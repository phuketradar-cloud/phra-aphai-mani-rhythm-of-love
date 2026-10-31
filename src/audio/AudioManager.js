/*
 * AudioManager — the AudioContext, the mixer, the sample player and the synthesized effects.
 *
 * Mixer (every channel has a user volume and a separate ducking stage, smooth ramps only):
 *
 *   music      (song; lowpass for the underwater effect) ┐
 *   flute      (hit accents, misses, countdown, UI)       │
 *   voice      (vocal feedback samples)                   │   channel gain (user volume)
 *   crowdAmb   (murmur / worried loops)                   ├─> duck gain (ducking)
 *   crowdReact (applause, cheers, whistles, gasps, boos)  │   ─> master ─> limiter ─> output
 *   footsteps  (giantess steps)                           │
 *   danger     (heartbeat, roar, grab, splash, impact)    ┘
 *
 * The music always stays the primary focus: ducking only dips it slightly (≈ -1.5 dB) and the
 * master limiter (DynamicsCompressor) prevents clipping when many layers sound together.
 */
window.PAM = window.PAM || {};
PAM.AudioManager = (function () {
  const CHANNELS = ['music', 'flute', 'voice', 'crowdAmb', 'crowdReact', 'footsteps', 'danger', 'menuMusic', 'menuSfx'];
  let ctx = null, master, limiter, musicFilter, noiseBuf, menuAnalyser, menuBuf;
  const ch = {};          // name -> { gain, duck }
  const samples = {};     // "group/category" -> [{ url, buffer }]
  let clockOffset = null; // smoothed (contextTime - performanceTime) in seconds
  let packMode = 'none';  // 'webaudio' | 'element' (file:// fallback) | 'none'
  const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 1;
    master.connect(limiter); limiter.connect(ctx.destination);
    for (const name of CHANNELS) {
      const gain = ctx.createGain(), duck = ctx.createGain();
      gain.connect(duck); duck.connect(master);
      ch[name] = { gain, duck };
    }
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 22000; musicFilter.Q.value = 0.7;
    musicFilter.connect(ch.music.gain);
    // level meter on the menu music (drives the title screen's music-energy glow)
    menuAnalyser = ctx.createAnalyser(); menuAnalyser.fftSize = 1024;
    ch.menuMusic.duck.connect(menuAnalyser);
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

  // ------------------------------------------------------------------ mixer
  const volumes = {};
  function setChannelVolume(name, v) {
    volumes[name] = v;
    init();
    if (ch[name]) ch[name].gain.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
  }
  /**
   * Temporarily lower channels: levels = { music: 0.85, crowdAmb: 0.5 }. Smooth attack/release.
   * Overlapping ducks keep the deepest level until the longest one ends.
   */
  const duckState = {};
  function duck(levels, holdSec, attack = 0.08, release = 0.6) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const name in levels) {
      const c = ch[name]; if (!c) continue;
      const st = duckState[name] || { level: 1, until: 0 };
      const level = now < st.until ? Math.min(st.level, levels[name]) : levels[name];
      const until = Math.max(st.until, now + holdSec);
      duckState[name] = { level, until };
      const g = c.duck.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(level, now, attack / 3);
      g.setTargetAtTime(1, until, release / 3);
    }
  }
  function resetDucking() { if (!ctx) return; for (const name of CHANNELS) { ch[name].duck.gain.cancelScheduledValues(ctx.currentTime); ch[name].duck.gain.setTargetAtTime(1, ctx.currentTime, 0.05); delete duckState[name]; } }

  // ------------------------------------------------------------------ sample pack
  /** Load every sample listed in a manifest ({voice:{cat:[urls]}, crowd:{cat:[urls]}}). */
  async function loadPack(manifest, onProgress) {
    init();
    const jobs = [];
    for (const group of ['voice', 'crowd']) for (const cat in (manifest[group] || {})) {
      const key = group + '/' + cat;
      samples[key] = manifest[group][cat].map(url => ({ url, buffer: null }));
      for (const s of samples[key]) jobs.push(s);
    }
    let done = 0, failed = 0;
    const worker = async () => {
      while (jobs.length) {
        const s = jobs.shift();
        // one retry after a short pause: static hosts occasionally answer 503 right after a deploy
        for (let attempt = 0; attempt < 2 && !s.buffer; attempt++) {
          try { const res = await fetch(encodeURI(s.url)); if (!res.ok) throw 0; s.buffer = await ctx.decodeAudioData(await res.arrayBuffer()); }
          catch (e) { if (attempt === 0) await new Promise(r => setTimeout(r, 800)); }
        }
        if (!s.buffer) failed++;
        done++; if (onProgress) onProgress(done);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    packMode = failed === 0 ? 'webaudio' : done > failed ? 'webaudio' : 'element';
    return { files: done, failed, mode: packMode };
  }
  function sampleList(key) { return samples[key] || []; }

  /**
   * Play a sample on a channel. opts: { gain, rate, pan, width (0..1 Haas widening), offset, loop, fadeIn }
   * Returns a handle { duration, stop(fadeSec), setGain(v, sec) } or null.
   */
  function play(sample, channel, opts = {}) {
    if (!sample || !ctx) return null;
    const o = Object.assign({ gain: 1, rate: 1, pan: 0, width: 0, loop: false, fadeIn: 0.005 }, opts);
    if (!sample.buffer) {
      // file:// fallback: a plain <audio> element (no ducking / panning possible there)
      if (o.loop && !sample.url) return null;
      const el = new Audio(encodeURI(sample.url));
      el.volume = Math.max(0, Math.min(1, o.gain * (volumes[channel] !== undefined ? volumes[channel] : 1)));
      el.loop = o.loop; el.playbackRate = o.rate;
      el.play().catch(() => {});
      return { duration: 2, stop() { el.pause(); }, setGain(v) { el.volume = Math.max(0, Math.min(1, v * (volumes[channel] || 1))); } };
    }
    const now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = sample.buffer; src.playbackRate.value = o.rate; src.loop = o.loop;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), now + Math.max(0.005, o.fadeIn));
    src.connect(g);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p;
    }
    out.connect(ch[channel].gain);
    if (o.width > 0 && ctx.createStereoPanner) {
      // Haas widening: a slightly delayed copy on the opposite side makes mono crowd layers feel wide
      const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.012 + Math.random() * 0.01;
      const p2 = ctx.createStereoPanner(); p2.pan.value = -Math.sign(o.pan || 0.3) * 0.8;
      const g2 = ctx.createGain(); g2.gain.value = o.width * 0.7;
      g.connect(dl); dl.connect(g2); g2.connect(p2); p2.connect(ch[channel].gain);
    }
    src.start(now, o.offset || 0);
    const dur = sample.buffer.duration / o.rate;
    return {
      duration: dur, source: src,
      stop(fade = 0.15) { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, fade / 3); try { src.stop(t + fade + 0.05); } catch (e) { /* stopped */ } },
      setGain(v, sec = 0.5) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, sec / 3); }
    };
  }

  // ------------------------------------------------------------------ synthesized effects
  function env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }
  function osc(type, freq, t, a, peak, decay, channel = 'flute', detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    env(g, t, a, peak, decay); o.connect(g); g.connect(ch[channel].gain);
    o.start(t); o.stop(t + a + decay + 0.05);
    return o;
  }
  function noise(t, dur, filterType, freq, q, peak, channel = 'flute', freqEnd) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); env(g, t, Math.min(0.01, dur / 4), peak, dur);
    s.connect(f); f.connect(g); g.connect(ch[channel].gain);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }
  const ready = () => ctx && ctx.state === 'running';

  const sfx = {
    /** Soft breathy flute accent; pitch walks up the pentatonic scale with the combo, lane shifts the octave colour. */
    hit(judgement, combo, accent, lane = 0) {
      if (!ready()) return;
      const t = ctx.currentTime, f = PENTATONIC[(combo + lane * 2) % PENTATONIC.length];
      const vol = judgement === 'perfect' ? 0.10 : judgement === 'good' ? 0.08 : 0.055;
      osc('sine', f, t, 0.012, vol, 0.28);
      osc('triangle', f * 2, t, 0.01, vol * 0.25, 0.14);
      noise(t, 0.08, 'bandpass', f * 2, 6, vol * 0.35);
      if (judgement === 'perfect') osc('sine', f * 3, t + 0.03, 0.01, 0.03, 0.4);
      if (accent) osc('sine', f / 2, t, 0.02, 0.05, 0.5);
    },
    holdTick(lane) {
      if (!ready()) return;
      const t = ctx.currentTime, f = PENTATONIC[(lane * 2 + 4) % PENTATONIC.length];
      osc('sine', f * 2, t, 0.005, 0.02, 0.08);
    },
    holdDone(lane) {
      if (!ready()) return;
      const t = ctx.currentTime, f = PENTATONIC[(lane * 2 + 3) % PENTATONIC.length];
      osc('sine', f, t, 0.01, 0.07, 0.35); osc('sine', f * 1.5, t + 0.06, 0.01, 0.05, 0.4);
    },
    chord(size) {
      if (!ready()) return;
      const t = ctx.currentTime;
      [0, 2, 4].slice(0, size).forEach((n, i) => osc('sine', PENTATONIC[n + 2] * 2, t + i * 0.03, 0.01, 0.035, 0.45));
    },
    miss() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('triangle', 196, t, 0.005, 0.06, 0.18).frequency.exponentialRampToValueAtTime(140, t + 0.18);
      osc('sawtooth', 207, t, 0.005, 0.02, 0.16);
      noise(t, 0.12, 'lowpass', 900, 1, 0.05);
    },
    wrong() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('square', 233, t, 0.003, 0.025, 0.09); osc('square', 247, t, 0.003, 0.02, 0.09);
    },
    /** Giantess footstep. intensity 0..1 (slow walk .. run). */
    step(intensity) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = osc('sine', 70 + intensity * 20, t, 0.004, 0.10 + intensity * 0.12, 0.22, 'footsteps');
      o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      noise(t, 0.10 + intensity * 0.06, 'lowpass', 500 + intensity * 600, 1, 0.05 + intensity * 0.08, 'footsteps');
      noise(t + 0.01, 0.25, 'bandpass', 1400, 1.2, 0.015 + intensity * 0.03, 'footsteps'); // wet sand / water
    },
    /** Danger heartbeat. */
    warning(level) {
      if (!ready()) return;
      const t = ctx.currentTime, v = 0.07 + level * 0.07;
      osc('sine', 58, t, 0.01, v, 0.16, 'danger').frequency.exponentialRampToValueAtTime(40, t + 0.16);
      osc('sine', 54, t + 0.22, 0.01, v * 0.8, 0.2, 'danger').frequency.exponentialRampToValueAtTime(38, t + 0.42);
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
      const o = osc('sawtooth', 110, t, 0.08, 0.07, 0.9, 'danger'); o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
      osc('sawtooth', 113, t, 0.08, 0.05, 0.9, 'danger').frequency.exponentialRampToValueAtTime(66, t + 0.9);
      noise(t, 0.8, 'bandpass', 600, 2, 0.08, 'danger', 250);
    },
    /** Dramatic impact for the capture (low boom + crack). */
    impact() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('sine', 85, t, 0.003, 0.35, 0.9, 'danger').frequency.exponentialRampToValueAtTime(30, t + 0.9);
      noise(t, 0.25, 'lowpass', 2500, 0.7, 0.25, 'danger', 200);
      noise(t, 0.05, 'highpass', 2000, 0.7, 0.15, 'danger');
    },
    grab() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 0.35, 'bandpass', 2400, 1, 0.12, 'danger', 300);
      osc('sine', 90, t + 0.05, 0.005, 0.2, 0.35, 'danger').frequency.exponentialRampToValueAtTime(40, t + 0.4);
    },
    splash() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 1.4, 'lowpass', 6000, 0.7, 0.35, 'danger', 300);
      noise(t + 0.05, 0.6, 'bandpass', 1800, 1.5, 0.18, 'danger', 500);
      osc('sine', 120, t, 0.005, 0.25, 0.5, 'danger').frequency.exponentialRampToValueAtTime(35, t + 0.5);
      for (let i = 0; i < 8; i++) osc('sine', 600 + Math.random() * 900, t + 0.3 + Math.random() * 1.2, 0.005, 0.02, 0.06, 'danger');
    },
    finalNote() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [0, 2, 4, 7].forEach((n, i) => osc('sine', PENTATONIC[n % 8] * (n >= 7 ? 2 : 1), t + i * 0.05, 0.01, 0.07, 1.6));
      noise(t, 1.2, 'highpass', 6000, 0.7, 0.03);
    },
    victory() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [0, 2, 4, 5, 7].forEach((n, i) => osc('sine', PENTATONIC[n], t + i * 0.12, 0.02, 0.06, 1.2));
    },
    /** Generic UI click (buttons on the other screens). */
    ui() {
      if (!ready()) return;
      osc('sine', 1320, ctx.currentTime, 0.004, 0.03, 0.08, 'menuSfx');
    },
    /**
     * Menu navigation tick: a crisp plucked note (pitch climbs with the item index) on top of a
     * tiny bright transient. Rate-limited so a fast run of key presses never turns into a buzz.
     */
    menuMove(index = 0) {
      if (!ready()) return;
      const t = ctx.currentTime;
      if (t - (sfx._lastMove || 0) < 0.045) return;
      sfx._lastMove = t;
      const f = [783.99, 659.25, 587.33, 523.25][index % 4];
      osc('triangle', f, t, 0.002, 0.11, 0.09, 'menuSfx');
      osc('sine', f * 2, t, 0.002, 0.05, 0.06, 'menuSfx');
      osc('sine', f * 3.01, t, 0.001, 0.02, 0.035, 'menuSfx');
      noise(t, 0.018, 'highpass', 5200, 0.8, 0.05, 'menuSfx');
    },
    /** Menu confirm: a punchy low thump, a rising two-note gold chime and a shimmer tail. */
    menuConfirm() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('sine', 110, t, 0.002, 0.28, 0.22, 'menuSfx').frequency.exponentialRampToValueAtTime(55, t + 0.2);
      noise(t, 0.05, 'lowpass', 1800, 0.7, 0.12, 'menuSfx');
      [[523.25, 0], [783.99, 0.07], [1046.5, 0.14]].forEach(([f, d]) => {
        osc('triangle', f, t + d, 0.003, 0.12, 0.35, 'menuSfx');
        osc('sine', f * 2, t + d, 0.003, 0.04, 0.3, 'menuSfx');
      });
      noise(t + 0.1, 0.5, 'bandpass', 7000, 2, 0.035, 'menuSfx', 11000);
    }
  };

  return {
    CHANNELS, init, resume, ctxTimeAtPerf, resetClock, sfx,
    setChannelVolume, duck, resetDucking, loadPack, sampleList, play,
    get ctx() { return ctx; },
    get packMode() { return packMode; },
    get musicInput() { init(); return musicFilter; },
    get menuMusicInput() { init(); return ch.menuMusic.gain; },
    /** RMS level of the menu music, roughly 0..1. */
    menuLevel() {
      if (!menuAnalyser || ctx.state !== 'running') return 0;
      if (!menuBuf) menuBuf = new Float32Array(menuAnalyser.fftSize);
      menuAnalyser.getFloatTimeDomainData(menuBuf);
      let s = 0; for (let i = 0; i < menuBuf.length; i++) s += menuBuf[i] * menuBuf[i];
      return Math.min(1, Math.sqrt(s / menuBuf.length) * 4);
    },
    // kept for MusicPlayer (element fallback reads volumes.music)
    setMusicVolume(v) { setChannelVolume('music', v); },
    channelVolume(name) { return volumes[name] !== undefined ? volumes[name] : 1; },
    /** Current per-channel gain values (for the debug overlay and tests). */
    mixerState() {
      const out = {};
      if (ctx) for (const n of CHANNELS) out[n] = { volume: +ch[n].gain.gain.value.toFixed(3), duck: +ch[n].duck.gain.value.toFixed(3) };
      return out;
    },
    /** 0 = normal, 1 = fully underwater (muffled). */
    setUnderwater(amount, seconds = 0.6) {
      if (!ctx) return;
      const f = 22000 * Math.pow(250 / 22000, amount);
      musicFilter.frequency.cancelScheduledValues(ctx.currentTime);
      musicFilter.frequency.setTargetAtTime(f, ctx.currentTime, seconds / 3);
    }
  };
})();
