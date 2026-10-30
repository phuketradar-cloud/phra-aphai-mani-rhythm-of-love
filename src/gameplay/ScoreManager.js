/*
 * ScoreManager — score, combo and judgement counters for the current run.
 */
window.PAM = window.PAM || {};
PAM.ScoreManager = {
  multiplier(combo) {
    const S = PAM.Config.scoring;
    return Math.min(S.maxComboMultiplier, 1 + Math.floor(combo / S.comboStep) * S.comboBonus);
  },

  /** note: runtime Note (kind, accent) or a plain type string from older callers. */
  hit(run, judgement, note) {
    const S = PAM.Config.scoring;
    run.combo++;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    run[judgement]++;
    run.judged++;
    run.missStreak = 0;
    const kind = typeof note === 'string' ? note : note.kind;
    const mult = (S.typeMultiplier[kind] || 1) * (note && note.accent ? S.typeMultiplier.accent : 1);
    const gained = Math.round(S[judgement] * mult * this.multiplier(run.combo));
    run.score += gained;
    return gained;
  },

  /** A hold kept to the end counts as one more successful judgement. */
  holdDone(run) {
    const S = PAM.Config.scoring;
    run.combo++;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    run.judged++;   // counted in run.holdsDone by the caller (weighted like a PERFECT in accuracy)
    run.score += Math.round(S.holdTail * this.multiplier(run.combo));
  },

  miss(run) {
    run.combo = 0;
    run.miss++;
    run.judged++;
    run.missStreak++;
  }
};
