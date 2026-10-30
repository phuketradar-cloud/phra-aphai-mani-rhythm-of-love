/*
 * TrackRenderer — the horizontal rhythm track at the bottom of the screen.
 * Note x positions are a pure function of (note.time - songTime), so they stay locked to the
 * music clock no matter the frame rate.
 */
window.PAM = window.PAM || {};
PAM.TrackRenderer = class TrackRenderer {
  constructor() {
    this.x0 = 110; this.x1 = 1810; this.y = 975; this.h = 104;
    this.hitX = 330;
    this.flash = 0; this.flashColor = '#7ee8ff';
    this.press = 0;
  }

  static colorFor(type) {
    return { normal: '#5fe3ff', soft: '#6f8dff', accent: '#f4c766', spell: '#ff5479' }[type] || '#5fe3ff';
  }

  xFor(dt, approach) { return this.hitX + (dt / approach) * (this.x1 - 40 - this.hitX); }

  hit(color) { this.flash = 1; this.flashColor = color; }
  pressed() { this.press = 1; }

  update(dt) { this.flash = Math.max(0, this.flash - dt * 4); this.press = Math.max(0, this.press - dt * 8); }

  draw(ctx, t, songTime, engine, approach, opts) {
    const y = this.y, h = this.h;
    // panel
    ctx.save();
    const pg = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    pg.addColorStop(0, 'rgba(8,16,40,0.88)'); pg.addColorStop(1, 'rgba(4,8,22,0.92)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(this.x0, y - h / 2, this.x1 - this.x0, h, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(217,169,78,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,160,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(this.x0 + 6, y - h / 2 + 6, this.x1 - this.x0 - 12, h - 12, 13); ctx.stroke();

    // guide line, coloured like the concept art (cyan -> blue -> red -> gold)
    const lg = ctx.createLinearGradient(this.hitX, 0, this.x1, 0);
    lg.addColorStop(0, '#5fe3ff'); lg.addColorStop(0.35, '#6f8dff'); lg.addColorStop(0.7, '#ff5479'); lg.addColorStop(1, '#f4c766');
    ctx.strokeStyle = lg; ctx.lineWidth = 3; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.moveTo(this.x0 + 30, y); ctx.lineTo(this.x1 - 24, y); ctx.stroke();
    ctx.globalAlpha = 1;

    // timing window band around the hit zone (shows how forgiving the difficulty is)
    const wpx = (engine.windows.good / approach) * (this.x1 - 40 - this.hitX);
    const band = ctx.createLinearGradient(this.hitX - wpx, 0, this.hitX + wpx, 0);
    band.addColorStop(0, 'rgba(95,227,255,0)'); band.addColorStop(0.5, 'rgba(95,227,255,0.16)'); band.addColorStop(1, 'rgba(95,227,255,0)');
    ctx.fillStyle = band; ctx.fillRect(this.hitX - wpx, y - h / 2 + 8, wpx * 2, h - 16);

    // hit zone
    const pulse = 1 + this.press * 0.12;
    ctx.save();
    ctx.translate(this.hitX, y); ctx.scale(pulse, pulse);
    ctx.shadowColor = this.flash > 0 ? this.flashColor : '#5fe3ff'; ctx.shadowBlur = 24 + this.flash * 30;
    ctx.strokeStyle = this.flash > 0 ? this.flashColor : '#a9f1ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(169,241,255,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + t * 0.6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 42, Math.sin(a) * 42); ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); ctx.stroke();
    }
    ctx.fillStyle = `rgba(169,241,255,${0.12 + this.flash * 0.4})`;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // notes
    const notes = engine.visible(songTime - 0.6, songTime + approach + 0.1);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.x0 + 4, y - h / 2, this.x1 - this.x0 - 8, h); ctx.clip();
    for (const n of notes) {
      const dt = n.time - songTime;
      if (n.judged && n.judgement !== 'miss') continue;
      let x = this.xFor(dt, approach);
      let alpha = 1, col = TrackRenderer.colorFor(n.type);
      if (n.judgement === 'miss') { alpha = Math.max(0, 1 - (songTime - n.judgedAt) * 2.5); col = '#ff3355'; }
      if (alpha <= 0) continue;
      // fade in at the far right
      alpha *= Math.min(1, (this.x1 - 20 - x) / 120);
      const size = n.type === 'accent' || n.type === 'spell' ? 22 : n.type === 'soft' ? 14 : 17;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(x, y);
      ctx.shadowColor = col; ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(10,16,36,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, size + 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, size + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-size / 5, -size / 5, size / 2.5, size / 2.5);
      ctx.restore();
    }
    ctx.restore();

    // instructions + early/late hint
    ctx.font = "600 17px 'Sarabun', sans-serif"; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200,215,240,0.75)';
    ctx.fillText('SPACE / ← ↑ → ↓ / คลิก', this.x0 + 24, y + h / 2 + 26);
    ctx.textAlign = 'right';
    ctx.fillText('กดเมื่อโน้ตถึงวงแหวน · ถ้ากดพลาด นางยักษ์จะก้าวเข้ามา', this.x1 - 10, y + h / 2 + 26);
    if (opts && opts.timingHint && opts.timingHintAge < 0.5) {
      ctx.textAlign = 'center'; ctx.font = "700 20px 'Sarabun', sans-serif";
      ctx.fillStyle = opts.timingHint === 'EARLY' ? '#8fb4ff' : '#ffb27a';
      ctx.globalAlpha = 1 - opts.timingHintAge * 2;
      ctx.fillText(opts.timingHint, this.hitX, y - h / 2 - 12);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
};
