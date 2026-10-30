/*
 * MusicPlayer — plays the supplied soundtrack and is the MASTER CLOCK of the game.
 *
 * Two backends:
 *  - 'webaudio' (preferred): the file is decoded once into an AudioBuffer and played with an
 *    AudioBufferSourceNode. Song time comes from the audio hardware clock
 *    (AudioManager.ctxTimeAtPerf), so it is immune to frame drops.
 *  - 'element' (fallback when the page is opened from file:// and fetch() is blocked): an
 *    <audio> element; its currentTime is interpolated with performance.now() for smoothness.
 *
 * The audio is never resampled, time-stretched or pitch-shifted (playbackRate is always 1).
 * Only one playback can exist at a time: play() always stops the previous one first.
 */
window.PAM = window.PAM || {};
PAM.MusicPlayer = class MusicPlayer {
  constructor(audio) {
    this.audio = audio;          // PAM.AudioManager
    this.mode = null;            // 'webaudio' | 'element'
    this.buffer = null;
    this.element = null;
    this.source = null;
    this.playing = false;
    this.position = 0;           // song time while stopped/paused
    this.startAt = 0;            // context time that corresponds to song time 0
    this.volume = 1;
    this.sourceName = '';
    this._timer = null;
    this._anchor = null;         // element mode clock anchor {media, perf}
    this.onEnded = null;
  }

  get loaded() { return !!(this.buffer || this.element); }
  get duration() {
    if (this.buffer) return this.buffer.duration;
    if (this.element && isFinite(this.element.duration) && this.element.duration > 0) return this.element.duration;
    return this.fallbackDuration || 0;   // e.g. streamed WAV without a known length: use the beat map's value
  }

  /** Try each URL with fetch + decode; if every fetch fails (file://), fall back to <audio>. */
  async load(urls) {
    this.audio.init();
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(encodeURI(url));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.arrayBuffer();
        this.buffer = await this.audio.ctx.decodeAudioData(data);
        this.mode = 'webaudio'; this.sourceName = url;
        return this.mode;
      } catch (e) { lastErr = e; }
    }
    for (const url of urls) {
      try {
        await this._loadElement(url);
        this.mode = 'element'; this.sourceName = url;
        return this.mode;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No audio');
  }

  /** Release the decoded audio (it is reloaded next time the song is selected). */
  unload() {
    this.stop();
    if (this.element) { this.element.removeAttribute('src'); this.element.load(); }
    this.buffer = null; this.element = null; this.mode = null;
  }

  /** Load a user-picked File (works everywhere, including file://). */
  async loadFile(file) {
    this.audio.init();
    const data = await file.arrayBuffer();
    this.stop();
    this.buffer = await this.audio.ctx.decodeAudioData(data);
    this.element = null;
    this.mode = 'webaudio'; this.sourceName = file.name;
    return this.mode;
  }

  _loadElement(url) {
    return new Promise((resolve, reject) => {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('canplaythrough', () => resolve(el), { once: true });
      el.addEventListener('error', () => reject(new Error('Audio element failed: ' + url)), { once: true });
      el.addEventListener('ended', () => { if (this.playing && this.onEnded) this.onEnded(); });
      el.src = encodeURI(url);
      el.load();
      this.element = el;
    });
  }

  setVolume(v) {
    this.volume = v;
    if (this.mode === 'element' && this.element) this.element.volume = v;
    else this.audio.setMusicVolume(v);
  }

  /** Start playing from `position` seconds after `lead` seconds of silence. */
  play(position = 0, lead = 0) {
    this.stop();
    this.position = position;
    this.playing = true;
    this.audio.resetClock();
    if (this.mode === 'webaudio') {
      const ctx = this.audio.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.audio.musicInput);
      const when = ctx.currentTime + lead;
      src.start(when, Math.max(0, position));
      this.startAt = when - position;
      src.onended = () => { if (this.source === src && this.playing) { this.playing = false; this.position = this.duration; if (this.onEnded) this.onEnded(); } };
      this.source = src;
    } else if (this.mode === 'element') {
      const el = this.element;
      el.pause();
      el.currentTime = Math.max(0, position);
      el.volume = this.volume;
      const startPerf = performance.now() + lead * 1000;
      this._anchor = { media: position, perf: startPerf };
      this._timer = setTimeout(() => {
        el.play().catch(() => { /* autoplay refusal: clock keeps running from anchor */ });
        this._anchor = { media: position, perf: performance.now() };
      }, lead * 1000);
    }
  }

  /** Pause and return the exact song position. */
  pause() {
    if (!this.playing) return this.position;
    // during a lead-in the clock is still before the start position, so never rewind
    this.position = Math.min(this.duration, Math.max(this.position, this.timeAt(performance.now())));
    this.stop(true);
    return this.position;
  }

  stop(keepPosition) {
    clearTimeout(this._timer);
    if (this.source) {
      const s = this.source; this.source = null;
      try { s.onended = null; s.stop(); } catch (e) { /* already stopped */ }
      try { s.disconnect(); } catch (e) { /* ignore */ }
    }
    if (this.element) this.element.pause();
    this.playing = false;
    if (!keepPosition) this.position = 0;
  }

  /** Song time (seconds) audible at performance time perfMs. Negative during the lead-in. */
  timeAt(perfMs) {
    if (!this.playing) return this.position;
    if (this.mode === 'webaudio') return this.audio.ctxTimeAtPerf(perfMs) - this.startAt;
    // element mode: interpolate between currentTime updates, re-anchoring on drift
    const a = this._anchor;
    const predicted = a.media + (perfMs - a.perf) / 1000;
    const el = this.element;
    if (!el.paused && perfMs >= a.perf) {
      const ct = el.currentTime;
      const drift = ct - (a.media + (performance.now() - a.perf) / 1000);
      if (Math.abs(drift) > 0.08) this._anchor = { media: ct, perf: performance.now() };
      else if (Math.abs(drift) > 0.004) a.media += drift * 0.1;
    }
    return predicted;
  }
};
