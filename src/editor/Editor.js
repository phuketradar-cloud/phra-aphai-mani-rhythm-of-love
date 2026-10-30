/*
 * Editor — Beat Map Editor (editor.html).
 * Timeline with waveform, optional onset envelope / detected beats from BeatAnalyzer, snap grid,
 * three difficulty rows. Preview uses the same MusicPlayer clock as the game, with optional
 * ticks scheduled on the audio clock at every note so timing can be checked by ear.
 */
window.PAM = window.PAM || {};
PAM.Editor = class Editor {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.canvas = this.$('timeline');
    this.ctx = this.canvas.getContext('2d');
    const wanted = new URLSearchParams(location.search).get('song') || PAM.Storage.loadSettings().songId;
    this.song = PAM.Config.songs.find(s => s.id === wanted) || PAM.Config.songs[0];
    this.music = new PAM.MusicPlayer(PAM.AudioManager);
    this.map = null;
    this.analysis = null;
    this.peaks = null;
    this.viewStart = 0;
    this.pxPerSec = 160;
    this.selected = null;
    this.drag = null;
    this.undoStack = [];
    this.tickedUntil = 0;
    this.RULER = 30;
  }

  async boot() {
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bind();
    const pick = this.$('selSong');
    pick.innerHTML = PAM.Config.songs.map(s => `<option value="${s.id}"${s === this.song ? ' selected' : ''}>${s.title}</option>`).join('');
    pick.onchange = () => {
      if (this.dirty && !confirm('Unsaved changes will be lost. Switch song?')) { pick.value = this.song.id; return; }
      location.search = '?song=' + pick.value;
    };
    this.map = await PAM.BeatMap.load(this.song);
    this.$('numBpm').value = this.map.bpm; this.$('numOffset').value = this.map.offset || 0;
    this.status('Beat map loaded from ' + this.map.source + '. Loading music…');
    try {
      const mode = await this.music.load(this.song.audio);
      this.onAudio(mode);
    } catch (e) { this.onAudio(null); }
    requestAnimationFrame(() => this.frame());
  }

  onAudio(mode) {
    if (mode === 'webaudio') { this.computePeaks(); this.$('pickAudio').style.display = 'none'; this.$('audioNote').textContent = ''; }
    else {
      this.$('pickAudio').style.display = '';
      this.$('audioNote').textContent = mode === 'element'
        ? 'Opened via file:// — playback works, but choose the music file to see the waveform and run analysis (or open the editor through Play.bat).'
        : 'Music could not be loaded. Choose the music file.';
    }
    this.status(`Ready · ${this.map.notes.length} notes · audio: ${mode || 'none'}`);
    this.updateInfo();
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.W = r.width; this.H = r.height;
    this.canvas.width = r.width * this.dpr; this.canvas.height = r.height * this.dpr;
  }

  status(t) { this.$('statusText').textContent = t; }

  // ------------------------------------------------------------------ geometry
  get waveTop() { return this.RULER; }
  get waveH() { return Math.round((this.H - this.RULER) * 0.38); }
  get rowsTop() { return this.RULER + this.waveH; }
  get rowH() { return (this.H - this.rowsTop) / 3; }
  timeToX(t) { return (t - this.viewStart) * this.pxPerSec; }
  xToTime(x) { return this.viewStart + x / this.pxPerSec; }
  rowAt(y) { return y < this.rowsTop ? 0 : Math.min(3, 1 + Math.floor((y - this.rowsTop) / this.rowH)); }
  rowY(level) { return this.rowsTop + (level - 0.5) * this.rowH; }
  get duration() { return this.music.duration || this.map.duration || 180; }

  snap(t) {
    const mode = this.$('selSnap').value;
    if (mode === '0') return t;
    if (mode === 'beats' && this.analysis) {
      let best = t, bd = Infinity;
      const cands = this.analysis.beats.map(b => b.time).concat(this.analysis.offbeats.map(b => b.time));
      for (const c of cands) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
      return best;
    }
    const bpm = parseFloat(this.$('numBpm').value) || this.map.bpm, off = parseFloat(this.$('numOffset').value) || 0;
    const step = 60 / bpm / (mode === 'beats' ? 2 : parseInt(mode, 10));
    return off + Math.round((t - off) / step) * step;
  }

  noteAt(x, y) {
    const row = this.rowAt(y);
    if (!row) return null;
    let best = null, bd = 10;
    for (const n of this.map.notes) {
      if (n.difficulty !== row) continue;
      const d = Math.abs(this.timeToX(n.time) - x);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ------------------------------------------------------------------ editing
  pushUndo() { this.undoStack.push(JSON.stringify(this.map.notes)); if (this.undoStack.length > 80) this.undoStack.shift(); }
  undo() { const s = this.undoStack.pop(); if (s) { this.map.notes = JSON.parse(s); this.selected = null; this.changed('Undo'); } }
  sortNotes() { this.map.notes.sort((a, b) => a.time - b.time); }
  changed(msg) { this.sortNotes(); this.dirty = true; this.updateInfo(); this.updateSel(); if (msg) this.status(msg); }

  addNote(t, level) {
    this.pushUndo();
    const n = { time: +t.toFixed(3), lane: 0, type: 'normal', difficulty: level, window: 1, fx: null };
    this.map.notes.push(n); this.selected = n;
    this.changed(`Added note at ${n.time.toFixed(3)} s (level ${level})`);
  }
  removeNote(n) {
    this.pushUndo();
    this.map.notes = this.map.notes.filter(m => m !== n);
    if (this.selected === n) this.selected = null;
    this.changed(`Removed note at ${n.time.toFixed(3)} s`);
  }

  // ------------------------------------------------------------------ input
  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      const x = e.offsetX, y = e.offsetY;
      if (y < this.RULER || (y < this.rowsTop && e.button === 0)) { this.seek(this.xToTime(x)); this.scrubbing = true; return; }
      const n = this.noteAt(x, y);
      if (e.button === 2) { if (n) this.removeNote(n); return; }
      if (n) { this.selected = n; this.pushUndo(); this.drag = { n, moved: false }; this.updateSel(); return; }
      const row = this.rowAt(y);
      if (row) this.addNote(this.snap(this.xToTime(x)), row);
    });
    window.addEventListener('mousemove', e => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left;
      if (this.scrubbing) { this.seek(this.xToTime(x)); return; }
      if (!this.drag) return;
      this.drag.n.time = +Math.max(0, this.snap(this.xToTime(x))).toFixed(3);
      this.drag.moved = true; this.updateSel();
    });
    window.addEventListener('mouseup', () => {
      this.scrubbing = false;
      if (this.drag) { if (!this.drag.moved) this.undoStack.pop(); else this.changed(`Moved note to ${this.drag.n.time.toFixed(3)} s`); this.drag = null; }
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) {
        const t = this.xToTime(e.offsetX);
        this.pxPerSec = Math.max(20, Math.min(1500, this.pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        this.viewStart = t - e.offsetX / this.pxPerSec;
      } else this.viewStart += (e.deltaY + e.deltaX) / this.pxPerSec;
      this.viewStart = Math.max(-1, Math.min(this.duration - 2, this.viewStart));
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' && e.target.type === 'number') return;
      const n = this.selected;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      else if (e.code === 'KeyK' && this.music.playing && this.$('chkRecord').checked) {
        const t = this.music.timeAt(performance.now()) - PAM.Storage.loadSettings().calibrationMs / 1000;
        this.addNote(this.snap(t), parseInt(this.$('selLevel').value, 10) === 1 ? 1 : 2);
      }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && n) { e.preventDefault(); this.removeNote(n); }
      else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code) && n) { this.pushUndo(); n.difficulty = +e.code.slice(-1); this.changed('Difficulty set to ' + n.difficulty); }
      else if (e.code === 'KeyT' && n) { this.pushUndo(); const types = ['normal', 'soft', 'accent', 'spell']; n.type = types[(types.indexOf(n.type) + 1) % 4]; this.changed('Type: ' + n.type); }
      else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && n) {
        e.preventDefault(); this.pushUndo();
        n.time = +(n.time + (e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.001 : 0.005)).toFixed(3); this.changed('Nudged to ' + n.time.toFixed(3));
      }
      else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.undo(); }
    });

    this.$('btnPlay').onclick = () => this.togglePlay();
    this.$('btnStop').onclick = () => { this.music.stop(); this.seek(0); this.$('btnPlay').textContent = '▶ Play'; };
    this.$('numBpm').onchange = () => { this.map.bpm = parseFloat(this.$('numBpm').value); this.dirty = true; };
    this.$('numOffset').onchange = () => { this.map.offset = parseFloat(this.$('numOffset').value); this.dirty = true; };
    this.$('selLevel').onchange = () => this.updateInfo();
    this.$('btnAnalyze').onclick = () => this.analyze();
    this.$('btnGenerate').onclick = () => this.regenerate();
    this.$('btnSave').onclick = () => this.saveToGame();
    this.$('btnDownload').onclick = () => this.download('json');
    this.$('btnDownloadJs').onclick = () => this.download('js');
    this.$('btnImport').onclick = () => this.$('fileImport').click();
    this.$('fileImport').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { this.pushUndo(); this.map = PAM.BeatMap.normalize(JSON.parse(await f.text())); this.changed('Imported ' + f.name); }
      catch (err) { alert('Invalid beat map: ' + err.message); }
    };
    this.$('btnRevert').onclick = async () => {
      if (!confirm('Discard the saved override and reload the shipped beat map?')) return;
      PAM.Storage.clearBeatmapOverride(this.song.id);
      this.map = await PAM.BeatMap.load(this.song, { ignoreOverride: true });
      this.selected = null; this.undoStack = []; this.changed('Reverted to ' + this.map.source);
    };
    this.$('btnPlaytest').onclick = () => {
      this.saveToGame();
      PAM.Storage.saveSettings(Object.assign(PAM.Storage.loadSettings(), { songId: this.song.id }));
      const start = Math.max(0, this.music.timeAt(performance.now()) - 3);
      window.open('index.html?start=' + start.toFixed(1), '_blank');
    };
    this.$('fileAudio').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      this.status('Decoding ' + f.name + '…');
      try { await this.music.loadFile(f); this.onAudio('webaudio'); } catch (err) { this.status('Cannot decode: ' + err.message); }
    };
  }

  async togglePlay() {
    await PAM.AudioManager.resume();
    if (!this.music.loaded) return;
    if (this.music.playing) { this.music.pause(); this.$('btnPlay').textContent = '▶ Play'; }
    else { this.music.play(this.music.position, 0.05); this.tickedUntil = this.music.position; this.$('btnPlay').textContent = '❚❚ Pause'; }
  }
  seek(t) {
    t = Math.max(0, Math.min(this.duration, t));
    const was = this.music.playing;
    this.music.stop(); this.music.position = t;
    if (was) { this.music.play(t, 0.03); this.tickedUntil = t; }
  }

  // ------------------------------------------------------------------ analysis / generation
  computePeaks() {
    const buf = this.music.buffer;
    const per = Math.floor(buf.sampleRate / 200), n = Math.floor(buf.length / per);
    const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    this.peaks = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = i * per; j < (i + 1) * per; j += 4) for (const ch of chs) { const v = Math.abs(ch[j]); if (v > m) m = v; }
      this.peaks[i] = m;
    }
    this.peakRate = 200;
  }

  analyze() {
    const buf = this.music.buffer;
    if (!buf) { alert('Load the music as a decoded file first (open via Play.bat or choose the file).'); return; }
    this.status('Analyzing audio (spectral flux + beat tracking) — this can take 5-15 seconds…');
    setTimeout(() => {
      const t0 = performance.now();
      const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
      this.analysis = PAM.BeatAnalyzer.analyze(chs, buf.sampleRate);
      const a = this.analysis;
      this.$('numBpm').value = a.bpm.toFixed(2); this.$('numOffset').value = a.firstDownbeat.toFixed(3);
      this.map.bpm = +a.bpm.toFixed(2); this.map.offset = +a.firstDownbeat.toFixed(3); this.map.feltBpm = +a.feltBpm.toFixed(2);
      this.status(`Analysis done in ${Math.round(performance.now() - t0)} ms · pulse ${a.bpm.toFixed(2)} BPM (felt ${a.feltBpm.toFixed(1)}) · ${a.beats.length} beats · sections: ${a.sections.map(s => s.kind).join(', ')}`);
      this.updateInfo();
    }, 30);
  }

  regenerate() {
    if (!this.analysis) { this.analyze(); setTimeout(() => this.analysis && this.regenerate(), 400); return; }
    const s = prompt('Minimum gap between notes in seconds for EASY, NORMAL, HARD (lower = denser):', '0.75, 0.38, 0.19');
    if (!s) return;
    const [g1, g2, g3] = s.split(',').map(parseFloat);
    if (![g1, g2, g3].every(v => v > 0.05)) { alert('Please enter three numbers, e.g. 0.75, 0.38, 0.19'); return; }
    this.pushUndo();
    this.map.notes = PAM.BeatMap.normalize({ notes: PAM.BeatAnalyzer.generateChart(this.analysis, { minGap: { 1: g1, 2: g2, 3: g3 } }) }).notes;
    this.map.sections = this.analysis.sections;
    this.selected = null;
    this.changed(`Regenerated ${this.map.notes.length} notes (Ctrl+Z to undo)`);
  }

  // ------------------------------------------------------------------ saving
  exportMap() {
    const m = Object.assign({}, this.map);
    delete m.source;
    m.notes = this.map.notes.map(n => {
      const o = { time: +n.time.toFixed(3), lane: n.lane || 0, type: n.type, difficulty: n.difficulty };
      if (n.window && n.window !== 1) o.window = n.window;
      if (n.fx) o.fx = n.fx;
      return o;
    });
    m.editedAt = new Date().toISOString();
    return m;
  }
  saveToGame() {
    const ok = PAM.Storage.saveBeatmapOverride(this.song.id, this.exportMap());
    this.dirty = false;
    this.status(ok ? 'Saved to this browser — the game now uses this beat map.' : 'Could not save (storage blocked). Use Download JSON instead.');
  }
  download(kind) {
    const m = this.exportMap(), id = this.song.id;
    const text = kind === 'json' ? JSON.stringify(m, null, 1)
      : `// Auto-generated from ${id}.json so the game also works when opened via file://\nwindow.PAM_BEATMAPS = window.PAM_BEATMAPS || {};\nwindow.PAM_BEATMAPS[${JSON.stringify(id)}] = ${JSON.stringify(m)};\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/javascript' }));
    a.download = id + (kind === 'json' ? '.json' : '.beatmap.js');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------------ info panels
  updateInfo() {
    const notes = this.map.notes, counts = [1, 2, 3].map(L => notes.filter(n => n.difficulty <= L).length);
    const minGapRule = { 1: 0.5, 2: 0.3, 3: 0.15 };
    this.tooClose = new Set();
    for (const L of [1, 2, 3]) {
      const v = notes.filter(n => n.difficulty <= L);
      for (let i = 1; i < v.length; i++) if (v[i].time - v[i - 1].time < minGapRule[L]) { this.tooClose.add(v[i]); this.tooClose.add(v[i - 1]); }
    }
    this.$('warn').textContent = this.tooClose.size ? `⚠ ${this.tooClose.size} notes are very close together (outlined red)` : '';
    const d = this.duration;
    this.$('info').innerHTML = [
      ['Title', this.map.song], ['Duration', `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}`],
      ['Pulse BPM', (+this.map.bpm).toFixed(2)], ['Felt BPM', this.map.feltBpm || '—'],
      ['Easy notes', counts[0]], ['Normal notes', counts[1]], ['Hard notes', counts[2]],
      ['Source', this.map.source || 'edited']
    ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  }
  updateSel() {
    const n = this.selected, el = this.$('sel');
    if (!n) { el.innerHTML = '<p>Click a note to select it.</p>'; return; }
    el.innerHTML = `<div class="kv"><span>time</span><b>${n.time.toFixed(3)} s</b><span>difficulty</span><b>${['', 'easy', 'normal', 'hard'][n.difficulty]}</b>
      <span>type</span><b>${n.type}</b><span>timing window</span><b>×${n.window || 1}</b></div>`;
  }

  // ------------------------------------------------------------------ rendering
  frame() {
    const now = performance.now();
    const t = this.music.timeAt(now);
    if (this.music.playing) {
      if (this.timeToX(t) > this.W * 0.7 || t < this.viewStart) this.viewStart = t - (this.W * 0.3) / this.pxPerSec;
      this.scheduleTicks(t);
      if (t >= this.duration) { this.music.stop(); this.$('btnPlay').textContent = '▶ Play'; }
    }
    this.draw(t);
    requestAnimationFrame(() => this.frame());
  }

  scheduleTicks(t) {
    if (!this.$('chkTick').checked || this.music.mode !== 'webaudio') return;
    const ctx = PAM.AudioManager.ctx, ahead = t + 0.15, level = parseInt(this.$('selLevel').value, 10);
    for (const n of this.map.notes) {
      if (n.time <= this.tickedUntil || n.time > ahead || n.difficulty > level) continue;
      const when = this.music.startAt + n.time;
      if (when < ctx.currentTime) continue;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = n.type === 'accent' || n.type === 'spell' ? 1760 : 1320;
      g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.18, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      o.connect(g); g.connect(ctx.destination); o.start(when); o.stop(when + 0.06);
    }
    this.tickedUntil = Math.max(this.tickedUntil, ahead);
  }

  draw(t) {
    const c = this.ctx, W = this.W, H = this.H;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#070c1d'; c.fillRect(0, 0, W, H);
    const t0 = this.viewStart, t1 = this.xToTime(W);

    // sections background
    for (const s of this.map.sections || []) {
      const col = { intense: 'rgba(255,84,121,0.07)', build: 'rgba(111,141,255,0.05)', quiet: 'rgba(95,227,255,0.03)', intro: 'rgba(227,180,92,0.05)', ending: 'rgba(227,180,92,0.05)' }[s.kind];
      c.fillStyle = col || 'transparent'; c.fillRect(this.timeToX(s.start), this.RULER, (s.end - s.start) * this.pxPerSec, H);
      c.fillStyle = 'rgba(200,210,240,0.35)'; c.font = '11px sans-serif'; c.fillText(s.kind, this.timeToX(s.start) + 4, this.RULER + 12);
    }

    // waveform
    const wt = this.waveTop, wh = this.waveH, mid = wt + wh / 2;
    if (this.peaks) {
      c.fillStyle = 'rgba(120,150,220,0.55)';
      for (let x = 0; x < W; x++) {
        const a = Math.floor(this.xToTime(x) * this.peakRate), b = Math.floor(this.xToTime(x + 1) * this.peakRate);
        let m = 0; for (let i = Math.max(0, a); i <= b && i < this.peaks.length; i++) if (this.peaks[i] > m) m = this.peaks[i];
        c.fillRect(x, mid - m * wh * 0.48, 1, m * wh * 0.96);
      }
    } else { c.fillStyle = '#56688f'; c.font = '13px sans-serif'; c.fillText('(waveform needs a decoded audio file)', 10, mid); }
    if (this.analysis) {
      const env = this.analysis.envelope, off = env.timeOffset;
      c.strokeStyle = 'rgba(95,227,255,0.8)'; c.beginPath();
      for (let x = 0; x < W; x += 2) { const i = Math.round((this.xToTime(x) - off) * env.fps); const v = env.env[i] || 0; const y = wt + wh - v * wh * 0.9; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      for (const b of this.analysis.beats) {
        if (b.time < t0 || b.time > t1) continue;
        c.strokeStyle = b.downbeat ? 'rgba(227,180,92,0.9)' : 'rgba(227,180,92,0.35)'; c.lineWidth = b.downbeat ? 2 : 1;
        c.beginPath(); c.moveTo(this.timeToX(b.time), wt); c.lineTo(this.timeToX(b.time), wt + wh); c.stroke();
      }
      c.lineWidth = 1;
    }

    // grid
    const bpm = parseFloat(this.$('numBpm').value) || this.map.bpm, off = parseFloat(this.$('numOffset').value) || 0;
    const beat = 60 / bpm, sub = this.$('selSnap').value;
    const div = /^\d$/.test(sub) && sub !== '0' ? parseInt(sub, 10) : 1, step = beat / div;
    if (step * this.pxPerSec > 5) {
      const k0 = Math.ceil((t0 - off) / step), k1 = Math.floor((t1 - off) / step);
      for (let k = k0; k <= k1; k++) {
        const x = this.timeToX(off + k * step);
        const onBeat = k % div === 0, bar = onBeat && (k / div) % (this.map.beatsPerBar || 8) === 0;
        c.strokeStyle = bar ? 'rgba(255,255,255,0.28)' : onBeat ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
        c.beginPath(); c.moveTo(x, this.rowsTop); c.lineTo(x, H); c.stroke();
      }
    }

    // rows
    const names = ['', 'EASY (1)', 'NORMAL (2)', 'HARD (3)'], cols = ['', '#7ee8b0', '#5fe3ff', '#ff5479'];
    for (let L = 1; L <= 3; L++) {
      const y = this.rowsTop + (L - 1) * this.rowH;
      c.strokeStyle = '#1e2b52'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      c.fillStyle = cols[L]; c.font = '600 12px sans-serif'; c.fillText(names[L], 8, y + 16);
    }
    const level = parseInt(this.$('selLevel').value, 10);
    for (const n of this.map.notes) {
      if (n.time < t0 - 0.1 || n.time > t1 + 0.1) continue;
      const x = this.timeToX(n.time), y = this.rowY(n.difficulty), dim = n.difficulty > level;
      const size = n.type === 'accent' || n.type === 'spell' ? 9 : n.type === 'soft' ? 6 : 7.5;
      c.save(); c.translate(x, y); c.globalAlpha = dim ? 0.25 : 1;
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(0, -this.rowH / 2 + 4); c.lineTo(0, this.rowH / 2 - 4); c.stroke();
      c.rotate(Math.PI / 4); c.fillStyle = PAM.TrackRenderer.colorFor(n.type); c.fillRect(-size, -size, size * 2, size * 2);
      if (n === this.selected) { c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.strokeRect(-size - 4, -size - 4, size * 2 + 8, size * 2 + 8); }
      else if (this.tooClose && this.tooClose.has(n)) { c.strokeStyle = '#ff3355'; c.lineWidth = 2; c.strokeRect(-size - 3, -size - 3, size * 2 + 6, size * 2 + 6); }
      c.restore();
    }

    // ruler
    c.fillStyle = '#0d1530'; c.fillRect(0, 0, W, this.RULER);
    c.fillStyle = '#8fa0c4'; c.font = '11px sans-serif';
    const lbl = this.pxPerSec > 300 ? 0.25 : this.pxPerSec > 100 ? 1 : 5;
    for (let s = Math.ceil(t0 / lbl) * lbl; s <= t1; s += lbl) {
      const x = this.timeToX(s);
      c.fillRect(x, this.RULER - 8, 1, 8);
      c.fillText(`${Math.floor(s / 60)}:${(s % 60).toFixed(lbl < 1 ? 2 : 0).padStart(lbl < 1 ? 5 : 2, '0')}`, x + 3, 14);
    }
    // playhead
    const px = this.timeToX(t);
    c.strokeStyle = '#e3b45c'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke(); c.lineWidth = 1;
    c.fillStyle = '#e3b45c'; c.font = '600 12px sans-serif'; c.fillText(t.toFixed(3) + ' s', px + 5, this.RULER + 26);
  }
};
