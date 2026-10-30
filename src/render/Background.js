/*
 * Background — the moonlit Thai fantasy seascape, painted procedurally in layers.
 * Static layers (sky, moon, far islands with temples, shore rocks) are cached in offscreen
 * canvases at the current pixel scale; animated layers (stars, clouds, sea shimmer, waves,
 * boats, fog) are drawn every frame.
 *
 * To use painted artwork instead, put images in assets/backgrounds/ and set
 * PAM.Background.images = { sky, islands, foreground } before the game starts — each image
 * replaces the matching procedural layer (1920x1080, transparent where needed).
 */
window.PAM = window.PAM || {};
PAM.Background = class Background {
  constructor() {
    this.W = PAM.Config.WIDTH; this.H = PAM.Config.HEIGHT;
    this.HORIZON = 585;
    this.SHORE = 800;
    this.scale = 1;
    this.layers = {};
    this.images = PAM.Background.images || {};
    this.stars = Array.from({ length: 140 }, (_, i) => ({
      x: (i * 733 % 1920), y: (i * 389 % 520) * (0.3 + 0.7 * ((i * 17 % 10) / 10)), r: 0.6 + (i % 5) * 0.35, p: i * 1.7
    }));
    this.clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 380 - 200, y: 120 + (i * 53 % 160), w: 380 + (i * 97 % 220), s: 4 + i % 3 * 3 }));
    this.boats = [{ x: 760, y: 640, s: 0.8, sp: 3 }, { x: 1270, y: 612, s: 0.55, sp: -2 }];
  }

  resize(scale) {
    this.scale = scale;
    const mk = (fn) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(this.W * scale); c.height = Math.ceil(this.H * scale);
      const g = c.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0); fn.call(this, g); return c;
    };
    this.layers.sky = mk(this.paintSky);
    this.layers.islands = mk(this.paintIslands);
    this.layers.shore = mk(this.paintShore);
    this.layers.front = mk(this.paintFrontRocks);
  }

  // ---------------------------------------------------------------- static layers
  paintSky(g) {
    if (this.images.sky) { g.drawImage(this.images.sky, 0, 0, this.W, this.H); return; }
    const sky = g.createLinearGradient(0, 0, 0, this.HORIZON);
    sky.addColorStop(0, '#03071a'); sky.addColorStop(0.45, '#0c1640'); sky.addColorStop(0.8, '#2a2a63'); sky.addColorStop(1, '#4a3a72');
    g.fillStyle = sky; g.fillRect(0, 0, this.W, this.HORIZON + 2);
    // moon halo
    const mx = 1030, my = 210;
    let halo = g.createRadialGradient(mx, my, 60, mx, my, 520);
    halo.addColorStop(0, 'rgba(210,220,255,0.35)'); halo.addColorStop(0.3, 'rgba(140,150,230,0.12)'); halo.addColorStop(1, 'rgba(60,60,140,0)');
    g.fillStyle = halo; g.fillRect(0, 0, this.W, this.HORIZON);
    // moon disc with soft maria
    const disc = g.createRadialGradient(mx - 20, my - 20, 10, mx, my, 86);
    disc.addColorStop(0, '#fbf6e6'); disc.addColorStop(0.75, '#e6e0cc'); disc.addColorStop(1, '#bdb8a8');
    g.save(); g.shadowColor = 'rgba(230,235,255,0.9)'; g.shadowBlur = 60;
    g.fillStyle = disc; g.beginPath(); g.arc(mx, my, 84, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = 'rgba(150,150,140,0.22)';
    [[-24, -18, 22], [18, 10, 16], [-6, 30, 12], [30, -26, 10], [-34, 16, 9]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, Math.PI * 2); g.fill(); });
  }

  paintIslands(g) {
    if (this.images.islands) { g.drawImage(this.images.islands, 0, 0, this.W, this.H); return; }
    const H = this.HORIZON;
    // farthest hazy island range
    g.fillStyle = '#1b2350';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= this.W; x += 40) g.lineTo(x, H - 30 - Math.sin(x * 0.006) * 22 - Math.sin(x * 0.017) * 10);
    g.lineTo(this.W, H); g.fill();

    // left island with a small shrine
    g.fillStyle = '#121a3d';
    g.beginPath(); g.moveTo(-20, H + 4); g.quadraticCurveTo(120, H - 120, 300, H - 90); g.quadraticCurveTo(420, H - 60, 520, H + 4); g.fill();
    this.chedi(g, 190, H - 108, 34, 120, '#121a3d');
    this.hall(g, 290, H - 84, 90, 46, '#121a3d');
    this.trees(g, 20, H - 70, 160, '#0e1533');

    // right cliff with the giantess's palace (like the concept art)
    g.fillStyle = '#0d1433';
    g.beginPath(); g.moveTo(1260, H + 4);
    g.lineTo(1320, H - 70); g.lineTo(1380, H - 120); g.lineTo(1460, H - 150); g.lineTo(1540, H - 190); g.lineTo(1650, H - 200);
    g.lineTo(1760, H - 170); g.lineTo(1860, H - 150); g.lineTo(1940, H - 140); g.lineTo(1940, H + 4); g.fill();
    this.prang(g, 1600, H - 196, 70, 250, '#0d1433');
    this.prang(g, 1500, H - 170, 46, 170, '#0d1433');
    this.prang(g, 1700, H - 186, 46, 170, '#0d1433');
    this.hall(g, 1420, H - 140, 120, 60, '#0d1433');
    this.hall(g, 1790, H - 162, 130, 66, '#0d1433');
    this.chedi(g, 1880, H - 150, 30, 110, '#0d1433');
    // rim light from the moon on the palace
    g.strokeStyle = 'rgba(150,160,230,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(1380, H - 120); g.lineTo(1460, H - 150); g.lineTo(1540, H - 190); g.stroke();
    // warm windows
    g.fillStyle = 'rgba(255,190,100,0.75)';
    [[1590, H - 230], [1610, H - 230], [1430, H - 120], [1450, H - 120], [1800, H - 138], [1830, H - 138], [1700, H - 210], [300, H - 70]].forEach(([x, y]) => g.fillRect(x, y, 5, 8));
    // mid-distance central islet with a hall
    g.fillStyle = '#16204a';
    g.beginPath(); g.moveTo(560, H + 2); g.quadraticCurveTo(640, H - 40, 720, H - 36); g.quadraticCurveTo(800, H - 30, 860, H + 2); g.fill();
    this.hall(g, 700, H - 36, 70, 34, '#16204a');
  }

  paintShore(g) {
    if (this.images.foreground) return;
    const S = this.SHORE;
    // wet sand / shallow beach band
    const sand = g.createLinearGradient(0, S - 20, 0, this.H);
    sand.addColorStop(0, '#1b2440'); sand.addColorStop(0.3, '#151b30'); sand.addColorStop(1, '#0b0f1c');
    g.fillStyle = sand;
    g.beginPath(); g.moveTo(0, S - 6);
    for (let x = 0; x <= this.W; x += 30) g.lineTo(x, S - 8 + Math.sin(x * 0.01) * 6);
    g.lineTo(this.W, this.H); g.lineTo(0, this.H); g.fill();
    // moonlit wet sheen
    const sheen = g.createRadialGradient(1030, S + 30, 10, 1030, S + 30, 700);
    sheen.addColorStop(0, 'rgba(160,180,255,0.18)'); sheen.addColorStop(1, 'rgba(160,180,255,0)');
    g.fillStyle = sheen; g.fillRect(0, S - 20, this.W, 300);
    // prince's rock (left)
    this.rock(g, 330, S + 2, 190, 70, '#20263c', '#2f3854');
    this.rock(g, 200, S + 30, 120, 50, '#171c2e', '#262d45');
    // scattered pebbles
    g.fillStyle = '#10142a';
    for (let i = 0; i < 30; i++) { const x = (i * 211) % 1920, y = S + 40 + (i * 37 % 200); g.beginPath(); g.ellipse(x, y, 6 + i % 4 * 3, 3 + i % 3, 0, 0, Math.PI * 2); g.fill(); }
  }

  paintFrontRocks(g) {
    if (this.images.foreground) { g.drawImage(this.images.foreground, 0, 0, this.W, this.H); return; }
    // dark framing rocks and foliage in the bottom corners, in front of the characters
    g.fillStyle = '#05070f';
    g.beginPath(); g.moveTo(0, 820); g.quadraticCurveTo(70, 780, 120, 840); g.quadraticCurveTo(150, 900, 90, 1080); g.lineTo(0, 1080); g.fill();
    g.beginPath(); g.moveTo(1920, 790); g.quadraticCurveTo(1830, 800, 1810, 880); g.quadraticCurveTo(1800, 960, 1850, 1080); g.lineTo(1920, 1080); g.fill();
    // palm fronds top-left
    g.strokeStyle = '#04060d'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -0.3 + i * 0.28;
      g.lineWidth = 7 - i * 0.5;
      g.beginPath(); g.moveTo(-10, 40); g.quadraticCurveTo(80 * Math.cos(a) + 30, 40 + 80 * Math.sin(a) - 20, 220 * Math.cos(a), 40 + 220 * Math.sin(a)); g.stroke();
      for (let k = 1; k < 9; k++) {
        const bx = 220 * Math.cos(a) * k / 9, by = 40 + 220 * Math.sin(a) * k / 9;
        g.lineWidth = 3; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 14, by + 34 - k * 2); g.stroke();
      }
    }
  }

  // ---------------------------------------------------------------- silhouettes
  prang(g, x, base, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x - w * 0.7, base - h * 0.12, w * 1.4, h * 0.12);   // base platform
    for (let i = 0; i < 7; i++) {
      const tw = w * (1 - i * 0.12), y = base - h * 0.12 - i * h * 0.1;
      g.beginPath(); g.moveTo(x - tw / 2, y); g.quadraticCurveTo(x - tw / 2 - 4, y - h * 0.06, x - tw * 0.42, y - h * 0.1);
      g.lineTo(x + tw * 0.42, y - h * 0.1); g.quadraticCurveTo(x + tw / 2 + 4, y - h * 0.06, x + tw / 2, y); g.fill();
    }
    g.beginPath(); g.moveTo(x - w * 0.08, base - h * 0.82); g.lineTo(x, base - h); g.lineTo(x + w * 0.08, base - h * 0.82); g.fill();
  }
  chedi(g, x, base, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x - w, base - h * 0.08, w * 2, h * 0.08);
    g.beginPath(); g.moveTo(x - w * 0.85, base - h * 0.08); g.quadraticCurveTo(x - w * 0.9, base - h * 0.5, x, base - h * 0.52);
    g.quadraticCurveTo(x + w * 0.9, base - h * 0.5, x + w * 0.85, base - h * 0.08); g.fill();
    for (let i = 0; i < 6; i++) { const rw = w * 0.32 * (1 - i * 0.13); g.fillRect(x - rw, base - h * (0.55 + i * 0.06), rw * 2, h * 0.045); }
    g.beginPath(); g.moveTo(x - 3, base - h * 0.9); g.lineTo(x, base - h); g.lineTo(x + 3, base - h * 0.9); g.fill();
  }
  hall(g, x, base, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x - w / 2 + 6, base - h * 0.45, w - 12, h * 0.45);
    for (let i = 0; i < 3; i++) {
      const rw = w * (1 - i * 0.22), y = base - h * 0.4 - i * h * 0.2;
      g.beginPath(); g.moveTo(x - rw / 2, y); g.lineTo(x - rw * 0.2, y - h * 0.32); g.lineTo(x + rw * 0.2, y - h * 0.32); g.lineTo(x + rw / 2, y); g.fill();
      // chofa finials
      g.beginPath(); g.moveTo(x - rw * 0.2, y - h * 0.3); g.quadraticCurveTo(x - rw * 0.26, y - h * 0.5, x - rw * 0.18, y - h * 0.5); g.lineTo(x - rw * 0.18, y - h * 0.32); g.fill();
      g.beginPath(); g.moveTo(x + rw * 0.2, y - h * 0.3); g.quadraticCurveTo(x + rw * 0.26, y - h * 0.5, x + rw * 0.18, y - h * 0.5); g.lineTo(x + rw * 0.18, y - h * 0.32); g.fill();
    }
  }
  trees(g, x, base, w, color) {
    g.fillStyle = color;
    for (let i = 0; i < 8; i++) { const tx = x + i * w / 8; g.beginPath(); g.ellipse(tx, base - 10 - (i % 3) * 8, 18, 22, 0, 0, Math.PI * 2); g.fill(); }
  }
  rock(g, x, base, w, h, dark, light) {
    const rg = g.createLinearGradient(x - w / 2, base - h, x + w / 2, base);
    rg.addColorStop(0, light); rg.addColorStop(1, dark);
    g.fillStyle = rg;
    g.beginPath(); g.moveTo(x - w / 2, base + 10);
    g.quadraticCurveTo(x - w * 0.48, base - h * 0.7, x - w * 0.2, base - h);
    g.quadraticCurveTo(x + w * 0.1, base - h * 1.08, x + w * 0.36, base - h * 0.8);
    g.quadraticCurveTo(x + w * 0.55, base - h * 0.3, x + w / 2, base + 10); g.fill();
    g.strokeStyle = 'rgba(170,185,240,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - w * 0.2, base - h); g.quadraticCurveTo(x + w * 0.1, base - h * 1.08, x + w * 0.36, base - h * 0.8); g.stroke();
  }

  // ---------------------------------------------------------------- per frame
  /** tension: 0..1 overall danger, intensity: 0..1 music section energy. */
  draw(ctx, t, tension, intensity) {
    ctx.drawImage(this.layers.sky, 0, 0, this.W, this.H);
    // stars
    for (const s of this.stars) {
      const a = 0.35 + 0.35 * Math.sin(t * 1.3 + s.p);
      ctx.fillStyle = `rgba(220,230,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    // clouds drifting across the moon
    for (const c of this.clouds) {
      const x = ((c.x + t * c.s) % 2400) - 300;
      const cg = ctx.createRadialGradient(x, c.y, 10, x, c.y, c.w / 2);
      cg.addColorStop(0, 'rgba(120,120,190,0.16)'); cg.addColorStop(1, 'rgba(60,60,120,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(x, c.y, c.w / 2, c.w / 9, 0, 0, Math.PI * 2); ctx.fill();
    }
    // blood-moon tint as danger grows
    if (tension > 0.4) {
      ctx.fillStyle = `rgba(160,20,50,${(tension - 0.4) * 0.35})`;
      ctx.beginPath(); ctx.arc(1030, 210, 90, 0, Math.PI * 2); ctx.fill();
    }

    this.drawSea(ctx, t, intensity);
    ctx.drawImage(this.layers.islands, 0, 0, this.W, this.H);
    this.drawBoats(ctx, t);
    this.drawFog(ctx, t, 0.5 + tension * 0.5);
    ctx.drawImage(this.layers.shore, 0, 0, this.W, this.H);
    this.drawShoreFoam(ctx, t);
  }

  drawSea(ctx, t, intensity) {
    const H = this.HORIZON, S = this.SHORE;
    const sea = ctx.createLinearGradient(0, H, 0, S);
    sea.addColorStop(0, '#2a3470'); sea.addColorStop(0.25, '#16245a'); sea.addColorStop(1, '#071330');
    ctx.fillStyle = sea; ctx.fillRect(0, H, this.W, S - H + 10);
    // moon reflection column — shimmering strokes that widen toward the viewer
    for (let i = 0; i < 46; i++) {
      const k = i / 46, y = H + 4 + k * (S - H - 10);
      const w = 30 + k * 220;
      const off = Math.sin(t * 1.7 + i * 1.3) * (8 + k * 30);
      const a = (0.55 - k * 0.35) * (0.6 + 0.4 * Math.sin(t * 3 + i * 2.1));
      ctx.fillStyle = `rgba(235,235,255,${Math.max(0, a)})`;
      ctx.fillRect(1030 - w / 2 + off, y, w * (0.3 + 0.7 * Math.abs(Math.sin(i * 7.3 + t * 0.8))), 1.5 + k * 2.5);
    }
    // wave lines
    ctx.lineWidth = 1.5;
    for (let j = 0; j < 12; j++) {
      const k = j / 12, y0 = H + 14 + k * k * (S - H - 20);
      ctx.strokeStyle = `rgba(120,170,240,${0.06 + k * 0.1 + intensity * 0.05})`;
      ctx.beginPath();
      for (let x = 0; x <= this.W; x += 24) {
        const y = y0 + Math.sin(x * (0.012 - k * 0.006) + t * (0.8 + k) + j) * (1.5 + k * 4);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  drawBoats(ctx, t) {
    for (const b of this.boats) {
      const x = ((b.x + t * b.sp) % 2100 + 2100) % 2100 - 90, y = b.y + Math.sin(t * 1.2 + b.x) * 2;
      ctx.save(); ctx.translate(x, y); ctx.scale(b.s, b.s); ctx.rotate(Math.sin(t * 1.1 + b.x) * 0.03);
      ctx.fillStyle = '#0a0f26';
      ctx.beginPath(); ctx.moveTo(-60, -6); ctx.quadraticCurveTo(0, 12, 60, -6); ctx.lineTo(48, 4); ctx.quadraticCurveTo(0, 16, -48, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-60, -6); ctx.quadraticCurveTo(-70, -20, -62, -26); ctx.lineTo(-56, -8); ctx.fill();
      ctx.fillRect(-14, -26, 8, 22); ctx.beginPath(); ctx.arc(-10, -30, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  drawFog(ctx, t, amount) {
    for (let i = 0; i < 4; i++) {
      const y = this.HORIZON - 30 + i * 60, x = ((t * (10 + i * 6) + i * 500) % 2600) - 600;
      const fg = ctx.createRadialGradient(x, y, 20, x, y, 700);
      fg.addColorStop(0, `rgba(150,160,220,${0.10 * amount})`); fg.addColorStop(1, 'rgba(150,160,220,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(x, y, 700, 70, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawShoreFoam(ctx, t) {
    const S = this.SHORE;
    ctx.strokeStyle = 'rgba(200,220,255,0.28)'; ctx.lineWidth = 2;
    for (let j = 0; j < 2; j++) {
      const surge = Math.sin(t * 0.7 + j * 2) * 6;
      ctx.beginPath();
      for (let x = 0; x <= this.W; x += 20) {
        const y = S - 10 + j * 8 + surge + Math.sin(x * 0.02 + t * 1.5 + j) * 2;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  drawFront(ctx) { ctx.drawImage(this.layers.front, 0, 0, this.W, this.H); }
};
