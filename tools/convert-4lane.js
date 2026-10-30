#!/usr/bin/env node
/*
 * Upgrades single-lane beat maps (format 1) in assets/beatmaps/ to the four-lane format (format 2).
 *   node tools/convert-4lane.js            converts every map that is not format 2 yet
 *   node tools/convert-4lane.js --force    re-converts all maps from their single-lane timing
 * Note timing and difficulty tags are kept exactly; lanes, chords, holds and streams are added
 * by BeatAnalyzer.toFourLane (deterministic per song id).
 */
const fs = require('fs');
const path = require('path');
const BA = require('../src/audio/BeatAnalyzer.js');

const dir = path.join(__dirname, '../assets/beatmaps');
const force = process.argv.includes('--force');

for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('.analysis'))) {
  const file = path.join(dir, f);
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (map.format === 2 && !force) { console.log(f, 'already 4-lane'); continue; }
  // single-lane source: for --force on a converted map, rebuild from the base (non-chord-extra) notes
  let src = map.notes;
  if (map.format === 2) src = map.notes.filter(n => !n.chord || n === map.notes.find(m => m.chord === n.chord && m.difficulty === Math.min(...map.notes.filter(k => k.chord === n.chord).map(k => k.difficulty))))
    .map(n => ({ time: n.time, difficulty: n.difficulty, type: n.accent ? (n.type === 'chord' ? 'spell' : 'accent') : 'normal' }));
  map.notes = BA.toFourLane(src, BA.hashSeed(map.id));
  map.format = 2;
  map.lanes = ['up', 'left', 'down', 'right'];
  fs.writeFileSync(file, JSON.stringify(map, null, 1));
  fs.writeFileSync(path.join(dir, map.id + '.beatmap.js'), BA.embeddedJs(map));
  const stat = L => {
    const v = map.notes.filter(n => n.difficulty <= L);
    const times = {}; v.forEach(n => { times[n.time] = (times[n.time] || 0) + 1; });
    const chords = Object.values(times).filter(c => c >= 2).length, triples = Object.values(times).filter(c => c >= 3).length;
    const lanes = [0, 1, 2, 3].map(l => v.filter(n => n.lane === l).length).join('/');
    return `${v.length} notes, ${chords} chords (${triples} x3), ${v.filter(n => n.type === 'hold').length} holds, ${v.filter(n => n.type === 'stream').length} stream, lanes ${lanes}`;
  };
  console.log(`${f}\n  easy:   ${stat(1)}\n  normal: ${stat(2)}\n  hard:   ${stat(3)}`);
}
