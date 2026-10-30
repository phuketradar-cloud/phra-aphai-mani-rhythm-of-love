/*
 * Storage — localStorage persistence for settings and records.
 * Every access is wrapped: private windows or blocked storage just fall back to defaults.
 */
window.PAM = window.PAM || {};
PAM.Storage = (function () {
  const KEY_SETTINGS = 'pam.settings.v1';
  const KEY_RECORDS = 'pam.records.v2';   // v2 = four-lane game (one-key records are not comparable)
  const KEY_BEATMAP = 'pam.beatmapOverride.';

  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  return {
    loadSettings() {
      const saved = read(KEY_SETTINGS, {});
      // migrate the single-slider settings of the one-key version
      if (saved.musicVolume !== undefined && saved.volMusic === undefined) saved.volMusic = saved.musicVolume;
      if (saved.sfxVolume !== undefined && saved.volFlute === undefined) saved.volFlute = saved.sfxVolume;
      delete saved.musicVolume; delete saved.sfxVolume;
      const s = Object.assign({}, PAM.Config.defaults, saved);
      if (!Array.isArray(s.keymap) || s.keymap.length !== 4) s.keymap = PAM.Config.defaults.keymap.slice();
      return s;
    },
    saveSettings(s) { write(KEY_SETTINGS, s); },

    getRecord(songId, difficulty) {
      const all = read(KEY_RECORDS, {});
      return Object.assign({ highScore: 0, bestCombo: 0, bestAccuracy: 0, bestCompletion: 0, cleared: false, plays: 0 },
        (all[songId] || {})[difficulty]);
    },
    /** Merge a finished run into the record. Returns flags for what improved. */
    submitRun(songId, difficulty, run) {
      const all = read(KEY_RECORDS, {});
      all[songId] = all[songId] || {};
      const r = this.getRecord(songId, difficulty);
      const improved = { score: run.score > r.highScore, combo: run.bestCombo > r.bestCombo };
      r.highScore = Math.max(r.highScore, run.score);
      r.bestCombo = Math.max(r.bestCombo, run.bestCombo);
      r.bestAccuracy = Math.max(r.bestAccuracy, run.accuracy);
      r.bestCompletion = Math.max(r.bestCompletion, run.completion);
      r.cleared = r.cleared || run.cleared;
      r.plays += 1;
      all[songId][difficulty] = r;
      write(KEY_RECORDS, all);
      return improved;
    },

    // Beat maps saved from the editor override the shipped file until cleared.
    loadBeatmapOverride(songId) { return read(KEY_BEATMAP + songId, null); },
    saveBeatmapOverride(songId, map) { return write(KEY_BEATMAP + songId, map); },
    clearBeatmapOverride(songId) { try { localStorage.removeItem(KEY_BEATMAP + songId); } catch (e) { /* ignore */ } }
  };
})();
