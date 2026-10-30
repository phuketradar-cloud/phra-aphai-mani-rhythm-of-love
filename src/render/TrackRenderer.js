/*
 * TrackRenderer — four horizontal rhythm lanes at the bottom of the screen (W / A / S / D).
 * Notes travel right -> left into each lane's hit zone. x positions are a pure function of
 * (note.time - songTime), so they stay locked to the music clock at any frame rate.
 */
window.PAM = window.PAM || {};
PAM.TrackRenderer = class TrackRenderer {
  constructor() {
    this.x0 = 110; this.x1 = 1810;
    this.hitX = 330;
    this.laneY = [846, 904, 962, 1020];
    this.laneH = 54;
    this.top = 815; this.bottom = 1051;
    this.flash = [0, 0, 0, 0]; this.flashColor = ['#fff', '#fff', '#fff', '#fff'];
    this.press = [0, 0, 0, 0];
    this.laneText = [null, null, null, null];   // { text, color, age }
    this.keyLabels = PAM.Config.lanes.map(l => l.key);
    this.comboPop = 0;
  }

  static laneColor(lane) { return (PAM.Config.lanes[lane] || PAM.Config.lanes[0]).color; }
  /** Kept for code that colours effects by note type. */
  static colorFor(type, lane = 0) { return type === 'miss' ? '#ff3355' : TrackRenderer.laneColor(lane); }

  setKeyLabels(labels) { this.keyLabels = labels; }
  xFor(dt, approach) { return this.hitX + (dt / approach) * (this.x1 - 40 - this.hitX); }

  hit(lane, color) { this.flash[lane] = 1; this.flashColor[lane] = color; }
  pressed(lane) { this.press[lane] = 1; }
  text(lane, text, color) { this.laneText[lane] = { text, color, age: 0 }; }
  bumpCombo() { this.comboPop = 1; }

  update(dt) {
    for (let i = 0; i < 4; i++) {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 4);
      this.press[i] = Math.max(0, this.press[i] - dt * 8);
      if (this.laneText[i]) this.laneText[i].age += dt;
    }
    this.comboPop = Math.max(0, this.comboPop - dt * 3);
  }

  /** Arrow glyph for a lane, centred on (0,0). */
  arrow(ctx, lane, s) {
    const rot = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][lane];
    ctx.save(); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.55, -s * 0.85); ctx.lineTo(-s * 0.2, 0); ctx.lineTo(-s * 0.55, s * 0.85); ctx.closePath();
    ctx.restore();
  }

  draw(ctx, t, songTime, engine, approach, opts = {}) {
    const keysDown = opts.keysDown || [];
    ctx.save();
    // panel
    const pg = ctx.createLinearGradient(0, this.top, 0, this.bottom);
    pg.addColorStop(0, 'rgba(8,16,40,0.9)'); pg.addColorStop(1, 'rgba(4,8,22,0.94)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(this.x0, this.top, this.x1 - this.x0, this.bottom - this.top, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(217,169,78,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();

    // lanes
    for (let l = 0; l < 4; l++) {
      const y = this.laneY[l], col = TrackRenderer.laneColor(l), held = keysDown[l];
      ctx.fillStyle = held ? 'rgba(255,255,255,0.06)' : l % 2 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(this.x0 + 6, y - this.laneH / 2 + 2, this.x1 - this.x0 - 12, this.laneH - 4);
      const lg = ctx.createLinearGradient(this.hitX, 0, this.x1, 0);
      lg.addColorStop(0, col); lg.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.strokeStyle = lg; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.hitX, y); ctx.lineTo(this.x1 - 24, y); ctx.stroke();
      ctx.globalAlpha = 1;
      // key label box
      ctx.fillStyle = held ? col : 'rgba(10,18,40,0.95)';
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(140, y - 20, 58, 40, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = held ? '#0a1028' : col; ctx.font = "800 24px 'Cinzel', 'Sarabun', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.keyLabels[l] || '?', 169, y + 1);
      ctx.fillStyle = 'rgba(200,215,240,0.55)'; ctx.font = "600 12px 'Sarabun', sans-serif";
      ctx.save(); ctx.translate(232, y); this.arrow(ctx, l, 9); ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.fill(); ctx.restore();
      // hit zone
      const pulse = 1 + this.press[l] * 0.15;
      ctx.save(); ctx.translate(this.hitX, y); ctx.scale(pulse, pulse);
      ctx.shadowColor = this.flash[l] > 0 ? this.flashColor[l] : col; ctx.shadowBlur = 14 + this.flash[l] * 30 + (held ? 10 : 0);
      ctx.strokeStyle = this.flash[l] > 0 ? this.flashColor[l] : col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = held ? col + '55' : `rgba(255,255,255,${0.05 + this.flash[l] * 0.35})`;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; this.arrow(ctx, l, 9); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.restore();
    }

    // timing band (shows how forgiving this difficulty is)
    const wpx = (engine.windows.good / approach) * (this.x1 - 40 - this.hitX);
    const band = ctx.createLinearGradient(this.hitX - wpx, 0, this.hitX + wpx, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.07)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.fillRect(this.hitX - wpx, this.top + 4, wpx * 2, this.bottom - this.top - 8);

    // notes
    const notes = engine.visible(songTime - 0.6, songTime + approach + 0.1);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.hitX - 40, this.top, this.x1 - this.hitX + 30, this.bottom - this.top); ctx.clip();
    // chord connectors first (behind notes)
    const chordDrawn = new Set();
    for (const n of notes) {
      if (!n.chord || chordDrawn.has(n.chord) || n.judged) continue;
      const group = notes.filter(m => m.chord === n.chord && !m.judged);
      if (group.length < 2) continue;
      chordDrawn.add(n.chord);
      const x = this.xFor(n.time - songTime, approach), ys = group.map(m => this.laneY[m.lane]);
      ctx.strokeStyle = 'rgba(246,216,140,0.75)'; ctx.lineWidth = 4; ctx.shadowColor = '#f6d88c'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(x, Math.min(...ys)); ctx.lineTo(x, Math.max(...ys)); ctx.stroke(); ctx.shadowBlur = 0;
    }
    for (const n of notes) {
      const col = TrackRenderer.laneColor(n.lane), y = this.laneY[n.lane];
      // hold body
      if (n.kind === 'hold' && n.holdResult !== 'done') {
        const headX = n.holding ? this.hitX : this.xFor(n.time - songTime, approach);
        const tailX = this.xFor(n.endTime - songTime, approach);
        if (tailX > this.hitX - 30 && (!n.judged || n.holding || n.holdResult === 'broken')) {
          const broken = n.holdResult === 'broken' || n.judgement === 'miss';
          ctx.fillStyle = broken ? 'rgba(255,51,85,0.25)' : n.holding ? col + 'cc' : col + '66';
          if (n.holding) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
          ctx.beginPath(); ctx.roundRect(Math.min(headX, tailX), y - 9, Math.abs(tailX - headX), 18, 9); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = broken ? '#ff3355' : col; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(tailX, y - 14); ctx.lineTo(tailX, y + 14); ctx.stroke();
        }
      }
      if (n.judged && n.judgement !== 'miss') continue;
      const dt = n.time - songTime;
      const x = this.xFor(dt, approach);
      let alpha = Math.min(1, (this.x1 - 20 - x) / 120), c = col;
      if (n.judgement === 'miss') { alpha = Math.max(0, 1 - (songTime - n.judgedAt) * 2.5); c = '#ff3355'; }
      if (alpha <= 0) continue;
      const size = n.kind === 'stream' ? 13 : n.accent ? 18 : 16;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
      ctx.shadowColor = c; ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(8,14,32,0.92)';
      ctx.beginPath(); ctx.arc(0, 0, size + 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = n.chordSize > 1 ? '#f6d88c' : c; ctx.lineWidth = n.accent ? 4 : 3;
      ctx.beginPath(); ctx.arc(0, 0, size + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 8;
      this.arrow(ctx, n.lane, size * 0.85); ctx.fillStyle = c; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.restore();

    // per-lane judgement words just right of the hit zones
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let l = 0; l < 4; l++) {
      const lt = this.laneText[l];
      if (!lt || lt.age > 0.45) continue;
      ctx.globalAlpha = 1 - lt.age / 0.45;
      ctx.font = "800 17px 'Cinzel', 'Sarabun', sans-serif"; ctx.fillStyle = lt.color;
      ctx.fillText(lt.text, this.hitX + 32, this.laneY[l] - 16 - lt.age * 10);
      ctx.globalAlpha = 1;
    }

    // early / late hint
    if (opts.timingHint && opts.timingHintAge < 0.5) {
      ctx.textAlign = 'center'; ctx.font = "700 18px 'Sarabun', sans-serif";
      ctx.fillStyle = opts.timingHint === 'EARLY' ? '#8fb4ff' : '#ffb27a';
      ctx.globalAlpha = 1 - opts.timingHintAge * 2;
      ctx.fillText(opts.timingHint, this.hitX, this.top - 14);
      ctx.globalAlpha = 1;
    }

    // big streak counter above the track (kept clear of the lanes)
    if (opts.combo >= 5) {
      const pop = 1 + this.comboPop * 0.35, milestone = opts.combo >= 50 ? '#ffd27a' : opts.combo >= 25 ? '#f6d88c' : '#bfefff';
      ctx.save(); ctx.translate(960, 760); ctx.scale(pop, pop);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = "800 54px 'Cinzel', serif"; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,10,0.7)';
      ctx.strokeText(opts.combo, 0, 0); ctx.shadowColor = milestone; ctx.shadowBlur = 20 + this.comboPop * 30; ctx.fillStyle = milestone; ctx.fillText(opts.combo, 0, 0);
      ctx.shadowBlur = 0; ctx.font = "700 16px 'Cinzel', serif"; ctx.fillStyle = 'rgba(230,236,250,0.85)'; ctx.fillText('COMBO · ต่อเนื่อง', 0, 22);
      ctx.restore();
    }
    ctx.restore();
  }
};
