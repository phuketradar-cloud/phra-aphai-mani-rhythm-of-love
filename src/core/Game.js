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
    this.voice = new PAM.VoiceFeedbackManager(PAM.AudioManager);
    this.crowd = new PAM.CrowdManager(PAM.AudioManager);
    this.keysDown = [false, false, false, false];   // physical key state per lane (keydown/keyup)
    this.botHeld = [0, 0, 0, 0];                     // autoplay bot: hold release times per lane
    this.remapLane = null;                           // lane waiting for a new key on the remap screen
    this.pack = null;                                // voice/crowd sample pack load result
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

    this.track.setKeyLabels(this.keyLabels());
    this.ui.renderKeymap(this.keyLabels());
    await this.selectSong(this.song.id);
    this.loadAudioPack();
  }

  /** Voice + crowd samples (about 7 MB) load after the song, in the background. */
  async loadAudioPack() {
    const manifest = await fetch('assets/audio/manifest.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => window.PAM_AUDIO_MANIFEST);
    if (!manifest) { this.pack = { files: 0, failed: 0, mode: 'none' }; return; }
    this.pack = await PAM.AudioManager.loadPack(manifest);
    console.info('audio pack', this.pack);
  }

  /** Display labels for the four lane keys (e.g. "W"). */
  keyLabels() {
    return this.settings.keymap.map(code => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Space', '␣').toUpperCase().slice(0, 5));
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
    // keep only the selected song's decoded audio in memory (a 3-minute song is ~70 MB decoded)
    for (const s of PAM.Config.songs) {
      if (s === song || this.loadState[s.id] !== 'ready') continue;
      this.players[s.id].unload();
      delete this.loadState[s.id]; delete this.loadState[s.id + ':p'];
    }
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
    const s = this.settings, m = s.volMaster;
    const map = { music: s.volMusic, flute: s.volFlute, voice: s.volVoice, crowdAmb: s.volCrowdAmb, crowdReact: s.volCrowdReact, footsteps: s.volFootsteps, danger: s.volDanger };
    for (const name in map) PAM.AudioManager.setChannelVolume(name, map[name] * m);
    this.music.setVolume(s.volMusic * m);
    this.voice.enabled = s.voiceEnabled;
    this.crowd.enabled = s.crowdEnabled;
    if (!s.crowdEnabled) this.crowd.stopLoops(0.5);
  }
  onSettingChanged(key) {
    if (key.startsWith('vol') || key === 'voiceEnabled' || key === 'crowdEnabled') this.applyAudioSettings();
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
      case 'resetKeys':
        this.settings.keymap = PAM.Config.defaults.keymap.slice(); this.saveSettings(); this.remapLane = null;
        this.track.setKeyLabels(this.keyLabels()); this.ui.renderKeymap(this.keyLabels()); break;
      case 'testVoice': PAM.AudioManager.resume(); this.voice.say(['perfect', 'good', 'miss', 'streak'][Math.floor(Math.random() * 4)], { force: true, priority: 3 }); break;
      case 'testCrowd': PAM.AudioManager.resume(); this.crowd.react(['applause_medium', 'cheer_small', 'whistle', 'groan'][Math.floor(Math.random() * 4)], { force: true }); break;
      default:
        if (name.startsWith('remap')) { this.remapLane = +name.slice(5); this.ui.renderKeymap(this.keyLabels(), this.remapLane); }
    }
  }

  /** Remap screen: assign `code` to the lane waiting for a key (swaps if another lane used it). */
  assignKey(code) {
    const lane = this.remapLane, map = this.settings.keymap;
    const other = map.indexOf(code);
    if (other >= 0 && other !== lane) map[other] = map[lane];
    map[lane] = code;
    this.remapLane = null;
    this.saveSettings();
    this.track.setKeyLabels(this.keyLabels());
    this.ui.renderKeymap(this.keyLabels());
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
      // remap screen: the next key press becomes the lane's key (Esc cancels)
      if (this.remapLane !== null) {
        e.preventDefault();
        if (code === 'Escape') { this.remapLane = null; this.ui.renderKeymap(this.keyLabels()); }
        else if (!['KeyP', 'F11'].includes(code)) this.assignKey(code);
        return;
      }
      if (this.ui.current === 'calibrate' && code === 'Space') { e.preventDefault(); if (!e.repeat) this.calib.tap(this.eventTime(e)); return; }
      const lane = this.laneFor(code);
      if (lane >= 0 && this.isRhythmState()) {
        e.preventDefault();
        // auto-repeat is never gameplay input, and a lane that is already down cannot hit again
        if (e.repeat || this.keysDown[lane]) return;
        this.keysDown[lane] = true;
        if (this.state === this.S.PLAYING) this.press(lane, this.eventTime(e));
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
    window.addEventListener('keyup', e => {
      const lane = this.laneFor(e.code);
      if (lane < 0 || !this.keysDown[lane]) return;
      this.keysDown[lane] = false;
      if (this.state === this.S.PLAYING) this.release(lane, this.eventTime(e));
    });
    // mouse / touch: pressing on a lane row plays that lane
    this.pointerLane = {};
    this.stage.addEventListener('pointerdown', e => {
      if (this.state !== this.S.PLAYING || e.target.closest('button, .screen, a, input')) return;
      const r = this.stage.getBoundingClientRect(), y = (e.clientY - r.top) / r.height * PAM.Config.HEIGHT;
      const lane = this.track.laneY.findIndex(ly => Math.abs(y - ly) <= this.track.laneH / 2);
      if (lane < 0 || this.keysDown[lane]) return;
      e.preventDefault();
      this.pointerLane[e.pointerId] = lane; this.keysDown[lane] = true;
      this.press(lane, this.eventTime(e));
    });
    const pointerUp = e => {
      const lane = this.pointerLane[e.pointerId];
      if (lane === undefined) return;
      delete this.pointerLane[e.pointerId]; this.keysDown[lane] = false;
      if (this.state === this.S.PLAYING) this.release(lane, this.eventTime(e));
    };
    window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.releaseAllKeys(); this.autoPause(); } });
    window.addEventListener('blur', () => { this.releaseAllKeys(); this.autoPause(); });
  }

  /** Lane for a key code: the configurable keymap first, the arrow keys as a fixed second set. */
  laneFor(code) {
    const i = this.settings.keymap.indexOf(code);
    return i >= 0 ? i : PAM.Config.keys.altLanes.indexOf(code);
  }

  /** Focus loss: keyup events are lost, so treat every key as released. */
  releaseAllKeys() { this.keysDown = [false, false, false, false]; this.pointerLane = {}; }

  isRhythmState() { return [this.S.PLAYING, this.S.RESUMING, this.S.INTRO].includes(this.state); }

  /** Event timestamp in the performance.now() timebase (falls back to now). */
  eventTime(e) {
    const now = performance.now();
    return e.timeStamp > 0 && Math.abs(e.timeStamp - now) < 1000 ? e.timeStamp : now;
  }

  /** Song time with the player's calibration applied (used for judging AND drawing). */
  songTime(perf) { return this.music.timeAt(perf) - this.settings.calibrationMs / 1000; }

  press(lane, perfTime) {
    const t = this.songTime(perfTime);
    this.track.pressed(lane);
    const ev = this.engine.press(lane, t);
    if (ev) this.handleEvent(ev);
    // a press with no note anywhere near is intentionally not punished
  }

  release(lane, perfTime) {
    const ev = this.engine.release(lane, this.songTime(perfTime));
    if (ev) this.handleEvent(ev);
  }

  handleEvent(ev) {
    switch (ev.type) {
      case 'hit': return this.onHit(ev);
      case 'miss': return this.onMiss(ev.note, 'MISS');
      case 'holdBreak': return this.onMiss(ev.note, 'RELEASED');
      case 'holdDone': return this.onHoldDone(ev.note);
      case 'wrong': return this.onWrong(ev);
    }
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
    this.run.totalNotes = this.engine.totalJudgements;
    this.stateT = 0; this.lastCount = null; this.finalAnnounced = false; this.heartbeat = 0;
    this.releaseAllKeys(); this.botHeld = [0, 0, 0, 0];
    this.lastMood = null; this.worriedSaid = false; this.freezeT = 0;
    PAM.AudioManager.resetDucking();
    this.voice.reset();
    this.crowd.intro();
    this.prince.setState('idle');
    this.giant.setState('idle');
    this.ui.hideScreens();
    this.ui.setHud(true);
    this.ui.updateHud(this.run, this.pursuit, 0);
    this.ui.banner(this.song.title, this.song.subtitle);
  }

  stopRun() {
    this.music.stop();
    this.crowd.reset(); this.voice.reset(); PAM.AudioManager.resetDucking();
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
    this.crowd.pause(); this.voice.stop();
    this.releaseAllKeys();
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
    this.crowd.resume();
    this.state = this.S.RESUMING;
    this.lastCount = null;
  }

  // =================================================================== gameplay events
  onHit({ note, judgement, delta }) {
    const run = this.run, T = this.track, y = T.laneY[note.lane];
    const gained = PAM.ScoreManager.hit(run, judgement, note);
    this.pursuit.onHit(judgement);
    this.prince.react('success');
    const col = PAM.TrackRenderer.laneColor(note.lane);
    const jCol = { perfect: '#7ee8ff', good: '#a6f0a0', ok: '#f6d88c' }[judgement];
    T.hit(note.lane, jCol);
    T.text(note.lane, judgement.toUpperCase(), jCol);
    T.bumpCombo();
    // PERFECT: strong luminous burst; GOOD: moderate; OK: small
    if (judgement === 'perfect') { this.fx.burst(T.hitX, y, col, 20, 300); this.fx.ring(T.hitX, y, '#ffffff', 18, 70, 0.35, 3); this.fx.ring(T.hitX, y, col, 22, 95, 0.45, 4); }
    else if (judgement === 'good') { this.fx.burst(T.hitX, y, col, 9, 200); this.fx.ring(T.hitX, y, jCol, 20, 60, 0.35, 3); }
    else this.fx.burst(T.hitX, y, col, 5, 140);
    // optional per-note visual effect from the beat map ("fx": "sparkle" | "burst")
    if (note.fx === 'sparkle') for (let i = 0; i < 12; i++) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 120, col);
    if (note.fx === 'burst') this.fx.burst(T.hitX, y, '#ffffff', 40, 420);
    if (Math.random() < 0.6 || note.accent) this.fx.musicNotes(this.prince.fluteTip, this.giant.headWorld, run.combo >= 30 ? 2 : 1, col);
    PAM.AudioManager.sfx.hit(judgement, run.combo, note.accent, note.lane);
    if (judgement !== 'perfect' && this.settings.showEarlyLate) { this.timingHint = delta < 0 ? 'EARLY' : 'LATE'; this.timingHintAge = 0; }

    // chords: bonus when every note of the group is hit
    if (note.chord) {
      const group = this.engine.chordNotes(note.chord);
      if (group.every(n => n.judged && n.judgement !== 'miss')) {
        const bonus = 100 * group.length;
        run.score += bonus; run.chords++;
        PAM.AudioManager.sfx.chord(group.length);
        this.fx.popup(group.length >= 3 ? `CHORD! +${bonus}` : `DOUBLE! +${bonus}`, 960, 690, '#f6d88c', 40, 0.8);
      }
    }
    // streak / milestones -> voices and crowd
    run.perfectStreak = judgement === 'perfect' ? run.perfectStreak + 1 : 0;
    this.voice.onJudge(judgement, run.perfectStreak, 0, run.combo);
    this.crowd.onPerfectStreak(run.perfectStreak);
    if (this.crowd.onCombo(run.combo)) this.milestoneFx(run.combo);
    return gained;
  }

  milestoneFx(combo) {
    PAM.AudioManager.sfx.mesmerize();
    this.fx.popup(`${combo} COMBO!`, 960, 640, combo >= 50 ? '#ffd27a' : '#f6d88c', combo >= 50 ? 72 : 58, 1.2);
    this.fx.ring(960, 740, '#f6d88c', 30, combo >= 50 ? 420 : 260, 0.8, 5);
    for (let i = 0; i < (combo >= 50 ? 40 : 20); i++) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 120, '#f6d88c');
    if (combo >= 100) { this.flash = 0.25; for (let i = 0; i < 30; i++) this.fx.sparkle(960, 500, i % 2 ? '#ffd27a' : '#bfefff'); }
  }

  /** A head that was never hit, or a hold released too early. */
  onMiss(note, label) {
    const run = this.run, T = this.track, y = T.laneY[note.lane];
    PAM.ScoreManager.miss(run);
    if (label === 'RELEASED') run.holdsBroken++;
    run.perfectStreak = 0;
    this.pursuit.onMiss();
    this.prince.react('miss');
    this.giant.flinch();
    T.hit(note.lane, '#ff3355'); T.text(note.lane, label, '#ff5479');
    this.fx.ring(T.hitX, y, '#ff3355', 16, 55, 0.35, 4);
    this.fx.burst(T.hitX, y, '#ff3355', 8, 160);
    if (run.missStreak <= 2) this.fx.popup(label === 'RELEASED' ? 'RELEASED' : 'MISS', 960, 690, '#ff5479', 40, 0.6);
    PAM.AudioManager.sfx.miss();
    this.addShake(3 + Math.min(run.missStreak, 4) * 2);
    if (run.missStreak === 3) PAM.AudioManager.sfx.warning(0.6);
    if (run.missStreak === 4) PAM.AudioManager.sfx.roar();
    this.voice.onJudge('miss', 0, run.missStreak, run.combo);
    this.crowd.onMiss(run.missStreak);
  }

  onHoldDone(note) {
    const run = this.run, T = this.track, y = T.laneY[note.lane];
    PAM.ScoreManager.holdDone(run);
    run.holdsDone++;
    this.pursuit.onHit('good');
    T.hit(note.lane, '#f6d88c'); T.text(note.lane, 'HOLD!', '#f6d88c'); T.bumpCombo();
    this.fx.burst(T.hitX, y, PAM.TrackRenderer.laneColor(note.lane), 14, 240);
    PAM.AudioManager.sfx.holdDone(note.lane);
    if (this.crowd.onCombo(run.combo)) this.milestoneFx(run.combo);
  }

  /** Key pressed in the wrong lane while another lane had a note. */
  onWrong(ev) {
    const run = this.run, T = this.track;
    run.wrong++;
    T.hit(ev.lane, '#ff8a3d'); T.text(ev.lane, 'WRONG KEY', '#ff8a3d');
    PAM.AudioManager.sfx.wrong();
    this.addShake(2);
    if (PAM.Config.input.wrongLaneBreaksCombo) { run.combo = 0; run.perfectStreak = 0; }
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
    // the finale holds the scene still for a moment after the final note
    const frozen = this.state === S.VICTORY && this.stateT < 0.7;
    if (this.state !== S.PAUSED && !frozen) {
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
      this.crowd.songStart();
      this.setState(this.S.PLAYING);
    }
  }

  updatePlaying(now, dt) {
    const run = this.run, t = this.songTime(now);
    this.updateCountdown(t, this.startOffset);

    // test bot (?autoplay=1): presses each note's lane on time and holds hold-notes to the end
    let keys = this.keysDown;
    if (this.autoplay === '1') {
      for (const n of this.engine.notes) {
        if (n.judged || n.time > t) continue;
        const ev = this.engine.press(n.lane, n.time + (Math.random() - 0.5) * 0.02);
        if (ev) this.handleEvent(ev);
        if (n.kind === 'hold') this.botHeld[n.lane] = n.endTime + 0.05;
      }
      keys = keys.map((k, l) => k || t < this.botHeld[l]);
    }
    for (const ev of this.engine.update(t, keys)) this.handleEvent(ev);
    this.pursuit.update(dt);
    if (this.state !== this.S.PLAYING) return;   // an event may have ended the run

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

    // audience: excitement follows the performance, tension follows the danger
    this.crowd.update(dt, { combo: run.combo, accuracy: run.accuracy, danger: d });
    const mood = this.pursuit.mood;
    if (mood === 'running' && this.lastMood !== 'running' && this.lastMood !== 'attack') this.crowd.onCharge();
    this.lastMood = mood;
    if (d > 0.75 && !this.worriedSaid) { this.worriedSaid = this.voice.say('worried', { priority: 2 }); }
    if (d < 0.5) this.worriedSaid = false;

    this.ui.updateHud(run, this.pursuit, Math.max(0, t) / dur);
    if (this.pursuit.caught) return this.startCapture(t);
    if (this.engine.total && this.engine.allJudged && t > this.startOffset) return this.startFinale(t);
    if (t >= dur - 0.03 || (!this.music.playing && t > 1)) return this.startFinale(t);
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
    this.releaseAllKeys();
    this.voice.stop();
    PAM.AudioManager.sfx.roar();
    this.crowd.capture();   // gasps + worried audience
    this.addShake(10);
  }

  updateCapture(dt) {
    const T = this.stateT, g = this.giant, p = this.prince, ease = x => x * x * (3 - 2 * x);
    g.reachTarget = this.capBase || p.bodyCenter;
    if (T > 0.55 && !this.grabbed) {
      this.grabbed = true;
      this.capBase = { x: p.bodyCenter.x, y: p.bodyCenter.y };
      g.setState('capture'); p.setState('caught');
      PAM.AudioManager.sfx.impact();
      PAM.AudioManager.sfx.grab();
      this.crowd.react('gasp', { gain: 0.8, force: true, rate: 1.08 });
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
  /**
   * Success: the final note is emphasised, the scene holds still for a beat, then the audience
   * erupts (celebration + applause + whistles + a vocal cheer) and PERFORMANCE COMPLETE appears.
   */
  startFinale(t) {
    this.run.endTime = t;
    this.setState(this.S.VICTORY);
    this.finaleCheered = false; this.finaleFaded = false;
    this.releaseAllKeys();
    this.giant.setState('mesmerized');
    this.prince.setState('play');
    this.ui.countdown(null);
    const last = this.engine.notes.filter(n => Math.abs(n.time - this.engine.notes[this.engine.notes.length - 1].time) < 0.01);
    for (const n of last.length ? last : [{ lane: 0 }]) {
      const y = this.track.laneY[n.lane];
      this.track.hit(n.lane, '#ffffff');
      this.fx.ring(this.track.hitX, y, '#ffffff', 20, 260, 1.1, 6);
      this.fx.burst(this.track.hitX, y, '#f6d88c', 50, 520);
    }
    this.flash = 0.35; this.zoom = 1.03;
    PAM.AudioManager.sfx.finalNote();
  }

  updateVictory(dt) {
    const T = this.stateT;
    this.zoom += (1 - this.zoom) * Math.min(1, dt * 2);
    if (T > 0.7 && !this.finaleCheered) {
      this.finaleCheered = true;
      this.crowd.celebrate();
      this.voice.say('celebrate', { priority: 3, force: true, excitement: 1 });
      PAM.AudioManager.sfx.victory();
      this.ui.banner('PERFORMANCE COMPLETE', 'การแสดงจบลงอย่างงดงาม · นางยักษ์หลับใหลในมนตร์เสียงปี่ หลบหนีสำเร็จ!');
      for (let i = 0; i < 40; i++) this.fx.sparkle(960, 520, i % 2 ? '#f6d88c' : '#bfe9ff');
    }
    if (T > 0.7) {
      if (Math.random() < dt * 30) this.fx.sparkle(this.giant.headWorld.x, this.giant.headWorld.y + 140, Math.random() < 0.5 ? '#f6d88c' : '#bfe9ff');
      if (Math.random() < dt * 3) this.fx.musicNotes(this.prince.fluteTip, this.giant.headWorld, 1, '#f6d88c');
    }
    if (T > 4.2 && !this.finaleFaded) { this.finaleFaded = true; PAM.AudioManager.duck({ music: 0.02 }, 10, 1.6, 0.2); }
    if (T > 6) this.finish(true);
  }

  finish(cleared) {
    const run = this.run;
    run.cleared = cleared;
    const completion = cleared ? 1 : Math.min(1, run.endTime / this.music.duration);
    this.music.stop();
    PAM.AudioManager.setUnderwater(0, 0.3);
    PAM.AudioManager.resetDucking();
    this.crowd.stopLoops(2.5);     // applause tails keep ringing into the results screen
    this.voice.stop();
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

    if (inRun && this.state !== S.CAPTURE && !(this.state === S.VICTORY && this.stateT > 1.4)) {
      const approach = PAM.Config.baseApproachTime / this.settings.noteSpeed;
      if (this.state === S.VICTORY) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (this.stateT - 0.7) / 0.7); }
      this.track.draw(ctx, this.t, songT, this.engine, approach, {
        timingHint: this.timingHint, timingHintAge: this.timingHintAge, combo: this.run.combo,
        keysDown: this.autoplay === '1' ? this.keysDown.map((k, l) => k || songT < this.botHeld[l]) : this.keysDown
      });
      if (this.state === S.VICTORY) ctx.restore();
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
      this.run ? `judged ${this.run.judged}/${this.run.totalNotes}  miss streak ${this.run.missStreak}  perfect streak ${this.run.perfectStreak}  wrong ${this.run.wrong}` : '',
      `keys ${this.keysDown.map((k, i) => k ? 'WASD'[i] : '·').join('')}  crowd exc ${this.crowd.excitement.toFixed(2)} tension ${this.crowd.tension.toFixed(2)}  pack ${this.pack ? this.pack.mode : 'loading'}`,
      `voice: ${this.voice.log.slice(-2).map(v => v.category).join(', ')}  crowd: ${this.crowd.log.slice(-3).map(c => c.cat).join(', ')}`
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(660, 70, 600, 148);
    ctx.fillStyle = '#9ff'; ctx.font = '16px monospace'; ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, 672, 94 + i * 22));
  }
};
