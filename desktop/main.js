/*
 * Desktop (Windows .exe) wrapper — Electron.
 *
 * The game is a plain web app, so the wrapper only:
 *  1. serves the game files from a private HTTP server on 127.0.0.1 (random free port), so audio
 *     decoding, range requests (menu music seeking) and fetch() behave exactly like the web build
 *  2. opens a 16:9 window without a menu bar; F11 / the in-game FULLSCREEN button toggle fullscreen
 *  3. lets audio start without waiting for a click (autoplay policy), so the menu music plays at once
 *
 * Self-test: "Phra Aphai Mani.exe" --selftest=<png path> loads the menu, saves a screenshot and a
 * small JSON report next to it, then quits (used to verify a build without clicking through it).
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// game files live next to this folder (desktop/..) both in development and inside the packaged app
const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', size = fs.statSync(file).size;
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const start = m[1] ? +m[1] : size - +m[2], end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
        if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await startServer();
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    useContentSize: true, backgroundColor: '#000000', show: false,
    title: 'Phra Aphai Mani: Rhythm of Love',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  win.setAspectRatio(16 / 9);
  win.once('ready-to-show', () => win.show());
  // F11 toggles fullscreen, like in a browser
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // links that leave the game (none by default) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${port}/`)) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${port}/index.html`);

  const selftest = (process.argv.find(a => a.startsWith('--selftest=')) || '').slice(11);
  if (selftest) {
    setTimeout(async () => {
      const report = await win.webContents.executeJavaScript(`({
        ready: document.getElementById('loadStatus').textContent,
        menu: [...document.querySelectorAll('.km-item')].map(b => b.innerText.trim()),
        menuMusic: PAM.game.menuMusic.nowPlaying, menuMusicPlaying: !!(PAM.game.menuMusic.deck && !PAM.game.menuMusic.deck.el.paused),
        audioPack: PAM.game.pack, ctx: PAM.AudioManager.ctx && PAM.AudioManager.ctx.state
      })`);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(selftest, img.toPNG());
      fs.writeFileSync(selftest.replace(/\.png$/i, '') + '.json', JSON.stringify(report, null, 1));
      app.quit();
    }, 9000);
  }
}

// one copy at a time: launching again (e.g. a second double-click while it loads) focuses the open window
// (the --selftest run skips this so a build can be checked while the game is open)
if (!process.argv.some(a => a.startsWith('--selftest=')) && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());
