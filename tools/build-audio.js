#!/usr/bin/env node
/*
 * Builds the vocal-feedback and crowd sample packs (run once; the game only plays the files).
 *   node tools/build-audio.js
 *
 * 1. Voices: tools/voice-src/*.wav (Thai clips rendered offline by tools/render-voices.ps1)
 *    -> trimmed, normalized, slightly brightened, short room tail -> assets/audio/voice/<category>/
 * 2. Crowd: synthesized procedurally (no recordings needed) -> assets/audio/crowd/<category>/
 *    murmur loops, applause (small/medium/large), cheers, whistles, gasps, groans, boos, celebration
 * 3. assets/audio/manifest.json + manifest.js (file:// copy) listing every sample per category.
 *
 * Any category can be replaced with real recordings: drop .wav/.mp3/.ogg files into the folder and
 * re-run this script with --manifest-only (it rescans folders without regenerating anything).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets/audio');
const SR = 22050;
const manifestOnly = process.argv.includes('--manifest-only');

// ------------------------------------------------------------------ helpers
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

class Biquad {
  constructor(type, f, q, sr = SR) { this.set(type, f, q, sr); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q, sr = SR) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; } // band-pass (0 dB peak)
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

function writeWav(file, data, sr = SR) {
  const n = data.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt, data;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = { start: p + 8, size }; break; }
    p += 8 + size + (size & 1);
  }
  const frames = Math.floor(data.size / (2 * fmt.ch)), out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += b.readInt16LE(data.start + (i * fmt.ch + c) * 2); out[i] = s / fmt.ch / 32768; }
  return { data: out, sr: fmt.sr };
}

function resample(data, from, to) {
  const n = Math.floor(data.length * to / from), out = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) { const x = i * k, a = Math.floor(x), f = x - a; out[i] = (data[a] || 0) * (1 - f) + (data[a + 1] || 0) * f; }
  return out;
}

function normalize(d, peak = 0.89) {
  let m = 0; for (const v of d) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

function fadeEdges(d, inS = 0.005, outS = 0.04) {
  const a = Math.floor(inS * SR), b = Math.floor(outS * SR);
  for (let i = 0; i < a && i < d.length; i++) d[i] *= i / a;
  for (let i = 0; i < b && i < d.length; i++) d[d.length - 1 - i] *= i / b;
  return d;
}

/** Cheap room: a few feedback-free early reflections + a short decaying tail. */
function room(d, amount = 0.25, tail = 0.35) {
  const extra = Math.floor(tail * SR), out = new Float32Array(d.length + extra);
  out.set(d);
  const taps = [[0.011, 0.5], [0.019, 0.4], [0.029, 0.33], [0.041, 0.26], [0.057, 0.2], [0.083, 0.14], [0.121, 0.09], [0.17, 0.05]];
  const lp = new Biquad('lp', 3500, 0.7);
  const wet = new Float32Array(out.length);
  for (const [t, g] of taps) { const o = Math.floor(t * SR); for (let i = 0; i < d.length; i++) wet[i + o] += d[i] * g; }
  for (let i = 0; i < out.length; i++) out[i] += lp.run(wet[i]) * amount;
  return out;
}

const VOWELS = { a: [750, 1200], e: [500, 1850], i: [320, 2300], o: [450, 850], u: [330, 750], ae: [650, 1700] };

/**
 * One crowd voice: band-limited sawtooth at f0(t) through two formant filters (vowel(t)) + breath.
 * f0 and vowel are functions of normalized time 0..1. Returns Float32Array of length dur*SR.
 */
function voice(r, dur, f0fn, vowelFn, ampFn, breath = 0.25) {
  const n = Math.floor(dur * SR), out = new Float32Array(n);
  const f1 = new Biquad('bp', 500, 6), f2 = new Biquad('bp', 1500, 8), hp = new Biquad('hp', 90, 0.7);
  let ph = r(), vib = r() * 6, last = '';
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f0 = f0fn(t) * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * i / SR + vib)) * (1 + (r() - 0.5) * 0.01);
    ph += f0 / SR; if (ph >= 1) ph -= 1;
    const src = (2 * ph - 1) * (1 - breath) + (r() * 2 - 1) * breath;
    const v = vowelFn(t);
    if (v !== last && i % 64 === 0) { f1.set('bp', VOWELS[v][0], 6); f2.set('bp', VOWELS[v][1], 8); last = v; }
    out[i] = hp.run(f1.run(src) * 1.0 + f2.run(src) * 0.6) * ampFn(t);
  }
  return out;
}

function mixInto(dst, src, at, gain) { const o = Math.floor(at * SR); for (let i = 0; i < src.length && i + o < dst.length; i++) if (i + o >= 0) dst[i + o] += src[i] * gain; }
const env = (a, s, r) => t => t < a ? t / a : t > 1 - r ? Math.max(0, (1 - t) / r) : 1 - (1 - s) * Math.min(1, (t - a) / Math.max(1e-3, 1 - a - r));

// ------------------------------------------------------------------ crowd generators
function clap(r) {
  const n = Math.floor((0.03 + r() * 0.03) * SR), out = new Float32Array(n);
  const bp = new Biquad('bp', 900 + r() * 1700, 1.2 + r() * 1.5), lp = new Biquad('lp', 600, 0.8);
  const dec = 0.006 + r() * 0.012;
  for (let i = 0; i < n; i++) { const e = Math.exp(-i / SR / dec), x = (r() * 2 - 1) * e; out[i] = bp.run(x) * 1.6 + lp.run(x) * 0.5; }
  return out;
}

function applause(seed, dur, clappers, swell = 0.35) {
  const r = rng(seed), out = new Float32Array(Math.floor(dur * SR));
  for (let c = 0; c < clappers; c++) {
    const rate = 3.6 + r() * 2.8, start = r() * swell * dur, stop = dur * (0.55 + r() * 0.42), gain = 0.25 + r() * 0.75;
    for (let t = start; t < stop; t += (1 / rate) * (0.88 + r() * 0.24)) {
      const fade = Math.min(1, (t - start) / 0.25) * Math.min(1, (stop - t) / 0.6);
      mixInto(out, clap(r), t, gain * fade);
    }
  }
  return normalize(fadeEdges(room(out, 0.35, 0.5)), 0.8);
}

function cheer(seed, dur, voices, excited = 1) {
  const r = rng(seed), out = new Float32Array(Math.floor(dur * SR));
  for (let v = 0; v < voices; v++) {
    const len = dur * (0.35 + r() * 0.6), at = r() * (dur - len);
    const base = (r() < 0.5 ? 140 + r() * 90 : 230 + r() * 160) * (0.9 + excited * 0.2);
    const kind = r();
    let f0fn, vfn;
    if (kind < 0.35) { f0fn = t => base * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.6))); vfn = t => t < 0.2 ? 'u' : 'o'; }          // "woo"
    else if (kind < 0.7) { f0fn = t => base * (1.2 - 0.3 * t); vfn = t => t < 0.25 ? 'e' : 'ae'; }                                      // "yeah"
    else { f0fn = t => base * (1 + 0.25 * Math.sin(t * Math.PI)); vfn = () => 'a'; }                                                    // "ahh"
    const s = voice(r, len, f0fn, vfn, env(0.12, 0.8, 0.35), 0.18 + r() * 0.2);
    mixInto(out, s, at, 0.4 + r() * 0.6);
  }
  // dense roar bed
  const bed = new Biquad('bp', 900, 0.6), lp = new Biquad('lp', 2800, 0.7);
  for (let i = 0; i < out.length; i++) { const t = i / out.length; out[i] += lp.run(bed.run(r() * 2 - 1)) * 0.35 * Math.min(1, voices / 30) * Math.sin(Math.PI * Math.min(1, t * 1.3)); }
  return normalize(fadeEdges(room(out, 0.45, 0.7)), 0.8);
}

function whistle(seed) {
  const r = rng(seed), kind = seed % 3, dur = kind === 2 ? 1.6 : 1.1, n = Math.floor(dur * SR), out = new Float32Array(n);
  let ph = 0; const noise = new Biquad('bp', 2800, 2);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let f;
    if (kind === 0) f = t < 0.45 ? 1300 + 1500 * (t / 0.45) : 2800 - 1500 * ((t - 0.45) / 0.55) ** 1.4;   // wolf whistle up/down
    else if (kind === 1) f = t < 0.3 ? 1800 + 1000 * (t / 0.3) : t < 0.5 ? 2800 : 2900 + 300 * Math.sin(t * 30); // whoop + trill
    else f = 2600 + 220 * Math.sin(2 * Math.PI * 7 * i / SR) * (t > 0.2 ? 1 : 0);                              // long trill
    ph += f / SR;
    const a = Math.min(1, t / 0.04) * Math.min(1, (1 - t) / 0.12);
    out[i] = (Math.sin(2 * Math.PI * ph) * 0.8 + noise.run(r() * 2 - 1) * 0.25) * a;
  }
  return normalize(fadeEdges(room(out, 0.4, 0.5)), 0.7);
}

function gasp(seed) {
  const r = rng(seed), dur = 1.4, out = new Float32Array(Math.floor(dur * SR));
  for (let v = 0; v < 26; v++) {
    const at = r() * 0.12, base = 180 + r() * 220;
    // sharp inhale (breath noise, rising) then a short "oh!"
    const inh = new Float32Array(Math.floor(0.22 * SR)), bp = new Biquad('bp', 1400 + r() * 900, 2);
    for (let i = 0; i < inh.length; i++) { const t = i / inh.length; inh[i] = bp.run(r() * 2 - 1) * t * t; }
    mixInto(out, inh, at, 0.6);
    const oh = voice(r, 0.5 + r() * 0.4, t => base * (1.15 - 0.35 * t), () => 'o', env(0.05, 0.6, 0.6), 0.35);
    mixInto(out, oh, at + 0.2 + r() * 0.05, 0.5 + r() * 0.5);
  }
  return normalize(fadeEdges(room(out, 0.4, 0.6)), 0.75);
}

function groan(seed) {
  const r = rng(seed), dur = 1.9, out = new Float32Array(Math.floor(dur * SR));
  for (let v = 0; v < 22; v++) {
    const base = 150 + r() * 170, len = 1.1 + r() * 0.6;
    const s = voice(r, len, t => base * (1.1 - 0.4 * t), t => t < 0.5 ? 'a' : 'o', env(0.15, 0.85, 0.45), 0.3);
    mixInto(out, s, r() * 0.25, 0.5 + r() * 0.5);
  }
  return normalize(fadeEdges(room(out, 0.4, 0.6)), 0.7);
}

function boo(seed) {
  const r = rng(seed), dur = 2.2, out = new Float32Array(Math.floor(dur * SR));
  for (let v = 0; v < 22; v++) {
    const base = 95 + r() * 90, len = 1.3 + r() * 0.8, trem = 4 + r() * 3;
    const s = voice(r, len, t => base * (1 + 0.04 * Math.sin(t * 9)), () => 'u', t => env(0.12, 0.9, 0.3)(t) * (0.8 + 0.2 * Math.sin(2 * Math.PI * trem * t * len)), 0.25);
    mixInto(out, s, r() * 0.3, 0.5 + r() * 0.5);
  }
  return normalize(fadeEdges(room(out, 0.4, 0.6)), 0.7);
}

/** Seamless chatter loop: syllable-modulated voices, muffled by distance. */
function murmur(seed, dur, talkers, mood = 'calm') {
  const r = rng(seed), n = Math.floor(dur * SR), out = new Float32Array(n);
  const vowels = Object.keys(VOWELS);
  for (let k = 0; k < talkers; k++) {
    const base = (r() < 0.5 ? 105 + r() * 50 : 190 + r() * 70) * (mood === 'worried' ? 0.92 : 1);
    let t = r() * 0.5;
    while (t < dur) {
      const words = 3 + Math.floor(r() * 9);
      for (let w = 0; w < words && t < dur; w++) {
        const syl = 0.09 + r() * 0.16, v = vowels[Math.floor(r() * vowels.length)];
        const contour = mood === 'worried' ? 1.06 + r() * 0.12 : 0.95 + r() * 0.15;
        const s = voice(r, syl, x => base * contour * (1 - 0.08 * x), () => v, env(0.2, 0.7, 0.4), 0.3);
        mixInto(out, s, t, 0.4 + r() * 0.6);
        t += syl + r() * 0.05;
      }
      t += 0.3 + r() * (mood === 'worried' ? 0.6 : 1.4);
    }
  }
  const lp = new Biquad('lp', mood === 'worried' ? 1600 : 2200, 0.7);
  for (let i = 0; i < n; i++) out[i] = lp.run(out[i]);
  // seamless loop: crossfade the last 0.6 s into the start
  const x = Math.floor(0.6 * SR);
  for (let i = 0; i < x; i++) { const g = i / x; out[i] = out[i] * g + out[n - x + i] * (1 - g); }
  const loop = out.slice(0, n - x);
  return normalize(loop, 0.6);
}

function celebration(seed) {
  const dur = 7.5, out = new Float32Array(Math.floor(dur * SR));
  mixInto(out, cheer(seed, 6.5, 70, 1.3), 0, 1.0);
  mixInto(out, applause(seed + 1, 7.4, 90, 0.25), 0.15, 0.85);
  const r = rng(seed + 2);
  for (let i = 0; i < 6; i++) mixInto(out, whistle(seed * 7 + i), 0.4 + r() * 5, 0.35 + r() * 0.3);
  return normalize(fadeEdges(out, 0.01, 1.2), 0.85);
}

// ------------------------------------------------------------------ build
function buildVoices() {
  const src = path.join(__dirname, 'voice-src');
  if (!fs.existsSync(src)) { console.log('voice-src missing: run tools/render-voices.ps1 first (skipping voices)'); return; }
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.wav'))) {
    const [cat] = f.split('_');
    const w = readWav(path.join(src, f));
    let d = resample(w.data, w.sr, SR);
    // trim leading/trailing silence
    let a = 0, b = d.length - 1; const th = 0.02;
    while (a < b && Math.abs(d[a]) < th) a++;
    while (b > a && Math.abs(d[b]) < th) b--;
    d = d.slice(Math.max(0, a - Math.floor(0.01 * SR)), Math.min(d.length, b + Math.floor(0.03 * SR)));
    // presence boost (excited, cuts through the music) then a short room so it sits "in the audience"
    const hp = new Biquad('hp', 160, 0.7), pres = new Biquad('bp', 2800, 1.2);
    for (let i = 0; i < d.length; i++) { const x = hp.run(d[i]); d[i] = x + pres.run(x) * 0.6; }
    d = normalize(fadeEdges(room(d, 0.22, 0.3)), 0.85);
    writeWav(path.join(OUT, 'voice', cat, f), d);
  }
}

function buildCrowd() {
  const C = (cat, name, data) => writeWav(path.join(OUT, 'crowd', cat, name + '.wav'), data);
  C('murmur', 'murmur_0', murmur(11, 9, 18, 'calm'));
  C('murmur', 'murmur_1', murmur(12, 9, 18, 'calm'));
  C('worried', 'worried_0', murmur(21, 8, 16, 'worried'));
  C('applause_small', 'applause_small_0', applause(31, 2.6, 7));
  C('applause_small', 'applause_small_1', applause(32, 2.4, 9));
  C('applause_medium', 'applause_medium_0', applause(41, 3.8, 24));
  C('applause_medium', 'applause_medium_1', applause(42, 4.0, 28));
  C('applause_large', 'applause_large_0', applause(51, 5.5, 60));
  C('applause_large', 'applause_large_1', applause(52, 5.0, 70));
  C('cheer_small', 'cheer_small_0', cheer(61, 1.8, 5));
  C('cheer_small', 'cheer_small_1', cheer(62, 1.6, 6));
  C('cheer_small', 'cheer_small_2', cheer(63, 2.0, 4));
  C('cheer_large', 'cheer_large_0', cheer(71, 3.5, 40));
  C('cheer_large', 'cheer_large_1', cheer(72, 3.2, 45));
  for (let i = 0; i < 4; i++) C('whistle', 'whistle_' + i, whistle(80 + i));
  C('gasp', 'gasp_0', gasp(91)); C('gasp', 'gasp_1', gasp(92));
  C('groan', 'groan_0', groan(101)); C('groan', 'groan_1', groan(102));
  C('boo', 'boo_0', boo(111)); C('boo', 'boo_1', boo(112));
  C('celebration', 'celebration_0', celebration(121)); C('celebration', 'celebration_1', celebration(131));
}

function buildManifest() {
  const manifest = { version: 1, voice: {}, crowd: {} };
  for (const group of ['voice', 'crowd']) {
    const dir = path.join(OUT, group);
    if (!fs.existsSync(dir)) continue;
    for (const cat of fs.readdirSync(dir).sort()) {
      const files = fs.readdirSync(path.join(dir, cat)).filter(f => /\.(wav|mp3|ogg|m4a)$/i.test(f)).sort();
      if (files.length) manifest[group][cat] = files.map(f => `assets/audio/${group}/${cat}/${f}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(OUT, 'manifest.js'), '// Auto-generated by tools/build-audio.js (copy of manifest.json for file:// use)\nwindow.PAM_AUDIO_MANIFEST = ' + JSON.stringify(manifest) + ';\n');
  return manifest;
}

const t0 = Date.now();
if (!manifestOnly) { buildVoices(); buildCrowd(); }
const m = buildManifest();
let files = 0, bytes = 0;
for (const g of ['voice', 'crowd']) for (const c in m[g]) for (const f of m[g][c]) { files++; bytes += fs.statSync(path.join(ROOT, f)).size; }
console.log(`audio pack: ${files} files, ${(bytes / 1048576).toFixed(1)} MB, ${Date.now() - t0} ms`);
for (const g of ['voice', 'crowd']) console.log(g, Object.entries(m[g]).map(([k, v]) => `${k}:${v.length}`).join(' '));
