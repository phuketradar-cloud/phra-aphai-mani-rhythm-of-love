/*
 * CrowdManager — a live audience that reacts to the whole performance.
 *
 * Layers (samples from assets/audio/crowd/, mixed on the crowdAmb / crowdReact channels):
 *   ambience  murmur loop (two loops cross-faded so the chatter never sounds identical)
 *   worried   tense murmur loop, faded in with danger
 *   reactions applause small/medium/large, individual cheers, large cheers, whistles,
 *             gasps, groans, boos, full celebration
 *
 * Phases: intro (anticipation: louder chatter, scattered claps) -> song (low ambience) ->
 * finale / capture. Excitement (0..1) follows combo and accuracy and slowly raises the ambience
 * and the chance of spontaneous cheers; tension (danger) suppresses positive reactions.
 * Every category has a cooldown and a shuffle bag; at most a few reactions sound at once.
 */
window.PAM = window.PAM || {};
PAM.CrowdManager = class CrowdManager {
  constructor(audio) {
    this.audio = audio;
    this.loops = {};
    this.active = [];          // live reaction handles { handle, until }
    this.cool = {};
    this.bags = {};
    this.excitement = 0; this.tension = 0;
    this.phase = 'idle';
    this.enabled = true;
    this.log = [];
    this.spontaneousT = 0;
  }

  get C() { return PAM.Config.audio.crowd; }
  now() { return this.audio.ctx ? this.audio.ctx.currentTime : 0; }

  pick(cat) {
    const list = this.audio.sampleList('crowd/' + cat);
    if (!list.length) return null;
    let bag = this.bags[cat];
    if (!bag || !bag.length) {
      bag = this.bags[cat] = list.map((_, i) => i).sort(() => Math.random() - 0.5);
      if (bag.length > 1 && bag[bag.length - 1] === this.bags[cat + ':last']) bag.unshift(bag.pop());
    }
    const i = bag.pop(); this.bags[cat + ':last'] = i;
    return list[i];
  }

  /** Fire one reaction. Respects per-category cooldown and the concurrency limit (unless forced). */
  react(cat, { gain = 1, cooldown = 0, force = false, delay = 0, rate } = {}) {
    if (!this.enabled) return false;
    const t = this.now();
    this.active = this.active.filter(a => a.until > t);
    if (!force) {
      if (this.cool[cat] && t < this.cool[cat]) return false;
      if (this.active.length >= this.C.maxConcurrent) return false;
    }
    const sample = this.pick(cat);
    if (!sample) return false;
    const fire = () => {
      const h = this.audio.play(sample, 'crowdReact', { gain, pan: (Math.random() - 0.5) * 0.9, width: 0.8, rate: rate || (0.96 + Math.random() * 0.08) });
      if (!h) return;
      this.active.push({ handle: h, until: this.now() + h.duration });
      this.log.push({ t: +this.now().toFixed(2), cat, file: sample.url.split('/').pop() });
      if (this.log.length > 60) this.log.shift();
    };
    if (delay > 0) setTimeout(fire, delay * 1000); else fire();
    if (cooldown) this.cool[cat] = t + cooldown;
    return true;
  }

  // ------------------------------------------------------------------ loops
  startLoop(name, cat, gain) {
    if (this.loops[name] || !this.enabled) return;
    const sample = this.pick(cat);
    if (!sample) return;
    const h = this.audio.play(sample, 'crowdAmb', { gain: Math.max(0.0002, gain), loop: true, width: 1, fadeIn: 1.5, offset: Math.random() * 3 });
    if (h) this.loops[name] = { handle: h, gain };
  }
  setLoop(name, gain, sec = 1.2) {
    const l = this.loops[name]; if (!l) return;
    if (Math.abs(l.gain - gain) < 0.01) return;
    l.gain = gain; l.handle.setGain(Math.max(0.0002, gain), sec);
  }
  stopLoops(fade = 1) { for (const k in this.loops) this.loops[k].handle.stop(fade); this.loops = {}; }

  // ------------------------------------------------------------------ phases
  /** Pre-song anticipation: chatter, a few claps and a whistle. */
  intro() {
    this.reset();
    this.phase = 'intro';
    this.startLoop('murmurA', 'murmur', this.C.introAmbience);
    this.startLoop('murmurB', 'murmur', this.C.introAmbience * 0.6);
    this.startLoop('worried', 'worried', 0.0002);
    this.react('applause_small', { gain: 0.45, delay: 0.6, force: true });
    this.react('whistle', { gain: 0.35, delay: 1.4, force: true });
  }
  /** Music started: the audience settles down. */
  songStart() {
    this.phase = 'song';
    this.setLoop('murmurA', this.C.songAmbience, 2.5);
    this.setLoop('murmurB', this.C.songAmbience * 0.5, 2.5);
  }

  pause() { for (const k in this.loops) this.loops[k].handle.setGain(0.0002, 0.3); this.active.forEach(a => a.handle.stop(0.2)); this.active = []; }
  resume() { for (const k in this.loops) this.loops[k].handle.setGain(Math.max(0.0002, this.loops[k].gain), 0.8); }

  reset() { this.stopLoops(0.3); this.active.forEach(a => a.handle.stop(0.2)); this.active = []; this.cool = {}; this.excitement = 0; this.tension = 0; this.phase = 'idle'; this.log = []; }

  // ------------------------------------------------------------------ performance hooks
  onCombo(combo) {
    const pos = 1 - this.tension * 0.6; // danger suppresses positive cheering
    const C = this.C;
    if (combo === 5) this.react('applause_small', { gain: 0.6 * pos, force: true });
    else if (combo === 10) { this.react('applause_medium', { gain: 0.7 * pos, force: true }); this.react('cheer_small', { gain: 0.6 * pos, force: true, delay: 0.2 }); }
    else if (combo === 25) { this.react('applause_large', { gain: 0.75 * pos, force: true }); this.react('whistle', { gain: 0.5 * pos, force: true, delay: 0.3 }); this.react('whistle', { gain: 0.4 * pos, force: true, delay: 1.1 }); this.react('cheer_small', { gain: 0.6 * pos, force: true, delay: 0.5 }); }
    else if (combo === 50) { this.react('cheer_large', { gain: 0.8 * pos, force: true }); this.react('applause_large', { gain: 0.8 * pos, force: true, delay: 0.25 }); for (let i = 0; i < 3; i++) this.react('whistle', { gain: 0.45 * pos, force: true, delay: 0.4 + i * 0.7 }); }
    else if (combo === 100 || (combo > 100 && combo % C.bigEvery === 0)) {
      this.react('celebration', { gain: 0.9 * pos, force: true });
      this.react('cheer_large', { gain: 0.6 * pos, force: true, delay: 1.5 });
      for (let i = 0; i < 4; i++) this.react('whistle', { gain: 0.45 * pos, force: true, delay: 0.5 + i * 0.9 });
      this.audio.duck({ music: 0.8 }, 3);
    } else return false;
    this.excitement = Math.min(1, this.excitement + 0.1);
    return true;
  }

  onPerfectStreak(streak) {
    if (streak > 0 && streak % this.C.perfectShoutEvery === 0 && this.tension < 0.6) this.react('cheer_small', { gain: 0.55, cooldown: 3 });
  }

  onMiss(missStreak) {
    if (missStreak === 2) this.react('groan', { gain: 0.55, cooldown: 4 });
    else if (missStreak === 3) this.react('groan', { gain: 0.65, cooldown: 3, force: true });
    else if (missStreak >= 4 && Math.random() < this.C.booChance) this.react('boo', { gain: 0.5, cooldown: 8 });
    this.excitement = Math.max(0, this.excitement - 0.12);
  }

  /** The giantess starts charging. */
  onCharge() { this.react('gasp', { gain: 0.7, cooldown: 6, force: true }); }

  /** Called every frame while playing. */
  update(dt, { combo, accuracy, danger }) {
    if (this.phase !== 'song') return;
    const C = this.C;
    const target = Math.min(1, combo / 60) * 0.7 + Math.max(0, accuracy - 0.6) * 0.75;
    this.excitement += (target - this.excitement) * Math.min(1, dt * 0.4);
    this.tension += (danger - this.tension) * Math.min(1, dt * 1.5);
    // ambience slowly follows the excitement; worried chatter follows danger
    this.setLoop('murmurA', C.songAmbience * (1 + this.excitement * 0.6) * (1 - this.tension * 0.5), 1.5);
    this.setLoop('worried', this.tension > 0.45 ? C.worriedMax * (this.tension - 0.45) / 0.55 : 0.0002, 1.2);
    // spontaneous reactions from an excited audience (never during danger)
    this.spontaneousT -= dt;
    if (this.spontaneousT <= 0) {
      this.spontaneousT = 2.5 + Math.random() * 3;
      if (this.tension < 0.4 && Math.random() < this.excitement * C.spontaneousChance) this.react(Math.random() < 0.6 ? 'cheer_small' : 'whistle', { gain: 0.3 + this.excitement * 0.3 });
    }
  }

  // ------------------------------------------------------------------ endings
  celebrate() {
    this.phase = 'finale';
    this.setLoop('worried', 0.0002, 0.5);
    this.setLoop('murmurA', this.C.songAmbience * 1.4, 1);
    this.react('celebration', { gain: 1, force: true });
    this.react('applause_large', { gain: 0.85, force: true, delay: 0.3 });
    this.react('cheer_large', { gain: 0.75, force: true, delay: 0.9 });
    for (let i = 0; i < 6; i++) this.react('whistle', { gain: 0.5, force: true, delay: 0.4 + i * 0.6 + Math.random() * 0.3 });
    this.audio.duck({ music: 0.7 }, 5, 0.3, 1.5);
  }

  capture() {
    this.phase = 'capture';
    this.react('gasp', { gain: 0.95, force: true });
    this.react('gasp', { gain: 0.7, force: true, delay: 0.25, rate: 0.9 });
    this.setLoop('murmurA', 0.0002, 0.8); this.setLoop('murmurB', 0.0002, 0.8);
    this.setLoop('worried', this.C.worriedMax, 0.4);
  }
};
