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
    const notes = (map.notes || [])
      .filter(n => typeof n.time === 'number' && isFinite(n.time))
      .map(n => ({
        time: n.time,
        lane: n.lane || 0,
        type: n.type || 'normal',
        difficulty: n.difficulty || 1,
        window: n.window || 1,
        fx: n.fx || null
      }))
      .sort((a, b) => a.time - b.time);
    return Object.assign({}, map, { notes });
  },

  /** Notes for one difficulty level (1..3). */
  notesFor(map, level) {
    return map.notes.filter(n => n.difficulty <= level);
  },

  countFor(map, level) { return this.notesFor(map, level).length; },

  sectionAt(map, t) {
    const s = (map.sections || []).find(s => t >= s.start && t < s.end);
    return s ? s.kind : 'build';
  }
};
