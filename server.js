'use strict';
// Server di "Misteri al Collegio": nessuna dipendenza, serve solo Node.js.
//   node server.js        (porta 3000)
//   PORT=8080 node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Game, GameError } = require('./game');
const { TITLE } = require('./data.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// ---------- stato e salvataggio ----------
// Salvataggio: sempre su file; in più, se configurato, su Upstash Redis (gratis) così la partita
// sopravvive ai riavvii di Render. Servono due variabili d'ambiente: UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.
const REMOTE_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REMOTE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REMOTE_KEY = 'collegio:state';
const remoteOn = !!(REMOTE_URL && REMOTE_TOKEN);
let lastSaveOk = null;

async function remote(cmd, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 4000);
  try {
    const r = await fetch(REMOTE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + REMOTE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: ctl.signal });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  } finally { clearTimeout(t); }
}

let game = new Game();
function adopt(saved, from) {
  if (saved && saved.status && saved.status !== 'ended') {
    game = Game.fromJSON(saved);
    console.log(`Partita ripresa (${from}): ${game.players.length} giocatrici, stato ${game.status}.`);
    return true;
  }
  return false;
}
async function loadState() {
  let got = false;
  if (remoteOn) {
    try {
      const raw = await remote(['GET', REMOTE_KEY], 5000);
      if (raw) got = adopt(JSON.parse(raw), 'cloud');
    } catch (e) { console.log('Cloud non raggiungibile all\'avvio:', e.message); }
  }
  if (!got) {
    try { if (fs.existsSync(DATA_FILE)) got = adopt(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), 'file'); } catch (e) { console.log('Salvataggio su file non leggibile.', e.message); }
  }
  if (!got) console.log('Nessuna partita da riprendere: si parte da zero.');
}

function writeFileState(txt) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, txt);
    fs.renameSync(tmp, DATA_FILE);
    return true;
  } catch (e) { console.log('Impossibile salvare su file:', e.message); return false; }
}
let saveTimer = null, saving = false, dirty = false;
async function flush() {
  if (saving) { dirty = true; return; }
  saving = true;
  try {
    const txt = JSON.stringify(game);
    const f = writeFileState(txt);
    let r = true;
    if (remoteOn) { try { await remote(['SET', REMOTE_KEY, txt]); } catch (e) { r = false; console.log('Salvataggio cloud fallito:', e.message); } }
    lastSaveOk = { at: Date.now(), cloud: remoteOn ? r : null, file: f };
  } finally { saving = false; if (dirty) { dirty = false; flush(); } }
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }

// ---------- client collegati (Server-Sent Events) ----------
const clients = new Set(); // { res, pid|null }
function connectedIds() {
  const s = new Set();
  for (const c of clients) if (c.pid) s.add(c.pid);
  return s;
}
function push(c, connected) {
  try {
    const v = game.view(c.pid, connected);
    c.res.write('data: ' + JSON.stringify(v) + '\n\n');
  } catch (e) { /* chiuso */ }
}

function broadcast() {
  const connected = connectedIds();
  for (const c of clients) push(c, connected);
  save();
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch (e) { /* */ } } }, 15000);
// il coprifuoco scatta da solo
setInterval(() => { if (game.tick()) broadcast(); }, 3000);

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
    return json(res, 200, { title: TITLE, port: PORT, addresses: lanAddresses(), persist: remoteOn ? (lastSaveOk && lastSaveOk.cloud === false ? 'cloud-error' : 'cloud') : 'file' });
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Metodo non valido' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: 'Richiesta non valida' }); }

  if (route === '/api/join') {
    const existing = game.byToken(body.token);
    if (existing) return json(res, 200, { ok: true, token: existing.token, id: existing.id });
    try {
      const p = game.join(body.name);
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
    if (!p) return json(res, 200, { ok: false, error: 'Giocatore non trovato' });
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
const FLAT_OK = new Set(['index.html','index.html', 'board.html', 'board.css', 'board.js', 'play.html', 'play.css', 'play.js', 'data.js', 'qrcode.js', 'mapview.js', 'ui.js', 'ui.css']);

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (p === '/board') p = '/board.html';
  if (p === '/play') p = '/play.html';
  const candidates = [];
  const base = path.basename(p);
  if (FLAT_OK.has(base)) candidates.push(path.join(__dirname, base));
  const tryNext = (i) => {
    if (i >= candidates.length) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Non trovato'); }
    const file = candidates[i];
    if (false) { res.writeHead(403); return res.end('Vietato'); }
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
    try { req.socket.setNoDelay(true); } catch (e) { /* */ }
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

async function main() {
  await loadState();
  server.listen(PORT, '0.0.0.0', onListen);
}
function onListen() {
  console.log(`\n  ${TITLE} è pronto!\n`);
  console.log('  Sull\'iPad (il tabellone) apri:');
  const addrs = lanAddresses();
  if (addrs.length) addrs.forEach((a, i) => console.log(`     http://${a}:${PORT}/board${i === 0 ? '   <-- di solito è questo' : ''}`));
  else console.log(`     http://localhost:${PORT}/board`);
  console.log('\n  Le amiche scansionano il QR code che compare sul tabellone.');
  console.log('  Per fermare il gioco premi Ctrl+C.\n');
  if (!remoteOn) console.log('  (Salvataggio solo su questo computer: va benissimo in locale.)\n');
}

let leaving = false;
async function bye() {
  if (leaving) return;
  leaving = true;
  try {
    const txt = JSON.stringify(game);
    writeFileState(txt);
    if (remoteOn) await remote(['SET', REMOTE_KEY, txt], 4000);
  } catch (e) { /* */ }
  process.exit(0);
}
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
// un errore imprevisto non deve mai far cadere il server (e quindi la partita)
process.on('uncaughtException', (e) => console.error('Errore imprevisto:', e));
process.on('unhandledRejection', (e) => console.error('Promessa rifiutata:', e));

// su Render gratis il servizio si addormenta dopo 15 minuti senza visite: durante la partita lo teniamo sveglio
const SELF = process.env.RENDER_EXTERNAL_URL;
if (SELF) setInterval(() => { if (game.status !== 'ended') fetch(SELF + '/api/info').catch(() => {}); }, 8 * 60 * 1000);

main();
