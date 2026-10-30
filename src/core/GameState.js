/*
 * GameState — the scene state machine names plus a factory for one run's mutable stats.
 * Retry creates a fresh RunStats instead of patching the old one, so nothing leaks between runs.
 */
window.PAM = window.PAM || {};
PAM.GameState = {
  MENU: 'menu',
  INTRO: 'intro',          // establishing shot before the countdown
  COUNTDOWN: 'countdown',  // music scheduled, song time < 0
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESUMING: 'resuming',    // short countdown after pause
  CAPTURE: 'capture',      // failure cinematic
  VICTORY: 'victory',      // success cinematic
  RESULTS: 'results',

  createRun(song, difficultyKey) {
    return {
      song, difficulty: difficultyKey,
      score: 0, combo: 0, bestCombo: 0,
      perfect: 0, good: 0, ok: 0, miss: 0,
      judged: 0, totalNotes: 0,
      missStreak: 0,
      endTime: 0,             // song time when the run ended
      cleared: false,
      get accuracy() {
        if (!this.judged) return 1;
        return (this.perfect + this.good * 0.7 + this.ok * 0.4) / this.judged;
      }
    };
  }
};
