/*
 * MainMenu — the full-screen key-art title menu (PLAY / OPTIONS / FULLSCREEN).
 *
 * The three menu plates are painted at runtime on canvases (see paint): an ornate gold PLAY button
 * and black-navy OPTIONS / FULLSCREEN buttons with gold borders. Each item keeps a normal and a
 * "lit" (selected) version that are cross-faded, so the selection glides smoothly between items.
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

  /**
   * Paint one ornate menu plate (deterministic, so the menu looks identical on every visit).
   *  - PLAY: metallic gold plate with an illuminated double border and Thai kranok (flame) ornaments
   *    with blue gems on both sides; `lit` = the brighter selected version
   *  - OPTIONS / FULLSCREEN: black-navy plate with an ornate gold metallic border and small gold
   *    flame finials at the pointed ends; `lit` adds a warm inner glow and a brighter border
   */
  paint(canvas, lit, big, seed) {
    let a = seed * 9973 >>> 0;
    const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const W = canvas.parentElement.offsetWidth || 700, H = canvas.parentElement.offsetHeight || 120;
    const k = 2;
    canvas.width = W * k; canvas.height = H * k;
    const g = canvas.getContext('2d');
    g.scale(k, k);
    const m = big ? 124 : 56;                       // room left for the side ornaments
    const top = H * (big ? 0.14 : 0.12), bot = H * (big ? 0.86 : 0.88), mid = H / 2;
    const p = (bot - top) * (big ? 0.32 : 0.42);   // depth of the pointed ends
    const shape = inset => {
      g.beginPath();
      g.moveTo(m + p + inset * 0.6, top + inset); g.lineTo(W - m - p - inset * 0.6, top + inset);
      g.lineTo(W - m - inset, mid); g.lineTo(W - m - p - inset * 0.6, bot - inset);
      g.lineTo(m + p + inset * 0.6, bot - inset); g.lineTo(m + inset, mid); g.closePath();
    };
    const goldGrad = (y0, y1, bright) => {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, bright ? '#ffe98a' : '#ffdf74'); gr.addColorStop(0.2, '#f6b324'); gr.addColorStop(0.46, '#d27806');
      gr.addColorStop(0.55, bright ? '#f8b52a' : '#eea21f'); gr.addColorStop(0.8, '#9a4a04'); gr.addColorStop(1, '#4c2103');
      return gr;
    };

    if (big) {
      // ---- gold plate
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
      shape(0); g.fillStyle = goldGrad(top, bot, lit); g.fill();
      g.restore();
      // brushed-metal streaks and fine grain
      g.save(); shape(0); g.clip();
      for (let i = 0; i < 70; i++) {
        const y = top + r() * (bot - top), x = m + r() * (W - 2 * m), len = 40 + r() * 160;
        g.strokeStyle = r() < 0.35 ? `rgba(255,236,170,${0.03 + r() * 0.07})` : `rgba(100,45,5,${0.05 + r() * 0.1})`;
        g.lineWidth = 0.6 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 2); g.stroke();
      }
      const shine = g.createRadialGradient(W / 2, top + (bot - top) * 0.35, 10, W / 2, top + (bot - top) * 0.35, W * 0.45);
      shine.addColorStop(0, `rgba(255,236,160,${lit ? 0.2 : 0.1})`); shine.addColorStop(1, 'rgba(255,255,235,0)');
      g.fillStyle = shine; g.fillRect(0, 0, W, H);
      g.restore();
      // illuminated double border
      shape(0); g.lineWidth = 6; g.strokeStyle = '#4a2606'; g.stroke();
      shape(3); g.lineWidth = 2.6; g.strokeStyle = lit ? '#fff6c8' : '#ffe9a3'; g.stroke();
      shape(9); g.lineWidth = 1.2; g.strokeStyle = 'rgba(90,45,5,0.65)'; g.stroke();
      // side ornaments
      this.kranok(g, m + 8, mid, 1, (bot - top) / 82, goldGrad, lit);
      this.kranok(g, W - m - 8, mid, -1, (bot - top) / 82, goldGrad, lit);
    } else {
      // ---- black-navy plate with an ornate gold border
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 12; g.shadowOffsetY = 5;
      shape(0);
      const dg = g.createLinearGradient(0, top, 0, bot);
      dg.addColorStop(0, '#1a2140'); dg.addColorStop(0.45, '#0a0d1c'); dg.addColorStop(1, '#05060d');
      g.fillStyle = dg; g.fill();
      g.restore();
      if (lit) {
        g.save(); shape(0); g.clip();
        const glow = g.createRadialGradient(W / 2, mid, 10, W / 2, mid, W * 0.42);
        glow.addColorStop(0, 'rgba(255,200,90,0.28)'); glow.addColorStop(1, 'rgba(255,200,90,0)');
        g.fillStyle = glow; g.fillRect(0, 0, W, H);
        g.restore();
      }
      const border = g.createLinearGradient(m, 0, W - m, 0);
      border.addColorStop(0, '#8a5a1a'); border.addColorStop(0.25, lit ? '#fff1b5' : '#f2d27a'); border.addColorStop(0.5, '#a8701e');
      border.addColorStop(0.75, lit ? '#fff1b5' : '#f2d27a'); border.addColorStop(1, '#8a5a1a');
      shape(0); g.lineWidth = 5; g.strokeStyle = '#2a1704'; g.stroke();
      shape(2.5); g.lineWidth = 2.8; g.strokeStyle = border; g.stroke();
      shape(7); g.lineWidth = 1; g.strokeStyle = lit ? 'rgba(255,225,150,0.75)' : 'rgba(226,180,92,0.5)'; g.stroke();
      // small diamond studs top and bottom centre
      for (const y of [top + 2.5, bot - 2.5]) {
        g.save(); g.translate(W / 2, y); g.rotate(Math.PI / 4);
        g.fillStyle = lit ? '#fff1b5' : '#e9c46a'; g.fillRect(-4, -4, 8, 8); g.restore();
      }
      // flame finials at the pointed ends
      this.kranok(g, m + 3, mid, 1, (bot - top) / 128, goldGrad, lit);
      this.kranok(g, W - m - 3, mid, -1, (bot - top) / 128, goldGrad, lit);
    }
  }

  /**
   * Thai kranok flame ornament anchored at (x, y), pointing outward (dir = 1 points left,
   * -1 points right), with curled side flames and a blue gem at its base.
   */
  kranok(g, x, y, dir, s, goldGrad, lit) {
    g.save();
    g.translate(x, y); g.scale(-dir * s, s);   // local +x points outward
    const flame = (len, wid, curl) => {
      g.beginPath();
      g.moveTo(0, -wid);
      g.bezierCurveTo(len * 0.35, -wid * 1.25, len * 0.7, -wid * 0.6, len, -curl);
      g.bezierCurveTo(len * 0.86, wid * 0.05, len * 0.62, wid * 0.35, len * 0.48, wid * 0.2);
      g.bezierCurveTo(len * 0.6, wid * 0.7, len * 0.3, wid * 1.15, 0, wid);
      g.closePath();
    };
    const fill = () => { g.fillStyle = goldGrad(-40, 40, lit); g.fill(); g.lineWidth = 2.2; g.strokeStyle = '#3d1f04'; g.stroke(); };
    // upper and lower side flames
    g.save(); g.rotate(-0.55); flame(58, 11, 10); fill(); g.restore();
    g.save(); g.rotate(0.55); g.scale(1, -1); flame(58, 11, 10); fill(); g.restore();
    // outer small flames and scroll curls near the base
    g.save(); g.rotate(-1.05); flame(36, 7, 6); fill(); g.restore();
    g.save(); g.rotate(1.05); g.scale(1, -1); flame(36, 7, 6); fill(); g.restore();
    g.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      g.beginPath(); g.moveTo(4, sgn * 16); g.bezierCurveTo(-10, sgn * 30, -26, sgn * 14, -14, sgn * 4); g.bezierCurveTo(-8, -sgn * 2, -2, sgn * 6, -8, sgn * 10);
      g.strokeStyle = '#3d1f04'; g.lineWidth = 5; g.stroke(); g.strokeStyle = lit ? '#ffe9a8' : '#f5c95a'; g.lineWidth = 2.6; g.stroke();
    }
    // main flame
    flame(92, 22, 14); fill();
    // inner curl line
    g.beginPath(); g.moveTo(12, -6); g.bezierCurveTo(34, -14, 54, -8, 66, -6); g.strokeStyle = 'rgba(255,245,200,0.8)'; g.lineWidth = 1.6; g.stroke();
    // gem
    g.beginPath(); g.arc(10, 0, 9, 0, Math.PI * 2); g.fillStyle = goldGrad(-10, 10, lit); g.fill(); g.strokeStyle = '#3d1f04'; g.lineWidth = 1.6; g.stroke();
    const gem = g.createRadialGradient(8, -2, 1, 10, 0, 6);
    gem.addColorStop(0, '#d8f0ff'); gem.addColorStop(0.4, '#3d8bff'); gem.addColorStop(1, '#0b2a7a');
    g.beginPath(); g.arc(10, 0, 5.5, 0, Math.PI * 2); g.fillStyle = gem; g.fill();
    g.restore();
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
