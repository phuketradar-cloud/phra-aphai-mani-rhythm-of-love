/*
 * RhythmEngine — four independent lanes: note lists, judgement, holds and automatic misses.
 * It never looks at frames: every call receives the song time from the music clock.
 *
 * Events returned by update()/press()/release():
 *   { type: 'hit', note, judgement, delta }
 *   { type: 'miss', note }                      head not hit in time
 *   { type: 'holdDone', note }                  hold kept until the end
 *   { type: 'holdBreak', note }                 hold released too early (counts as a miss)
 *   { type: 'wrong', lane, expected }           key pressed in a lane with nothing to hit while
 *                                               another lane has a note right now
 */
window.PAM = window.PAM || {};
PAM.RhythmEngine = class RhythmEngine {
  constructor() {
    this.notes = [];
    this.lanes = [[], [], [], []];
    this.heads = [0, 0, 0, 0];   // per lane: first note that may still be unjudged
    this.windows = Object.assign({}, PAM.Config.timing);
  }

  setup(chartNotes, timingScale) {
    this.notes = chartNotes.map((n, i) => new PAM.Note(n, i));
    this.lanes = [[], [], [], []];
    for (const n of this.notes) this.lanes[n.lane].push(n);
    this.heads = [0, 0, 0, 0];
    const t = PAM.Config.timing;
    this.windows = { perfect: t.perfect * timingScale, good: t.good * timingScale, ok: t.ok * timingScale };
  }

  get total() { return this.notes.length; }
  get holdCount() { return this.notes.filter(n => n.kind === 'hold').length; }
  /** Judgements a run can earn: one per note + one per hold tail. */
  get totalJudgements() { return this.total + this.holdCount; }
  get lastNoteTime() { return this.notes.length ? Math.max(...this.notes.slice(-8).map(n => n.endTime)) : 0; }
  get allJudged() { return this.notes.every(n => n.judged && !n.holding); }

  advance(lane) {
    const list = this.lanes[lane];
    while (this.heads[lane] < list.length && list[this.heads[lane]].judged) this.heads[lane]++;
  }

  /**
   * Per frame. keysDown[lane] = is the lane's key physically held.
   * Marks late heads as missed and resolves holds (finished / released early).
   */
  update(t, keysDown) {
    const events = [];
    const tol = PAM.Config.input.holdReleaseTolerance;
    for (let lane = 0; lane < 4; lane++) {
      const list = this.lanes[lane];
      for (let i = this.heads[lane]; i < list.length; i++) {
        const n = list[i];
        if (n.judged) continue;
        if (t - n.time > this.windows.ok * n.window) {
          n.judged = true; n.judgement = 'miss'; n.delta = t - n.time; n.judgedAt = t;
          if (n.kind === 'hold') n.holdResult = 'broken';
          events.push({ type: 'miss', note: n });
        } else break;
      }
      this.advance(lane);
      // active holds in this lane
      for (const n of list) {
        if (!n.holding) continue;
        if (t >= n.endTime) { n.holding = false; n.holdResult = 'done'; n.holdEndedAt = n.endTime; events.push({ type: 'holdDone', note: n }); }
        else if (!keysDown[lane] && t < n.endTime - tol) { n.holding = false; n.holdResult = 'broken'; n.holdEndedAt = t; events.push({ type: 'holdBreak', note: n }); }
      }
    }
    return events;
  }

  /** Key pressed in a lane at song time t. Returns an event or null (null = harmless press). */
  press(lane, t) {
    const list = this.lanes[lane];
    const n = PAM.HitDetector.pick(list, this.heads[lane], t, this.windows);
    if (n) {
      const delta = t - n.time;
      const judgement = PAM.HitDetector.judge(delta, this.windows, n.window);
      if (judgement) {
        n.judged = true; n.judgement = judgement; n.delta = delta; n.judgedAt = t;
        if (n.kind === 'hold') n.holding = true;
        this.advance(lane);
        return { type: 'hit', note: n, judgement, delta };
      }
    }
    // wrong lane: nothing here, but another lane has a note right now
    const w = this.windows[PAM.Config.input.wrongLaneWindow] || this.windows.good;
    for (let other = 0; other < 4; other++) {
      if (other === lane) continue;
      const o = this.lanes[other];
      for (let i = this.heads[other]; i < o.length; i++) {
        const m = o[i];
        if (m.time - t > w) break;
        if (!m.judged && Math.abs(m.time - t) <= w) return { type: 'wrong', lane, expected: other };
      }
    }
    return null;
  }

  /** Key released: ends a hold early if it is still running (resolved in update with the tolerance). */
  release(lane, t) {
    for (const n of this.lanes[lane]) {
      if (!n.holding) continue;
      const tol = PAM.Config.input.holdReleaseTolerance;
      n.holding = false; n.holdEndedAt = t;
      if (t >= n.endTime - tol) { n.holdResult = 'done'; return { type: 'holdDone', note: n }; }
      n.holdResult = 'broken'; return { type: 'holdBreak', note: n };
    }
    return null;
  }

  /** Notes inside [t0, t1] (by head or tail) for drawing. */
  visible(t0, t1) {
    const out = [];
    for (const n of this.notes) {
      if (n.time > t1) break;
      if (n.endTime >= t0 || n.holding) out.push(n);
    }
    return out;
  }

  /** All notes of a chord group (for chord-complete bonuses). */
  chordNotes(id) { return id ? this.notes.filter(n => n.chord === id) : []; }
};
