/*
 * VoiceFeedbackManager — short English hype-announcer reactions (pre-recorded/pre-generated samples only).
 *
 * Rules (all numbers in PAM.Config.audio.voice):
 *  - never a voice on every note: chance + milestones + a global cooldown
 *  - one voice at a time; a higher-priority line may cut a lower one with a quick fade,
 *    otherwise the new line is skipped (no unintelligible overlaps)
 *  - shuffle bags per category, so the same sample is never picked twice in a row
 *  - excitement: during a PERFECT streak the lines play slightly faster/higher and louder
 *  - while a voice plays, the music and crowd ambience are ducked so the announcer cuts through
 */
window.PAM = window.PAM || {};
PAM.VoiceFeedbackManager = class VoiceFeedbackManager {
  constructor(audio) {
    this.audio = audio;
    this.bags = {};
    this.current = null;      // { handle, priority, until }
    this.cooldownUntil = 0;
    this.lastCategory = null;
    this.enabled = true;
    this.log = [];            // recent plays (for testing / debug overlay)
  }

  get C() { return PAM.Config.audio.voice; }
  now() { return this.audio.ctx ? this.audio.ctx.currentTime : 0; }

  reset() { this.stop(); this.cooldownUntil = 0; this.log = []; }

  stop() { if (this.current && this.current.handle) this.current.handle.stop(0.08); this.current = null; }

  /** Next sample from a shuffled bag (refilled when empty, never repeating the last one). */
  pick(category) {
    const list = this.audio.sampleList('voice/' + category);
    if (!list.length) return null;
    let bag = this.bags[category];
    if (!bag || !bag.items.length) {
      const items = list.map((_, i) => i);
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      if (bag && items.length > 1 && items[items.length - 1] === bag.last) items.unshift(items.pop());
      bag = this.bags[category] = { items, last: bag ? bag.last : -1 };
    }
    const idx = bag.items.pop();
    bag.last = idx;
    return list[idx];
  }

  /** Play a category. priority: 1 = flavour, 2 = milestone / important, 3 = ending. */
  say(category, { priority = 1, excitement = 0, force = false } = {}) {
    if (!this.enabled) return false;
    const t = this.now();
    if (!force && t < this.cooldownUntil && priority < 3) return false;
    if (this.current && t < this.current.until) {
      if (priority <= this.current.priority) return false;
      this.current.handle.stop(0.06);
    }
    const sample = this.pick(category);
    if (!sample) return false;
    const rate = 1 + Math.min(0.12, excitement * 0.12);
    const gain = this.C.gain * (0.9 + Math.min(0.2, excitement * 0.2));
    const handle = this.audio.play(sample, 'voice', { gain, rate, pan: (Math.random() - 0.5) * 0.5 });
    if (!handle) return false;
    const dur = handle.duration;
    this.current = { handle, priority, until: t + dur };
    this.cooldownUntil = t + dur + this.C.cooldown * (priority >= 2 ? 0.6 : 1);
    this.audio.duck({ music: this.C.duckMusic, crowdAmb: 0.45, crowdReact: 0.7 }, dur);
    this.lastCategory = category;
    this.log.push({ t: +t.toFixed(2), category, file: sample.url.split('/').pop(), priority });
    if (this.log.length > 40) this.log.shift();
    return true;
  }

  /** Called for every judgement. Decides whether this moment deserves a voice line. */
  onJudge(judgement, perfectStreak, missStreak, combo) {
    const C = this.C;
    if (judgement === 'perfect') {
      const excitement = Math.min(1, perfectStreak / 40);
      if (C.perfectStreakMilestones.includes(perfectStreak)) return this.say('streak', { priority: 2, excitement });
      if (perfectStreak >= C.minPerfectStreak && Math.random() < C.perfectChance) return this.say('perfect', { excitement });
    } else if (judgement === 'good' || judgement === 'ok') {
      if (Math.random() < C.goodChance) return this.say('good');
    } else if (judgement === 'miss') {
      if (missStreak === 1 && combo === 0 && Math.random() < C.missChance) return this.say('miss');
      if (missStreak === 3) return this.say('miss', { priority: 2 });
    }
    return false;
  }
};
