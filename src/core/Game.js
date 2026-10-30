/*
 * Game — orchestrates everything: boot/loading, the frame loop, the scene state machine,
 * input, gameplay events, cinematics and rendering.
 *
 * Timing rule: ALL rhythm logic uses song time from MusicPlayer (the audio clock).
 * Frame delta time is only used for animation, particles and pursuit smoothing.
 *
 * URL options (for testing): ?autoplay=1 (bot hits every note), ?autoplay=miss (never hits),
 * ?start=SECONDS (start the song part-way), ?debug=1 (timing overlay).
 */
window.PAM = window.PAM || {};
const PRINCE_SCALE = 1.25, GIANT_SCALE = 1.12;
PAM.Game = class Game {
  constructor() {
    const $ = id => document.getElementById(id);
    this.S = PAM.GameState;
    this.settings = PAM.Storage.loadSettings();
    this.viewport = $('viewport');
    this.stage = $('stage');
    this.canvas = $('scene');
    this.ctx = this.canvas.getContext('2d');
    this.engine = new PAM.RhythmEngine();
    this.pursuit = new PAM.PursuitController();
    this.prince = new PAM.PhraAphai();
    this.giant = new PAM.PhiSueaSamut();
    this.bg = new PAM.Background();
    this.fx = new PAM.Effects();
    this.track = new PAM.TrackRenderer();
    this.ui = new PAM.UI(this);
    this.calib = new PAM.Calibration(this.ui, ms => {
      this.settings.calibrationMs = ms; this.saveSettings(); this.ui.refreshSettings(); this.action('back');
    });

    this.state = this.S.MENU;
    // one MusicPlayer + beat map per song, loaded when the song is first selected and kept
    this.players = {}; this.beatmaps = {}; this.loadState = {};
    this.song = PAM.Config.songs.find(s => s.id === this.settings.songId) || PAM.Config.songs[0];
    this.music = this.playerFor(this.song);
    this.beatmap = null;
    this.run = null;
    this.params = new URLSearchParams(location.search);
    this.autoplay = this.params.get('autoplay');
    this.debug = this.params.has('debug');
    this.startOffset = parseFloat(this.params.get('start')) || 0;

    this.t = 0; this.last = performance.now();
    this.shake = 0; this.flash = 0; this.underwater = 0; this.zoom = 1;
    this.stateT = 0;              // seconds spent in the current state
    this.pausedAt = 0; this.resumePos = 0;
    this.lastCount = null; this.heartbeat = 0; this.finalAnnounced = false;
    this.timingHint = null; this.timingHintAge = 9;
    this.fps = 60;
    this.k = 1;                   // design -> device pixel scale

    this.giant.onStep = intensity => {
      if (this.state !== this.S.PLAYING && this.state !== this.S.CAPTURE) return;
      PAM.AudioManager.sfx.step(intensity);
      this.fx.footSplash(this.giant.x - 20, this.giant.y - 4, intensity);
      if (intensity > 0.5) this.addShake(2 + intensity * 4);
    };
  }

  // =================================================================== boot
  async boot() {
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();
    this.ui.bindSettings(this.settings, key => this.onSettingChanged(key));
    this.ui.show('menu', { remember: false });
    this.resetScene();
    requestAnimationFrame(now => this.frame(now));

    document.getElementById('musicFile').addEventListener('change', async e => {
      const f = e.target.files[0], song = this.song;
      if (!f) return;
      this.ui.setAudioStatus('กำลังถอดรหัสเสียง ' + f.name + '…', { ready: false, fallback: true });
      try { await this.music.loadFile(f); this.loadState[song.id] = 'ready'; this.applyAudioSettings(); this.onMusicReady('webaudio'); }
      catch (err) { this.ui.setAudioStatus('ไฟล์นี้เล่นไม่ได้: ' + err.message, { ready: false, fallback: true }); }
      e.target.value = '';
    });

    await this.selectSong(this.song.id);
    // warm up the other songs in the background so switching is instant
    for (const s of PAM.Config.songs) if (s !== this.song) await this.loadSong(s);
  }

  playerFor(song) {
    if (!this.players[song.id]) this.players[song.id] = new PAM.MusicPlayer(PAM.AudioManager);
    return this.players[song.id];
  }

  /** Load a song's beat map and audio once. Resolves when done (or failed); safe to call repeatedly. */
  loadSong(song) {
    if (this.loadState[song.id + ':p']) return this.loadState[song.id + ':p'];
    const p = (async () => {
      try {
        this.beatmaps[song.id] = await PAM.BeatMap.load(song);
      } catch (e) { this.loadState[song.id] = 'nomap'; return; }
      const player = this.playerFor(song);
      player.fallbackDuration = this.beatmaps[song.id].duration;
      this.loadState[song.id] = 'loading';
      if (song === this.song) this.renderSongSelect();
      try { await player.load(song.audio); this.loadState[song.id] = 'ready'; }
      catch (e) { console.warn('Music load failed', song.id, e); this.loadState[song.id] = 'error'; }
      if (this.ui.current === 'songs' && !this.run) this.renderSongSelect();  // refresh the list badges
    })();
    this.loadState[song.id + ':p'] = p;
    return p;
  }

  async selectSong(id) {
    const song = PAM.Config.songs.find(s => s.id === id) || PAM.Config.songs[0];
    if (this.run) this.stopRun();
    if (this.music && this.music !== this.playerFor(song)) this.music.stop();
    this.song = song;
    this.settings.songId = song.id; this.saveSettings();
    this.music = this.playerFor(song);
    this.beatmap = this.beatmaps[song.id] || null;
    this.renderSongSelect();
    if (this.loadState[song.id] !== 'ready') this.ui.setAudioStatus(`กำลังโหลดเพลง ${song.title}…`, { ready: false, fallback: false });
    await this.loadSong(song);
    if (this.song !== song) return;            // the player picked another song meanwhile
    this.beatmap = this.beatmaps[song.id] || null;
    const st = this.loadState[song.id];
    if (st === 'nomap') this.ui.setAudioStatus(`ไม่พบ Beat Map ของเพลง ${song.title}`, { ready: false, fallback: false });
    else if (st === 'error') this.ui.setAudioStatus('โหลดไฟล์เพลงไม่สำเร็จ — กรุณาเลือกไฟล์เพลงด้านล่าง หรือเปิดด้วย Play.bat', { ready: false, fallback: true });
    else { this.applyAudioSettings(); this.onMusicReady(this.music.mode); }
    this.renderSongSelect();
  }

  onMusicReady(mode) {
    const d = this.music.duration;
    const note = mode === 'element' ? ' · โหมดสำรอง (file://) — แนะนำให้เปิดผ่าน Play.bat เพื่อความแม่นยำสูงสุด' : '';
    this.ui.setAudioStatus(`พร้อมเล่น ♪ ${this.song.title} (${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')})${note}`, { ready: true, fallback: false });
    if (this.params.has('autostart')) this.startSong();
  }

  resize() {
    const w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    const W = PAM.Config.WIDTH, H = PAM.Config.HEIGHT;
    const s = Math.min(w / W, h / H);
    this.stage.style.transform = `translate(${(w - W * s) / 2}px, ${(h - H * s) / 2}px) scale(${s})`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.k = s * dpr;
    this.canvas.width = Math.round(W * this.k);
    this.canvas.height = Math.round(H * this.k);
    this.bg.resize(this.k);
  }

  // =================================================================== settings
  saveSettings() { PAM.Storage.saveSettings(this.settings); }
  applyAudioSettings() {
    this.music.setVolume(this.settings.musicVolume);
    PAM.AudioManager.setSfxVolume(this.settings.sfxVolume);
  }
  onSettingChanged(key) {
    if (key === 'musicVolume' || key === 'sfxVolume') this.applyAudioSettings();
    if (key === 'difficulty') this.renderSongSelect();
    this.saveSettings();
  }
  renderSongSelect() {
    this.ui.renderSongList(PAM.Config.songs, this.song, id => this.loadState[id], this.settings.difficulty, id => this.selectSong(id));
    if (!this.beatmap) return;
    this.ui.renderSongSelect(this.song, this.beatmap, this.settings.difficulty, key => {
      this.settings.difficulty = key; this.saveSettings(); this.ui.refreshSettings(); this.renderSongSelect();
    });
  }

  // =================================================================== actions (buttons)
  action(name) {
    PAM.AudioManager.resume();
    switch (name) {
      case 'songs': if (this.run) this.stopRun(); this.renderSongSelect(); this.ui.show('songs'); break;
      case 'tutorial': this.ui.show('tutorial'); break;
      case 'settings': this.ui.show('settings'); break;
      case 'calibrate': this.calib.open(this.settings.calibrationMs); this.ui.show('calibrate'); break;
      case 'menu': this.stopRun(); this.ui.history = []; this.ui.show('menu', { remember: false }); break;
      case 'back': this.calib.stop(); this.ui.back(); break;
      case 'resume': this.resume(); break;
      case 'start':
      case 'retry': this.startSong(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
    }
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  // =================================================================== input
  bindInput() {
    const K = PAM.Config.keys;
    window.addEventListener('keydown', e => {
      const code = e.code;
      const typing = e.target && (e.target.tagName === 'SELECT');
      if (this.ui.current === 'calibrate' && code === 'Space') { e.preventDefault(); if (!e.repeat) this.calib.tap(this.eventTime(e)); return; }
      if (K.hit.includes(code) && this.isRhythmState()) {
        e.preventDefault();
        if (!e.repeat && this.state === this.S.PLAYING) this.press(this.eventTime(e));
        return;
      }
      if (e.repeat) return;
      if (K.pause.includes(code)) {
        if (this.state === this.S.PLAYING || this.state === this.S.RESUMING) { e.preventDefault(); this.pause(); }
        else if (this.state === this.S.PAUSED) { e.preventDefault(); this.resume(); }
        else if (code === 'Escape' && ['settings', 'tutorial', 'calibrate', 'songs'].includes(this.ui.current)) this.action('back');
        return;
      }
      if (code === 'KeyF' && !typing && !this.isRhythmState()) this.toggleFullscreen();
      if (code === 'KeyR' && this.state === this.S.PAUSED) this.startSong();
    });
    this.stage.addEventListener('pointerdown', e => {
      if (this.state !== this.S.PLAYING) return;
      if (e.target.closest('button, .screen, a, input')) return;
      e.preventDefault();
      this.press(this.eventTime(e));
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); });
    window.addEventListener('blur', () => this.autoPause());
  }

  isRhythmState() { return [this.S.PLAYING, this.S.RESUMING, this.S.INTRO].includes(this.state); }

  /** Event timestamp in the performance.now() timebase (falls back to now). */
  eventTime(e) {
    const now = performance.now();
    return e.timeStamp > 0 && Math.abs(e.timeStamp - now) < 1000 ? e.timeStamp : now;
  }

  /** Song time with the player's calibration applied (used for judging AND drawing). */
  songTime(perf) { return this.music.timeAt(perf) - this.settings.calibrationMs / 1000; }

  press(perfTime) {
    const t = this.songTime(perfTime);
    this.track.pressed();
    const res = this.engine.press(t);
    if (res) this.onHit(res);
    // pressing with no note in range is intentionally not punished
  }

  // =================================================================== run lifecycle
  resetScene() {
    this.prince.override = null; this.giant.override = null;
    this.prince.scale = PRINCE_SCALE; this.giant.scale = GIANT_SCALE;
    this.prince.setState(this.state === this.S.MENU ? 'play' : 'idle');
    this.giant.setState('mesmerized');
    this.pursuit.reset(PAM.DifficultyManager.get(this.settings.difficulty));
    this.underwater = 0; this.flash = 0; this.shake = 0; this.zoom = 1;
    this.sink = 0; this.waterY = null;
    PAM.AudioManager.setUnderwater(0, 0.05);
    this.fx.clear();
    this.ui.banner(null); this.ui.countdown(null);
  }

  async startSong() {
    if (!this.music.loaded || !this.beatmap) { this.renderSongSelect(); this.ui.show('songs'); return; }
    await PAM.AudioManager.resume();
    this.music.stop();
    this.applyAudioSettings();
    if (document.activeElement) document.activeElement.blur();

    const key = this.settings.difficulty, D = PAM.DifficultyManager.get(key);
    let notes = PAM.DifficultyManager.chartFor(this.beatmap, key);
    if (this.startOffset) notes = notes.filter(n => n.time >= this.startOffset + 1);
    this.engine.setup(notes, D.timingScale);
    this.state = this.S.INTRO;
    this.resetScene();
    this.pursuit.reset(D);
    this.run = this.S.createRun(this.song, key);
    this.run.totalNotes = this.engine.total;
    this.stateT = 0; this.lastCount = null; this.finalAnnounced = false; this.heartbeat = 0;
    this.prince.setState('idle');
    this.giant.setState('idle');
    this.ui.hideScreens();
    this.ui.setHud(true);
    this.ui.updateHud(this.run, this.pursuit, 0);
    this.ui.banner(this.song.title, this.song.subtitle);
  }

  stopRun() {
    this.music.stop();
    this.run = null;
    this.state = this.S.MENU;
    this.ui.setHud(false);
    this.resetScene();
    this.prince.setState('play');
  }

  pause() {
    if (this.state !== this.S.PLAYING && this.state !== this.S.RESUMING) return;
    this.pausedAt = this.music.pause();
    this.state = this.S.PAUSED;
    this.ui.countdown(null);
    this.ui.refreshSettings();
    this.ui.show('pause', { remember: false });
  }

  autoPause() { if (this.state === this.S.PLAYING || this.state === this.S.RESUMING) this.pause(); }

  async resume() {
    if (this.state !== this.S.PAUSED) return;
    await PAM.AudioManager.resume();
    this.ui.hideScreens();
    this.resumePos = this.pausedAt;
    this.music.play(this.pausedAt, PAM.Config.resumeLeadIn);
    this.state = this.S.RESUMING;
    this.lastCount = null;
  }

  // =================================================================== gameplay events
  onHit({ note, judgement, delta }) {
    const run = this.run;
    const gained = PAM.ScoreManager.hit(run, judgement, note.type);
    this.pursuit.onHit(judgement);
    this.prince.react('success');
    const col = PAM.TrackRenderer.colorFor(note.type);
    const jCol = { perfect: '#7ee8ff', good: '#a6f0a0', ok: '#f6d88c' }[judgement];
    this.track.hit(jCol);
    this.fx.burst(this.track.hitX, this.track.y, col, judgement === 'perfect' ? 22 : 12);
    this.fx.ring(this.track.hitX, this.track.y, jCol, 30, judgement === 'perfect' ? 110 : 80);
    this.fx.popup(judgement.toUpperCase(), this.track.hitX + 20, this.track.y - 100, jCol, judgement === 'perfect' ? 50 : 42);
    // optional per-note visual effect from the beat map ("fx": "sparkle" | "burst")
    if (note.fx === 'sparkle') for (let i = 0; i < 12; i++) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 120, col);
    if (note.fx === 'burst') this.fx.burst(this.track.hitX, this.track.y, '#ffffff', 40, 420);
    const n = 1 + (run.combo >= 10 ? 1 : 0) + (run.combo >= 30 ? 1 : 0);
    this.fx.musicNotes(this.prince.fluteTip, this.giant.headWorld, n, col);
    PAM.AudioManager.sfx.hit(judgement, run.combo, note.type);
    if (judgement !== 'perfect' && this.settings.showEarlyLate) { this.timingHint = delta < 0 ? 'EARLY' : 'LATE'; this.timingHintAge = 0; }
    if (run.combo > 0 && run.combo % 25 === 0) {
      PAM.AudioManager.sfx.mesmerize();
      this.fx.popup(`COMBO ${run.combo}!`, 960, 470, '#f6d88c', 64, 1.1);
      for (let i = 0; i < 20; i++) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 120, '#f6d88c');
    }
    return gained;
  }

  onMiss() {
    const run = this.run;
    PAM.ScoreManager.miss(run);
    this.pursuit.onMiss();
    this.prince.react('miss');
    this.giant.flinch();
    this.fx.popup('MISS', this.track.hitX + 20, this.track.y - 100, '#ff5479', 44);
    PAM.AudioManager.sfx.miss();
    this.addShake(3 + Math.min(run.missStreak, 4) * 2);
    if (run.missStreak === 3) PAM.AudioManager.sfx.warning(0.6);
    if (run.missStreak === 4) PAM.AudioManager.sfx.roar();
  }

  addShake(a) { if (this.settings.screenShake) this.shake = Math.min(30, this.shake + a); }

  // =================================================================== frame loop
  frame(now) {
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.05, raw);           // animation step (capped so a hitch never teleports things)
    this.last = now;
    this.t += dt;
    this.stateT += Math.min(0.25, raw);       // cinematic timers follow real time even at low frame rates
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    try { this.update(now, dt); this.render(now); }
    catch (e) { console.error(e); }
    requestAnimationFrame(n => this.frame(n));
  }

  setState(s) { this.state = s; this.stateT = 0; }

  update(now, dt) {
    const S = this.S;
    switch (this.state) {
      case S.MENU: this.updateMenu(dt); break;
      case S.INTRO: this.updateIntro(dt); break;
      case S.PLAYING: this.updatePlaying(now, dt); break;
      case S.RESUMING: this.updateResuming(now); break;
      case S.CAPTURE: this.updateCapture(dt); break;
      case S.VICTORY: this.updateVictory(dt); break;
    }
    if (this.state !== S.PAUSED) {
      this.prince.update(dt); this.giant.update(dt); this.fx.update(dt); this.track.update(dt);
    }
    this.timingHintAge += dt;
    this.shake *= Math.pow(0.02, dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  updateMenu(dt) {
    this.giant.x = this.giantX(1);
    if (Math.random() < dt * 1.2) this.fx.musicNotes(this.prince.fluteTip, this.giant.headWorld, 1, Math.random() < 0.5 ? '#5fe3ff' : '#f4c766');
    if (Math.random() < dt * 3) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 120, '#bfe9ff');
  }

  updateIntro(dt) {
    // establishing shot: slow push-in, prince lifts his flute, then the countdown starts
    this.zoom = 1.06 - 0.06 * Math.min(1, this.stateT / 2.4);
    this.giant.x = this.giantX(1);
    if (this.stateT > 0.9) this.prince.setState('play');
    if (this.stateT > 2.4) {
      this.ui.banner(null);
      this.music.play(this.startOffset, PAM.Config.leadIn);
      this.setState(this.S.PLAYING);
    }
  }

  updatePlaying(now, dt) {
    const run = this.run, t = this.songTime(now);
    this.updateCountdown(t, this.startOffset);

    if (this.autoplay === '1') {
      for (const n of this.engine.notes) {
        if (n.judged || n.time > t) continue;
        const r = this.engine.press(n.time + (Math.random() - 0.5) * 0.02);
        if (r) this.onHit(r);
      }
    }
    for (const n of this.engine.update(t)) this.onMiss(n);
    this.pursuit.update(dt);

    // giantess follows the pursuit model; after the last note she is lost in the music
    this.giant.x = this.giantX(this.pursuit.pursuitDistance);
    const finished = this.engine.allJudged && t > this.engine.lastNoteTime;
    this.giant.setState(t < 0 ? 'mesmerized' : finished ? 'mesmerized' : this.pursuit.mood);
    this.giant.reachTarget = this.prince.bodyCenter;
    const d = this.pursuit.danger;
    this.prince.setState(d > 0.78 ? 'panic' : d > 0.5 ? 'nervous' : 'play');
    if (this.pursuit.mood === 'mesmerized' && Math.random() < dt * 4) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 140, '#bfe9ff');

    // heartbeat warning when she is close
    if (d > 0.6) {
      this.heartbeat -= dt;
      if (this.heartbeat <= 0) { PAM.AudioManager.sfx.warning(d); this.heartbeat = 1.25 - d * 0.6; }
    }
    // final section tension cue
    const dur = this.music.duration;
    if (!this.finalAnnounced && t > dur * 0.86 && !finished) {
      this.finalAnnounced = true;
      this.fx.popup('FINAL VERSE · ท่อนสุดท้าย', 960, 430, '#ff8aa0', 52, 1.6);
    }

    this.ui.updateHud(run, this.pursuit, Math.max(0, t) / dur);
    if (this.pursuit.caught) return this.startCapture(t);
    if (t >= dur - 0.03 || (!this.music.playing && t > 1)) return this.startVictory(t);
  }

  updateCountdown(t, start) {
    const left = start - t;
    let label = null, go = false;
    if (left > 0) label = String(Math.ceil(left));
    else if (left > -0.7 && this.state !== this.S.RESUMING) { label = 'เริ่ม!'; go = true; }
    if (label !== this.lastCount) {
      if (label) PAM.AudioManager.sfx.countdown(go);
      this.lastCount = label;
    }
    this.ui.countdown(label, go);
  }

  updateResuming(now) {
    const t = this.songTime(now);
    this.updateCountdown(t, this.resumePos);
    if (t >= this.resumePos) { this.ui.countdown(null); this.setState(this.S.PLAYING); }
  }

  giantX(d) { return 500 + d * 1040; }

  // =================================================================== failure cinematic
  startCapture(t) {
    this.run.endTime = Math.max(0, t);
    this.setState(this.S.CAPTURE);
    this.ui.countdown(null);
    this.giant.setState('attack');
    this.prince.setState('panic');
    this.grabbed = false; this.splashed = false; this.capBase = null;
    PAM.AudioManager.sfx.roar();
    this.addShake(10);
  }

  updateCapture(dt) {
    const T = this.stateT, g = this.giant, p = this.prince, ease = x => x * x * (3 - 2 * x);
    g.reachTarget = this.capBase || p.bodyCenter;
    if (T > 0.55 && !this.grabbed) {
      this.grabbed = true;
      this.capBase = { x: p.bodyCenter.x, y: p.bodyCenter.y };
      g.setState('capture'); p.setState('caught');
      PAM.AudioManager.sfx.grab();
      this.flash = 0.8; this.addShake(22);
    }
    if (this.grabbed) {
      // carry him away toward the sea, then plunge
      const k = ease(Math.min(1, (T - 0.55) / 1.0));
      g.override = { dx: 300 * k, dy: -150 * k, rot: -0.12 * k };
      g.scale = GIANT_SCALE * (1 - 0.28 * k);
      p.scale = PRINCE_SCALE * (1 - 0.28 * k);
      if (T > 1.55) {
        if (this.waterY === null) this.waterY = g.y + g.override.dy - 10;
        this.sink += dt * (300 + (T - 1.55) * 900);
        g.override.dy = -150 + this.sink;
        g.override.rot = -0.12 - Math.min(0.5, (T - 1.55) * 0.6);
      }
      const h = g.handsWorld;
      p.override = { dx: h.x - this.capBase.x, dy: h.y - this.capBase.y + 30, rot: Math.sin(T * 14) * 0.08 - 0.2 };
    }
    if (T > 1.62 && !this.splashed) {
      this.splashed = true;
      PAM.AudioManager.sfx.splash();
      PAM.AudioManager.setUnderwater(1, 1.6);
      this.fx.splash(g.x + 300, this.waterY, 90, 1.2);
      this.addShake(28);
    }
    if (T > 1.9) {
      if (this.underwater === 0) this.ui.setHud(false);
      this.underwater = Math.min(1, (T - 1.9) / 1.4);
      if (Math.random() < dt * 40) this.fx.bubble(200 + Math.random() * 1520, 1100);
      this.zoom = 1 + (T - 1.9) * 0.03;
    }
    if (T > 2.6 && !this.ui.$('banner').innerHTML) this.ui.banner('GAME OVER', 'ถูกจับ…พาลงทะเล', 'lose');
    if (T > 5.2) this.finish(false);
  }

  // =================================================================== success ending
  startVictory(t) {
    this.run.endTime = t;
    this.setState(this.S.VICTORY);
    this.giant.setState('mesmerized');
    this.prince.setState('play');
    this.ui.countdown(null);
    this.ui.banner('ESCAPE SUCCESSFUL', 'นางยักษ์หลับใหลในมนตร์เสียงปี่ · หลบหนีสำเร็จ!');
    PAM.AudioManager.sfx.victory();
  }

  updateVictory(dt) {
    if (Math.random() < dt * 30) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 140, Math.random() < 0.5 ? '#f6d88c' : '#bfe9ff');
    if (Math.random() < dt * 3) this.fx.musicNotes(this.prince.fluteTip, this.giant.headWorld, 1, '#f6d88c');
    if (this.stateT > 4) this.finish(true);
  }

  finish(cleared) {
    const run = this.run;
    run.cleared = cleared;
    const completion = cleared ? 1 : Math.min(1, run.endTime / this.music.duration);
    this.music.stop();
    PAM.AudioManager.setUnderwater(0, 0.3);
    const improved = PAM.Storage.submitRun(this.song.id, run.difficulty, {
      score: run.score, bestCombo: run.bestCombo, accuracy: run.accuracy, completion, cleared
    });
    this.lastResult = { score: run.score, bestCombo: run.bestCombo, accuracy: run.accuracy, completion, cleared,
      perfect: run.perfect, good: run.good, ok: run.ok, miss: run.miss };
    this.setState(this.S.RESULTS);
    this.ui.banner(null);
    this.ui.setHud(false);
    this.ui.history = ['menu'];
    this.ui.showResults(run, completion, improved, cleared);
  }

  // =================================================================== rendering
  render(now) {
    const ctx = this.ctx, S = this.S;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    const W = PAM.Config.WIDTH, H = PAM.Config.HEIGHT;
    const inRun = this.run && [S.INTRO, S.PLAYING, S.PAUSED, S.RESUMING, S.CAPTURE, S.VICTORY].includes(this.state);
    let songT = 0;
    if (inRun) songT = this.state === S.INTRO ? this.startOffset - PAM.Config.leadIn : this.songTime(now);
    if (this.state === S.RESUMING) songT = Math.max(songT, this.resumePos);

    const danger = inRun ? this.pursuit.danger : 0;
    const section = this.beatmap && inRun ? PAM.BeatMap.sectionAt(this.beatmap, songT) : 'quiet';
    const intensity = { intense: 1, build: 0.55, quiet: 0.2, intro: 0.2, ending: 0.1 }[section] || 0.4;

    // camera: zoom around the centre + shake
    ctx.save();
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(this.zoom, this.zoom); ctx.translate(-W / 2, -H / 2);

    this.bg.draw(ctx, this.t, danger, intensity);
    this.fx.drawAmbient(ctx, this.t, 0.6 + intensity * 0.6);

    const clip = this.waterY !== null && this.state === S.CAPTURE;
    if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, this.waterY); ctx.clip(); }
    this.giant.draw(ctx);
    this.prince.draw(ctx);
    if (clip) ctx.restore();
    this.fx.draw(ctx);
    this.bg.drawFront(ctx);
    ctx.restore();

    // ---- screen-space overlays
    if (danger > 0.45 && this.state !== S.VICTORY) {
      const a = (danger - 0.45) * 0.9 * (0.75 + 0.25 * Math.sin(this.t * (4 + danger * 6)));
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, 'rgba(120,0,20,0)'); v.addColorStop(1, `rgba(150,0,30,${a})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    if (inRun && this.music.duration && songT > this.music.duration * 0.86 && this.state === S.PLAYING) {
      const k = Math.min(1, (songT - this.music.duration * 0.86) / 8);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
      v.addColorStop(0, 'rgba(40,0,60,0)'); v.addColorStop(1, `rgba(40,0,60,${0.45 * k})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    if (this.underwater > 0) this.drawUnderwater(ctx, W, H);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,240,240,${this.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === S.VICTORY) {
      ctx.fillStyle = `rgba(255,214,140,${0.08 + 0.05 * Math.sin(this.t * 2)})`; ctx.fillRect(0, 0, W, H);
    }

    if (inRun && this.state !== S.CAPTURE && this.state !== S.VICTORY) {
      const approach = PAM.Config.baseApproachTime / this.settings.noteSpeed;
      this.track.draw(ctx, this.t, songT, this.engine, approach, { timingHint: this.timingHint, timingHintAge: this.timingHintAge });
    }
    if (this.debug) this.drawDebug(ctx, songT);
  }

  drawUnderwater(ctx, W, H) {
    const a = this.underwater;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(20,70,120,${0.75 * a})`); g.addColorStop(1, `rgba(2,8,30,${0.97 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.18 * a; ctx.fillStyle = '#bfe6ff';
    for (let i = 0; i < 6; i++) {
      const x = 300 + i * 260 + Math.sin(this.t * 0.6 + i) * 60;
      ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 140, H); ctx.lineTo(x + 40, H); ctx.fill();
    }
    ctx.restore();
    this.fx.draw(ctx); // bubbles above the tint
  }

  drawDebug(ctx, songT) {
    const lines = [
      `state ${this.state}  fps ${this.fps.toFixed(0)}  audio ${this.music.mode}`,
      `song ${songT.toFixed(3)}s / ${this.music.duration.toFixed(1)}  calib ${this.settings.calibrationMs}ms`,
      `distance ${this.pursuit.pursuitDistance.toFixed(3)}  spell ${this.pursuit.spell.toFixed(2)}  mood ${this.pursuit.mood}`,
      this.run ? `notes ${this.run.judged}/${this.run.totalNotes}  streak ${this.run.missStreak}` : ''
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(660, 70, 600, 104);
    ctx.fillStyle = '#9ff'; ctx.font = '16px monospace'; ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, 672, 94 + i * 22));
  }
};
