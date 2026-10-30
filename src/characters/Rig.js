/*
 * Rig — tiny 2D skeletal-animation toolkit shared by both characters.
 *  - poses are flat objects of numbers; Rig.blend eases the current pose toward a target,
 *    which gives smooth transitions between animation states
 *  - Rig.ik solves a two-bone limb (shoulder -> elbow -> hand) so hands can hold the flute
 *    or reach for a target in world space
 *  - Rig.limb draws a tapered two-segment limb
 */
window.PAM = window.PAM || {};
PAM.Rig = {
  blend(current, target, dt, speed) {
    const k = 1 - Math.exp(-speed * dt);
    for (const key in target) {
      if (current[key] === undefined) current[key] = target[key];
      else current[key] += (target[key] - current[key]) * k;
    }
    return current;
  },

  /** Two-bone IK. Returns the elbow position. bend = +1 / -1 picks the elbow side. */
  ik(ax, ay, tx, ty, l1, l2, bend) {
    let dx = tx - ax, dy = ty - ay;
    let d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 0.01;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d || 1))));
    const base = Math.atan2(dy, dx) + a * bend;
    return { x: ax + Math.cos(base) * l1, y: ay + Math.sin(base) * l1, hx: ax + dx, hy: ay + dy };
  },

  /** Point at angle/length from (x, y). Angle 0 = +x, PI/2 = down. */
  from(x, y, angle, len) { return { x: x + Math.cos(angle) * len, y: y + Math.sin(angle) * len }; },

  limb(ctx, a, b, c, w1, w2, w3, fill) {
    ctx.fillStyle = fill;
    this.capsule(ctx, a.x, a.y, b.x, b.y, w1, w2);
    this.capsule(ctx, b.x, b.y, c.x, c.y, w2, w3);
  },

  capsule(ctx, x1, y1, x2, y2, r1, r2) {
    const ang = Math.atan2(y2 - y1, x2 - x1), n = ang + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(n) * r1, y1 + Math.sin(n) * r1);
    ctx.lineTo(x2 + Math.cos(n) * r2, y2 + Math.sin(n) * r2);
    ctx.arc(x2, y2, r2, n, n + Math.PI, true);
    ctx.lineTo(x1 - Math.cos(n) * r1, y1 - Math.sin(n) * r1);
    ctx.arc(x1, y1, r1, n + Math.PI, n, true);
    ctx.closePath();
    ctx.fill();
  },

  /** Smooth flowing strand (hair, scarf). pts: array of {x,y}. */
  ribbon(ctx, pts, w0, w1, fill) {
    if (pts.length < 2) return;
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const ang = Math.atan2(q.y - o.y, q.x - o.x) + Math.PI / 2;
      const w = w0 + (w1 - w0) * (i / (pts.length - 1));
      left.push({ x: p.x + Math.cos(ang) * w, y: p.y + Math.sin(ang) * w });
      right.push({ x: p.x - Math.cos(ang) * w, y: p.y - Math.sin(ang) * w });
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) {
      const m = { x: (left[i - 1].x + left[i].x) / 2, y: (left[i - 1].y + left[i].y) / 2 };
      ctx.quadraticCurveTo(left[i - 1].x, left[i - 1].y, m.x, m.y);
    }
    ctx.lineTo(left[left.length - 1].x, left[left.length - 1].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();
  },

  lerp(a, b, t) { return a + (b - a) * t; },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
};
