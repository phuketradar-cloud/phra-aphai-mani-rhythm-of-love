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
  res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/index.html${allowSave ? '  (beat-map saving enabled)' : ''}`));
