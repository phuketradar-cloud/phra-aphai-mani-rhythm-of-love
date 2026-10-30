/*
 * PursuitController — the distance between Phi Suea Samut and Phra Aphai Mani.
 *
 * pursuitDistance: 1.0 = her starting point, 0 = caught.
 * She only moves because of the player's performance:
 *   - every miss queues a visible step (bigger with consecutive misses) and gives her
 *     "chase momentum" for a moment, during which she keeps approaching at a speed that
 *     grows with the consecutive-miss count (walk -> fast walk -> run)
 *   - every hit pushes her back a little and feeds the spell meter
 *   - while the spell is strong and the combo is alive she drifts back, mesmerized
 */
window.PAM = window.PAM || {};
PAM.PursuitController = class PursuitController {
  constructor() { this.reset(PAM.Config.DIFFICULTIES.normal); }

  reset(difficulty) {
    const P = PAM.Config.pursuit;
    this.P = P;
    this.D = difficulty;
    this.pursuitDistance = P.startDistance;
    this.spell = 0.5;
    this.missStreak = 0;
    this.combo = 0;
    this.pendingStep = 0;      // distance still to be covered by the current step(s)
    this.stepRate = 0;
    this.chaseTimer = 0;
    this.velocity = 0;         // signed distance/sec this frame (negative = approaching)
    this.caught = false;
    this.mood = 'mesmerized';  // drives the giantess animation state
  }

  static pick(arr, i) { return arr[Math.min(i, arr.length - 1)]; }

  onHit(judgement) {
    const P = this.P, D = this.D;
    this.missStreak = 0;
    this.combo++;
    this.chaseTimer = 0;
    this.pendingStep *= 0.3;   // a good note interrupts a step in progress
    this.pursuitDistance = Math.min(P.maxDistance, this.pursuitDistance + P.hitRecover[judgement] * D.recoverScale);
    this.spell = Math.min(1, this.spell + P.spellGain[judgement] * D.recoverScale);
  }

  onMiss() {
    const P = this.P, D = this.D;
    this.missStreak++;
    this.combo = 0;
    const step = PursuitController.pick(P.stepOnMiss, this.missStreak) * D.stepScale;
    this.pendingStep += step;
    this.stepRate = this.pendingStep / P.stepDuration;
    this.chaseTimer = P.chaseMomentum;
    this.spell = Math.max(0, this.spell - P.spellLossOnMiss * D.spellLossScale);
  }

  update(dt) {
    if (this.caught) { this.velocity = 0; return; }
    const P = this.P, D = this.D;
    const before = this.pursuitDistance;

    if (this.pendingStep > 0) {
      const d = Math.min(this.pendingStep, this.stepRate * dt);
      this.pendingStep -= d; this.pursuitDistance -= d;
    }
    if (this.chaseTimer > 0) {
      this.chaseTimer -= dt;
      this.pursuitDistance -= PursuitController.pick(P.chaseSpeed, this.missStreak) * D.chaseScale * dt;
    } else if (this.combo >= P.recoverComboMin && this.spell >= P.mesmerizedThreshold) {
      this.pursuitDistance = Math.min(P.maxDistance, this.pursuitDistance + P.mesmerizedRetreat * D.recoverScale * this.spell * dt);
    }
    this.spell = Math.max(0, this.spell - P.spellDecay * dt);

    if (this.pursuitDistance <= 0) { this.pursuitDistance = 0; this.caught = true; }
    this.velocity = (this.pursuitDistance - before) / Math.max(dt, 1e-4);
    this.mood = this.computeMood();
  }

  get approaching() { return this.pendingStep > 0.0005 || this.chaseTimer > 0; }
  /** 0 = safe, 1 = caught. */
  get danger() { return 1 - this.pursuitDistance / this.P.maxDistance; }

  computeMood() {
    if (this.caught) return 'capture';
    if (this.pursuitDistance < this.P.attackDistance && this.approaching) return 'attack';
    if (this.approaching) {
      if (this.missStreak >= 4) return 'running';
      if (this.missStreak >= 3) return 'fastWalk';
      return 'slowWalk';
    }
    return this.spell >= this.P.mesmerizedThreshold ? 'mesmerized' : 'idle';
  }

  /** Human-readable status for the HUD. */
  get status() {
    switch (this.mood) {
      case 'mesmerized': return { th: 'นางยักษ์ต้องมนตร์เสียงขลุ่ย', en: 'MESMERIZED', level: 0 };
      case 'idle': return { th: 'นางยักษ์หยุดฟัง…', en: 'LISTENING', level: 1 };
      case 'slowWalk': return { th: 'นางยักษ์ก้าวเข้ามา', en: 'APPROACHING', level: 2 };
      case 'fastWalk': return { th: 'นางยักษ์เร่งฝีเท้า!', en: 'HUNTING', level: 3 };
      case 'running': return { th: 'นางยักษ์วิ่งไล่!', en: 'CHARGING', level: 4 };
      case 'attack': return { th: 'นางยักษ์เอื้อมมือคว้า!!', en: 'REACHING', level: 5 };
      default: return { th: 'ถูกจับแล้ว', en: 'CAUGHT', level: 5 };
    }
  }
};
