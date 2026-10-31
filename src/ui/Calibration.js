/*
 * Calibration — measures the player's average input offset against an audible metronome.
 * Clicks are scheduled on the AudioContext clock; taps are converted to the same audible clock
 * (AudioManager.ctxTimeAtPerf), so the result already includes output latency compensation.
 * The first 4 clicks are a lead-in; taps on the remaining 12 are averaged (outliers dropped).
 */
window.PAM = window.PAM || {};
PAM.Calibration = class Calibration {
  constructor(ui, onDone) {
    this.ui = ui; this.onDone = onDone;
    this.active = false; this.result = null;
    this.beats = []; this.taps = [];
    ui.$('btnCalibStart').addEventListener('click', () => this.start());
    ui.$('btnCalibApply').addEventListener('click', () => { if (this.result !== null) this.onDone(this.result); });
  }

  open(currentMs) {
    this.stop();
    this.result = null;
    this.ui.$('btnCalibApply').disabled = true;
    this.ui.$('calibCount').textContent = '—';
    this.ui.$('calibResult').textContent = `Current offset: ${currentMs > 0 ? '+' : ''}${currentMs} ms`;
  }

  async start() {
    const AM = PAM.AudioManager;
    await AM.resume();
    const ctx = AM.ctx;
    this.stop();
    this.active = true; this.taps = []; this.beats = [];
    const interval = 0.6, t0 = ctx.currentTime + 0.6;
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * interval;
      this.beats.push(t);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i % 4 === 0 ? 1320 : 990;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.1);
    }
    this.ui.$('btnCalibApply').disabled = true;
    const tick = () => {
      if (!this.active) return;
      const now = AM.ctxTimeAtPerf(performance.now());
      const idx = this.beats.findIndex(b => Math.abs(now - b) < 0.06);
      this.ui.$('calibPulse').classList.toggle('on', idx >= 0);
      const passed = this.beats.filter(b => b <= now).length;
      this.ui.$('calibCount').textContent = passed < 4 ? `${4 - passed}…` : `${passed - 4}/12`;
      if (now > this.beats[this.beats.length - 1] + 0.5) this.finish();
      else this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  tap(eventTime) {
    if (!this.active) return;
    const t = PAM.AudioManager.ctxTimeAtPerf(eventTime);
    const scored = this.beats.slice(4);
    let best = null;
    for (const b of scored) if (best === null || Math.abs(t - b) < Math.abs(t - best)) best = b;
    if (best !== null && Math.abs(t - best) < 0.3) this.taps.push(t - best);
  }

  finish() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.ui.$('calibPulse').classList.remove('on');
    if (this.taps.length < 6) {
      this.ui.$('calibResult').textContent = `Only ${this.taps.length} taps counted. Please try again.`;
      return;
    }
    const sorted = this.taps.slice().sort((a, b) => a - b);
    const trimmed = sorted.slice(Math.floor(sorted.length * 0.2), Math.ceil(sorted.length * 0.8));
    const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    this.result = Math.round(mean * 1000);
    this.ui.$('calibCount').textContent = (this.result > 0 ? '+' : '') + this.result + ' ms';
    this.ui.$('calibResult').textContent = `On average you press ${Math.abs(this.result)} ms ${this.result > 0 ? 'late' : 'early'} (${this.taps.length} taps). Press APPLY to save it.`;
    this.ui.$('btnCalibApply').disabled = false;
  }

  stop() { this.active = false; cancelAnimationFrame(this.raf); }
};
