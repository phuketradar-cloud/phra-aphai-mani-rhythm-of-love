/*
 * ScoreManager — score, combo and judgement counters for the current run.
 */
window.PAM = window.PAM || {};
PAM.ScoreManager = {
  multiplier(combo) {
    const S = PAM.Config.scoring;
    return Math.min(S.maxComboMultiplier, 1 + Math.floor(combo / S.comboStep) * S.comboBonus);
  },

  hit(run, judgement, noteType) {
    const S = PAM.Config.scoring;
    run.combo++;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    run[judgement]++;
    run.judged++;
    run.missStreak = 0;
    const gained = Math.round(S[judgement] * (S.typeMultiplier[noteType] || 1) * this.multiplier(run.combo));
    run.score += gained;
    return gained;
  },

  miss(run) {
    run.combo = 0;
    run.miss++;
    run.judged++;
    run.missStreak++;
  }
};
