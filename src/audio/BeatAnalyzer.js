/*
 * BeatAnalyzer — offline audio analysis used to build beat maps.
 * Works both in the browser (window.PAM.BeatAnalyzer) and in Node (require).
 *
 * Pipeline:
 *   1. mono mix -> STFT (Hann, 2048 window, 512 hop)
 *   2. spectral flux onset envelope (log magnitude, half-wave rectified),
 *      split into low / mid / high bands
 *   3. tempo estimate from the autocorrelation of the onset envelope
 *   4. dynamic-programming beat tracker (Ellis 2007) -> beat times that can drift
 *   5. bar phase (downbeats) from onset strength at every 4th beat
 *   6. per-beat RMS energy -> sections (intro / quiet / build / intense / ending)
 *   7. chart generator -> notes tagged with the minimum difficulty they appear at
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PAM = root.PAM || {}; root.PAM.BeatAnalyzer = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIN = 2048, HOP = 512;

  const twiddles = {};
  function fft(re, im) {
    const n = re.length;
    if (!twiddles[n]) {
      const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
      for (let k = 0; k < n / 2; k++) { c[k] = Math.cos(-2 * Math.PI * k / n); s[k] = Math.sin(-2 * Math.PI * k / n); }
      twiddles[n] = { c, s };
    }
    const tw = twiddles[n];
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < halfLen; k++) {
          const a = i + k, b = a + halfLen, cr = tw.c[k * step], ci = tw.s[k * step];
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  function normalize(arr) {
    let max = 0;
    for (const v of arr) if (v > max) max = v;
    if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] /= max;
    return arr;
  }

  function smooth(arr, radius) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0, c = 0;
      for (let k = -radius; k <= radius; k++) { const j = i + k; if (j >= 0 && j < arr.length) { s += arr[j]; c++; } }
      out[i] = s / c;
    }
    return out;
  }

  /** channels: array of Float32Array (one per channel). */
  function onsetEnvelope(channels, sampleRate, onProgress) {
    const len = channels[0].length;
    const mono = new Float32Array(len);
    for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length;

    const frames = Math.max(1, Math.floor((len - WIN) / HOP) + 1);
    const hann = new Float32Array(WIN);
    for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WIN);
    const binHz = sampleRate / WIN;
    const lowEnd = Math.round(200 / binHz), midEnd = Math.round(2000 / binHz), half = WIN / 2;

    const flux = new Float32Array(frames), fluxLow = new Float32Array(frames),
      fluxMid = new Float32Array(frames), fluxHigh = new Float32Array(frames), rms = new Float32Array(frames);
    let prev = new Float32Array(half), mag = new Float32Array(half);
    const re = new Float64Array(WIN), im = new Float64Array(WIN);
    for (let f = 0; f < frames; f++) {
      const off = f * HOP;
      let e = 0;
      for (let i = 0; i < WIN; i++) { const s = mono[off + i]; re[i] = s * hann[i]; im[i] = 0; e += s * s; }
      rms[f] = Math.sqrt(e / WIN);
      fft(re, im);
      let lo = 0, mi = 0, hi = 0;
      for (let k = 1; k < half; k++) {
        const m = Math.log(1 + 1000 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        mag[k] = m;
        const d = m - prev[k];
        if (d > 0) { if (k < lowEnd) lo += d; else if (k < midEnd) mi += d; else hi += d; }
      }
      fluxLow[f] = lo; fluxMid[f] = mi; fluxHigh[f] = hi; flux[f] = lo * 1.5 + mi + hi * 0.6;
      const swap = prev; prev = mag; mag = swap;
      if (onProgress && f % 2000 === 0) onProgress(f / frames);
    }
    // remove slow trend (local mean) so the envelope is about *changes*
    const trend = smooth(flux, 16);
    const env = new Float32Array(frames);
    for (let i = 0; i < frames; i++) env[i] = Math.max(0, flux[i] - trend[i]);
    return { env: normalize(env), low: normalize(fluxLow), mid: normalize(fluxMid), high: normalize(fluxHigh),
      rms: normalize(rms), fps: sampleRate / HOP, frames, duration: len / sampleRate, mono, sampleRate };
  }

  /**
   * Frame times are coarse (~10 ms) and describe a whole 43 ms window. Move each time to the
   * actual attack in the waveform: the steepest rise of a 3 ms log-energy curve within ±radius.
   */
  function refineToAttack(mono, sampleRate, t, radius = 0.035) {
    const step = Math.round(sampleRate * 0.001), win = step * 3;
    const a = Math.max(0, Math.round((t - radius - 0.006) * sampleRate)), b = Math.min(mono.length - win, Math.round((t + radius) * sampleRate));
    let prevE = null, best = -Infinity, bestT = t;
    for (let s = a; s < b; s += step) {
      let e = 0;
      for (let i = 0; i < win; i++) e += mono[s + i] * mono[s + i];
      e = Math.log(1e-9 + e / win);
      if (prevE !== null && e - prevE > best) { best = e - prevE; bestT = (s + win / 2) / sampleRate; }
      prevE = e;
    }
    return bestT;
  }

  /** Global tempo from onset-envelope autocorrelation, weighted toward 70-160 BPM. */
  function estimateTempo(env, fps, minBpm = 60, maxBpm = 180) {
    const minLag = Math.floor(fps * 60 / maxBpm), maxLag = Math.ceil(fps * 60 / minBpm);
    const ac = new Float32Array(maxLag * 2 + 2);
    for (let lag = 1; lag < ac.length; lag++) {
      let s = 0;
      for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
      ac[lag] = s / (env.length - lag);
    }
    const at = l => { const a = Math.floor(l), f = l - a; return ac[a] * (1 - f) + (ac[a + 1] || 0) * f; };
    const scores = [];
    let best = 0, bestLag = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const s = ac[lag];
      // light support from the double period (bar-level repetition)
      const h = s + 0.25 * at(lag * 2);
      const bpm = 60 * fps / lag;
      const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.9, 2));
      scores.push({ lag, bpm, raw: s, score: h * w });
      if (h * w > best) { best = h * w; bestLag = lag; }
    }
    // parabolic refinement of the peak lag
    const i = bestLag - minLag;
    let lag = bestLag;
    if (i > 0 && i < scores.length - 1) {
      const a = scores[i - 1].raw, b = scores[i].raw, c = scores[i + 1].raw, den = a - 2 * b + c;
      if (den !== 0) lag = bestLag + 0.5 * (a - c) / den;
    }
    // distinct local maxima, best first (used by analyze() to verify against real onsets)
    const peaks = scores.filter((s, k) => k > 0 && k < scores.length - 1 && s.score >= scores[k - 1].score && s.score >= scores[k + 1].score)
      .sort((x, y) => y.score - x.score);
    const candidates = [];
    for (const s of peaks) if (candidates.every(c => Math.abs(c.bpm / s.bpm - 1) > 0.04)) candidates.push({ bpm: +s.bpm.toFixed(2), period: s.lag, score: +s.score.toFixed(5) });
    return { bpm: 60 * fps / lag, period: lag, candidates: candidates.slice(0, 5) };
  }

  /** Strong onset peaks (frame indices) used to verify tempo hypotheses. */
  function strongOnsets(env, threshold = 0.15) {
    const out = [];
    for (let i = 3; i < env.length - 3; i++) {
      const v = env[i];
      if (v < threshold) continue;
      let isMax = true;
      for (let k = -3; k <= 3; k++) if (env[i + k] > v) { isMax = false; break; }
      if (isMax) out.push({ t: i, v });
    }
    return out;
  }

  /**
   * Autocorrelation alone can be fooled by syncopation (e.g. a 3+3+2 rhythm makes a 3:2 alias
   * look strong). Track beats for each candidate tempo and keep the grid that lands on the
   * largest share of strong onsets (weighted by onset strength).
   */
  function chooseTempo(env, fps, tempo) {
    const onsets = strongOnsets(env);
    const tol = 0.035 * fps;
    let best = null;
    for (const c of tempo.candidates.slice(0, 4)) {
      const period = fps * 60 / c.bpm;
      const beats = trackBeats(env, fps, period).map(t => t * fps);
      let cov = 0, total = 0, j = 0;
      for (const o of onsets) {
        while (j < beats.length - 1 && beats[j + 1] < o.t) j++;
        const d = Math.min(Math.abs(beats[j] - o.t), Math.abs((beats[j + 1] !== undefined ? beats[j + 1] : 1e9) - o.t));
        total += o.v; if (d <= tol) cov += o.v;
      }
      c.coverage = +(total ? cov / total : 0).toFixed(3);
      if (!best || c.coverage > best.coverage + 0.02) best = c;
    }
    return best ? { bpm: best.bpm, period: fps * 60 / best.bpm, candidates: tempo.candidates } : tempo;
  }

  /** Ellis DP beat tracker. Returns beat times in seconds. */
  function trackBeats(env, fps, period, tightness = 120) {
    const n = env.length, score = new Float32Array(n), back = new Int32Array(n).fill(-1);
    const lo = Math.round(period / 2), hi = Math.round(period * 2);
    for (let i = 0; i < n; i++) {
      let best = 0, bi = -1;
      for (let p = i - hi; p <= i - lo; p++) {
        if (p < 0) continue;
        const d = Math.log((i - p) / period);
        const s = score[p] - tightness * d * d;
        if (bi < 0 || s > best) { best = s; bi = p; }
      }
      score[i] = env[i] + (bi >= 0 ? Math.max(0, best) : 0);
      back[i] = bi >= 0 && best > 0 ? bi : -1;
    }
    // pick the best end point in the last period
    let end = n - 1, bestEnd = -Infinity;
    for (let i = Math.max(0, n - Math.round(period)); i < n; i++) if (score[i] > bestEnd) { bestEnd = score[i]; end = i; }
    const beats = [];
    for (let i = end; i >= 0; i = back[i]) { beats.push(i); if (back[i] < 0) break; }
    beats.reverse();
    return beats.map(f => f / fps);
  }

  function sampleAt(arr, fps, t, radius = 2) {
    const c = Math.round(t * fps);
    let m = 0;
    for (let k = -radius; k <= radius; k++) { const j = c + k; if (j >= 0 && j < arr.length && arr[j] > m) m = arr[j]; }
    return m;
  }

  /** Snap a time to the strongest onset frame within ±radius frames. */
  function refineToOnset(env, fps, t, radius = 3) {
    const c = Math.round(t * fps);
    let best = c, bv = -1;
    for (let k = -radius; k <= radius; k++) { const j = c + k; if (j >= 0 && j < env.length && env[j] > bv) { bv = env[j]; best = j; } }
    return best / fps;
  }

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  }

  /**
   * Full analysis. Times inside are first in "frame time" (f / fps); the final beat times are
   * corrected to real audio time (window centre + attack refinement) before being returned.
   */
  function analyze(channels, sampleRate, onProgress) {
    const o = onsetEnvelope(channels, sampleRate, onProgress);
    const tempo = chooseTempo(o.env, o.fps, estimateTempo(o.env, o.fps));
    let frameBeats = trackBeats(o.env, o.fps, tempo.period);

    // Drop tracked "beats" in silence before the music actually starts / after it ends
    const energySmooth = smooth(o.rms, Math.round(o.fps * 0.5));
    frameBeats = frameBeats.filter(t => sampleAt(energySmooth, o.fps, t, 0) >= 0.04);

    const pulse = frameBeats.map((t, i) => ({
      i, frameTime: t,
      onset: sampleAt(o.env, o.fps, t), low: sampleAt(o.low, o.fps, t),
      energy: sampleAt(energySmooth, o.fps, t, 0)
    }));

    // ---- real-time correction: frame centre, then the waveform attack for clear onsets
    const centre = (WIN / 2) / sampleRate;
    const shifts = [];
    pulse.forEach(p => {
      const approx = p.frameTime + centre;
      if (p.onset > 0.25) { p.time = refineToAttack(o.mono, sampleRate, approx); shifts.push(p.time - approx); }
      else p.time = null;
    });
    const globalShift = median(shifts);
    pulse.forEach(p => { if (p.time === null) p.time = p.frameTime + centre + globalShift; });

    // ---- metre: the tracker locks to the fastest steady pulse. Group pulses in bars of 8
    // (= 4 felt beats at half the pulse rate). Bar phase = the position with the most bass onsets.
    const BAR = 8;
    const phaseScore = new Array(BAR).fill(0);
    pulse.forEach(p => { phaseScore[p.i % BAR] += p.low * 1.5 + p.onset; });
    const phase = phaseScore.indexOf(Math.max(...phaseScore));
    pulse.forEach(p => { p.barPos = ((p.i - phase) % BAR + BAR) % BAR; p.downbeat = p.barPos === 0; p.quarter = p.barPos % 2 === 0; });

    const intervals = [];
    for (let i = 1; i < pulse.length; i++) intervals.push(pulse[i].time - pulse[i - 1].time);
    const pulseInterval = median(intervals);

    // ---- sections: 4-bar windows classified by RMS energy quantiles
    const energies = pulse.map(p => p.energy).sort((a, b) => a - b);
    const q = r => energies[Math.floor(r * (energies.length - 1))] || 0;
    const quietT = q(0.25), intenseT = q(0.7);
    const sections = [];
    const firstDown = pulse.findIndex(p => p.downbeat);
    const chunkStarts = firstDown > 2 ? [0] : [];
    for (let s = firstDown > 2 ? firstDown : 0; s < pulse.length; s += BAR * 4) chunkStarts.push(s);
    for (let c = 0; c < chunkStarts.length; c++) {
      const chunk = pulse.slice(chunkStarts[c], chunkStarts[c + 1] || pulse.length);
      if (!chunk.length) continue;
      const e = chunk.reduce((a, b) => a + b.energy, 0) / chunk.length;
      const kind = e >= intenseT ? 'intense' : e <= quietT ? 'quiet' : 'build';
      sections.push({ start: +chunk[0].time.toFixed(3), end: +(chunk[chunk.length - 1].time + pulseInterval).toFixed(3), energy: +e.toFixed(3), kind });
    }
    if (sections.length) {
      if (sections[0].kind !== 'intense') sections[0].kind = 'intro';
      const last = sections[sections.length - 1];
      if (last.energy < intenseT) last.kind = 'ending';
      else sections.push({ start: last.end, end: o.duration, energy: 0, kind: 'ending' });
    }
    const sectionAt = t => (sections.find(s => t >= s.start && t < s.end) || sections[sections.length - 1] || { kind: 'build' }).kind;
    pulse.forEach(p => { p.section = sectionAt(p.time); });

    // ---- half-pulse positions (sixteenths) that carry a real onset, for the hard chart
    const offbeats = [];
    for (let i = 0; i < pulse.length - 1; i++) {
      const midFrame = (pulse[i].frameTime + pulse[i + 1].frameTime) / 2;
      const strength = sampleAt(o.env, o.fps, midFrame, 1);
      if (strength < 0.2) continue;
      const t = refineToAttack(o.mono, sampleRate, refineToOnset(o.env, o.fps, midFrame, 2) + centre);
      offbeats.push({ time: t, onset: strength, section: pulse[i].section });
    }

    return {
      duration: o.duration, bpm: 60 / pulseInterval, feltBpm: 30 / pulseInterval, globalBpm: tempo.bpm,
      tempoCandidates: tempo.candidates, attackShift: globalShift,
      firstBeat: pulse.length ? pulse[0].time : 0, firstDownbeat: (pulse.find(p => p.downbeat) || { time: 0 }).time,
      barPhase: phase, pulsesPerBar: BAR, beats: pulse, offbeats, sections,
      envelope: { fps: o.fps, timeOffset: centre, env: o.env, rms: energySmooth }
    };
  }

  /**
   * Build a chart from an analysis. Every note gets `difficulty` = the lowest level
   * (1 easy, 2 normal, 3 hard) that includes it, so one map serves all levels and
   * harder levels are strict supersets of easier ones.
   */
  function generateChart(an, opts = {}) {
    const o = Object.assign({
      leadIn: 2.0, endTrim: 1.0,
      minGap: { 1: 0.75, 2: 0.38, 3: 0.19 },
      threshold: { 1: 0.3, 2: 0.4, 3: 0.08, offbeat: 0.5 }
    }, opts);
    const raw = [];
    // let the player hear one bar of music before the first note
    o.leadIn = Math.max(o.leadIn, an.firstBeat + 4 * 60 / an.bpm - 0.05);
    const lastTime = an.duration - o.endTrim;
    for (const b of an.beats) {
      if (b.time < o.leadIn || b.time > lastTime) continue;
      const calm = b.section === 'quiet' || b.section === 'intro' || b.section === 'ending';
      let lvl = 0;
      if (b.quarter) {
        const halfNote = b.barPos % 4 === 0;
        if (halfNote) lvl = 1;
        else lvl = calm ? 2 : (b.onset > o.threshold[1] ? 1 : 2);
      } else {
        lvl = !calm && b.onset > o.threshold[2] ? 2 : b.onset > o.threshold[3] ? 3 : 0;
      }
      if (!lvl) continue;
      const type = b.downbeat || b.barPos === 4 ? 'accent' : b.quarter ? 'normal' : 'soft';
      raw.push({ time: b.time, difficulty: lvl, type, strength: b.onset, section: b.section, bar: b.downbeat });
    }
    for (const ob of an.offbeats) {
      if (ob.time < o.leadIn || ob.time > lastTime) continue;
      if ((ob.section === 'intense' || ob.section === 'build') && ob.onset > o.threshold.offbeat) raw.push({ time: ob.time, difficulty: 3, type: 'soft', strength: ob.onset, section: ob.section });
    }
    raw.sort((a, b) => a.time - b.time);

    // Accept easiest notes first; a note is kept only if it respects the min gap of every level it shows up in.
    const keep = [];
    for (const lvl of [1, 2, 3]) {
      for (const n of raw.filter(r => r.difficulty === lvl).sort((a, b) => b.strength - a.strength)) {
        let ok = true;
        for (const k of keep) {
          const gap = Math.abs(k.time - n.time), L = Math.max(k.difficulty, n.difficulty);
          if (gap < o.minGap[L]) { ok = false; break; }
        }
        if (ok) keep.push(n);
      }
    }
    keep.sort((a, b) => a.time - b.time);

    // First downbeat note of every 4-bar phrase in an intense section becomes a red "spell" note.
    let lastSpell = -Infinity;
    const phrase = an.pulsesPerBar * 4 * 60 / an.bpm;
    keep.forEach(n => {
      if (n.bar && n.section === 'intense' && n.time - lastSpell > phrase * 0.9) { n.type = 'spell'; lastSpell = n.time; }
    });

    return keep.map(n => ({ time: +n.time.toFixed(3), lane: 0, type: n.type, difficulty: n.difficulty }));
  }

  /** The editable beat-map file written by tools/analyze-song.js and the editor. */
  function buildBeatmap(an, notes, { id, title, audio, tool }) {
    return {
      song: title, id, audio,
      duration: +an.duration.toFixed(3),
      bpm: +an.bpm.toFixed(2),
      feltBpm: +an.feltBpm.toFixed(2),
      offset: +an.firstDownbeat.toFixed(3),
      beatsPerBar: an.pulsesPerBar,
      tempoNote: 'bpm/offset only drive the editor snap grid; note times come from per-beat tracking, so tempo drift is followed.',
      analysis: `Generated by ${tool} (spectral flux + tempo verified against onsets + DP beat tracking + waveform attack refinement). Edit freely.`,
      difficulties: { easy: 1, normal: 2, hard: 3 },
      sections: an.sections,
      notes
    };
  }

  /** Same data wrapped as a script, so the game also works when opened via file://. */
  function embeddedJs(map) {
    return `// Auto-generated from ${map.id}.json so the game also works when opened via file://\n` +
      'window.PAM_BEATMAPS = window.PAM_BEATMAPS || {};\n' +
      `window.PAM_BEATMAPS[${JSON.stringify(map.id)}] = ${JSON.stringify(map)};\n`;
  }

  return { analyze, generateChart, buildBeatmap, embeddedJs, onsetEnvelope, estimateTempo, trackBeats, refineToAttack };
});

