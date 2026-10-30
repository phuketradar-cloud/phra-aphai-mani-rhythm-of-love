#!/usr/bin/env node
/*
 * Offline beat-map generator.
 *   node tools/analyze-song.js "assets/music/Feltwood Requiem.wav" feltwood_requiem "Feltwood Requiem"
 * Writes:
 *   assets/beatmaps/<id>.json          editable beat map (source of truth)
 *   assets/beatmaps/<id>.beatmap.js    same data wrapped for file:// use (regenerate after edits)
 *   assets/beatmaps/<id>.analysis.json BPM / beats / sections report
 * Only 16-bit or 24-bit PCM WAV is supported here (the in-browser editor can analyze any format).
 */
const fs = require('fs');
const path = require('path');
const BeatAnalyzer = require('../src/audio/BeatAnalyzer.js');

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let p = 12, fmt = null, data = null;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), sampleRate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = { start: p + 8, size }; break; }
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.format !== 1) throw new Error('Unsupported WAV (need PCM)');
  const bytes = fmt.bits / 8, frames = Math.floor(data.size / (bytes * fmt.channels));
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) {
    const o = data.start + (i * fmt.channels + c) * bytes;
    channels[c][i] = fmt.bits === 16 ? b.readInt16LE(o) / 32768 : b.readIntLE(o, 3) / 8388608;
  }
  return { channels, sampleRate: fmt.sampleRate };
}

const [, , wavArg, idArg, titleArg] = process.argv;
const root = path.join(__dirname, '..');
const wav = wavArg || path.join(root, 'assets/music/Feltwood Requiem.wav');
const id = idArg || 'feltwood_requiem';
const title = titleArg || 'Feltwood Requiem';

const t0 = Date.now();
const { channels, sampleRate } = readWav(wav);
const an = BeatAnalyzer.analyze(channels, sampleRate);
const notes = BeatAnalyzer.generateChart(an);

const count = lvl => notes.filter(n => n.difficulty <= lvl).length;
const beatmap = BeatAnalyzer.buildBeatmap(an, notes, { id, title, audio: 'assets/music/' + path.basename(wav), tool: 'tools/analyze-song.js' });
const outDir = path.join(root, 'assets/beatmaps');
fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(beatmap, null, 1));
fs.writeFileSync(path.join(outDir, id + '.beatmap.js'), BeatAnalyzer.embeddedJs(beatmap));
fs.writeFileSync(path.join(outDir, id + '.analysis.json'), JSON.stringify({
  pulseBpm: an.bpm, feltBpm: an.feltBpm, globalAutocorrBpm: an.globalBpm, tempoCandidates: an.tempoCandidates,
  attackShiftSec: an.attackShift, firstBeat: an.firstBeat, firstDownbeat: an.firstDownbeat,
  barPhase: an.barPhase, duration: an.duration, sections: an.sections,
  beats: an.beats.map(b => ({ t: +b.time.toFixed(3), onset: +b.onset.toFixed(3), energy: +b.energy.toFixed(3), barPos: b.barPos, section: b.section }))
}, null, 1));

console.log(`analyzed ${an.duration.toFixed(1)}s in ${Date.now() - t0} ms`);
console.log(`pulse BPM ${an.bpm.toFixed(2)} (felt ${an.feltBpm.toFixed(2)}; autocorr ${an.globalBpm.toFixed(2)}), attack shift ${(an.attackShift * 1000).toFixed(1)} ms, first downbeat ${an.firstDownbeat.toFixed(3)}s, pulses ${an.beats.length}`);
console.log('tempo candidates', JSON.stringify(an.tempoCandidates));
console.log('sections', an.sections.map(s => `${s.kind}@${s.start.toFixed(1)}(${s.energy})`).join(' '));
console.log(`notes easy ${count(1)}, normal ${count(2)}, hard ${count(3)}`);
for (const L of [1, 2, 3]) {
  const ts = notes.filter(n => n.difficulty <= L).map(n => n.time);
  let minGap = Infinity; for (let i = 1; i < ts.length; i++) minGap = Math.min(minGap, ts[i] - ts[i - 1]);
  console.log(`  level ${L}: first ${ts[0]}s, last ${ts[ts.length - 1]}s, min gap ${minGap.toFixed(3)}s, avg ${(ts.length / (ts[ts.length - 1] - ts[0])).toFixed(2)} notes/s`);
}
