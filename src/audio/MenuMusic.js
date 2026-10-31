/*
 * MenuMusic — a shuffled background playlist for the title menu, built from the game's own songs
 * (PAM.Config.songs; nothing is added, changed or removed).
 *
 * - Fair shuffle: every song plays once before any repeats, and never the same song twice in a row.
 * - Streams with <audio> elements (no full decode of 30 MB WAVs). Over http the elements are routed
 *   through Web Audio into the `menuMusic` mixer channel; on file:// they play directly with their
 *   own volume (browsers silence cross-origin media inside Web Audio there).
 * - Fade in on start, crossfade between tracks, fade out on stop. Only one "deck" is ever audible
 *   besides the short crossfade overlap; start() while already playing does nothing.
 * - Autoplay rules: if play() is refused before the first user gesture, the start is remembered
 *   and retried by unlock() (called on the first click / key press).
 * - A track that fails to load is skipped; if every track fails, the menu simply stays silent.
 */
window.PAM = window.PAM || {};
PAM.MenuMusic = class MenuMusic {
  constructor(audio) {
    this.audio = audio;
    this.tracks = PAM.Config.songs.map(s => ({ id: s.id, title: s.title, url: s.audio[0] }));
    this.bag = [];
    this.last = null;
    this.deck = null;          // { el, gain, track }
    this.active = false;       // menu wants music
    this.pending = false;      // start refused by autoplay policy, waiting for a gesture
    this.direct = location.protocol === 'file:';
    this.volume = 0.6;
    this.fadeIn = 2.0; this.fadeOut = 1.2; this.crossfade = 3.0;
    this.failures = 0;
    this.history = [];         // played track ids (tests / debug)
    this.timer = setInterval(() => this.tick(), 250);
  }

  /** Fair shuffle bag that never starts with the track that just played. */
  next() {
    if (!this.bag.length) {
      this.bag = this.tracks.slice();
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      if (this.bag.length > 1 && this.last && this.bag[this.bag.length - 1].id === this.last.id) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
    }
    return this.bag.pop();
  }

  setVolume(v) {
    this.volume = v;
    if (this.direct && this.deck && !this.deck.fading) this.deck.el.volume = v;
  }

  /** Menu opened: fade a random track in (no-op if music is already running). */
  start() {
    this.active = true;
    if (this.deck && !this.deck.fading) return;
    this.play(this.next(), this.fadeIn);
  }

  /** Leave the menu: fade out and release the element. */
  stop(fade = this.fadeOut) {
    this.active = false; this.pending = false;
    if (this.deck) this.retire(this.deck, fade);
    this.deck = null;
  }

  /** First user gesture: resume the context and retry a start the browser refused. */
  unlock() {
    if (this.pending && this.active) { this.pending = false; if (this.deck) this.retire(this.deck, 0.05); this.deck = null; this.start(); }
  }

  play(track, fade) {
    if (!track) return;
    const el = new Audio();
    el.preload = 'auto';
    el.src = encodeURI(track.url);
    const deck = { el, track, gain: null, fading: false, started: performance.now() };
    if (!this.direct && this.audio.ctx) {
      try {
        const src = this.audio.ctx.createMediaElementSource(el);
        deck.gain = this.audio.ctx.createGain();
        deck.gain.gain.value = 0.0001;
        src.connect(deck.gain); deck.gain.connect(this.audio.menuMusicInput);
      } catch (e) { deck.gain = null; }
    }
    if (!deck.gain) el.volume = 0;
    el.addEventListener('error', () => this.onError(deck));
    el.addEventListener('ended', () => { if (this.deck === deck) this.advance(0.6); });
    const old = this.deck;
    this.deck = deck;
    this.last = track;
    this.history.push(track.id);
    el.play().then(() => {
      this.failures = 0;
      this.ramp(deck, 1, fade);
    }).catch(err => {
      if (err && err.name === 'NotAllowedError') this.pending = true;   // autoplay blocked: retry on first gesture
      else this.onError(deck);
    });
    if (old) this.retire(old, fade);
  }

  /** Volume ramp of one deck towards level (0..1 of the menu volume). */
  ramp(deck, level, sec) {
    if (deck.gain) {
      const t = this.audio.ctx.currentTime, g = deck.gain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(Math.max(0.0001, level), t + Math.max(0.02, sec));
    } else {
      const from = deck.el.volume, to = level * this.volume, t0 = performance.now();
      clearInterval(deck.fadeTimer);
      deck.fadeTimer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        deck.el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
        if (k >= 1) clearInterval(deck.fadeTimer);
      }, 40);
    }
  }

  retire(deck, fade) {
    deck.fading = true;
    this.ramp(deck, 0, fade);
    setTimeout(() => { deck.el.pause(); deck.el.removeAttribute('src'); deck.el.load(); if (deck.gain) deck.gain.disconnect(); }, fade * 1000 + 120);
  }

  advance(fade) { if (this.active) this.play(this.next(), fade); }

  onError(deck) {
    if (this.deck !== deck) return;
    this.failures++;
    console.warn('Menu music: cannot play', deck.track.url);
    if (this.failures >= this.tracks.length) { this.deck = null; return; }   // nothing playable: stay silent
    this.retire(deck, 0.05);
    this.deck = null;
    if (this.active) this.play(this.next(), this.fadeIn);
  }

  /** Start the crossfade a few seconds before the current track ends. */
  tick() {
    const d = this.deck;
    if (!d || d.fading || !this.active) return;
    const el = d.el;
    if (isFinite(el.duration) && el.duration > this.crossfade * 2 && el.currentTime > el.duration - this.crossfade) this.advance(this.crossfade);
  }

  get nowPlaying() { return this.deck ? this.deck.track.title : null; }
};
