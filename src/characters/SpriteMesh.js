/*
 * SpriteMesh — draws a painted sprite as a bendable triangle mesh, shared by both characters.
 *
 * The image is cut into a grid; each cell is drawn as two textured triangles whose corners are
 * moved by a deform(x, y) -> [x, y] function (image pixels in, image pixels out). Characters use
 * it to plant the feet while the body sways, breathes and nods and hair / cloth ripple.
 * Grid cells with no visible pixels are skipped.
 */
window.PAM = window.PAM || {};
PAM.SpriteMesh = {
  COLS: 8, ROWS: 16,

  /** Load an image into a sprite record {img, ok, ...def}. */
  load(src, def) {
    const img = new Image(), sp = Object.assign({ img, ok: false }, def);
    img.onload = () => { sp.ok = true; };
    img.src = src;
    return sp;
  },

  /** Grid cells of a sprite that contain visible pixels (computed once per image). */
  cells(sp) {
    if (sp.mesh) return sp.mesh;
    const W = sp.img.naturalWidth, H = sp.img.naturalHeight, cols = this.COLS, rows = this.ROWS, cells = [];
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
  },

  /** Draw sp.img (origin at its top-left, in the current transform) bent by deform. */
  draw(ctx, sp, deform) {
    const img = sp.img;
    const tri = (u0, v0, u1, v1, u2, v2) => {
      const [x0, y0] = deform(u0, v0), [x1, y1] = deform(u1, v1), [x2, y2] = deform(u2, v2);
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
    for (const [x0, y0, x1, y1] of this.cells(sp)) { tri(x0, y0, x1, y0, x1, y1); tri(x0, y0, x1, y1, x0, y1); }
  }
};
