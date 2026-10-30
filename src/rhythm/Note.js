/*
 * Note — runtime state of one chart note. Created fresh for every run.
 */
window.PAM = window.PAM || {};
PAM.Note = class Note {
  constructor(data, index) {
    this.index = index;
    this.time = data.time;
    this.lane = data.lane;
    this.type = data.type;
    this.window = data.window || 1;
    this.fx = data.fx;
    this.judged = false;
    this.judgement = null;   // perfect | good | ok | miss
    this.delta = 0;          // hit time - note time (s); negative = early
    this.judgedAt = 0;       // song time of judgement (for fade-out effects)
  }
};
