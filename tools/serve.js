#!/usr/bin/env node
// Static server for development (Node.js). Usage: node tools/serve.js [port] [--allow-save]
// --allow-save enables POST /__save/<name> so a beat map generated in the browser (e.g. from an
// MP3, which the Node tool cannot decode) can be written to assets/beatmaps/. Off by default.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const port = +process.argv.find(a => /^\d+$/.test(a)) || 8642;
const allowSave = process.argv.includes('--allow-save');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.png': 'image/png' };
http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  if (req.method === 'POST' && rel.startsWith('__save/')) {
    const name = rel.slice(7);
    if (!allowSave || !/^[a-z0-9_]+(\.json|\.beatmap\.js|\.analysis\.json)$/.test(name)) { res.writeHead(403); return res.end('Saving disabled'); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => { fs.writeFileSync(path.join(root, 'assets/beatmaps', name), body); res.writeHead(200); res.end('saved ' + name); });
    return;
  }
  const file = path.resolve(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream', size = fs.statSync(file).size;
  // Range requests let <audio> elements seek and report a duration (menu music crossfades rely on it)
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? +m[1] : size - +m[2], end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/index.html${allowSave ? '  (beat-map saving enabled)' : ''}`));
