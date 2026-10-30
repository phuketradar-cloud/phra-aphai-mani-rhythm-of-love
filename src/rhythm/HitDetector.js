/*
 * HitDetector — pure timing judgement.
 */
window.PAM = window.PAM || {};
PAM.HitDetector = {
  /** windows = {perfect, good, ok} in seconds; scale = per-note window multiplier. */
  judge(delta, windows, scale = 1) {
    const d = Math.abs(delta);
    if (d <= windows.perfect * scale) return 'perfect';
    if (d <= windows.good * scale) return 'good';
    if (d <= windows.ok * scale) return 'ok';
    return null;
  },

  /**
   * Pick which unjudged note a press belongs to. Prefers the earliest note in range, unless
   * that note is already late and a later note is closer to the press.
   */
  pick(notes, from, t, windows) {
    let first = null;
    for (let i = from; i < notes.length; i++) {
      const n = notes[i];
      if (n.time - t > windows.ok * 2) break;
      if (n.judged) continue;
      const d = t - n.time;
      if (Math.abs(d) > windows.ok * n.window) continue;
      if (!first) { first = n; continue; }
      if (t - first.time > 0 && Math.abs(d) < Math.abs(t - first.time)) return n;
      break;
    }
    return first;
  }
};
