/*
 * MenuScene — animated light layers drawn OVER the supplied title artwork (assets/menu/menu_bg.webp).
 *
 * The artwork itself is never moved, warped or redrawn: the characters, their faces and hands stay
 * exactly as painted. Every effect is a separate translucent layer confined to its own region:
 *   sky      drifting cloud wisps (kept clear of both characters) + a slow moon-light pulse
 *   sea      moving moon-reflection glints, rolling wave highlights, foam spray at the rocks
 *   music    a flowing blue light trail from Phra Aphai Mani's flute toward Phi Suea Samut, with
 *            notes and sparks travelling along it; its brightness follows the menu music level
 *
 * Coordinates below are measured on the 1672 x 941 artwork and converted to the 1920 x 1080 stage.
 * The layer only animates while the menu background is visible.
 */
window.PAM = window.PAM || {};
PAM.MenuScene = class MenuScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.k = 1;
    this.t = 0; this.last = performance.now();
    this.level = 0;
    this.S = 1920 / 1672;
    const P = (x, y) => ({ x: x * this.S, y: y * this.S });
    this.P = P;
    this.moon = P(305, 148);
    // light trail from the flute tip through the painted notes toward the giantess's hand
    this.path = [P(548, 440), P(600, 398), P(680, 382), P(768, 404), P(858, 352), P(948, 318), P(1030, 326), P(1085, 352)];
    this.sea = { x0: 585 * this.S, x1: 1435 * this.S, y0: 752 * this.S, y1: 941 * this.S };
    this.foamZones = [{ x: 1010, w: 300, y: 845 }, { x: 565, w: 70, y: 885 }].map(z => ({ x: z.x * this.S, w: z.w * this.S, y: z.y * this.S }));
    this.particles = [];
    this.notes = Array.from({ length: 5 }, (_, i) => ({ u: i / 5, glyph: '♪♫♬♩♪'[i], size: 34 + (i % 3) * 7 }));
    this.clouds = Array.from({ length: 6 }, (_, i) => ({ x: (i * 397) % 1900 - 300, y: 40 + (i * 61) % 300, s: 6 + (i % 3) * 4, sprite: this.cloudSprite(i) }));
    this.running = false;
    this.frame = this.frame.bind(this);
  }

  resize(k) {
    this.k = k;
    this.canvas.width = Math.round(1920 * k); this.canvas.height = Math.round(1080 * k);
  }

  start() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.frame); } }
  stop() { this.running = false; }

  cloudSprite(seed) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 200;
    const g = c.getContext('2d');
    let a = seed * 7919 + 13; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const x = 80 + r() * 480, y = 70 + r() * 70, rad = 40 + r() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(120,140,215,0.20)'); grd.addColorStop(1, 'rgba(70,90,170,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  /** Half-resolution cloud layer + its soft mask (open sky between the moon and the giantess). */
  makeCloudLayer() {
    const layer = document.createElement('canvas'); layer.width = 960; layer.height = 540;
    const m = document.createElement('canvas'); m.width = 960; m.height = 540;
    const g = m.getContext('2d');
    // ellipse centred on stage (900, 190), radii 430 x 190 (half resolution: 450, 95 / 215 x 95)
    const sy = 95 / 215;
    const grd = g.createRadialGradient(450, 95 / sy, 20, 450, 95 / sy, 215);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.8)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, sy); g.fillStyle = grd; g.fillRect(0, 0, 960, 540 / sy); g.restore();
    this.cloudMask = m;
    return layer;
  }

  /** Point and tangent on the light trail (Catmull-Rom through this.path), u in 0..1. */
  along(u) {
    const p = this.path, n = p.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), t = f - i;
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n, i + 2)];
    const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    return { x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) };
  }

  frame(now) {
    if (!this.running) return;
    const bg = document.getElementById('menuBg');
    if (bg && !bg.classList.contains('hidden')) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.t += dt;
      const target = PAM.AudioManager.menuLevel ? PAM.AudioManager.menuLevel() : 0;
      this.level += (target - this.level) * Math.min(1, dt * 6);
      this.update(dt); this.draw();
    }
    this.last = now;
    requestAnimationFrame(this.frame);
  }

  update(dt) {
    const energy = 0.5 + this.level;
    // sparks along the music trail
    if (Math.random() < dt * 22 * energy) {
      const u = Math.random(), p = this.along(u);
      this.particles.push({ kind: 'spark', x: p.x + (Math.random() - 0.5) * 18, y: p.y + (Math.random() - 0.5) * 18, vx: 10 + Math.random() * 25, vy: -10 - Math.random() * 25, life: 0.8 + Math.random() * 0.9, age: 0, r: 1 + Math.random() * 2.2 });
    }
    // foam spray where the waves meet the rocks
    for (const z of this.foamZones) {
      if (Math.random() < dt * 9) {
        this.particles.push({ kind: 'foam', x: z.x + Math.random() * z.w, y: z.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 70, life: 0.7 + Math.random() * 0.6, age: 0, r: 1 + Math.random() * 2.4 });
      }
    }
    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'foam') p.vy += 160 * dt; else { p.vx *= 0.98; p.vy *= 0.98; }
    }
    this.particles = this.particles.filter(p => p.age < p.life);
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
    for (const c of this.clouds) { c.x += c.s * dt; if (c.x > 1950) c.x = -700; }
    for (const n of this.notes) n.u = (n.u + dt * (0.07 + this.level * 0.05)) % 1;
  }

  draw() {
    const g = this.ctx, t = this.t;
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.clearRect(0, 0, 1920, 1080);

    // ---- sky: clouds drift only through the open sky between the characters, faded out at the
    // edges by a soft mask (no hard clip lines across the moon or the figures)
    const cl = this.cloudLayer || (this.cloudLayer = this.makeCloudLayer());
    const cg = cl.getContext('2d');
    cg.globalCompositeOperation = 'source-over'; cg.clearRect(0, 0, cl.width, cl.height);
    for (const c of this.clouds) cg.drawImage(c.sprite, c.x / 2, c.y / 2, 320, 100);
    cg.globalCompositeOperation = 'destination-in'; cg.drawImage(this.cloudMask, 0, 0);
    g.drawImage(cl, 0, 0, 1920, 1080);

    // ---- moonlight pulse
    g.save(); g.globalCompositeOperation = 'screen';
    const mp = 0.10 + 0.07 * Math.sin(t * 0.8);
    const mg = g.createRadialGradient(this.moon.x, this.moon.y, 150, this.moon.x, this.moon.y, 420);
    mg.addColorStop(0, `rgba(255,240,205,${mp})`); mg.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = mg; g.fillRect(0, 0, 900, 700);
    g.restore();

    // ---- sea: moon reflection glints + rolling wave highlights (clipped to open water)
    const s = this.sea;
    g.save(); g.beginPath(); g.rect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0); g.clip();
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 16; i++) {
      const k = i / 16, y = s.y0 + 8 + k * 70;
      const w = 30 + k * 110, cx = 838 + Math.sin(t * 1.3 + i * 1.7) * (8 + k * 26);
      const a = (0.22 - k * 0.1) * (0.55 + 0.45 * Math.sin(t * 2.6 + i * 2.3));
      g.fillStyle = `rgba(235,240,255,${Math.max(0, a)})`;
      g.fillRect(cx - w / 2, y, w * (0.35 + 0.65 * Math.abs(Math.sin(i * 3.1 + t * 0.7))), 1.6 + k * 2);
    }
    g.lineWidth = 1.6;
    for (let j = 0; j < 7; j++) {
      const k = j / 7, y0 = s.y0 + 30 + k * k * (s.y1 - s.y0 - 40);
      g.strokeStyle = `rgba(150,195,255,${0.05 + k * 0.07})`;
      g.beginPath();
      for (let x = s.x0; x <= s.x1; x += 22) {
        const y = y0 + Math.sin(x * (0.011 - k * 0.004) + t * (0.9 + k * 0.8) + j * 1.9) * (2 + k * 5);
        if (x === s.x0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();

    // ---- music energy: flowing light trail + travelling notes + sparks (brightness follows the music)
    const e = Math.min(1.6, 0.55 + this.level * 1.2);
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    const trail = () => { g.beginPath(); for (let i = 0; i <= 60; i++) { const p = this.along(i / 60); p.y += Math.sin(i * 0.35 + t * 2.4) * 4; if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); } };
    [[16, 0.05], [8, 0.10], [3, 0.30]].forEach(([w, a]) => {
      trail(); g.strokeStyle = `rgba(110,175,255,${a * e})`; g.lineWidth = w; g.setLineDash([60, 40]); g.lineDashOffset = -t * 90; g.stroke();
    });
    g.setLineDash([]);
    for (const n of this.notes) {
      const p = this.along(n.u), fade = Math.sin(Math.PI * n.u);
      g.save(); g.globalAlpha = Math.min(1, fade * 1.3) * Math.min(1, 0.45 + e * 0.5);
      g.translate(p.x, p.y - 26 + Math.sin(t * 3 + n.u * 9) * 6);
      g.shadowColor = '#7fc0ff'; g.shadowBlur = 18;
      g.fillStyle = '#cfe8ff'; g.font = `${n.size}px serif`; g.textAlign = 'center';
      g.fillText(n.glyph, 0, 0);
      g.restore();
    }
    for (const p of this.particles) {
      if (p.kind !== 'spark') continue;
      const a = (1 - p.age / p.life) * 0.9 * Math.min(1, e);
      g.fillStyle = `rgba(150,205,255,${a})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    // ---- foam
    for (const p of this.particles) {
      if (p.kind !== 'foam') continue;
      g.fillStyle = `rgba(225,238,255,${(1 - p.age / p.life) * 0.75})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }
};
