# Cuts a character pose out of a white-background character sheet (see assets/characters/).
# How Phra Aphai's sprites were made (sheets are the supplied character art PNGs):
#   play   : -In <sheet 1> -BBox 11,11,469,1232 -Seed 250,750 -Hair 0,0,360,200 -Scale 0.484 -Erase 325,105,28,30
#   idle   : -In <sheet 2> -BBox 12,7,319,1010  -Seed 200,650 -Hair 0,0,336,170 -Scale 0.594 -Erase 275,400,30,55,262,75,22,30
#   scared : -In <sheet 2> -BBox 336,92,528,916 -Seed 606,650 -Hair 376,0,220,240 -Scale 0.634
# Keep -BBox and -Scale unchanged when re-cutting: the anchor points in PhraAphai.SPRITES depend on them.# Cut a figure out of a white-background sheet with proper edge matting.
#  -BBox  : exact output rectangle in the sheet (x,y,w,h) โ€” kept identical so sprite anchors stay valid
#  -Seed  : a point on the figure (sheet coords)
#  -Hair  : rectangle (sheet coords) where small white specks between strands are removed too
#  -Scale : final resize factor
param([string]$In, [string]$Out, [int[]]$BBox, [int[]]$Seed, [int[]]$Hair, [double]$Scale, [int[]]$Erase = @(0,0,0,0))
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Drawing.Drawing2D; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Cut2 {
  static int W, H; static byte[] px;
  static int Mn(int i) { int o = i * 4; return Math.Min(px[o], Math.Min(px[o + 1], px[o + 2])); }
  static int Sat(int i) { int o = i * 4; return Math.Max(px[o], Math.Max(px[o + 1], px[o + 2])) - Mn(i); }
  static bool Whiteish(int i, int mn, int sat) { return Mn(i) >= mn && Sat(i) <= sat; }
  static IEnumerable<int> N8(int i) { int x = i % W, y = i / W;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { if (dx == 0 && dy == 0) continue; int nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) yield return ny * W + nx; } }

  public static string Run(string inPath, string outPath, int bx, int by, int bw, int bh, int sx, int sy, int hx, int hy, int hw, int hh, double scale, int[] erase) {
    var src = new Bitmap(inPath);
    const int PAD = 6;
    int X = Math.Max(0, bx - PAD), Y = Math.Max(0, by - PAD);
    W = Math.Min(src.Width, bx + bw + PAD) - X; H = Math.Min(src.Height, by + bh + PAD) - Y;
    var crop = src.Clone(new Rectangle(X, Y, W, H), PixelFormat.Format32bppArgb);
    var d = crop.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    px = new byte[W * H * 4]; Marshal.Copy(d.Scan0, px, 0, px.Length);
    int N = W * H; var bg = new bool[N]; var q = new Queue<int>();

    // 1. background: near-white connected to the border
    for (int i = 0; i < N; i++) { int x = i % W, y = i / W; if ((x == 0 || y == 0 || x == W - 1 || y == H - 1) && Whiteish(i, 226, 24)) { bg[i] = true; q.Enqueue(i); } }
    while (q.Count > 0) { int i = q.Dequeue(); foreach (int j in N8(i)) if (!bg[j] && Whiteish(j, 226, 24)) { bg[j] = true; q.Enqueue(j); } }

    // 1b. hand-marked gaps (sheet-coord rects x,y,w,h): their light pixels are background
    for (int k = 0; k + 3 < erase.Length; k += 4)
      for (int y = Math.Max(0, erase[k + 1] - Y); y < Math.Min(H, erase[k + 1] + erase[k + 3] - Y); y++)
        for (int x = Math.Max(0, erase[k] - X); x < Math.Min(W, erase[k] + erase[k + 2] - X); x++) { int i = y * W + x; if (Whiteish(i, 200, 40)) bg[i] = true; }

    // 2. enclosed white islands: big pure-white ones anywhere; any size inside the hair box
    var seen = new bool[N]; var reg = new List<int>();
    for (int i0 = 0; i0 < N; i0++) {
      if (bg[i0] || seen[i0] || !Whiteish(i0, 215, 30)) continue;
      reg.Clear(); seen[i0] = true; q.Enqueue(i0); int pure = 0, inHair = 0;
      while (q.Count > 0) { int i = q.Dequeue(); reg.Add(i);
        if (Mn(i) >= 251 && Sat(i) <= 3) pure++;
        int x = i % W + X, y = i / W + Y; if (x >= hx && x < hx + hw && y >= hy && y < hy + hh) inHair++;
        foreach (int j in N8(i)) if (!seen[j] && !bg[j] && Whiteish(j, 215, 30)) { seen[j] = true; q.Enqueue(j); } }
      bool hair = inHair > reg.Count / 2;
      if (hair) {
        // only gaps between dark strands: the ring around the island must be dark and not skin
        // (keeps the whites of the eyes, teeth and skin highlights)
        // band: up to 3 pixels around the island
        var depth = new Dictionary<int, int>(); var bq = new Queue<int>();
        foreach (int i in reg) { depth[i] = 0; bq.Enqueue(i); }
        int ring = 0, skin = 0;
        while (bq.Count > 0) { int i = bq.Dequeue(); int dd = depth[i]; if (dd >= 3) continue;
          foreach (int j in N8(i)) { if (depth.ContainsKey(j) || bg[j]) continue; depth[j] = dd + 1; bq.Enqueue(j);
            if (Whiteish(j, 215, 30)) continue;
            int oj = j * 4, r = px[oj + 2], g = px[oj + 1], b = px[oj]; ring++;
            if (r > 150 && r > g + 12 && g > b - 5 && Mn(j) > 95) skin++; } }
        hair = ring > 0 && skin < ring * 0.15;
      }
      if ((reg.Count >= 25 && pure > reg.Count * 0.6) || (hair && reg.Count >= 2)) foreach (int i in reg) bg[i] = true;
    }

    // 3. keep only the figure (component containing the seed)
    var keep = new bool[N]; int s = (sy - Y) * W + (sx - X); if (bg[s]) return "seed on background";
    keep[s] = true; q.Enqueue(s);
    while (q.Count > 0) { int i = q.Dequeue(); foreach (int j in N8(i)) if (!keep[j] && !bg[j]) { keep[j] = true; q.Enqueue(j); } }

    // 4. distance (in pixels, 8-connected) from the background, capped
    const int BAND = 3, CAP = 8;
    var dist = new int[N]; for (int i = 0; i < N; i++) { dist[i] = keep[i] ? CAP : 0; if (!keep[i]) q.Enqueue(i); }
    while (q.Count > 0) { int i = q.Dequeue(); foreach (int j in N8(i)) if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.Enqueue(j); } }

    // 5. matting in the edge band: estimate the true colour F from nearby solid pixels and
    //    solve C = a*F + (1-a)*white for alpha, then output F with that alpha (no white left)
    var outPx = new byte[N * 4];
    for (int i = 0; i < N; i++) {
      int o = i * 4;
      if (!keep[i]) continue;
      // inside the figure: always solid, original colour (the white shirt included)
      if (dist[i] > BAND) { outPx[o] = px[o]; outPx[o + 1] = px[o + 1]; outPx[o + 2] = px[o + 2]; outPx[o + 3] = 255; continue; }
      int x = i % W, y = i / W; double fr = 0, fg = 0, fb = 0, wsum = 0;
      // F = colour of the nearby solid interior (fallback: nearby clearly non-white pixels)
      for (int pass = 0; pass < 2 && wsum == 0; pass++)
        for (int r = 2; r <= 7 && wsum < 3; r++) {
          fr = fg = fb = wsum = 0;
          for (int dy = -r; dy <= r; dy++) for (int dx = -r; dx <= r; dx++) {
            int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            int j = ny * W + nx; if (!keep[j]) continue;
            if (pass == 0 ? dist[j] <= BAND : Mn(j) >= 200) continue;
            double w = 1.0 / (1 + dx * dx + dy * dy);
            int oj = j * 4; fb += px[oj] * w; fg += px[oj + 1] * w; fr += px[oj + 2] * w; wsum += w;
          }
        }
      double cb = px[o], cg = px[o + 1], cr = px[o + 2], a;
      if (wsum > 0) {
        fb /= wsum; fg /= wsum; fr /= wsum;
        double ex = fb - 255, ey = fg - 255, ez = fr - 255, den = ex * ex + ey * ey + ez * ez;
        // a near-white surface (the shirt) can't be told apart from the backdrop: keep it, soften only the rim
        a = den < 1600 ? (dist[i] >= 2 ? 1 : 0.8) : ((cb - 255) * ex + (cg - 255) * ey + (cr - 255) * ez) / den;
      } else { fb = cb; fg = cg; fr = cr; a = Mn(i) >= 215 ? 0 : 1; }
      a = Math.Max(0, Math.Min(1, a));
      if (dist[i] <= 1) a = Math.Min(a, 0.92);                 // outermost ring is never fully hard
      if (a < 0.1) continue;
      // where the pixel is solid enough, keep its own (unmixed) colour so detail survives
      double ub = a > 0.6 ? (cb - 255 * (1 - a)) / a : fb, ug = a > 0.6 ? (cg - 255 * (1 - a)) / a : fg, ur = a > 0.6 ? (cr - 255 * (1 - a)) / a : fr;
      outPx[o] = (byte)Math.Max(0, Math.Min(255, ub)); outPx[o + 1] = (byte)Math.Max(0, Math.Min(255, ug)); outPx[o + 2] = (byte)Math.Max(0, Math.Min(255, ur)); outPx[o + 3] = (byte)(a * 255);
    }
    // 6. bleed colour into transparent neighbours so resizing never pulls in black or white
    for (int pass = 0; pass < 3; pass++) {
      var copy = (byte[])outPx.Clone();
      for (int i = 0; i < N; i++) { int o = i * 4; if (copy[o + 3] > 0 || copy[o] + copy[o + 1] + copy[o + 2] > 0) continue;
        double b = 0, g = 0, r = 0; int c = 0;
        foreach (int j in N8(i)) { int oj = j * 4; if (copy[oj + 3] > 0 || copy[oj] + copy[oj + 1] + copy[oj + 2] > 0) { b += copy[oj]; g += copy[oj + 1]; r += copy[oj + 2]; c++; } }
        if (c > 0) { outPx[o] = (byte)(b / c); outPx[o + 1] = (byte)(g / c); outPx[o + 2] = (byte)(r / c); } }
    }
    Marshal.Copy(outPx, 0, d.Scan0, outPx.Length); crop.UnlockBits(d);
    var exact = crop.Clone(new Rectangle(bx - X, by - Y, bw, bh), PixelFormat.Format32bppArgb);
    int ow = (int)Math.Round(bw * scale), oh = (int)Math.Round(bh * scale);
    var res = new Bitmap(ow, oh, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(res)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.CompositingQuality = CompositingQuality.HighQuality; g.CompositingMode = CompositingMode.SourceCopy;
      using (var ia = new ImageAttributes()) { ia.SetWrapMode(WrapMode.TileFlipXY); g.DrawImage(exact, new Rectangle(0, 0, ow, oh), 0, 0, bw, bh, GraphicsUnit.Pixel, ia); } }
    res.Save(outPath, ImageFormat.Png);
    return string.Format("{0}x{1}", ow, oh);
  }
}
'@
[Cut2]::Run($In, $Out, $BBox[0], $BBox[1], $BBox[2], $BBox[3], $Seed[0], $Seed[1], $Hair[0], $Hair[1], $Hair[2], $Hair[3], $Scale, [int[]]$Erase)
