/*
 * UI — DOM screens (main menu, song select, settings, tutorial, calibration, pause, results)
 * and the HUD. Buttons declare data-action="..." and are routed to Game.action().
 * The concept art sheet is reused for menu / song / tutorial / result artwork via CSS crops.
 */
window.PAM = window.PAM || {};
PAM.UI = class UI {
  constructor(game) {
    this.game = game;
    this.current = 'menu';
    this.history = [];
    this.lastHud = {};
    this.$ = id => document.getElementById(id);

    // concept-sheet crops (source rectangles in the 1536x1024 sheet)
    this.crop(this.$('artBanner'), 0, 0, 1160, 345, 800, 238);
    this.crop(this.$('artTut2'), 916, 392, 196, 86, 470, 230, 'cover');
    this.crop(this.$('artTut3'), 196, 752, 192, 196, 470, 230, 'cover');

    document.getElementById('stage').addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      e.preventDefault();
      PAM.AudioManager.sfx.ui();
      game.action(el.dataset.action);
    });
  }

  /** Show a sub-rectangle of the concept sheet inside an element of size w x h. */
  crop(el, sx, sy, sw, sh, w, h, fit) {
    if (!el) return;
    let k = w / sw, ky = h / sh;
    if (fit === 'cover') k = Math.max(k, ky); else ky = k;
    const ox = (w - sw * k) / 2, oy = (h - sh * k) / 2;
    el.style.backgroundSize = `${1536 * k}px ${1024 * k}px`;
    el.style.backgroundPosition = `${-sx * k + ox}px ${-sy * k + oy}px`;
  }

  show(name, { remember = true } = {}) {
    if (remember && this.current && this.current !== name) this.history.push(this.current);
    if (this.history.length > 10) this.history.shift();
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== 'screen-' + name));
    this.current = name;
    const first = document.querySelector('#screen-' + name + ' .btn.primary:not([disabled])');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }
  back() {
    const prev = this.history.pop() || 'menu';
    this.show(prev, { remember: false });
    return prev;
  }
  hideScreens() { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); this.current = null; }

  setHud(visible) { this.$('hud').classList.toggle('hidden', !visible); }

  // ---------------------------------------------------------------- settings
  bindSettings(settings, onChange) {
    const fmt = {
      musicVolume: v => Math.round(v * 100) + '%', sfxVolume: v => Math.round(v * 100) + '%',
      noteSpeed: v => (+v).toFixed(2) + '×', calibrationMs: v => (v > 0 ? '+' : '') + v + ' ms'
    };
    this.refreshSettings = () => {
      document.querySelectorAll('[data-setting]').forEach(el => {
        const k = el.dataset.setting, v = settings[k];
        if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
        const out = el.parentElement.querySelector('output');
        if (out && fmt[k]) out.textContent = fmt[k](v);
      });
    };
    document.querySelectorAll('[data-setting]').forEach(el => {
      el.addEventListener('input', () => {
        const k = el.dataset.setting;
        settings[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
        this.refreshSettings();
        onChange(k);
      });
      // keep the game keys from fighting with focused sliders
      el.addEventListener('keydown', e => { if (e.code === 'Space') e.preventDefault(); });
    });
    this.refreshSettings();
  }

  // ---------------------------------------------------------------- song select
  /** Left column: one card per song. state(id) -> 'loading' | 'ready' | 'error' | 'nomap' | undefined */
  renderSongList(songs, current, state, difficulty, onSelect) {
    const list = this.$('songList');
    list.innerHTML = '';
    for (const s of songs) {
      const r = PAM.Storage.getRecord(s.id, difficulty), st = state(s.id);
      const b = document.createElement('button');
      b.className = 'song-item' + (s === current ? ' active' : '');
      const status = st === 'ready' ? (r.cleared ? 'CLEAR ✓' : r.highScore ? 'BEST ' + r.highScore.toLocaleString() : 'NEW')
        : st === 'error' || st === 'nomap' ? 'โหลดไม่สำเร็จ' : 'กำลังโหลด…';
      b.innerHTML = `<b>${s.title}</b><span>${s.subtitle}</span><em>${status}</em>`;
      b.addEventListener('click', () => { if (s !== current) { PAM.AudioManager.sfx.ui(); onSelect(s.id); } });
      list.appendChild(b);
    }
    const a = current.art || [300, 0, 860, 345];
    this.crop(this.$('artSong'), a[0], a[1], a[2], a[3], 460, 300, 'cover');
    this.$('songTitle').textContent = current.title;
    this.$('songSubtitle').textContent = current.subtitle;
    // cleared here, filled by renderSongSelect once this song's beat map is loaded
    this.$('songMeta').innerHTML = '<span class="chip">กำลังโหลด…</span>';
    this.$('diffTabs').innerHTML = ''; this.$('songRecords').innerHTML = ''; this.$('diffDesc').textContent = '';
  }

  renderSongSelect(song, beatmap, difficulty, onPick) {
    this.$('songTitle').textContent = song.title;
    this.$('songSubtitle').textContent = song.subtitle;
    const dur = beatmap.duration || this.game.music.duration;
    const mm = Math.floor(dur / 60), ss = String(Math.round(dur % 60)).padStart(2, '0');
    this.$('songMeta').innerHTML = [
      `⏱ ${mm}:${ss}`, `♩ ≈ ${Math.round(beatmap.feltBpm || beatmap.bpm / 2)} BPM (pulse ${Math.round(beatmap.bpm)})`,
      `♪ ${beatmap.source || ''}`
    ].map(s => `<span class="chip">${s}</span>`).join('');
    const tabs = this.$('diffTabs');
    tabs.innerHTML = '';
    for (const key of PAM.DifficultyManager.keys) {
      const D = PAM.DifficultyManager.get(key);
      const n = PAM.DifficultyManager.chartFor(beatmap, key).length;
      const stars = '★'.repeat(PAM.DifficultyManager.stars(beatmap, key)).padEnd(5, '☆');
      const b = document.createElement('button');
      b.className = 'diff-tab' + (key === difficulty ? ' active' : '');
      b.dataset.diff = key;
      b.innerHTML = `<b>${D.label}</b><span>${D.thai} · ${n} โน้ต</span><div class="stars">${stars}</div>`;
      b.addEventListener('click', () => { PAM.AudioManager.sfx.ui(); onPick(key); });
      tabs.appendChild(b);
    }
    const D = PAM.DifficultyManager.get(difficulty);
    const w = PAM.Config.timing;
    this.$('diffDesc').textContent = `${D.description} · หน้าต่างจังหวะ PERFECT ±${Math.round(w.perfect * D.timingScale * 1000)}ms / GOOD ±${Math.round(w.good * D.timingScale * 1000)}ms / OK ±${Math.round(w.ok * D.timingScale * 1000)}ms`;
    const r = PAM.Storage.getRecord(song.id, difficulty);
    this.$('songRecords').innerHTML = [
      ['HIGH SCORE', r.highScore.toLocaleString()], ['BEST COMBO', r.bestCombo],
      ['BEST ACC', Math.round(r.bestAccuracy * 100) + '%'], ['COMPLETION', r.cleared ? 'CLEAR ✓' : Math.round(r.bestCompletion * 100) + '%']
    ].map(([l, v]) => `<div><label>${l}</label><b>${v}</b></div>`).join('');
  }

  setAudioStatus(text, { ready, fallback }) {
    this.$('loadStatus').textContent = text;
    this.$('btnPlay').disabled = !ready;
    this.$('audioFallback').classList.toggle('hidden', !fallback);
  }

  // ---------------------------------------------------------------- HUD
  updateHud(run, pursuit, progress) {
    const set = (id, v) => { if (this.lastHud[id] !== v) { this.lastHud[id] = v; this.$(id).textContent = v; } };
    set('hudScore', String(run.score).padStart(7, '0'));
    if (this.lastHud.hudCombo !== String(run.combo) && run.combo > 0) {
      const el = this.$('hudCombo'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
    set('hudCombo', String(run.combo));
    set('hudBest', String(run.bestCombo));
    set('hudAcc', Math.round(run.accuracy * 100) + '%');
    const danger = Math.round(pursuit.danger * 100);
    set('hudDangerPct', danger + '%');
    this.$('hudDanger').style.width = danger + '%';
    const st = pursuit.status;
    set('hudStatus', st.th); set('hudStatusEn', st.en);
    const ps = this.$('hudStatus').parentElement;
    if (this.lastHud.level !== st.level) { this.lastHud.level = st.level; ps.className = 'pursuit-status l' + st.level; }
    this.$('hudGiantIcon').style.left = (pursuit.pursuitDistance * 100) + '%';
    set('hudDistance', Math.round(pursuit.pursuitDistance * 100) + ' m');
    this.$('hudSpellFill').style.width = Math.round(pursuit.spell * 100) + '%';
    this.$('hudProgress').style.width = (Math.max(0, Math.min(1, progress)) * 100).toFixed(1) + '%';
  }

  countdown(text, go) {
    const el = this.$('countdown');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('go', !!go);
    if (el.textContent !== text) el.textContent = text;
  }

  banner(title, sub, cls) {
    const el = this.$('banner');
    if (!title) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.className = cls || '';
    el.innerHTML = `<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}`;
  }

  // ---------------------------------------------------------------- results
  showResults(run, completion, improved, cleared) {
    const won = cleared;
    this.$('resEyebrow').textContent = won ? 'THE GIANTESS SLEEPS UNDER THE SPELL' : 'THE SEA CLAIMS ITS PRINCE';
    const h = this.$('resTitle');
    h.textContent = won ? 'ESCAPE SUCCESSFUL' : 'GAME OVER';
    h.className = won ? 'win' : 'lose';
    this.$('resMsg').textContent = won
      ? 'นางผีเสื้อสมุทรหลงใหลในเสียงปี่ จนพระอภัยมณีหลบหนีได้สำเร็จ'
      : 'นางผีเสื้อสมุทรจับพระอภัยมณีพาลงทะเล — The giantess has captured Phra Aphai Mani.';
    if (won) this.crop(this.$('artResult'), 640, 20, 520, 330, 460, 640, 'cover');
    else this.crop(this.$('artResult'), 1276, 384, 244, 244, 460, 640, 'cover');
    this.$('resScore').textContent = run.score.toLocaleString();
    this.$('resNew').classList.toggle('hidden', !improved.score);
    const D = PAM.DifficultyManager.get(run.difficulty);
    this.$('resGrid').innerHTML = [
      ['BEST COMBO', run.bestCombo + (improved.combo ? ' ★' : ''), ''], ['ACCURACY', (run.accuracy * 100).toFixed(1) + '%', ''],
      ['COMPLETION', Math.round(completion * 100) + '%', ''], ['DIFFICULTY', D.label, ''],
      ['PERFECT', run.perfect, 'p'], ['GOOD', run.good, 'g'], ['OK', run.ok, 'o'], ['MISS', run.miss, 'm']
    ].map(([l, v, c]) => `<div class="${c}"><label>${l}</label><b>${v}</b></div>`).join('');
    this.show('results');
  }
};
