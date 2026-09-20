'use strict';
const { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { readFlacMeta } = require('./flac-meta');

const ROOT = path.resolve(__dirname, '..');
const AUDIO_EXT = new Set(['.flac', '.mp3', '.ogg', '.oga', '.opus', '.wav', '.aiff', '.aif', '.m4a', '.aac', '.mp4', '.webm']);
const isAudio = (p) => AUDIO_EXT.has(path.extname(p).toLowerCase());

// The page and the media it plays share one origin (flaccer://app) so that
// Web Audio (EQ + spectrum analyser) is allowed to process the decoded audio.
protocol.registerSchemesAsPrivileged([{
  scheme: 'flaccer',
  privileges: { standard: true, secure: true, supportsFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true },
}]);

let win = null;
let rendererReady = false;
let shown = false;
let lastFit = null;
let saveTimer = null;
const pendingOpen = [];

const VALUE_FLAGS = new Set(['--screenshot', '--wait', '--user-data', '--state']);
const argvPaths = (argv) => argv.slice(1).filter((a, i, arr) => !a.startsWith('-') && !VALUE_FLAGS.has(arr[i - 1]) && isAudio(a) && fs.existsSync(a)).map((a) => path.resolve(a));
const flag = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
if (flag('--user-data')) app.setPath('userData', path.resolve(flag('--user-data')));

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', (_e, argv) => { queueOpen(argvPaths(argv)); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('open-file', (e, p) => { e.preventDefault(); queueOpen([p]); });

function queueOpen(paths) {
  if (!paths || !paths.length) return;
  if (win && rendererReady) win.webContents.send('open', paths);
  else pendingOpen.push(...paths);
}

const statePath = () => path.join(app.getPath('userData'), 'window.json');
function loadWinState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (e) { return {}; } }
function saveWinState() {
  if (!win) return;
  const [x, y] = win.getPosition();
  try { fs.writeFileSync(statePath(), JSON.stringify({ x, y })); } catch (e) { /* ignore */ }
}

function createWindow() {
  const st = loadWinState();
  win = new BrowserWindow({
    width: 560, height: 640,
    x: Number.isFinite(st.x) ? st.x : undefined,
    y: Number.isFinite(st.y) ? st.y : undefined,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'FLACCER',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL('flaccer://app/renderer/index.html');
  win.on('move', () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveWinState, 300); });
  win.on('closed', () => { win = null; });
  setTimeout(() => { if (win && !shown) { shown = true; win.show(); } }, 2500);
  win.webContents.on('did-finish-load', () => { if (process.argv.includes('--debug')) win.webContents.openDevTools({ mode: 'detach' }); });
  if (process.argv.includes('--debug') || flag('--screenshot')) {
    win.webContents.on('console-message', (ev) => console.log('[renderer]', ev.level, ev.message, ev.sourceId + ':' + ev.line));
    win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('[did-fail-load]', code, desc, url));
    win.webContents.on('render-process-gone', (_e, d) => console.log('[render-process-gone]', d.reason));
  }
  const shot = flag('--screenshot');
  if (shot) setTimeout(() => { if (!rendererReady) { console.log('FLACCER_DEBUG renderer never signalled ready'); takeScreenshot(shot); } }, 9000);
}

function applyFit() {
  if (!win || !lastFit) return;
  const z = win.webContents.getZoomFactor();
  const w = Math.ceil(lastFit.w * z), h = Math.ceil(lastFit.h * z);
  const [cw, ch] = win.getContentSize();
  if (cw !== w || ch !== h) win.setContentSize(w, h, false);
}

function serveFile(fp, req) {
  const headers = {};
  const range = req.headers.get('range');
  if (range) headers.range = range;
  return net.fetch(pathToFileURL(fp).href, { headers });
}

function walk(p, out, depth) {
  let st;
  try { st = fs.statSync(p); } catch (e) { return; }
  if (st.isDirectory()) {
    if (depth > 8) return;
    let names = [];
    try { names = fs.readdirSync(p).filter((n) => !n.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); } catch (e) { return; }
    for (const n of names) walk(path.join(p, n), out, depth + 1);
  } else if (st.isFile() && isAudio(p)) {
    out.push({ p, size: st.size });
  }
}

function describe({ p, size }) {
  const ext = path.extname(p).slice(1).toUpperCase();
  const name = path.basename(p, path.extname(p));
  const meta = { title: '', artist: '', album: '', sampleRate: 0, channels: 0, bitsPerSample: 0, bitrate: 0 };
  let dur = 0;
  if (ext === 'FLAC') {
    try {
      const m = readFlacMeta(p);
      if (m) {
        dur = m.duration || 0;
        meta.sampleRate = m.sampleRate || 0;
        meta.channels = m.channels || 0;
        meta.bitsPerSample = m.bitsPerSample || 0;
        meta.title = m.tags.title || '';
        meta.artist = m.tags.artist || m.tags.albumartist || '';
        meta.album = m.tags.album || '';
        if (dur) meta.bitrate = Math.round(size * 8 / dur / 1000);
      }
    } catch (e) { /* fall back to file name */ }
  }
  return { path: p, name, ext, size, dur, meta, missing: false };
}

app.whenReady().then(() => {
  protocol.handle('flaccer', (req) => {
    const u = new URL(req.url);
    if (u.hostname !== 'app') return new Response('not found', { status: 404 });
    if (u.pathname.startsWith('/media/')) {
      const p = decodeURIComponent(u.pathname.slice('/media/'.length));
      if (!path.isAbsolute(p) || !isAudio(p)) return new Response('forbidden', { status: 403 });
      return serveFile(p, req);
    }
    const rel = decodeURIComponent(u.pathname);
    if (!/^\/(renderer|node_modules)\//.test(rel)) return new Response('not found', { status: 404 });
    const fp = path.normalize(path.join(ROOT, rel));
    if (!fp.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
    return serveFile(fp, req);
  });

  ipcMain.handle('debugState', () => { try { return flag('--state') ? JSON.parse(flag('--state')) : null; } catch (e) { return null; } });
  ipcMain.handle('template', () => fs.readFileSync(path.join(ROOT, 'renderer', 'template.html'), 'utf8'));
  ipcMain.handle('dialog:open', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Open audio files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXT].map((e) => e.slice(1)) }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open folder', properties: ['openDirectory', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:relink', async (_e, name) => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Locate "' + name + '"',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXT].map((e) => e.slice(1)) }],
    });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('scan', (_e, paths) => {
    const found = [];
    for (const p of paths || []) if (typeof p === 'string' && p) walk(p, found, 0);
    return found.map(describe);
  });
  ipcMain.handle('exists', (_e, paths) => (paths || []).map((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }));
  ipcMain.on('fit', (_e, { w, h }) => {
    lastFit = { w, h };
    applyFit();
    if (win && !shown) { shown = true; win.show(); }
  });
  ipcMain.on('zoom', (_e, z) => { if (win) { win.webContents.setZoomFactor(z); applyFit(); } });
  ipcMain.on('pin', (_e, f) => { if (win) win.setAlwaysOnTop(!!f, 'floating'); });
  ipcMain.on('ready', () => {
    rendererReady = true;
    queueOpen([...pendingOpen.splice(0), ...argvPaths(process.argv)]);
    const shot = flag('--screenshot');
    if (shot) setTimeout(() => takeScreenshot(shot), Number(flag('--wait') || 2500));
  });

  buildMenu();
  createWindow();
});

async function takeScreenshot(file) {
  try {
    const img = await win.capturePage();
    fs.writeFileSync(file, img.toPNG());
    const dbg = await win.webContents.executeJavaScript('window.__flaccerDebug ? window.__flaccerDebug() : null');
    console.log('FLACCER_DEBUG ' + JSON.stringify(dbg));
  } catch (e) { console.error('screenshot failed', e); }
  app.quit();
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', saveWinState);

function send(id) { if (win) win.webContents.send('menu', id); }

function buildMenu() {
  const themes = [['classic', 'Classic blue/silver'], ['graphite', 'Dark graphite'], ['lcd', 'Green LCD'], ['amber', 'Amber']];
  const template = [
    { label: 'FLACCER', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      { label: 'Open Files…', accelerator: 'Cmd+O', click: () => send('open') },
      { label: 'Open Folder…', accelerator: 'Shift+Cmd+O', click: () => send('openFolder') },
      { type: 'separator' },
      { label: 'Remove Selected', accelerator: 'Backspace', click: () => send('removeSel') },
      { label: 'Clear Playlist', click: () => send('clear') },
    ] },
    { label: 'Play', submenu: [
      { label: 'Play / Pause', accelerator: 'Cmd+P', click: () => send('playPause') },
      { label: 'Stop', accelerator: 'Cmd+.', click: () => send('stop') },
      { label: 'Previous', accelerator: 'Cmd+Left', click: () => send('prev') },
      { label: 'Next', accelerator: 'Cmd+Right', click: () => send('next') },
      { type: 'separator' },
      { label: 'Shuffle', accelerator: 'Cmd+Shift+S', click: () => send('shuffle') },
      { label: 'Repeat', accelerator: 'Cmd+Shift+R', click: () => send('repeat') },
      { type: 'separator' },
      { label: 'Volume Up', accelerator: 'Cmd+Up', click: () => send('volUp') },
      { label: 'Volume Down', accelerator: 'Cmd+Down', click: () => send('volDown') },
    ] },
    { label: 'View', submenu: [
      { label: 'Compact Mode', accelerator: 'Cmd+Shift+M', click: () => send('shade') },
      { label: 'Double Size', accelerator: 'Cmd+D', click: () => send('dbl') },
      { type: 'separator' },
      { label: 'Equalizer Panel', accelerator: 'Cmd+E', click: () => send('eq') },
      { label: 'Playlist Panel', accelerator: 'Cmd+L', click: () => send('pl') },
      { label: 'Options', click: () => send('options') },
      { type: 'separator' },
      { label: 'Color Theme', submenu: themes.map(([k, l]) => ({ label: l, click: () => send('theme:' + k) })) },
      { label: 'Window Chrome', submenu: [{ label: 'Classic', click: () => send('chrome:classic') }, { label: 'macOS', click: () => send('chrome:mac') }] },
      { type: 'separator' },
      { label: 'Always On Top', accelerator: 'Cmd+T', click: () => send('pin') },
      { type: 'separator' },
      { role: 'toggleDevTools' },
    ] },
    { role: 'window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    { role: 'help', submenu: [{ label: 'Reveal Current Track in Finder', click: () => send('reveal') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on('reveal', (_e, p) => { if (p) shell.showItemInFolder(p); });
