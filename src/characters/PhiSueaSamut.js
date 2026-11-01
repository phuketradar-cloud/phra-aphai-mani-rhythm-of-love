/*
 * PhiSueaSamut — the sea giantess (right side, faces left toward the prince).
 *
 * Drawn from painted sprites (assets/characters/phi_suea_samut/):
 *   walk_0…7   — 8-frame walk cycle (idle, slowWalk, fastWalk, running)
 *   mesmerized — eyes closed, hands at the heart (mesmerized)
 *   run        — the leap at the start of an attack
 *   attack     — roaring lunge with claws out (attack, capture)
 * The walk frame follows the gait phase, so a foot lands on frames 0 and 4 exactly when
 * onStep(intensity) fires (footstep sounds stay in sync and speed up as she accelerates); frames
 * cross-fade at the end of each step. Every sprite is drawn as a bending mesh (PAM.SpriteMesh):
 * hair streams and ripples, the skirt flutters, the body breathes and sways when enchanted.
 * Until the images load the original procedural skeletal figure is drawn (drawRig).
 * Poses are blended every frame (PAM.Rig.blend) so state changes are smooth.
 */
window.PAM = window.PAM || {};
PAM.PhiSueaSamut = class PhiSueaSamut {
  constructor() {
    this.x = 1600; this.y = 800; this.scale = 1.0;
    this.state = 'mesmerized';
    this.t = 0;
    this.phase = 0;            // gait phase (radians)
    this.pose = {};
    this.reachTarget = null;   // world point for attack / capture hands
    this.onStep = null;
    this.flinchT = 9;
    this.override = null;      // cinematic transform {dx, dy, rot}
    this.handsWorld = { x: 0, y: 0 };
    this.headWorld = { x: 0, y: 0 };
    this.sprites = PAM.PhiSueaSamut.loadSprites();
    this.stateT = 0;           // seconds in the current state
    this.poseKey = 'mesmerized'; this.prevKey = null; this.fade = 1;
  }

  /** Load the images once (shared by every instance). */
  static loadSprites() {
    if (PAM.PhiSueaSamut._sprites) return PAM.PhiSueaSamut._sprites;
    const S = PAM.PhiSueaSamut.SPRITES, dir = 'assets/characters/phi_suea_samut/', v = '?v=1', set = {};
    set.walk = [];
    for (let i = 0; i < 8; i++) set.walk.push(PAM.SpriteMesh.load(`${dir}walk_${i}.png${v}`, S.walk));
    for (const k of ['mesmerized', 'run', 'attack']) set[k] = PAM.SpriteMesh.load(`${dir}${k}.png${v}`, S[k]);
    return (PAM.PhiSueaSamut._sprites = set);
  }

  setState(s) { if (s !== this.state) this.stateT = 0; this.state = s; }
  flinch() { this.flinchT = 0; }

  gait() {
    switch (this.state) {
      case 'slowWalk': return { speed: 3.2, stride: 0.55, intensity: 0.25 };
      case 'fastWalk': return { speed: 5.2, stride: 0.8, intensity: 0.55 };
      case 'running': return { speed: 8.5, stride: 1.0, intensity: 1 };
      case 'attack': return { speed: 9, stride: 0.9, intensity: 1 };
      default: return { speed: 0, stride: 0, intensity: 0 };
    }
  }

  targetPose() {
    const t = this.t, s = this.state;
    const p = { lean: 0, bob: 0, sway: 0, headTilt: 0, stride: 0, arms: 0, reach: 0, eyesClosed: 0,
      glow: 0.3, mouth: 0, hairWind: 0.3, smile: 0.3, crouch: 0 };
    if (s === 'mesmerized') {
      Object.assign(p, { sway: Math.sin(t * 1.4) * 0.07, headTilt: 0.18 + Math.sin(t * 1.4 + 0.6) * 0.06,
        eyesClosed: 1, glow: 0, smile: 0.8, arms: 1, hairWind: 0.4, bob: Math.sin(t * 2.8) * 2 });
    } else if (s === 'idle') {
      Object.assign(p, { sway: Math.sin(t * 0.9) * 0.02, headTilt: 0.05, eyesClosed: 0.2, glow: 0.35, smile: 0.2, arms: 0.3 });
    } else if (s === 'slowWalk') {
      Object.assign(p, { lean: 0.08, glow: 0.6, smile: 0.5, hairWind: 0.6, headTilt: -0.02 });
    } else if (s === 'fastWalk') {
      Object.assign(p, { lean: 0.16, glow: 0.85, smile: 0.1, hairWind: 0.8, headTilt: -0.06, mouth: 0.2 });
    } else if (s === 'running') {
      Object.assign(p, { lean: 0.28, glow: 1, smile: 0, hairWind: 1.2, headTilt: -0.12, mouth: 0.5, reach: 0.4, crouch: 0.15 });
    } else if (s === 'attack') {
      Object.assign(p, { lean: 0.36, glow: 1.2, mouth: 1, hairWind: 1.3, headTilt: -0.15, reach: 1, crouch: 0.25 });
    } else if (s === 'capture') {
      Object.assign(p, { lean: 0.15, glow: 1.2, mouth: 0.6, hairWind: 1.1, reach: 1, smile: 0.9, crouch: 0.1 });
    }
    if (this.flinchT < 0.4) { const k = Math.sin(this.flinchT / 0.4 * Math.PI); p.lean += 0.08 * k; p.glow += 0.4 * k; p.mouth += 0.3 * k; }
    return p;
  }

  update(dt) {
    this.t += dt; this.flinchT += dt; this.stateT += dt;
    const key = this.poseFor();
    if (key !== this.poseKey) { this.prevKey = this.poseKey; this.poseKey = key; this.fade = 0; }
    this.fade = Math.min(1, this.fade + dt / (key === 'attack' || key === 'run' ? 0.12 : 0.3));
    const g = this.gait();
    const prev = this.phase;
    this.phase += g.speed * dt;
    // a foot lands every half cycle
    if (g.speed > 0 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && this.onStep) this.onStep(g.intensity);
    const target = this.targetPose();
    target.stride = g.stride;
    PAM.Rig.blend(this.pose, target, dt, this.state === 'attack' || this.state === 'running' ? 10 : 5);
  }

  /** Converts a world point into this character's local (flipped, scaled) space. */
  toLocal(q) {
    let x = q.x - this.x, y = q.y - this.y;
    if (this.override) {
      x -= this.override.dx; y -= this.override.dy;
      const c = Math.cos(-this.override.rot), s = Math.sin(-this.override.rot);
      const rx = x * c - y * s, ry = x * s + y * c; x = rx; y = ry;
    }
    return { x: -x / this.scale, y: y / this.scale };
  }
  toWorld(q) {
    let x = -q.x * this.scale, y = q.y * this.scale;
    if (this.override) {
      const c = Math.cos(this.override.rot), s = Math.sin(this.override.rot);
      const rx = x * c - y * s, ry = x * s + y * c; x = rx + this.override.dx; y = ry + this.override.dy;
    }
    return { x: this.x + x, y: this.y + y };
  }

  /** Which painted pose the current state shows ('walk' = the walk cycle). */
  poseFor() {
    switch (this.state) {
      case 'mesmerized': return 'mesmerized';
      case 'attack': return this.stateT < 0.22 ? 'run' : 'attack';
      case 'capture': return 'attack';
      default: return 'walk';
    }
  }

  draw(ctx) {
    const s = this.sprites;
    if (s.walk.every(f => f.ok) && s.mesmerized.ok && s.run.ok && s.attack.ok) this.drawSprites(ctx); else this.drawRig(ctx);
  }

  /** Walk frame for the gait phase: frame 0 / 4 = a foot landing (phase 0 / π, when onStep fires). */
  walkFrame() {
    const f = ((this.phase / Math.PI * 4) % 8 + 8) % 8, i = Math.floor(f), frac = f - i;
    // hold each frame, then cross-fade into the next during the last part of the step
    const k = Math.max(0, Math.min(1, (frac - 0.5) / 0.5));
    return { a: this.sprites.walk[i], b: this.sprites.walk[(i + 1) % 8], mix: k * k * (3 - 2 * k) };
  }

  /**
   * Bend one image point (sprite pixels): the body breathes (and sways when enchanted), hair
   * streams back and ripples in waves, and the skirt / sash flutter — more on the trailing side.
   */
  deform(sp, x, y) {
    const p = this.pose, t = this.t, clamp = (v, a, z) => Math.max(a, Math.min(z, v));
    const footY = sp.foot[1], cx = sp.foot[0], hip = sp.hip, head = sp.head;
    const h = clamp((footY - y) / footY, 0, 1);
    let dx = 0, dy = 0;
    // enchanted sway: the upper body drifts slowly side to side above planted feet
    dx += Math.sin(t * 1.3) * 9 * (p.eyesClosed || 0) * Math.pow(h, 1.5);
    // breathing
    const br = Math.sin(t * (2 + (p.glow || 0) * 2.5)) * 1.4;
    const chest = clamp(1 - Math.abs(y - (head[1] + hip) / 2) / ((hip - head[1]) / 2 + 20), 0, 1);
    dx += (x - cx) * 0.01 * br * chest; dy -= br * 1.5 * clamp((hip - y) / (hip - head[1]), 0, 1);
    // hair: everything behind the head down to the hips streams back and ripples
    const wind = 0.6 + (p.hairWind || 0.3);
    const behind = clamp((x - head[0] - 18) / 90, 0, 1) * clamp((hip + 60 - y) / 120, 0, 1);
    if (behind > 0) {
      const far = clamp((x - head[0]) / 220, 0, 1.4);
      dx += behind * (Math.sin(t * 2.7 + y * 0.028 - x * 0.012) * (3 + 7 * far) + far * 4 * (wind - 0.6)) * wind;
      dy += behind * Math.cos(t * 2.3 + x * 0.03) * (2 + 4 * far) * wind;
    }
    // skirt and sash ends: below the hips, growing toward the hem and the trailing (right) side
    const low = clamp((y - hip - 30) / 220, 0, 1) * clamp((footY - 35 - y) / 60, 0, 1);
    if (low > 0) {
      const trail = clamp((x - cx + 30) / 140, 0.2, 1.3);
      dx += low * trail * Math.sin(t * 3.4 - y * 0.024 + x * 0.012) * 6 * wind;
      dy += low * trail * Math.cos(t * 2.9 - x * 0.02) * 2.5 * wind;
    }
    return [x + dx, y + dy];
  }

  /** Painted sprites: walk cycle or pose, bent by deform(), leaning and bobbing as a whole. */
  drawSprites(ctx) {
    const p = this.pose, t = this.t, S = PAM.PhiSueaSamut.SPRITE_SCALE, set = this.sprites;
    const st = p.stride || 0;
    const lift = (p.bob || 0) + (p.crouch || 0) * 18 - Math.abs(Math.sin(this.phase)) * 7 * st;
    const leanOf = key => key === 'walk' ? -(p.lean || 0) * 0.45 : key === 'mesmerized' ? -(p.sway || 0) * 0.4 : -(p.lean || 0) * 0.15;
    const place = (key) => {
      ctx.translate(this.x, this.y);
      if (this.override) { ctx.translate(this.override.dx, this.override.dy); ctx.rotate(this.override.rot); }
      ctx.scale(this.scale, this.scale);
      ctx.translate(0, lift);
      ctx.rotate(leanOf(key));
      ctx.scale(S, S);
    };
    const drawOne = (sp, key, alpha) => {
      if (!sp || alpha <= 0.01) return;
      ctx.save(); place(key); ctx.globalAlpha *= alpha;
      ctx.translate(-sp.foot[0], -sp.foot[1]);
      PAM.SpriteMesh.draw(ctx, sp, (x, y) => this.deform(sp, x, y));
      ctx.restore();
    };
    const drawKey = (key, alpha) => {
      if (key === 'walk') { const w = this.walkFrame(); drawOne(w.a, key, alpha); drawOne(w.b, key, alpha * w.mix); }
      else drawOne(set[key], key, alpha);
    };

    // contact shadow
    ctx.save();
    ctx.translate(this.x + (this.override ? this.override.dx : 0), this.y + (this.override ? this.override.dy : 0));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(10, 4, 95 * this.scale, 15 * this.scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (this.fade < 1 && this.prevKey) drawKey(this.prevKey, 1 - this.fade);
    drawKey(this.poseKey, this.fade < 1 ? this.fade : 1);

    // world-space anchors (for music notes, sparkles and the capture)
    const cur = this.poseKey === 'walk' ? set.walk[0] : set[this.poseKey], rot = leanOf(this.poseKey);
    const toWorld = q0 => {
      const q = this.deform(cur, q0[0], q0[1]);
      let x = (q[0] - cur.foot[0]) * S, y = (q[1] - cur.foot[1]) * S;
      const c0 = Math.cos(rot), s0 = Math.sin(rot);
      [x, y] = [x * c0 - y * s0, x * s0 + y * c0 + lift];
      x *= this.scale; y *= this.scale;
      if (this.override) {
        const c = Math.cos(this.override.rot), s = Math.sin(this.override.rot);
        [x, y] = [x * c - y * s + this.override.dx, x * s + y * c + this.override.dy];
      }
      return { x: this.x + x, y: this.y + y };
    };
    this.handsWorld = toWorld(cur.hands);
    this.headWorld = toWorld(cur.head);
    this.chestWorld = toWorld(cur.chest);

    // glowing red eyes when she hunts
    const glow = Math.max(0, Math.min(1, ((p.glow || 0) - 0.45) * 1.4));
    if (glow > 0 && cur.eye && this.poseKey !== 'mesmerized') {
      const e = toWorld(cur.eye), r = 16 * this.scale;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, `rgba(255,60,60,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,40,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /** Original procedural skeletal figure (fallback while the sprites load). */
  drawRig(ctx) {
    const R = PAM.Rig, p = this.pose, t = this.t;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.override) { ctx.translate(this.override.dx, this.override.dy); ctx.rotate(this.override.rot); }
    ctx.scale(-this.scale, this.scale); // flip: she faces left

    const SKIN = '#7d8aa0', SKIN_L = '#a3afc2', SKIN_D = '#5a6479', HAIR = '#120c18', HAIR_L = '#2a1f38',
      RED = '#8e1730', RED_L = '#b8283f', RED_D = '#5e0f22', GOLD = '#d9a94e', GOLD_L = '#f6d88c';

    // ---- gait / skeleton
    const ph = this.phase, st = p.stride;
    const hipY = -196 + p.bob + p.crouch * 30 - Math.abs(Math.sin(ph)) * 8 * st;
    const hip = { x: 0, y: hipY };
    const lean = p.lean + p.sway;
    const chest = R.from(hip.x, hip.y, -Math.PI / 2 + lean, 140);
    const head = R.from(chest.x, chest.y, -Math.PI / 2 + lean + p.headTilt * 0.5, 52);
    const hAng = lean + p.headTilt;

    const foot = (off) => {
      const a = ph + off;
      return { x: Math.sin(a) * 62 * st + (off ? -10 : 14), y: -Math.max(0, Math.cos(a)) * 28 * st };
    };
    const fBack = foot(Math.PI), fFront = foot(0);
    const hipB = { x: hip.x - 10, y: hip.y }, hipF = { x: hip.x + 10, y: hip.y };
    const kneeB = R.ik(hipB.x, hipB.y, fBack.x, fBack.y - 8, 100, 100, -1);
    const kneeF = R.ik(hipF.x, hipF.y, fFront.x, fFront.y - 8, 100, 100, -1);

    // arms: mesmerized = hands near the heart, idle = down, walking = swinging, attack = reaching
    const shB = { x: chest.x - 16, y: chest.y + 10 }, shF = { x: chest.x + 14, y: chest.y + 14 };
    const swing = Math.sin(ph) * 40 * st;
    let tB = { x: shB.x - 14 - swing * 0.6, y: shB.y + 128 };
    let tF = { x: shF.x + 22 + swing * 0.6, y: shF.y + 124 };
    if (p.arms > 0) {
      const heart = { x: chest.x + 26, y: chest.y + 52 };
      tB = { x: R.lerp(tB.x, heart.x - 4, p.arms), y: R.lerp(tB.y, heart.y + 8, p.arms) };
      tF = { x: R.lerp(tF.x, heart.x + 14 + Math.sin(t * 1.4) * 6, p.arms), y: R.lerp(tF.y, heart.y - 6, p.arms) };
    }
    if (p.reach > 0) {
      const goal = this.reachTarget ? this.toLocal(this.reachTarget) : { x: shF.x + 150, y: shF.y + 10 };
      const claw = Math.sin(t * 12) * 6 * (1 - p.reach * 0.5);
      tB = { x: R.lerp(tB.x, goal.x - 8, p.reach), y: R.lerp(tB.y, goal.y - 22 + claw, p.reach) };
      tF = { x: R.lerp(tF.x, goal.x + 6, p.reach), y: R.lerp(tF.y, goal.y + 10 - claw, p.reach) };
    }
    const elB = R.ik(shB.x, shB.y, tB.x, tB.y, 76, 72, 1);
    const elF = R.ik(shF.x, shF.y, tF.x, tF.y, 76, 72, 1);

    // ---- shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 4, 90, 14, 0, 0, Math.PI * 2); ctx.fill();

    // ---- hair (behind everything), flows backward (−x in local space) with wind
    const wind = p.hairWind;
    const len = 250, back = 50 + wind * 110, wave = k => Math.sin(t * (1.5 + wind) - k * 0.8) * (5 + k * 4) * (0.4 + wind * 0.6);
    const hg = ctx.createLinearGradient(head.x, head.y, head.x - back, head.y + len);
    hg.addColorStop(0, HAIR_L); hg.addColorStop(0.5, HAIR); hg.addColorStop(1, '#07040b');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(head.x + 8, head.y - 36);
    ctx.quadraticCurveTo(head.x - 44, head.y - 44, head.x - 46, head.y);
    for (let k = 1; k <= 6; k++) ctx.lineTo(head.x - 46 - back * k / 6 - wave(k), head.y + k * len / 6 - wind * k * 14);
    for (let k = 6; k >= 1; k--) ctx.lineTo(head.x + 10 - back * k / 6 * 0.55 + wave(k + 1) * 0.6, head.y + k * len / 6 * 0.92 - wind * k * 10);
    ctx.closePath(); ctx.fill();
    // flowing strands over the mass
    for (let i = 0; i < 5; i++) {
      const baseA = { x: head.x - 30 + i * 6, y: head.y - 8 + i * 10 };
      const pts = [baseA];
      for (let k = 1; k <= 5; k++) pts.push({ x: baseA.x - back * k / 5 - wave(k + i) * 1.3 - i * 4, y: baseA.y + k * (len / 5.5) - wind * k * 12 });
      R.ribbon(ctx, pts, 7, 1, i % 2 ? HAIR : '#3a2c52');
    }

    // ---- back arm
    ctx.fillStyle = SKIN_D;
    R.capsule(ctx, shB.x, shB.y, elB.x, elB.y, 13, 10);
    R.capsule(ctx, elB.x, elB.y, elB.hx, elB.hy, 10, 7);
    this.drawHand(ctx, elB, SKIN_D, p.reach);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(R.lerp(elB.x, elB.hx, 0.85), R.lerp(elB.y, elB.hy, 0.85), 8, 0, Math.PI * 2); ctx.stroke();

    // ---- legs (skin) — the skirt covers the thighs
    ctx.fillStyle = SKIN_D;
    R.capsule(ctx, hipB.x, hipB.y, kneeB.x, kneeB.y, 17, 12);
    R.capsule(ctx, kneeB.x, kneeB.y, kneeB.hx, kneeB.hy, 11, 7);
    ctx.beginPath(); ctx.ellipse(fBack.x + 10, fBack.y - 4, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SKIN;
    R.capsule(ctx, hipF.x, hipF.y, kneeF.x, kneeF.y, 18, 13);
    R.capsule(ctx, kneeF.x, kneeF.y, kneeF.hx, kneeF.hy, 12, 7.5);
    ctx.beginPath(); ctx.ellipse(fFront.x + 10, fFront.y - 4, 19, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3.5;
    for (const k of [kneeB, kneeF]) { ctx.beginPath(); ctx.moveTo(k.hx - 9, k.hy - 16); ctx.lineTo(k.hx + 9, k.hy - 14); ctx.stroke(); }

    // ---- skirt (pha nung): long wrap from waist to calves following the knees
    const sx = Math.cos(lean), sy = Math.sin(lean);
    const T = (dx, dy) => ({ x: hip.x + dx * sx - dy * sy, y: hip.y + dx * sy + dy * sx });
    const wL = T(-34, -18), wR = T(36, -18);
    const hemB = { x: R.lerp(kneeB.x, kneeB.hx, 0.55) - 26, y: R.lerp(kneeB.y, kneeB.hy, 0.55) };
    const hemF = { x: R.lerp(kneeF.x, kneeF.hx, 0.55) + 26, y: R.lerp(kneeF.y, kneeF.hy, 0.55) };
    const sg = ctx.createLinearGradient(hip.x - 40, hip.y, hip.x + 50, hip.y + 120);
    sg.addColorStop(0, RED_D); sg.addColorStop(0.5, RED); sg.addColorStop(1, RED_L);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(wL.x, wL.y);
    ctx.lineTo(wR.x, wR.y);
    ctx.quadraticCurveTo(kneeF.x + 34, kneeF.y - 10, hemF.x, hemF.y);
    ctx.quadraticCurveTo((hemF.x + hemB.x) / 2, Math.max(hemF.y, hemB.y) + 12 + Math.sin(t * 3) * 3, hemB.x, hemB.y);
    ctx.quadraticCurveTo(kneeB.x - 34, kneeB.y - 10, wL.x, wL.y);
    ctx.fill();
    // gold hem + pleat lines
    ctx.strokeStyle = GOLD; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hemB.x, hemB.y); ctx.quadraticCurveTo((hemF.x + hemB.x) / 2, Math.max(hemF.y, hemB.y) + 12 + Math.sin(t * 3) * 3, hemF.x, hemF.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,120,0.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const top = T(-20 + i * 16, -14);
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(R.lerp(hemB.x, hemF.x, 0.2 + i * 0.2), R.lerp(hemB.y, hemF.y, 0.2 + i * 0.2) - 6); ctx.stroke();
    }
    // front hanging panel (chai wai) swaying
    const pv = Math.sin(t * 3 + ph) * 8 * (0.3 + st);
    const pt = T(4, -16);
    R.ribbon(ctx, [pt, { x: pt.x + 4 + pv * 0.4, y: pt.y + 50 }, { x: pt.x + 6 + pv, y: pt.y + 104 }], 12, 9, '#6a1024');
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.quadraticCurveTo(pt.x + 4 + pv * 0.4, pt.y + 50, pt.x + 6 + pv, pt.y + 104); ctx.stroke();

    // ---- torso
    const C = (dx, dy) => ({ x: hip.x + dx * sx - dy * sy, y: hip.y + dx * sy + dy * sx });
    const tg = ctx.createLinearGradient(hip.x - 40, 0, hip.x + 40, 0);
    tg.addColorStop(0, SKIN_D); tg.addColorStop(0.6, SKIN); tg.addColorStop(1, SKIN_L);
    ctx.fillStyle = tg;
    const c1 = C(-30, -16), c2 = C(-36, -128), c3 = C(-14, -150), c4 = C(22, -150), c5 = C(40, -126), c6 = C(32, -16);
    ctx.beginPath(); ctx.moveTo(c1.x, c1.y);
    ctx.quadraticCurveTo(C(-26, -70).x, C(-26, -70).y, c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y); ctx.lineTo(c5.x, c5.y);
    ctx.quadraticCurveTo(C(28, -70).x, C(28, -70).y, c6.x, c6.y);
    ctx.fill();
    // belt
    ctx.fillStyle = GOLD;
    const b1 = C(-33, -26), b2 = C(36, -26), b3 = C(36, -12), b4 = C(-33, -12);
    ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y); ctx.fill();
    ctx.fillStyle = '#b3162f';
    for (let i = 0; i < 4; i++) { const g = C(-22 + i * 18, -19); ctx.beginPath(); ctx.arc(g.x, g.y, 3, 0, Math.PI * 2); ctx.fill(); }
    // sabai (breast cloth) diagonal over the far shoulder
    const sg2 = ctx.createLinearGradient(c2.x, c2.y, c5.x, c5.y);
    sg2.addColorStop(0, RED_D); sg2.addColorStop(1, RED_L);
    ctx.fillStyle = sg2;
    const s1 = C(-34, -112), s2 = C(-10, -150), s3 = C(8, -146), s4 = C(40, -98), s5 = C(36, -78), s6 = C(-30, -86);
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y);
    ctx.quadraticCurveTo(C(30, -122).x, C(30, -122).y, s4.x, s4.y);
    ctx.lineTo(s5.x, s5.y); ctx.quadraticCurveTo(C(0, -78).x, C(0, -78).y, s6.x, s6.y); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s2.x, s2.y); ctx.lineTo(s1.x, s1.y); ctx.moveTo(s3.x, s3.y); ctx.quadraticCurveTo(C(30, -122).x, C(30, -122).y, s4.x, s4.y); ctx.stroke();
    // sabai tail flowing back
    const tailW = Math.sin(t * 2.2) * 10 * (0.4 + p.hairWind);
    R.ribbon(ctx, [s2, { x: s2.x - 30, y: s2.y + 30 + tailW * 0.5 }, { x: s2.x - 52 - p.hairWind * 20, y: s2.y + 80 + tailW }], 10, 5, RED_D);

    // broad gold collar (krong kho)
    const col = C(4, -150);
    ctx.save(); ctx.translate(col.x, col.y); ctx.rotate(lean);
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.ellipse(0, 4, 34, 15, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = GOLD_L;
    ctx.beginPath(); ctx.ellipse(0, 4, 26, 9, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#b3162f';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 10, 12 - Math.abs(i) * 2, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(6, 16); ctx.lineTo(0, 30); ctx.fill();
    ctx.restore();

    // ---- head
    ctx.save();
    ctx.translate(head.x, head.y); ctx.rotate(hAng);
    // neck
    ctx.fillStyle = SKIN_D; ctx.fillRect(-11, 18, 22, 30);
    // hair cap behind face
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.ellipse(-8, -2, 33, 38, 0, 0, Math.PI * 2); ctx.fill();
    // face
    const fg = ctx.createRadialGradient(8, -6, 4, 4, 0, 36);
    fg.addColorStop(0, SKIN_L); fg.addColorStop(1, SKIN_D);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-12, -26);
    ctx.quadraticCurveTo(18, -34, 28, -10);
    ctx.lineTo(31, 2); ctx.lineTo(27, 8);
    ctx.quadraticCurveTo(28, 22, 16, 30);
    ctx.quadraticCurveTo(0, 36, -12, 22);
    ctx.quadraticCurveTo(-20, -4, -12, -26);
    ctx.fill();
    // pointed ear + earring
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-30, -22); ctx.lineTo(-14, 10); ctx.fill();
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(-14, 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 18); ctx.lineTo(-18, 34); ctx.lineTo(-10, 34); ctx.fill();
    // eyes
    const glow = R.clamp(p.glow, 0, 1.5);
    ctx.lineCap = 'round';
    if (p.eyesClosed > 0.6) {
      ctx.strokeStyle = '#1c1020'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(14, -6, 6, 0.3, Math.PI - 0.3); ctx.stroke();
    } else {
      ctx.fillStyle = '#1b0d16';
      ctx.beginPath(); ctx.moveTo(6, -8); ctx.quadraticCurveTo(14, -14, 23, -8); ctx.quadraticCurveTo(14, -3, 6, -8); ctx.fill();
      ctx.save();
      ctx.shadowColor = '#ff2a3c'; ctx.shadowBlur = 10 + glow * 18;
      ctx.fillStyle = glow > 0.5 ? '#ff4a4a' : '#e6b25c';
      ctx.beginPath(); ctx.arc(16, -8, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // sharp brows (angrier with glow)
    ctx.strokeStyle = '#120a12'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(4, -17 + glow * 1); ctx.quadraticCurveTo(14, -22 + glow * 2, 26, -14 - glow * 3); ctx.stroke();
    // forehead mark (urna-like gem)
    ctx.fillStyle = '#c4213b'; ctx.beginPath(); ctx.ellipse(18, -24, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    // lips: smile when enchanted, open with fangs when hunting
    const mo = R.clamp(p.mouth, 0, 1);
    ctx.fillStyle = '#3d0f1d';
    ctx.beginPath(); ctx.moveTo(12, 16); ctx.quadraticCurveTo(19, 16 - p.smile * 3 + mo * 2, 25, 13 - p.smile * 2);
    ctx.quadraticCurveTo(19, 19 + mo * 12, 12, 16); ctx.fill();
    if (mo > 0.3) {
      ctx.fillStyle = '#efe6d8';
      ctx.beginPath(); ctx.moveTo(15, 17); ctx.lineTo(16.5, 17 + mo * 7); ctx.lineTo(18, 17); ctx.fill();
      ctx.beginPath(); ctx.moveTo(20, 16); ctx.lineTo(21.5, 16 + mo * 6); ctx.lineTo(23, 15.5); ctx.fill();
    }
    // front lock of hair over the shoulder
    R.ribbon(ctx, [{ x: -6, y: -26 }, { x: -18, y: 6 }, { x: -12 + Math.sin(t * 2) * 3, y: 40 }, { x: -18, y: 70 }], 8, 2, HAIR);

    // ---- crown (chada): tiered golden spire with ear wings (kanjiak)
    ctx.save();
    ctx.translate(2, -30);
    const cg = ctx.createLinearGradient(-30, 0, 30, -90);
    cg.addColorStop(0, '#9c6d24'); cg.addColorStop(0.5, GOLD); cg.addColorStop(1, GOLD_L);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(0, 2, 32, 10, 0, 0, Math.PI * 2); ctx.fill();               // band
    for (let i = 0; i < 4; i++) {                                                             // tiers
      const w = 28 - i * 6, y0 = -4 - i * 16;
      ctx.beginPath(); ctx.moveTo(-w, y0); ctx.quadraticCurveTo(0, y0 - 22, w, y0); ctx.lineTo(w - 3, y0 + 6); ctx.lineTo(-w + 3, y0 + 6); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-4, -64); ctx.quadraticCurveTo(2, -100, 6, -118); ctx.quadraticCurveTo(6, -90, 6, -64); ctx.fill(); // spire
    // side wing (kanjiak) behind the ear
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.quadraticCurveTo(-56, -20, -46, -56); ctx.quadraticCurveTo(-36, -24, -18, -10); ctx.fill();
    ctx.fillStyle = '#c4213b';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-12 + i * 9, 2, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(2, -34, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,190,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-22, -6); ctx.quadraticCurveTo(0, -24, 22, -6); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ---- front arm (over the body)
    ctx.fillStyle = SKIN;
    R.capsule(ctx, shF.x, shF.y, elF.x, elF.y, 14, 10.5);
    R.capsule(ctx, elF.x, elF.y, elF.hx, elF.hy, 10.5, 7.5);
    this.drawHand(ctx, elF, SKIN, p.reach);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(R.lerp(shF.x, elF.x, 0.45), R.lerp(shF.y, elF.y, 0.45), 13, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(R.lerp(elF.x, elF.hx, 0.85), R.lerp(elF.y, elF.hy, 0.85), 9, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();

    this.handsWorld = this.toWorld({ x: (elF.hx + elB.hx) / 2, y: (elF.hy + elB.hy) / 2 });
    this.headWorld = this.toWorld(head);
    this.chestWorld = this.toWorld(chest);
  }

  /** Long-nailed hand; claws open while reaching. */
  drawHand(ctx, el, color, reach) {
    const ang = Math.atan2(el.hy - el.y, el.hx - el.x);
    ctx.save();
    ctx.translate(el.hx, el.hy); ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(6, 0, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    const spread = 0.15 + reach * 0.35;
    for (let i = -2; i <= 1; i++) {
      const a = i * spread;
      ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(10, i * 2); ctx.lineTo(10 + Math.cos(a) * 14, i * 2 + Math.sin(a) * 14); ctx.stroke();
      ctx.strokeStyle = '#1a0d14'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(10 + Math.cos(a) * 14, i * 2 + Math.sin(a) * 14); ctx.lineTo(10 + Math.cos(a) * 22, i * 2 + Math.sin(a) * 22 + 2); ctx.stroke();
    }
    ctx.restore();
  }
};

/** World units per sprite pixel (before this.scale). */
PAM.PhiSueaSamut.SPRITE_SCALE = 0.72;
/**
 * Anchor points in sprite pixels: foot = ground point under the pelvis, hip = waist height,
 * head / chest / hands / eye = what effects, the music notes and the capture aim at.
 * All 8 walk frames share one canvas registered on the face, so they share their anchors.
 */
PAM.PhiSueaSamut.SPRITES = {
  walk:       { foot: [110, 633], hip: 290, head: [100, 85], chest: [110, 190], hands: [85, 335], eye: [86, 92] },
  mesmerized: { foot: [85, 625],  hip: 270, head: [65, 75],  chest: [80, 170],  hands: [55, 160] },
  run:        { foot: [160, 568], hip: 260, head: [75, 85],  chest: [110, 185], hands: [15, 180], eye: [85, 98] },
  attack:     { foot: [230, 548], hip: 250, head: [130, 80], chest: [180, 170], hands: [35, 140], eye: [110, 90] }
};
