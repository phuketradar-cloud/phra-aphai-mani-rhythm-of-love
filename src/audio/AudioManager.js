/*
 * AudioManager — owns the AudioContext, the music / SFX buses and all sound effects.
 * Sound effects are synthesized (no extra files needed) and mixed under the music:
 * they are short, filtered and quiet so the supplied soundtrack stays in front.
 *
 *   music source -> musicFilter (lowpass, used for the underwater effect) -> musicGain -> master
 *   sfx voices   -> sfxGain -> master
 */
window.PAM = window.PAM || {};
PAM.AudioManager = (function () {
  let ctx = null, master, musicGain, musicFilter, sfxGain, noiseBuf;
  let clockOffset = null; // smoothed (contextTime - performanceTime) in seconds
  const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 22000; musicFilter.Q.value = 0.7;
    musicGain = ctx.createGain(); musicFilter.connect(musicGain); musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function resume() { init(); if (ctx.state !== 'running') return ctx.resume(); return Promise.resolve(); }

  /**
   * Context time that is *audible* at performance time perfMs.
   * Uses getOutputTimestamp (accounts for output latency); falls back to currentTime - outputLatency.
   * The mapping is smoothed so per-frame jitter never moves notes backwards.
   */
  function ctxTimeAtPerf(perfMs) {
    if (!ctx) return 0;
    let raw = null;
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime > 0 && ts.contextTime > 0) raw = ts.contextTime - ts.performanceTime / 1000;
    else raw = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - performance.now() / 1000;
    if (clockOffset === null || Math.abs(raw - clockOffset) > 0.03) clockOffset = raw;
    else clockOffset += (raw - clockOffset) * 0.05;
    return clockOffset + perfMs / 1000;
  }
  function resetClock() { clockOffset = null; }

  function env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }
  function osc(type, freq, t, a, peak, decay, dest, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    env(g, t, a, peak, decay); o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + a + decay + 0.05);
    return o;
  }
  function noise(t, dur, filterType, freq, q, peak, dest, freqEnd) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); env(g, t, Math.min(0.01, dur / 4), peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxGain);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }
  const ready = () => ctx && ctx.state === 'running';

  const sfx = {
    /** Soft breathy flute accent, pitch walks up the pentatonic scale with the combo. */
    hit(judgement, combo, type) {
      if (!ready()) return;
      const t = ctx.currentTime, f = PENTATONIC[combo % PENTATONIC.length] * (type === 'spell' ? 1 : 1);
      const vol = judgement === 'perfect' ? 0.10 : judgement === 'good' ? 0.08 : 0.055;
      osc('sine', f, t, 0.012, vol, 0.28);
      osc('triangle', f * 2, t, 0.01, vol * 0.25, 0.14);
      noise(t, 0.08, 'bandpass', f * 2, 6, vol * 0.35);
      if (judgement === 'perfect') osc('sine', f * 3, t + 0.03, 0.01, 0.025, 0.4);
      if (type === 'accent' || type === 'spell') osc('sine', f / 2, t, 0.02, 0.05, 0.5);
    },
    miss() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('triangle', 196, t, 0.005, 0.06, 0.18, null, 0).frequency.exponentialRampToValueAtTime(140, t + 0.18);
      osc('sawtooth', 207, t, 0.005, 0.02, 0.16);
      noise(t, 0.12, 'lowpass', 900, 1, 0.05);
    },
    /** Giantess footstep. intensity 0..1 (slow walk .. run). */
    step(intensity) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = osc('sine', 70 + intensity * 20, t, 0.004, 0.10 + intensity * 0.12, 0.22);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      noise(t, 0.10 + intensity * 0.06, 'lowpass', 500 + intensity * 600, 1, 0.05 + intensity * 0.08);
      noise(t + 0.01, 0.25, 'bandpass', 1400, 1.2, 0.015 + intensity * 0.03); // wet sand / water
    },
    /** Danger heartbeat. */
    warning(level) {
      if (!ready()) return;
      const t = ctx.currentTime, v = 0.07 + level * 0.07;
      osc('sine', 58, t, 0.01, v, 0.16).frequency.exponentialRampToValueAtTime(40, t + 0.16);
      osc('sine', 54, t + 0.22, 0.01, v * 0.8, 0.2).frequency.exponentialRampToValueAtTime(38, t + 0.42);
    },
    mesmerize() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [0, 2, 4, 5].forEach((n, i) => osc('sine', PENTATONIC[n] * 2, t + i * 0.07, 0.01, 0.025, 0.6));
    },
    countdown(final) {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('square', final ? 1175 : 880, t, 0.002, 0.03, 0.06);
      noise(t, 0.03, 'highpass', 3000, 1, 0.03);
    },
    roar() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = osc('sawtooth', 110, t, 0.08, 0.07, 0.9); o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
      osc('sawtooth', 113, t, 0.08, 0.05, 0.9).frequency.exponentialRampToValueAtTime(66, t + 0.9);
      noise(t, 0.8, 'bandpass', 600, 2, 0.08, null, 250);
    },
    grab() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 0.35, 'bandpass', 2400, 1, 0.12, null, 300);
      osc('sine', 90, t + 0.05, 0.005, 0.2, 0.35).frequency.exponentialRampToValueAtTime(40, t + 0.4);
    },
    splash() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 1.4, 'lowpass', 6000, 0.7, 0.35, null, 300);
      noise(t + 0.05, 0.6, 'bandpass', 1800, 1.5, 0.18, null, 500);
      osc('sine', 120, t, 0.005, 0.25, 0.5).frequency.exponentialRampToValueAtTime(35, t + 0.5);
      for (let i = 0; i < 8; i++) osc('sine', 600 + Math.random() * 900, t + 0.3 + Math.random() * 1.2, 0.005, 0.02, 0.06);
    },
    victory() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [0, 2, 4, 5, 7].forEach((n, i) => osc('sine', PENTATONIC[n], t + i * 0.12, 0.02, 0.06, 1.2));
    },
    ui() {
      if (!ready()) return;
      osc('sine', 1320, ctx.currentTime, 0.004, 0.025, 0.08);
    }
  };

  return {
    init, resume, ctxTimeAtPerf, resetClock, sfx,
    get ctx() { return ctx; },
    get musicInput() { init(); return musicFilter; },
    setMusicVolume(v) { init(); musicGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setSfxVolume(v) { init(); sfxGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    /** 0 = normal, 1 = fully underwater (muffled and quieter). */
    setUnderwater(amount, seconds = 0.6) {
      if (!ctx) return;
      const f = 22000 * Math.pow(250 / 22000, amount);
      musicFilter.frequency.cancelScheduledValues(ctx.currentTime);
      musicFilter.frequency.setTargetAtTime(f, ctx.currentTime, seconds / 3);
    }
  };
})();
