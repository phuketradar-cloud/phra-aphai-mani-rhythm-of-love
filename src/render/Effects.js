/*
 * Effects — lightweight particle system: magical music notes, hit bursts, rings, judgement
 * pop-ups, ambient motes, water splashes and bubbles. Everything is in design coordinates.
 */
window.PAM = window.PAM || {};
PAM.Effects = class Effects {
  constructor() {
    this.parts = [];
    this.motes = Array.from({ length: 46 }, (_, i) => ({
      x: Math.random() * 1920, y: 300 + Math.random() * 600, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 10,
      r: 1 + Math.random() * 2.2, p: Math.random() * 10, gold: i % 4 === 0
    }));
  }

  clear() { this.parts.length = 0; }

  add(p) { if (this.parts.length < 900) this.parts.push(Object.assign({ age: 0, life: 1 }, p)); }

  /** Magical notes travelling from the flute to the giantess along a curved path. */
  musicNotes(from, to, n, color) {
    const glyphs = ['♪', '♫', '♬', '♩'];
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'note', x0: from.x, y0: from.y, x1: to.x + (Math.random() - 0.5) * 60, y1: to.y + (Math.random() - 0.5) * 80,
        lift: 80 + Math.random() * 140, life: 1.3 + Math.random() * 0.6, delay: i * 0.08,
        g: glyphs[(Math.random() * 4) | 0], size: 26 + Math.random() * 14, color, wob: Math.random() * 6
      });
    }
  }

  burst(x, y, color, n = 16, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.3, color, r: 2 + Math.random() * 3 });
    }
  }

  ring(x, y, color, r0 = 20, r1 = 90, life = 0.4, width = 4) { this.add({ kind: 'ring', x, y, color, r0, r1, life, width }); }

  popup(text, x, y, color, size = 46, life = 0.6) { this.add({ kind: 'text', text, x, y, color, size, life }); }

  sparkle(x, y, color) {
    this.add({ kind: 'sparkle', x: x + (Math.random() - 0.5) * 220, y: y + (Math.random() - 0.5) * 300, life: 0.8 + Math.random() * 0.8, color, r: 2 + Math.random() * 3 });
  }

  splash(x, y, n = 60, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = (300 + Math.random() * 700) * power;
      this.add({ kind: 'drop', x: x + (Math.random() - 0.5) * 80, y, vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s, life: 0.9 + Math.random() * 0.8, r: 2 + Math.random() * 5 });
    }
    this.ring(x, y, 'rgba(200,230,255,0.8)', 30, 340, 1.0, 5);
  }

  footSplash(x, y, power) {
    for (let i = 0; i < 6 + power * 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, s = 120 + Math.random() * 220 * (0.5 + power);
      this.add({ kind: 'drop', x: x + (Math.random() - 0.5) * 30, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, r: 1.5 + Math.random() * 2.5 });
    }
  }

  bubble(x, y) { this.add({ kind: 'bubble', x, y, vy: -60 - Math.random() * 120, life: 1.5 + Math.random() * 2, r: 2 + Math.random() * 9, p: Math.random() * 6 }); }

  update(dt) {
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(m.p + m.y * 0.01) * 6) * dt; m.y += m.vy * dt; m.p += dt;
      if (m.y < 160 || m.x < -10 || m.x > 1930) { m.y = 820 + Math.random() * 80; m.x = Math.random() * 1920; }
    }
    for (const p of this.parts) {
      p.age += dt;
      if (p.kind === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
      if (p.kind === 'drop') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1500 * dt; }
      if (p.kind === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(p.age * 4 + p.p) * 20 * dt; }
      if (p.kind === 'text') p.y -= 40 * dt;
    }
    this.parts = this.parts.filter(p => p.age < p.life + (p.delay || 0));
  }

  drawAmbient(ctx, t, brightness) {
    for (const m of this.motes) {
      const a = (0.25 + 0.35 * Math.sin(t * 2 + m.p * 3)) * brightness;
      ctx.fillStyle = m.gold ? `rgba(255,214,140,${a})` : `rgba(130,230,255,${a})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  draw(ctx) {
    for (const p of this.parts) {
      const age = p.age - (p.delay || 0);
      if (age < 0) continue;
      const k = age / p.life, fade = 1 - k;
      if (p.kind === 'note') {
        const e = 1 - Math.pow(1 - k, 2);
        const x = p.x0 + (p.x1 - p.x0) * e + Math.sin(age * 5 + p.wob) * 10;
        const y = p.y0 + (p.y1 - p.y0) * e - Math.sin(e * Math.PI) * p.lift;
        ctx.save();
        ctx.globalAlpha = Math.min(1, age * 6) * (k > 0.75 ? (1 - k) * 4 : 1);
        ctx.shadowColor = p.color; ctx.shadowBlur = 16;
        ctx.fillStyle = p.color; ctx.font = `${p.size}px serif`; ctx.textAlign = 'center';
        ctx.fillText(p.g, x, y);
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color; ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * fade + 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.globalAlpha = fade; ctx.lineWidth = p.width * fade + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (p.kind === 'text') {
        const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
        ctx.save(); ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        ctx.translate(p.x, p.y); ctx.scale(pop, pop);
        ctx.font = `800 ${p.size}px 'Cinzel', 'Sarabun', serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,10,0.75)'; ctx.strokeText(p.text, 0, 0);
        ctx.shadowColor = p.color; ctx.shadowBlur = 18; ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
        ctx.restore();
      } else if (p.kind === 'sparkle') {
        const s = Math.sin(k * Math.PI);
        ctx.save(); ctx.globalAlpha = s; ctx.fillStyle = p.color; ctx.translate(p.x, p.y - age * 20);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.lineTo(Math.cos(a) * p.r * 3 * s, Math.sin(a) * p.r * 3 * s); ctx.lineTo(Math.cos(a + Math.PI / 4) * p.r * 0.6, Math.sin(a + Math.PI / 4) * p.r * 0.6); }
        ctx.fill(); ctx.restore();
      } else if (p.kind === 'drop') {
        ctx.fillStyle = `rgba(200,225,255,${fade * 0.85})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = `rgba(190,230,255,${fade * 0.7})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
};
