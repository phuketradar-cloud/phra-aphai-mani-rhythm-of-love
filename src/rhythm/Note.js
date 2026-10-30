/*
 * Note — runtime state of one chart note. Created fresh for every run.
 * kind: normal | double | chord | hold | stream (what the player sees at this difficulty)
 */
window.PAM = window.PAM || {};
PAM.Note = class Note {
  constructor(data, index) {
    this.index = index;
    this.time = data.time;
    this.lane = data.lane || 0;
    this.kind = data.kind || data.type || 'normal';
    this.accent = !!data.accent;
    this.duration = this.kind === 'hold' ? data.duration : 0;
    this.chord = data.chord || 0;
    this.chordSize = data.chordSize || 1;
    this.window = data.window || 1;
    this.fx = data.fx;
    this.judged = false;
    this.judgement = null;   // perfect | good | ok | miss
    this.delta = 0;          // hit time - note time (s); negative = early
    this.judgedAt = 0;       // song time of judgement (for fade-out effects)
    // hold state
    this.holding = false;
    this.holdResult = null;  // 'done' | 'broken' | null
    this.holdEndedAt = 0;
  }
  get endTime() { return this.time + this.duration; }
};
