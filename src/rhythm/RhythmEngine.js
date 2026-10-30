/*
 * RhythmEngine — note list for one run, input judgement and automatic misses.
 * It never looks at frames: every call receives the song time from the music clock.
 */
window.PAM = window.PAM || {};
PAM.RhythmEngine = class RhythmEngine {
  constructor() {
    this.notes = [];
    this.head = 0;               // first note that may still be unjudged
    this.windows = Object.assign({}, PAM.Config.timing);
  }

  setup(chartNotes, timingScale) {
    this.notes = chartNotes.map((n, i) => new PAM.Note(n, i));
    this.head = 0;
    const t = PAM.Config.timing;
    this.windows = { perfect: t.perfect * timingScale, good: t.good * timingScale, ok: t.ok * timingScale };
  }

  get total() { return this.notes.length; }
  get lastNoteTime() { return this.notes.length ? this.notes[this.notes.length - 1].time : 0; }
  get allJudged() { return this.head >= this.notes.length; }

  /** Mark notes whose window has fully passed as MISS. Returns the newly missed notes. */
  update(songTime) {
    const missed = [];
    for (let i = this.head; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.judged) continue;
      if (songTime - n.time > this.windows.ok * n.window) {
        n.judged = true; n.judgement = 'miss'; n.delta = songTime - n.time; n.judgedAt = songTime;
        missed.push(n);
      } else break;
    }
    while (this.head < this.notes.length && this.notes[this.head].judged) this.head++;
    return missed;
  }

  /** A hit key at song time t. Returns {note, judgement, delta} or null if no note is in range. */
  press(t) {
    const n = PAM.HitDetector.pick(this.notes, this.head, t, this.windows);
    if (!n) return null;
    const delta = t - n.time;
    const judgement = PAM.HitDetector.judge(delta, this.windows, n.window);
    if (!judgement) return null;
    n.judged = true; n.judgement = judgement; n.delta = delta; n.judgedAt = t;
    while (this.head < this.notes.length && this.notes[this.head].judged) this.head++;
    return { note: n, judgement, delta };
  }

  /** Notes inside [t0, t1] for drawing (includes recently judged ones for fade-outs). */
  visible(t0, t1) {
    const out = [];
    // binary search to the first note >= t0
    let lo = 0, hi = this.notes.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.notes[m].time < t0) lo = m + 1; else hi = m; }
    for (let i = lo; i < this.notes.length && this.notes[i].time <= t1; i++) out.push(this.notes[i]);
    return out;
  }

  nextNote(t) {
    for (let i = this.head; i < this.notes.length; i++) if (!this.notes[i].judged && this.notes[i].time >= t - this.windows.ok) return this.notes[i];
    return null;
  }
};
