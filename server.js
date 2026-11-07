'use strict';
// Server di gioco: nessuna dipendenza, serve solo Node.js.
//   node server.js        (porta 3000)
//   PORT=8080 node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Game, GameError } = require('./game');
let DATA;
try { DATA = require('./public/shared/data.js'); } catch (e) { DATA = require('./data.js'); }
const { TITLE } = DATA;

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// ---------- stato ----------
let game = new Game();
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (saved && saved.status && saved.status !== 'ended') {
      game = Game.fromJSON(saved);
      console.log(`Partita ripresa dal salvataggio (${game.players.length} giocatori, stato: ${game.status}).`);
    }
  }
} catch (e) {
  console.log('Salvataggio non leggibile, parto da zero.', e.message);
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(game));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.log('Impossibile salvare:', e.message); }
  }, 150);
}

// ---------- client collegati (Server-Sent Events) ----------
const clients = new Set(); // { res, pid|null }
function connectedIds() {
  const s = new Set();
  for (const c of clients) if (c.pid) s.add(c.pid);
  return s;
}
function push(c, connected) {
  try { c.res.write('data: ' + JSON.stringify(game.view(c.pid, connected)) + '\n\n'); } catch (e) { /* chiuso */ }
}
function broadcast() {
  const connected = connectedIds();
  for (const c of clients) push(c, connected);
  save();
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch (e) { /* */ } } }, 15000);

// ---------- rete locale ----------
function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  // gli indirizzi "da casa" (192.168.x.x, 10.x.x.x) vanno per primi
  const score = (a) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : a.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}

// ---------- HTTP ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 20000) { reject(new Error('troppo grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function handleApi(req, res, url) {
  const route = url.pathname;
  if (req.method === 'GET' && route === '/api/info') {
    return json(res, 200, { title: TITLE, port: PORT, addresses: lanAddresses() });
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Metodo non valido' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: 'Richiesta non valida' }); }

  if (route === '/api/join') {
    const existing = game.byToken(body.token);
    if (existing) return json(res, 200, { ok: true, token: existing.token, id: existing.id });
    try {
      const p = game.join(body.name, body.emoji);
      broadcast();
      return json(res, 200, { ok: true, token: p.token, id: p.id });
    } catch (e) {
      if (e instanceof GameError) return json(res, 200, { ok: false, error: e.message });
      throw e;
    }
  }
  if (route === '/api/claim') {
    // riprendi un giocatore rimasto senza telefono (solo se in questo momento non è collegato)
    const p = game.player(body.id);
    if (!p || p.bankrupt) return json(res, 200, { ok: false, error: 'Giocatore non trovato' });
    if (connectedIds().has(p.id)) return json(res, 200, { ok: false, error: 'Questo giocatore è già collegato da un altro telefono.' });
    return json(res, 200, { ok: true, token: p.token, id: p.id });
  }
  if (route === '/api/act') {
    const p = game.byToken(body.token);
    if (!p) return json(res, 200, { ok: false, error: 'Sessione scaduta: ricarica la pagina.' });
    const r = game.act(p.id, body);
    broadcast();
    return json(res, 200, r);
  }
  if (route === '/api/board') {
    if (body.type === 'reset') {
      game = new Game();
      broadcast();
      return json(res, 200, { ok: true });
    }
    const r = game.admin(body);
    broadcast();
    return json(res, 200, r);
  }
  return json(res, 404, { ok: false, error: 'Non trovato' });
}

// File pubblici ammessi quando tutto sta nella stessa cartella (senza sottocartelle)
const FLAT_OK = new Set(['index.html', 'board.html', 'board.css', 'board.js', 'play.html', 'play.css', 'play.js', 'data.js', 'qrcode.js']);

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (p === '/board') p = '/board.html';
  if (p === '/play') p = '/play.html';
  const candidates = [path.normalize(path.join(PUBLIC, p))];
  const base = path.basename(p);
  if (FLAT_OK.has(base)) candidates.push(path.join(__dirname, base)); // struttura "piatta"
  const tryNext = (i) => {
    if (i >= candidates.length) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Non trovato'); }
    const file = candidates[i];
    if (i === 0 && !file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Vietato'); }
    fs.readFile(file, (err, buf) => {
      if (err) return tryNext(i + 1);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
    });
  };
  tryNext(0);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/events') {
    const token = url.searchParams.get('token');
    const role = url.searchParams.get('role');
    const player = token ? game.byToken(token) : null;
    if (token && !player) { res.writeHead(401); return res.end('sessione scaduta'); }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1500\n\n');
    const c = { res, pid: player ? player.id : null, role };
    clients.add(c);
    push(c, connectedIds());
    if (player) broadcast(); // gli altri vedono che sei collegato
    req.on('close', () => { clients.delete(c); if (c.pid) broadcast(); });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'Errore del server' });
    });
    return;
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ${TITLE} è pronto!\n`);
  console.log('  Sull\'iPad (il tabellone) apri:');
  const addrs = lanAddresses();
  if (addrs.length) addrs.forEach((a, i) => console.log(`     http://${a}:${PORT}/board${i === 0 ? '   <-- di solito è questo' : ''}`));
  else console.log(`     http://localhost:${PORT}/board`);
  console.log('\n  Le amiche scansionano il QR code che compare sul tabellone.');
  console.log('  Per fermare il gioco premi Ctrl+C.\n');
});

const bye = () => { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(game)); } catch (e) { /* */ } process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
