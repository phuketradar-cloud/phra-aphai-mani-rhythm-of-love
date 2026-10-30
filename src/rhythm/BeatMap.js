/*
 * BeatMap — loads, validates and filters the editable JSON chart.
 *
 * Load order:
 *   1. editor override saved in localStorage (if any)
 *   2. the JSON file (needs http:// — see Play.bat)
 *   3. the embedded copy in <id>.beatmap.js (works from file://)
 *
 * Note fields: time (s), lane (0 = any hit key), type (normal|soft|accent|spell),
 * difficulty (1 easy, 2 normal, 3 hard = lowest level that includes it),
 * window (optional per-note timing scale), fx (optional visual effect name).
 */
window.PAM = window.PAM || {};
PAM.BeatMap = {
  async load(song, { ignoreOverride = false } = {}) {
    if (!ignoreOverride) {
      const o = PAM.Storage.loadBeatmapOverride(song.id);
      if (o && Array.isArray(o.notes)) return this.normalize(Object.assign({ source: 'editor (local override)' }, o));
    }
    try {
      const res = await fetch(song.beatmap, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return this.normalize(Object.assign(await res.json(), { source: song.beatmap }));
    } catch (e) {
      const embedded = (window.PAM_BEATMAPS || {})[song.id];
      if (embedded) return this.normalize(Object.assign({}, embedded, { source: 'embedded .beatmap.js' }));
      throw new Error('Beat map not found for ' + song.id);
    }
  },

  normalize(map) {
    let raw = (map.notes || []).filter(n => typeof n.time === 'number' && isFinite(n.time));
    // one-key (format 1) maps, e.g. an old editor override, are upgraded to four lanes on load
    if (map.format !== 2 && !raw.some(n => n.lane > 0) && PAM.BeatAnalyzer) {
      raw = PAM.BeatAnalyzer.toFourLane(raw, PAM.BeatAnalyzer.hashSeed(map.id || map.song || 'song'));
    }
    const notes = raw
      .map(n => ({
        time: n.time,
        lane: Math.max(0, Math.min(3, n.lane || 0)),
        type: n.type || 'normal',
        difficulty: n.difficulty || 1,
        duration: n.type === 'hold' ? Math.max(0.2, n.duration || 0.5) : 0,
        chord: n.chord || 0,
        accent: !!n.accent,
        window: n.window || 1,
        fx: n.fx || null
      }))
      .sort((a, b) => a.time - b.time || a.lane - b.lane);
    return Object.assign({}, map, { format: 2, notes });
  },

  /**
   * Notes for one difficulty level (1..3), with `kind` = what the player sees at this level:
   * a chord whose partner notes are hidden at this difficulty becomes a normal note again.
   */
  notesFor(map, level) {
    const notes = map.notes.filter(n => n.difficulty <= level).map(n => Object.assign({}, n));
    const groups = {};
    for (const n of notes) if (n.chord) (groups[n.chord] = groups[n.chord] || []).push(n);
    for (const n of notes) {
      const size = n.chord ? groups[n.chord].length : 1;
      n.chordSize = size;
      n.kind = size >= 3 ? 'chord' : size === 2 ? 'double' : n.type === 'double' || n.type === 'chord' ? 'normal' : n.type;
    }
    return notes;
  },

  countFor(map, level) { return this.notesFor(map, level).length; },

  sectionAt(map, t) {
    const s = (map.sections || []).find(s => t >= s.start && t < s.end);
    return s ? s.kind : 'build';
  }
};
