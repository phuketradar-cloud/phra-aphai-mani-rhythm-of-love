/*
 * DifficultyManager — turns a difficulty key into chart notes + pursuit/timing parameters.
 * Difficulty changes the chart (note density) and the pursuit rules, never the music speed.
 */
window.PAM = window.PAM || {};
PAM.DifficultyManager = {
  keys: ['easy', 'normal', 'hard'],
  get(key) { return PAM.Config.DIFFICULTIES[key] || PAM.Config.DIFFICULTIES.normal; },
  chartFor(beatmap, key) { return PAM.BeatMap.notesFor(beatmap, this.get(key).level); },
  /** 1..5 star rating from average note density. */
  stars(beatmap, key) {
    const notes = this.chartFor(beatmap, key);
    if (notes.length < 2) return 1;
    const nps = notes.length / (notes[notes.length - 1].time - notes[0].time);
    return Math.max(1, Math.min(5, Math.round(nps * 2.2)));
  }
};
