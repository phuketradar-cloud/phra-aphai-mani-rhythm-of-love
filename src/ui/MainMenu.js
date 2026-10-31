/*
 * MainMenu — the full-screen key-art title menu (PLAY / OPTIONS / FULLSCREEN).
 *
 * The three menu "plates" are painted at runtime on canvases as rough brush strokes, so they sit
 * on the key art like the painted buttons of a console rhythm game: a gold plate for the selected
 * option and a black ink plate with gold dry-brush edges for the others. Both versions are kept
 * per item and cross-faded, which makes the gold highlight glide between options.
 *
 * Navigation: mouse hover/click, or Up/Down (W/S) + Enter/Space. Esc on Options returns here
 * (handled by Game).
 */
window.PAM = window.PAM || {};
PAM.MainMenu = class MainMenu {
  constructor(onActivate) {
    this.onActivate = onActivate;
    this.items = [...document.querySelectorAll('#mainMenu .km-item')];
    this.index = 0;
    this.confirming = false;
    this.items.forEach((item, i) => {
      item.addEventListener('mouseenter', () => this.select(i));
      // clicks go through the same confirm path as Enter (sound + flash, then the action)
      item.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.select(i, true); this.activate(); }, true);
      item.addEventListener('focus', () => this.select(i, true));
      for (const c of item.querySelectorAll('canvas.km-plate')) this.paint(c, c.classList.contains('gold'), item.classList.contains('km-play'), i * 7 + 3);
    });
    this.sparks();
    this.select(0, true);
  }

  select(i, silent) {
    i = (i + this.items.length) % this.items.length;
    if (i !== this.index && !silent) PAM.AudioManager.resume().then(() => PAM.AudioManager.sfx.menuMove(i));
    this.index = i;
    this.items.forEach((el, k) => el.classList.toggle('selected', k === i));
  }

  move(d) { this.select(this.index + d); }
  /** Confirm: stronger sound + a gold flash on the plate, then run the item's action. */
  activate() {
    if (this.confirming) return;
    const item = this.items[this.index];
    this.confirming = true;
    PAM.AudioManager.resume().then(() => PAM.AudioManager.sfx.menuConfirm());
    item.classList.remove('confirmed'); void item.offsetWidth; item.classList.add('confirmed');
    // fullscreen must run inside the user gesture; the others wait for the flash to land
    const act = item.dataset.action;
    const run = () => { this.confirming = false; item.classList.remove('confirmed'); if (this.onActivate) this.onActivate(act); };
    if (act === 'fullscreen') { run(); item.classList.add('confirmed'); setTimeout(() => item.classList.remove('confirmed'), 450); }
    else setTimeout(run, 230);
  }

  /** Paint one brush-stroke plate. Deterministic per seed so the menu looks the same every visit. */
  paint(canvas, gold, big, seed) {
    const r = (() => { let a = seed * 9973 >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
    const W = canvas.parentElement.offsetWidth || 700, H = canvas.parentElement.offsetHeight || 120;
    const k = 1.5;
    canvas.width = W * k; canvas.height = H * k;
    const g = canvas.getContext('2d');
    g.scale(k, k);
    const padX = big ? 70 : 26, top = H * 0.12, bot = H * 0.88;

    // body: many overlapping horizontal brush strokes with ragged ends (dry-brush look)
    const strokes = 34;
    for (let s = 0; s < strokes; s++) {
      const y = top + (bot - top) * (s / (strokes - 1));
      const th = (bot - top) / strokes * 2.4;
      const x0 = padX + r() * 24 - (s % 5 === 0 ? 18 : 0), x1 = W - padX - r() * 24 + (s % 7 === 0 ? 20 : 0);
      const grad = g.createLinearGradient(0, top, 0, bot);
      if (gold) { grad.addColorStop(0, '#fff0a6'); grad.addColorStop(0.35, '#f6c443'); grad.addColorStop(0.8, '#d9971f'); grad.addColorStop(1, '#a8670f'); }
      else { grad.addColorStop(0, '#16131c'); grad.addColorStop(1, '#050408'); }
      g.fillStyle = grad;
      g.globalAlpha = gold ? 0.55 + r() * 0.45 : 0.6 + r() * 0.4;
      g.beginPath();
      g.moveTo(x0, y - th / 2);
      for (let x = x0; x <= x1; x += 24) g.lineTo(x, y - th / 2 + (r() - 0.5) * 3);
      g.lineTo(x1 + r() * 10, y);
      for (let x = x1; x >= x0; x -= 24) g.lineTo(x, y + th / 2 + (r() - 0.5) * 3);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    // bristle streaks trailing off both ends
    for (let s = 0; s < 26; s++) {
      const y = top + r() * (bot - top), left = r() < 0.5;
      const len = 20 + r() * (big ? 90 : 50), x = left ? padX + 8 : W - padX - 8;
      g.strokeStyle = gold ? `rgba(240,185,60,${0.25 + r() * 0.5})` : `rgba(10,8,14,${0.4 + r() * 0.5})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(left ? x - len : x + len, y + (r() - 0.5) * 6); g.stroke();
    }
    // texture: grain specks
    for (let s = 0; s < 260; s++) {
      g.fillStyle = gold ? `rgba(120,70,10,${r() * 0.25})` : `rgba(160,140,100,${r() * 0.06})`;
      g.fillRect(padX + r() * (W - padX * 2), top + r() * (bot - top), 1 + r() * 3, 1 + r() * 2);
    }
    // gold dry-brush rims on the dark plates
    if (!gold) {
      for (const yy of [top + 2, bot - 2]) {
        for (let s = 0; s < 3; s++) {
          g.strokeStyle = `rgba(226,176,72,${0.35 + r() * 0.4})`; g.lineWidth = 1 + r() * 2;
          g.beginPath();
          const a = padX + r() * 60, b = W - padX - r() * 60;
          g.moveTo(a, yy + (r() - 0.5) * 3);
          for (let x = a; x < b; x += 30) g.lineTo(x, yy + (r() - 0.5) * 3);
          g.stroke();
        }
      }
    }
    // Thai-style gold curl ornaments at the ends of the PLAY plate
    if (big) {
      g.strokeStyle = gold ? '#ffe7a0' : '#d7a64a'; g.lineWidth = 3; g.lineCap = 'round';
      for (const side of [-1, 1]) {
        const cx = side < 0 ? padX - 30 : W - padX + 30, cy = H / 2;
        g.save(); g.translate(cx, cy); g.scale(side, 1);
        g.beginPath(); g.moveTo(34, 0); g.bezierCurveTo(10, -26, -22, -18, -18, 2); g.bezierCurveTo(-14, 18, 6, 14, 4, 2); g.stroke();
        g.beginPath(); g.moveTo(34, 0); g.bezierCurveTo(14, 24, -10, 26, -30, 10); g.stroke();
        g.beginPath(); g.moveTo(40, -6); g.lineTo(60, 0); g.lineTo(40, 6); g.stroke();
        g.restore();
      }
    }
  }

  /** A few drifting embers / magic sparks over the key art (pure CSS animation). */
  sparks() {
    const box = document.getElementById('kmSparks');
    if (!box || box.childElementCount) return;
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('i');
      s.style.left = (Math.random() * 100) + '%';
      s.style.animationDelay = (-Math.random() * 14) + 's';
      s.style.animationDuration = (9 + Math.random() * 9) + 's';
      s.style.setProperty('--drift', ((Math.random() - 0.5) * 160) + 'px');
      if (i % 3 === 0) s.className = 'blue';
      box.appendChild(s);
    }
  }
};
