# Splits an animation strip with a TRANSPARENT background into separate frame PNGs.
# Each frame = one large opaque island plus the loose bits (hair wisps) closest to it. All frames are
# written on the same canvas size, registered on the head (horizontally) and the sheet row (vertically),
# so playing them in order keeps the character in place.
#   -Frames 8 -Out <dir> -Prefix walk_  ->  walk_0.png … walk_7.png, and prints the canvas size and
#   where the sheet row's ground line falls on that canvas.
param([string]$In, [string]$Out, [string]$Prefix, [int]$Frames, [double]$Scale = 1.0)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Drawing.Drawing2D; using System.Collections.Generic; using System.Linq; using System.Runtime.InteropServices;
public static class Split {
  public static string Run(string inPath, string outDir, string prefix, int frames, double scale) {
    var src = new Bitmap(inPath); int W = src.Width, H = src.Height;
    var bmp = src.Clone(new Rectangle(0, 0, W, H), PixelFormat.Format32bppArgb);
    var d = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    var px = new byte[W * H * 4]; Marshal.Copy(d.Scan0, px, 0, px.Length); bmp.UnlockBits(d);
    int N = W * H; var lab = new int[N]; for (int i = 0; i < N; i++) lab[i] = px[i * 4 + 3] > 10 ? 0 : -1;
    var comps = new List<int[]>(); // [count, minX, minY, maxX, maxY, sumX]
    var q = new Queue<int>(); int next = 1;
    for (int i0 = 0; i0 < N; i0++) { if (lab[i0] != 0) continue; lab[i0] = next; q.Enqueue(i0); int[] c = { 0, W, H, 0, 0, 0 };
      while (q.Count > 0) { int i = q.Dequeue(), x = i % W, y = i / W; c[0]++; c[1] = Math.Min(c[1], x); c[2] = Math.Min(c[2], y); c[3] = Math.Max(c[3], x); c[4] = Math.Max(c[4], y); c[5] += x;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; int j = ny * W + nx; if (lab[j] == 0) { lab[j] = next; q.Enqueue(j); } } }
      comps.Add(c); next++; }
    // the N biggest islands are the frames, ordered left to right
    var order = Enumerable.Range(0, comps.Count).OrderByDescending(k => comps[k][0]).Take(frames).OrderBy(k => comps[k][5] / (double)comps[k][0]).ToList();
    if (order.Count < frames) return "found only " + order.Count + " frames";
    var owner = new int[comps.Count]; for (int k = 0; k < comps.Count; k++) owner[k] = -1;
    for (int f = 0; f < frames; f++) owner[order[f]] = f;
    for (int k = 0; k < comps.Count; k++) { if (owner[k] >= 0) continue;
      double cx = comps[k][5] / (double)comps[k][0], cy = (comps[k][2] + comps[k][4]) / 2.0, best = 1e9;
      for (int f = 0; f < frames; f++) { var c = comps[order[f]];
        double dx = cx < c[1] ? c[1] - cx : cx > c[3] ? cx - c[3] : 0, dy = cy < c[2] ? c[2] - cy : cy > c[4] ? cy - c[4] : 0, dd = dx * dx + dy * dy;
        if (dd < best) { best = dd; owner[k] = f; } }
      if (best > 60 * 60) owner[k] = -2; }               // far stray specks are dropped
    // per frame: bounding box and head x (mean x of the top 90 opaque rows)
    var bb = new int[frames][]; var headX = new double[frames];
    for (int f = 0; f < frames; f++) bb[f] = new[] { W, H, 0, 0 };
    for (int i = 0; i < N; i++) { if (lab[i] <= 0) continue; int f = owner[lab[i] - 1]; if (f < 0) continue; int x = i % W, y = i / W;
      bb[f][0] = Math.Min(bb[f][0], x); bb[f][1] = Math.Min(bb[f][1], y); bb[f][2] = Math.Max(bb[f][2], x); bb[f][3] = Math.Max(bb[f][3], y); }
    // head reference = the front edge of the face (leftmost opaque pixel in the face rows), which
    // stays put through a cycle while the hair behind it changes from frame to frame
    for (int f = 0; f < frames; f++) { double s = 0; int n = 0;
      for (int y = bb[f][1] + 50; y < bb[f][1] + 110; y++) for (int x = bb[f][0]; x <= bb[f][2]; x++) { int i = y * W + x; if (lab[i] > 0 && owner[lab[i] - 1] == f) { s += x; n++; break; } }
      headX[f] = s / Math.Max(1, n); }
    int left = 0, right = 0; for (int f = 0; f < frames; f++) { left = Math.Max(left, (int)Math.Ceiling(headX[f] - bb[f][0])); right = Math.Max(right, (int)Math.Ceiling(bb[f][2] - headX[f])); }
    int top = bb.Min(b => b[1]), bottom = bb.Max(b => b[3]);
    int CW = left + right + 4, CH = bottom - top + 3;
    var info = new List<string>();
    for (int f = 0; f < frames; f++) {
      var fr = new Bitmap(CW, CH, PixelFormat.Format32bppArgb);
      var fd = fr.LockBits(new Rectangle(0, 0, CW, CH), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      var op = new byte[CW * CH * 4]; int ox = (int)Math.Round(left + 2 - headX[f]), oy = 1 - top;
      for (int y = bb[f][1]; y <= bb[f][3]; y++) for (int x = bb[f][0]; x <= bb[f][2]; x++) { int i = y * W + x; if (lab[i] <= 0 || owner[lab[i] - 1] != f) continue;
        int tx = x + ox, ty = y + oy; if (tx < 0 || ty < 0 || tx >= CW || ty >= CH) continue; Array.Copy(px, i * 4, op, (ty * CW + tx) * 4, 4); }
      Marshal.Copy(op, 0, fd.Scan0, op.Length); fr.UnlockBits(fd);
      Bitmap outB = fr;
      if (scale != 1.0) { int ow = (int)Math.Round(CW * scale), oh = (int)Math.Round(CH * scale); outB = new Bitmap(ow, oh, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outB)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.CompositingMode = CompositingMode.SourceCopy; g.DrawImage(fr, 0, 0, ow, oh); } }
      outB.Save(System.IO.Path.Combine(outDir, prefix + f + ".png"), ImageFormat.Png);
      info.Add(string.Format("{0}{1}: feet bottom y={2}", prefix, f, (int)Math.Round((bb[f][3] + oy) * scale)));
    }
    return string.Format("canvas {0}x{1} (head x={2})\n", (int)Math.Round(CW * scale), (int)Math.Round(CH * scale), (int)Math.Round((left + 2) * scale)) + string.Join("\n", info);
  }
}
'@
[Split]::Run($In, $Out, $Prefix, $Frames, $Scale)
