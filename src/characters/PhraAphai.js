/*
 * PhraAphai — Phra Aphai Mani, the flute-playing prince (left side, faces right).
 *
 * Drawn from painted full-body sprites (assets/characters/phra_aphai/), one per pose:
 *   idle   — standing, flute held at his side       (state idle)
 *   play   — playing the flute                      (states play, nervous)
 *   scared — recoiling with a raised hand           (states panic, caught, pulled)
 * The pose values below (bob, lean, sway, shake…) move the whole sprite around its feet, and pose
 * changes cross-fade. Until the images load (or if one is missing) the original procedural
 * skeletal figure is drawn instead (drawRig).
 * Gameplay code only calls setState(), react(), update() and draw().
 *
 * States: idle | play | nervous | panic | caught | pulled
 * One-shot reactions layered on top: 'success' (hit) and 'miss'.
 */
window.PAM = window.PAM || {};
PAM.PhraAphai = class PhraAphai {
  constructor() {
    this.x = 330; this.y = 790; this.scale = 1.05;
    this.state = 'idle';
    this.t = 0;
    this.reactT = 0; this.reactKind = null;
    this.pose = {};
    this.fluteTip = { x: 0, y: 0 };   // world position where music notes are emitted
    this.bodyCenter = { x: 0, y: 0 }; // world position the giantess reaches for
    this.override = null;             // capture cinematic transform {dx, dy, rot}
    this.sprites = PAM.PhraAphai.loadSprites();
    this.spriteKey = 'idle'; this.prevKey = null; this.fade = 1;
  }

  /** Load the pose images once (shared by every instance). */
  static loadSprites() {
    if (PAM.PhraAphai._sprites) return PAM.PhraAphai._sprites;
    const set = {};
    for (const [key, def] of Object.entries(PAM.PhraAphai.SPRITES)) {
      const img = new Image();
      set[key] = Object.assign({ img, ok: false }, def);
      img.onload = () => { set[key].ok = true; };
      img.src = def.src;
    }
    return (PAM.PhraAphai._sprites = set);
  }

  spriteFor(state) {
    if (state === 'play' || state === 'nervous') return 'play';
    if (state === 'panic' || state === 'caught' || state === 'pulled') return 'scared';
    return 'idle';
  }

  setState(s) { this.state = s; }
  react(kind) { this.reactKind = kind; this.reactT = 0; }

  targetPose() {
    const t = this.t, s = this.state;
    const breathe = Math.sin(t * 2.1);
    const p = { bob: breathe * 1.5, lean: 0.02, headTilt: 0.04, flute: 1, fluteAngle: 0.16,
      armsUp: 0, knee: 0.15, eyes: 0.2, brow: 0, shake: 0, sway: 0 };
    if (s === 'idle') { Object.assign(p, { flute: 0.0, lean: 0, headTilt: -0.02, eyes: 1, knee: 0.08 }); }
    if (s === 'play') { p.sway = Math.sin(t * 1.6) * 0.035; p.headTilt = 0.06 + Math.sin(t * 1.6 + 0.5) * 0.03; }
    if (s === 'nervous') { Object.assign(p, { lean: -0.06, eyes: 0.9, brow: 0.6, knee: 0.25, fluteAngle: 0.1 }); p.sway = Math.sin(t * 6) * 0.015; }
    if (s === 'panic') { Object.assign(p, { lean: -0.16, eyes: 1.25, brow: 1, knee: 0.4, shake: 1.6, fluteAngle: 0.05 }); }
    if (s === 'caught' || s === 'pulled') { Object.assign(p, { flute: 0, armsUp: 1, lean: -0.3, eyes: 1.3, brow: 1, knee: 0.7, shake: 2.5, headTilt: -0.2 }); }
    // one-shot reactions
    if (this.reactKind && this.reactT < 0.35) {
      const k = Math.sin(Math.min(1, this.reactT / 0.35) * Math.PI);
      if (this.reactKind === 'success') { p.headTilt += 0.08 * k; p.bob -= 3 * k; }
      if (this.reactKind === 'miss') { p.lean -= 0.12 * k; p.headTilt -= 0.12 * k; p.brow = Math.max(p.brow, 0.8 * k); p.eyes = Math.max(p.eyes, 1.1 * k); }
    }
    return p;
  }

  update(dt) {
    this.t += dt;
    this.reactT += dt;
    const fast = this.state === 'panic' || this.state === 'caught';
    PAM.Rig.blend(this.pose, this.targetPose(), dt, fast ? 14 : 7);
    const key = this.spriteFor(this.state);
    if (key !== this.spriteKey) { this.prevKey = this.spriteKey; this.spriteKey = key; this.fade = 0; }
    this.fade = Math.min(1, this.fade + dt / 0.25);
    // motion style eases between states so nothing snaps
    if (!this.motion) this.motion = this.targetMotion();
    PAM.Rig.blend(this.motion, this.targetMotion(), dt, 4);
    this.clock = (this.clock || 0) + dt;
    // beat phase: from the song while it plays (Game sets this.beat), otherwise a gentle internal pulse
    this.beatPhase = this.beat != null ? this.beat : this.clock * 0.9;
  }

  /** How much each part of the body moves in the current state (image pixels / radians). */
  targetMotion() {
    switch (this.state) {
      case 'play':    return { sway: 9, dip: 5, nod: 0.05, breath: 0.8, breathRate: 2.2, wind: 1, tremble: 0, beatSway: 1 };
      case 'nervous': return { sway: 6, dip: 3, nod: 0.03, breath: 1.2, breathRate: 3.4, wind: 1.1, tremble: 0.5, beatSway: 1 };
      case 'panic':   return { sway: 4, dip: 1, nod: 0.02, breath: 1.8, breathRate: 6, wind: 1.4, tremble: 1.6, beatSway: 0 };
      case 'caught':
      case 'pulled':  return { sway: 6, dip: 0, nod: 0.06, breath: 2, breathRate: 7, wind: 1.8, tremble: 2.2, beatSway: 0 };
      default:        return { sway: 4, dip: 0, nod: 0.02, breath: 1, breathRate: 1.6, wind: 0.7, tremble: 0, beatSway: 0 };
    }
  }

  draw(ctx) {
    const cur = this.sprites[this.spriteKey];
    if (cur && cur.ok) this.drawSprites(ctx); else this.drawRig(ctx);
  }

  /**
   * Bend one image point (sprite pixels) for this frame. The feet stay planted while the body
   * above them sways and dips on the beat, the chest breathes, the head nods around the neck,
   * and the loose sash ends and hair ripple in the sea wind.
   */
  deform(sp, x, y) {
    const m = this.motion, t = this.clock, b = this.beatPhase, clamp = (v, a, z) => Math.max(a, Math.min(z, v));
    const footY = sp.foot[1], hip = sp.hip, neck = sp.neck, cx = sp.cx;
    const h = clamp((footY - y) / footY, 0, 1);              // 0 at the feet, 1 at the top of the head
    // sway: one side-to-side swing every two beats (or a slow drift when not playing)
    const swing = m.beatSway * Math.sin(b * Math.PI) + (1 - m.beatSway) * Math.sin(t * 1.1);
    let dx = m.sway * swing * Math.pow(h, 1.6);
    // dip: knees give a little on each beat
    const pulse = Math.pow(0.5 + 0.5 * Math.cos(b * Math.PI * 2), 3);
    let dy = m.dip * pulse * h;
    // breathing: chest widens and shoulders rise
    const br = Math.sin(t * m.breathRate) * m.breath;
    const chest = clamp(1 - Math.abs(y - (neck + hip) / 2) / ((hip - neck) / 2 + 25), 0, 1);
    dx += (x - cx) * 0.012 * br * chest;
    dy -= br * 1.6 * clamp((hip - y) / (hip - neck), 0, 1);
    // head nod around the neck, on the beat
    if (y < neck + 14) {
      const w = clamp((neck + 14 - y) / 50, 0, 1), a = (m.nod * (pulse - 0.3) + Math.sin(t * 0.7) * 0.012) * w;
      const rx = x - cx, ry = y - neck, c = Math.cos(a) - 1, s = Math.sin(a);
      dx += rx * c - ry * s; dy += rx * s + ry * c;
    }
    // loose cloth: sash ends outside the legs, between the waist and the shins
    const side = Math.abs(x - cx) - sp.bodyW;
    if (side > 0 && y > hip - 20 && y < footY - 70) {
      const w = clamp(side / 70, 0, 1) * clamp((y - hip + 20) / 110, 0, 1) * clamp((footY - 70 - y) / 60, 0, 1);
      const ph = t * 3.1 - y * 0.035 + (x > cx ? 0 : 1.7);
      dx += w * m.wind * Math.sin(ph) * 9; dy += w * m.wind * Math.cos(ph * 0.8) * 4;
    }
    // hair: strands around the head lift and flow
    const hy = sp.head[1] + 30;
    if (y < hy) {
      const w = clamp((hy - y) / 70, 0, 1) * clamp((Math.abs(x - sp.head[0]) - 18) / 40, 0, 1);
      dx += w * m.wind * Math.sin(t * 2.6 + y * 0.05) * 5; dy += w * m.wind * Math.cos(t * 2.2 + x * 0.04) * 2;
    }
    // fear: fine trembling that grows toward the shoulders
    dx += m.tremble * Math.sin(t * 41 + y * 0.06) * h;
    return [x + dx, y + dy];
  }

  /** Grid cells of each sprite that contain visible pixels (empty cells are skipped when drawing). */
  meshFor(sp) {
    if (sp.mesh) return sp.mesh;
    const W = sp.img.naturalWidth, H = sp.img.naturalHeight, cols = 8, rows = 16, cells = [];
    let data = null;
    try {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.drawImage(sp.img, 0, 0); data = g.getImageData(0, 0, W, H).data;
    } catch (e) { /* unreadable image: draw every cell */ }
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const x0 = Math.floor(q * W / cols), x1 = Math.floor((q + 1) * W / cols), y0 = Math.floor(r * H / rows), y1 = Math.floor((r + 1) * H / rows);
      let used = !data;
      for (let y = y0; y < y1 && !used; y += 2) for (let x = x0; x < x1; x += 2) if (data[(y * W + x) * 4 + 3] > 8) { used = true; break; }
      if (used) cells.push([x0, y0, x1, y1]);
    }
    return (sp.mesh = cells);
  }

  /** Draw a sprite bent by deform(): each grid cell is split into two textured triangles. */
  drawMesh(ctx, sp) {
    const img = sp.img;
    const tri = (u0, v0, u1, v1, u2, v2) => {
      const [x0, y0] = this.deform(sp, u0, v0), [x1, y1] = this.deform(sp, u1, v1), [x2, y2] = this.deform(sp, u2, v2);
      // grow the clip a little around the centroid so neighbouring triangles overlap (no seams)
      const mx = (x0 + x1 + x2) / 3, my = (y0 + y1 + y2) / 3, grow = (x, y) => {
        const l = Math.hypot(x - mx, y - my) || 1; return [x + (x - mx) / l * 0.9, y + (y - my) / l * 0.9];
      };
      const [a0, b0] = grow(x0, y0), [a1, b1] = grow(x1, y1), [a2, b2] = grow(x2, y2);
      const den = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
      if (!den) return;
      const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / den, c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / den;
      const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / den, d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / den;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(a0, b0); ctx.lineTo(a1, b1); ctx.lineTo(a2, b2); ctx.closePath(); ctx.clip();
      ctx.transform(a, b, c, d, x0 - a * u0 - c * v0, y0 - b * u0 - d * v0);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    for (const [x0, y0, x1, y1] of this.meshFor(sp)) { tri(x0, y0, x1, y0, x1, y1); tri(x0, y0, x1, y1, x0, y1); }
  }

  /** Painted sprites, bent by deform() and leaned / trembled as a whole around the feet. */
  drawSprites(ctx) {
    const p = this.pose, t = this.t, S = PAM.PhraAphai.SPRITE_SCALE;
    const shake = p.shake ? Math.sin(t * 60) * p.shake : 0;
    const rot = (p.lean || 0) * 0.55;
    const lift = (p.bob || 0) + (p.knee || 0) * 6;
    // character-local frame: origin between the feet, before this.scale / override
    const place = () => {
      ctx.translate(this.x, this.y);
      if (this.override) { ctx.translate(this.override.dx, this.override.dy); ctx.rotate(this.override.rot); }
      ctx.scale(this.scale, this.scale);
      ctx.translate(shake, lift);
      ctx.rotate(rot);
      ctx.scale(S, S);
    };
    const drawOne = (sp, alpha) => {
      if (!sp || !sp.ok || alpha <= 0) return;
      ctx.save(); place(); ctx.globalAlpha = alpha;
      if (sp.flip) ctx.scale(-1, 1);
      ctx.translate(-sp.foot[0], -sp.foot[1]);
      this.drawMesh(ctx, sp);
      ctx.restore();
    };
    // soft contact shadow
    ctx.save();
    ctx.translate(this.x + (this.override ? this.override.dx : 0), this.y + (this.override ? this.override.dy : 0));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 4, 62 * this.scale, 11 * this.scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const cur = this.sprites[this.spriteKey];
    if (this.fade < 1) drawOne(this.sprites[this.prevKey], 1 - this.fade);
    drawOne(cur, this.fade < 1 ? this.fade : 1);

    // world-space anchors for effects / the giantess
    const toWorld = q0 => {
      const q = this.deform(cur, q0[0], q0[1]);
      let x = (cur.flip ? cur.foot[0] - q[0] : q[0] - cur.foot[0]) * S, y = (q[1] - cur.foot[1]) * S;
      const c0 = Math.cos(rot), s0 = Math.sin(rot);
      [x, y] = [x * c0 - y * s0 + shake, x * s0 + y * c0 + lift];
      x *= this.scale; y *= this.scale;
      if (this.override) {
        const c = Math.cos(this.override.rot), s = Math.sin(this.override.rot);
        [x, y] = [x * c - y * s + this.override.dx, x * s + y * c + this.override.dy];
      }
      return { x: this.x + x, y: this.y + y };
    };
    this.fluteTip = toWorld(cur.flute);
    this.bodyCenter = toWorld(cur.chest);
    this.headPos = toWorld(cur.head);

    // the flute glows while it is being played
    if (this.spriteKey === 'play') {
      const g = ctx.createRadialGradient(this.fluteTip.x, this.fluteTip.y, 0, this.fluteTip.x, this.fluteTip.y, 26);
      g.addColorStop(0, `rgba(140,230,255,${0.45 + Math.sin(t * 5) * 0.12})`); g.addColorStop(1, 'rgba(140,230,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.fluteTip.x, this.fluteTip.y, 26, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** Original procedural skeletal figure (fallback while the sprites load). */
  drawRig(ctx) {
    const R = PAM.Rig, p = this.pose, t = this.t;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.override) { ctx.translate(this.override.dx, this.override.dy); ctx.rotate(this.override.rot); }
    ctx.scale(this.scale, this.scale);
    const shake = p.shake ? Math.sin(t * 60) * p.shake : 0;
    ctx.translate(shake, 0);

    // ---- skeleton
    const hip = { x: 0, y: -116 + p.bob + p.knee * 14 };
    const lean = p.lean + p.sway;
    const sh = R.from(hip.x, hip.y, -Math.PI / 2 + lean, 88);
    const head = R.from(sh.x, sh.y, -Math.PI / 2 + lean + p.headTilt * 0.6, 34);
    const hAng = lean + p.headTilt;
    const rot = (dx, dy) => ({ x: head.x + dx * Math.cos(hAng) - dy * Math.sin(hAng), y: head.y + dx * Math.sin(hAng) + dy * Math.cos(hAng) });
    const mouth = rot(16, 8);

    // flute: horizontal from the mouth when playing, lowered along the body otherwise
    const fA = p.flute * (p.fluteAngle + hAng * 0.5) + (1 - p.flute) * 1.35;
    const fBase = { x: R.lerp(sh.x + 18, mouth.x - 8, p.flute), y: R.lerp(sh.y + 60, mouth.y - 1, p.flute) };
    const fluteLen = 118;
    const fEnd = R.from(fBase.x, fBase.y, fA, fluteLen);
    const onFlute = k => ({ x: R.lerp(fBase.x, fEnd.x, k), y: R.lerp(fBase.y, fEnd.y, k) });

    const backSh = { x: sh.x - 8, y: sh.y + 4 }, frontSh = { x: sh.x + 6, y: sh.y + 6 };
    const up = p.armsUp;
    const flail = Math.sin(t * 18) * 10 * up;
    let backTarget = onFlute(0.62), frontTarget = onFlute(0.3);
    if (p.flute < 0.5) { backTarget = { x: sh.x - 10, y: sh.y + 74 }; frontTarget = onFlute(0.15); }
    backTarget = { x: R.lerp(backTarget.x, head.x + 34, up), y: R.lerp(backTarget.y, head.y - 46 + flail, up) };
    frontTarget = { x: R.lerp(frontTarget.x, head.x + 46, up), y: R.lerp(frontTarget.y, head.y - 20 - flail, up) };
    const backEl = R.ik(backSh.x, backSh.y, backTarget.x, backTarget.y, 40, 40, 1);
    const frontEl = R.ik(frontSh.x, frontSh.y, frontTarget.x, frontTarget.y, 40, 40, 1);

    const backFoot = { x: -20, y: 0 }, frontFoot = { x: 24, y: 0 };
    const backHip = { x: hip.x - 7, y: hip.y }, frontHip = { x: hip.x + 7, y: hip.y };
    const backKnee = R.ik(backHip.x, backHip.y, backFoot.x, backFoot.y - 4, 58, 58, -1);
    const frontKnee = R.ik(frontHip.x, frontHip.y, frontFoot.x, frontFoot.y - 4, 58, 58, -1);

    const SKIN = '#c98f66', SKIN_D = '#a8714f', SHIRT = '#e9dcc0', SHIRT_D = '#c8b791',
      PANTS = '#4a2b26', PANTS_D = '#3a201d', SASH = '#9e2632', GOLD = '#e2b558', HAIR = '#141019';

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 2, 46, 9, 0, 0, Math.PI * 2); ctx.fill();

    // back arm (sleeve + forearm)
    R.capsule(ctx, backSh.x, backSh.y, backEl.x, backEl.y, 10, 8.5); ctx.fillStyle = SHIRT_D; ctx.fill();
    ctx.fillStyle = SKIN_D; R.capsule(ctx, backEl.x, backEl.y, backEl.hx, backEl.hy, 6, 5);
    ctx.beginPath(); ctx.arc(backEl.hx, backEl.hy, 6.5, 0, Math.PI * 2); ctx.fill();

    // back leg
    R.capsule(ctx, backHip.x, backHip.y, backKnee.x, backKnee.y, 14, 11); ctx.fillStyle = PANTS_D; ctx.fill();
    ctx.fillStyle = SKIN_D; R.capsule(ctx, backKnee.x, backKnee.y, backKnee.hx, backKnee.hy, 7, 5.5);
    ctx.beginPath(); ctx.ellipse(backFoot.x + 6, backFoot.y - 3, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

    // torso — loose shirt
    const sx = Math.cos(lean), sy = Math.sin(lean);
    const P = (dx, dy) => ({ x: hip.x + dx * sx - dy * sy, y: hip.y + dx * sy + dy * sx }); // local torso frame (y up negative)
    const tg = ctx.createLinearGradient(hip.x - 30, 0, hip.x + 30, 0);
    tg.addColorStop(0, SHIRT_D); tg.addColorStop(0.55, SHIRT); tg.addColorStop(1, '#f6eedd');
    ctx.fillStyle = tg;
    ctx.beginPath();
    const a = P(-20, -90), b = P(22, -88), c = P(27, -8), d = P(-25, -6);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(P(2, -96).x, P(2, -96).y, b.x, b.y);
    ctx.quadraticCurveTo(P(30, -50).x, P(30, -50).y, c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.quadraticCurveTo(P(-28, -48).x, P(-28, -48).y, a.x, a.y);
    ctx.fill();
    // shirt folds + open collar
    ctx.strokeStyle = 'rgba(120,100,70,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); let f1 = P(-6, -80), f2 = P(-2, -20); ctx.moveTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y);
    f1 = P(12, -70); f2 = P(16, -24); ctx.moveTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y); ctx.stroke();
    ctx.fillStyle = SKIN; const n1 = P(-6, -92), n2 = P(10, -92), n3 = P(4, -74);
    ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.lineTo(n3.x, n3.y); ctx.fill();
    // gold necklace
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(n1.x, n1.y + 2); ctx.quadraticCurveTo(n3.x, n3.y + 6, n2.x, n2.y + 2); ctx.stroke();

    // pants (jongkraben) + sash
    ctx.fillStyle = PANTS;
    const w1 = P(-26, -10), w2 = P(28, -12);
    ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(w2.x, w2.y); ctx.lineTo(frontHip.x + 16, frontHip.y + 18); ctx.lineTo(backHip.x - 14, backHip.y + 18); ctx.fill();
    R.capsule(ctx, frontHip.x, frontHip.y, frontKnee.x, frontKnee.y, 15, 12); ctx.fillStyle = PANTS; ctx.fill();
    ctx.fillStyle = SKIN; R.capsule(ctx, frontKnee.x, frontKnee.y, frontKnee.hx, frontKnee.hy, 7.5, 6);
    ctx.beginPath(); ctx.ellipse(frontFoot.x + 7, frontFoot.y - 3, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(frontKnee.x - 9, frontKnee.y + 2); ctx.lineTo(frontKnee.x + 10, frontKnee.y + 4); ctx.stroke();
    const s1 = P(-27, -18), s2 = P(29, -20), s3 = P(29, -6), s4 = P(-27, -4);
    ctx.fillStyle = SASH; ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.lineTo(s4.x, s4.y); ctx.fill();
    // sash tail swinging
    const tailSw = Math.sin(t * 2.4) * 4 + p.shake * 2;
    const k1 = P(20, -12);
    R.ribbon(ctx, [k1, { x: k1.x + 6 + tailSw * 0.3, y: k1.y + 18 }, { x: k1.x + 4 + tailSw, y: k1.y + 40 }], 5, 3.5, '#7e1c27');
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.moveTo(s4.x, s4.y); ctx.lineTo(s3.x, s3.y); ctx.stroke();

    // ---- head
    ctx.save();
    ctx.translate(head.x, head.y); ctx.rotate(hAng);
    // hair back mass + topknot
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.ellipse(-6, -4, 21, 23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-10, -27, 9, 10, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(-8, -19, 7, 3, -0.3, 0, Math.PI * 2); ctx.stroke();
    // loose strands
    R.ribbon(ctx, [{ x: -20, y: -2 }, { x: -24, y: 14 + Math.sin(t * 2) * 2 }, { x: -20, y: 28 }], 6, 2, HAIR);
    // neck
    ctx.fillStyle = SKIN_D; ctx.fillRect(-6, 12, 12, 16);
    // face
    const fg = ctx.createRadialGradient(6, -4, 4, 2, 0, 24);
    fg.addColorStop(0, '#e2ad85'); fg.addColorStop(1, SKIN_D);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-8, -18);
    ctx.quadraticCurveTo(12, -24, 18, -6);
    ctx.lineTo(20, 2); ctx.lineTo(17, 6);
    ctx.quadraticCurveTo(18, 14, 10, 19);
    ctx.quadraticCurveTo(-2, 22, -10, 12);
    ctx.quadraticCurveTo(-14, -4, -8, -18);
    ctx.fill();
    // ear
    ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.ellipse(-6, 2, 4, 6, 0.2, 0, Math.PI * 2); ctx.fill();
    // fringe
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.moveTo(-16, -6); ctx.quadraticCurveTo(-6, -26, 16, -14); ctx.quadraticCurveTo(6, -16, 4, -10); ctx.quadraticCurveTo(-4, -14, -12, 2); ctx.fill();
    // eyes: closed and serene while playing, wider when scared
    const eyeOpen = R.clamp(p.eyes, 0, 1.4);
    ctx.strokeStyle = '#1a1014'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    if (eyeOpen < 0.45) { ctx.beginPath(); ctx.arc(9, -3, 4, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else {
      ctx.fillStyle = '#f2ebe0'; ctx.beginPath(); ctx.ellipse(10, -3, 4.2, 2.4 * eyeOpen, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1014'; ctx.beginPath(); ctx.arc(11.5, -3, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // brow
    ctx.beginPath(); ctx.moveTo(4, -9 - p.brow * 2); ctx.lineTo(15, -10 + p.brow * 1.5); ctx.stroke();
    // mouth (lips on the flute while playing)
    ctx.strokeStyle = '#7a3b35'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (p.armsUp > 0.5) ctx.ellipse(13, 11, 2.5, 3.5, 0, 0, Math.PI * 2); else { ctx.moveTo(10, 10); ctx.lineTo(16, 9); }
    ctx.stroke();
    ctx.restore();

    // ---- flute (khlui) with gold bands and glow when playing
    ctx.save();
    if (p.flute > 0.5 && (this.state === 'play' || this.state === 'nervous')) { ctx.shadowColor = 'rgba(120,220,255,0.6)'; ctx.shadowBlur = 10; }
    ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fBase.x, fBase.y); ctx.lineTo(fEnd.x, fEnd.y); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#c08a4a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fBase.x, fBase.y - 1.5); ctx.lineTo(fEnd.x, fEnd.y - 1.5); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 7.5; ctx.lineCap = 'butt';
    for (const k of [0.08, 0.5, 0.94]) {
      const q1 = onFlute(k), q2 = onFlute(k + 0.025);
      ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
    }
    ctx.fillStyle = '#2a170c';
    for (let i = 0; i < 6; i++) { const q = onFlute(0.38 + i * 0.07); ctx.beginPath(); ctx.arc(q.x, q.y - 1, 1.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();

    // front arm (drawn last so the hand is over the flute)
    R.capsule(ctx, frontSh.x, frontSh.y, frontEl.x, frontEl.y, 10.5, 9); ctx.fillStyle = SHIRT; ctx.fill();
    ctx.fillStyle = SKIN; R.capsule(ctx, frontEl.x, frontEl.y, frontEl.hx, frontEl.hy, 6.5, 5.5);
    ctx.beginPath(); ctx.arc(frontEl.hx, frontEl.hy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    const cuff = { x: R.lerp(frontEl.x, frontEl.hx, 0.75), y: R.lerp(frontEl.y, frontEl.hy, 0.75) };
    ctx.beginPath(); ctx.arc(cuff.x, cuff.y, 6, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();

    // world-space anchors for effects / the giantess
    const toWorld = q => {
      let x = (q.x + shake) * this.scale, y = q.y * this.scale;
      if (this.override) {
        const c = Math.cos(this.override.rot), s = Math.sin(this.override.rot);
        const rx = x * c - y * s, ry = x * s + y * c; x = rx + this.override.dx; y = ry + this.override.dy;
      }
      return { x: this.x + x, y: this.y + y };
    };
    this.fluteTip = toWorld(fEnd);
    this.bodyCenter = toWorld({ x: sh.x, y: (sh.y + hip.y) / 2 });
    this.headPos = toWorld(head);
  }
};

/** World units per sprite pixel (before this.scale); the sprites are stored at about 2x display size. */
PAM.PhraAphai.SPRITE_SCALE = 0.5;
/**
 * Pose images and their anchor points in image pixels:
 * foot = ground point between the feet, hip / neck = waist and neck heights, cx = body centre line,
 * bodyW = half-width of the legs (sash ends beyond it flutter), flute = where music notes leave, chest = what the
 * giantess grabs, head = head centre. flip mirrors the image so he faces right (the sea).
 */
PAM.PhraAphai.SPRITES = {
  idle:   { src: 'assets/characters/phra_aphai/idle.png?v=2',   foot: [113, 600], flute: [179, 172], chest: [95, 150],  head: [105, 60], hip: 215, neck: 100, cx: 110, bodyW: 48, flip: true },
  play:   { src: 'assets/characters/phra_aphai/play.png?v=2',   foot: [128, 596], flute: [226, 107], chest: [111, 150], head: [131, 60], hip: 222, neck: 105, cx: 118, bodyW: 50 },
  scared: { src: 'assets/characters/phra_aphai/scared.png?v=2', foot: [150, 581], flute: [16, 240],  chest: [114, 150], head: [104, 60], hip: 222, neck: 100, cx: 150, bodyW: 62 }
};
