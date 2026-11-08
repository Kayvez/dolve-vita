'use strict';
// Motore di gioco: "Misteri al Collegio" (Cluedo in versione collegio). Tutte le regole stanno qui, sul server.
const crypto = require('crypto');
const D = require('./data.js');

class GameError extends Error {}
const bad = (m) => { throw new GameError(m); };

const MAP = D.buildMap();
const ALL_SUSPECTS = D.SUSPECTS.map((s) => s.id);
const ALL_WEAPONS = D.WEAPONS.map((w) => w.id);
const ALL_ROOMS = D.ROOMS.map((r) => r.id);
const TYPES = { s: ALL_SUSPECTS, w: ALL_WEAPONS, r: ALL_ROOMS };
const key = (t, id) => t + ':' + id;
const PASS = new Map();
for (const [a, b] of D.PASSAGES) { PASS.set(a, b); PASS.set(b, a); }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---- coprifuoco: prossime ore 23:00 (o altra ora) a Roma ----
function romeParts(ms) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
function romeToMs(y, m, d, h) {
  const target = Date.UTC(y, m - 1, d, h, 0, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = romeParts(guess);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess;
    guess = target - diff;
  }
  return guess;
}
function nextCurfew(now, hour) {
  const p = romeParts(now);
  let t = romeToMs(p.y, p.m, p.d, hour);
  if (t <= now + 60000) {
    const nd = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    t = romeToMs(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), hour);
  }
  return t;
}

class Game {
  constructor(rng) {
    this.rng = rng || Math.random;
    this.status = 'lobby';       // lobby | playing | ended
    this.phase = 'lobby';        // lobby | turn | disprove | curfew | ended
    this.players = [];
    this.hostId = null;
    this.seq = 0;
    this.settings = { curfew: true, curfewHour: 23 };
    this.pawns = {};             // sospettato -> posizione {t:'t',x,y} | {t:'r',r}
    this.weapons = {};           // arma -> stanza
    this.solution = null;
    this.turn = null;            // { i, rolled, dice, steps, moved, suggested, gossiped }
    this.suggestion = null;
    this.suora = 'cucina';
    this.round = 0;
    this.curfewAt = 0;
    this.curfew = null;          // { deadline, finals: {pid: {s,w,r}|null} }
    this.result = null;
    this.log = [];
    this.logSeq = 0;
    this.evs = [];
    this.evSeq = 0;
    this.turnCount = 0;
    this.createdAt = Date.now();
  }

  // ---------- utilità ----------
  rand(n) { return Math.floor(this.rng() * n); }
  pick(a) { return a[this.rand(a.length)]; }
  shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = this.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  player(id) { return this.players.find((p) => p.id === id); }
  byToken(t) { return t ? this.players.find((p) => p.token === t) : undefined; }
  get cur() { return this.turn ? this.players[this.turn.i] : null; }
  pawnOf(p) { return this.pawns[p.suspect]; }
  nameOf(id) { return D.suspect(id).name; }
  say(kind, text, extra) { this.log.push(Object.assign({ id: ++this.logSeq, kind, text }, extra || {})); if (this.log.length > 120) this.log.shift(); }
  ev(kind, data) { this.evs.push(Object.assign({ seq: ++this.evSeq, kind }, data || {})); if (this.evs.length > 14) this.evs.shift(); }
  active() { return this.players.filter((p) => !p.out); }
  cardName(k) { return D.cardInfo(k).name; }

  // ---------- sala d'attesa ----------
  join(name) {
    if (this.status !== 'lobby') bad('La partita è già iniziata: se hai perso il telefono, riprendi il tuo posto dalla lista.');
    name = String(name || '').trim().slice(0, 14);
    if (!name) bad('Scrivi il tuo nome.');
    if (this.players.length >= 9) bad('Siete già in 9: è il massimo.');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) bad('Questo nome c\'è già: aggiungi un\'iniziale.');
    const p = { id: 'p' + (++this.seq), token: crypto.randomBytes(12).toString('hex'), name, suspect: null, cards: [], seen: [], gossips: [], out: false };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  start() {
    if (this.status !== 'lobby') bad('La partita è già iniziata.');
    if (this.players.length < 2) bad('Servono almeno 2 giocatrici.');
    if (this.players.some((p) => !p.suspect)) bad('Tutte devono scegliere il personaggio.');
    // pedine
    D.SUSPECTS.forEach((s, i) => { const [x, y] = D.STARTS[i]; this.pawns[s.id] = { t: 't', x, y }; });
    // soluzione e carte
    this.solution = { s: this.pick(ALL_SUSPECTS), w: this.pick(ALL_WEAPONS), r: this.pick(ALL_ROOMS) };
    const deck = [];
    for (const t of ['s', 'w', 'r']) for (const id of TYPES[t]) if (this.solution[t] !== id) deck.push(key(t, id));
    this.shuffle(deck).forEach((k, i) => this.players[i % this.players.length].cards.push(k));
    const ord = { s: 0, w: 1, r: 2 };
    for (const p of this.players) p.cards.sort((a, b) => ord[a[0]] - ord[b[0]]);
    // armi sparse in stanze diverse
    const rooms = this.shuffle(ALL_ROOMS);
    ALL_WEAPONS.forEach((w, i) => { this.weapons[w] = rooms[i]; });
    this.players = this.shuffle(this.players);
    this.suora = this.pick(D.PATROL);
    this.status = 'playing';
    this.phase = 'turn';
    this.round = 1;
    this.turnCount = 1;
    this.turn = this.freshTurn(0);
    if (this.settings.curfew) this.curfewAt = nextCurfew(Date.now(), this.settings.curfewHour);
    this.say('start', `Un delitto al collegio: ${D.VICTIM} è stato trovato senza vita! Chi è stato, con cosa e dove?`);
    this.say('turn', `Comincia ${this.cur.name}.`);
  }

  freshTurn(i) { return { i, rolled: false, dice: null, steps: 0, moved: false, suggested: false, gossiped: false }; }

  // ---------- movimento ----------
  occupied() {
    const s = new Set();
    for (const id of ALL_SUSPECTS) { const p = this.pawns[id]; if (p && p.t === 't') s.add(p.x + ',' + p.y); }
    return s;
  }
  reach(pos, steps) {
    const occ = this.occupied();
    const tiles = new Map(), rooms = new Map();
    const startKey = pos.t === 't' ? 't:' + pos.x + ',' + pos.y : 'r:' + pos.r;
    const prev = new Map([[startKey, null]]);
    const dist = new Map([[startKey, 0]]);
    const q = [startKey];
    const startRoom = pos.t === 'r' ? pos.r : null;
    if (pos.t === 't') occ.delete(pos.x + ',' + pos.y);
    while (q.length) {
      const n = q.shift();
      const d = dist.get(n);
      if (d >= steps) continue;
      const nb = [];
      if (n[0] === 'r') {
        for (const [x, y] of D.room(n.slice(2)).doors) nb.push('t:' + x + ',' + y);
      } else {
        const [x, y] = n.slice(2).split(',').map(Number);
        for (const [dx, dy] of DIRS) if (MAP.tiles.has((x + dx) + ',' + (y + dy))) nb.push('t:' + (x + dx) + ',' + (y + dy));
        for (const r of MAP.doorRoom.get(x + ',' + y) || []) if (r !== startRoom) nb.push('r:' + r);
      }
      for (const m of nb) {
        if (dist.has(m)) continue;
        if (m[0] === 't' && occ.has(m.slice(2))) continue;
        dist.set(m, d + 1); prev.set(m, n);
        if (m[0] === 't') { tiles.set(m.slice(2), d + 1); q.push(m); } else rooms.set(m.slice(2), d + 1);
      }
    }
    const pathTo = (k) => { const out = []; for (let n = k; n; n = prev.get(n)) out.unshift(n); return out.slice(1); };
    return { tiles, rooms, pathTo };
  }

  // ---------- azioni ----------
  act(pid, body) {
    try {
      const p = this.player(pid);
      if (!p) bad('Giocatrice non trovata.');
      const fn = this['do_' + body.type];
      if (!fn || body.type.startsWith('_')) bad('Azione sconosciuta.');
      fn.call(this, p, body);
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      throw e;
    }
  }
  mustTurn(p) {
    if (this.status !== 'playing' || this.phase !== 'turn') bad('Adesso non si può.');
    if (!this.cur || this.cur.id !== p.id) bad('Non è il tuo turno.');
  }

  // lobby
  do_pick(p, b) {
    if (this.status !== 'lobby') bad('Troppo tardi.');
    const s = D.suspect(b.suspect);
    if (!s) bad('Personaggio sconosciuto.');
    if (this.players.some((q) => q.id !== p.id && q.suspect === s.id)) bad('Questo personaggio è già stato scelto.');
    p.suspect = s.id;
  }
  do_settings(p, b) {
    if (this.status !== 'lobby') bad('Troppo tardi.');
    if (p.id !== this.hostId) bad('Solo chi ha creato la partita può cambiare le opzioni.');
    if (typeof b.curfew === 'boolean') this.settings.curfew = b.curfew;
    if ([20, 21, 22, 23].includes(b.curfewHour)) this.settings.curfewHour = b.curfewHour;
  }
  do_start(p) {
    if (p.id !== this.hostId) bad('Solo chi ha creato la partita può iniziarla.');
    this.start();
  }

  // turno
  do_roll(p) {
    this.mustTurn(p);
    const t = this.turn;
    if (t.rolled || t.moved) bad('Hai già tirato i dadi.');
    const d = [1 + this.rand(6), 1 + this.rand(6)];
    t.rolled = true; t.dice = d; t.steps = d[0] + d[1];
    this.say('roll', `${p.name} tira i dadi: ${d[0]} + ${d[1]} = ${t.steps} passi.`, { pid: p.id });
    this.ev('roll', { pid: p.id, dice: d });
  }
  do_move(p, b) {
    this.mustTurn(p);
    const t = this.turn;
    if (!t.rolled) bad('Prima tira i dadi.');
    if (t.moved) bad('Ti sei già mossa.');
    const from = this.pawnOf(p);
    const rc = this.reach(from, t.steps);
    let k, to;
    if (b.room) { if (!rc.rooms.has(b.room)) bad('Non arrivi fin lì con questi passi.'); k = 'r:' + b.room; to = { t: 'r', r: b.room }; }
    else { const kk = Number(b.x) + ',' + Number(b.y); if (!rc.tiles.has(kk)) bad('Non arrivi fin lì.'); k = 't:' + kk; to = { t: 't', x: Number(b.x), y: Number(b.y) }; }
    const path = rc.pathTo(k).map((n) => (n[0] === 'r' ? { r: n.slice(2) } : { x: +n.slice(2).split(',')[0], y: +n.slice(2).split(',')[1] }));
    this.pawns[p.suspect] = to;
    t.moved = true;
    this.say('move', to.t === 'r' ? `${p.name} entra in ${D.room(to.r).name}.` : `${p.name} si sposta nel corridoio.`, { pid: p.id });
    this.ev('move', { pid: p.id, suspect: p.suspect, path, to });
  }
  do_passage(p) {
    this.mustTurn(p);
    const t = this.turn, pos = this.pawnOf(p);
    if (t.rolled || t.moved) bad('Il passaggio segreto si usa al posto dei dadi.');
    if (pos.t !== 'r' || !PASS.has(pos.r)) bad('Qui non c\'è nessun passaggio segreto.');
    const to = PASS.get(pos.r);
    this.pawns[p.suspect] = { t: 'r', r: to };
    t.moved = true;
    this.say('passage', `${p.name} sparisce nel passaggio segreto e riappare in ${D.room(to).name}!`, { pid: p.id });
    this.ev('passage', { pid: p.id, suspect: p.suspect, from: pos.r, to });
  }
  do_gossip(p) {
    this.mustTurn(p);
    const t = this.turn, pos = this.pawnOf(p);
    if (pos.t !== 'r' || !D.GOSSIP_ROOMS.includes(pos.r)) bad('I pettegolezzi si sentono solo in Portineria, nel Salotto delle Sorelle e nella Cappella.');
    if (t.gossiped) bad('Per oggi hai già origliato.');
    t.gossiped = true;
    const type = this.pick(['s', 'w', 'r']);
    const truth = this.rng() < 0.6;
    let id = this.solution[type];
    if (!truth) id = this.pick(TYPES[type].filter((x) => x !== this.solution[type]));
    p.gossips.push({ k: key(type, id), room: pos.r, n: p.gossips.length + 1 });
    this.say('gossip', `${p.name} origlia un pettegolezzo in ${D.room(pos.r).name}…`, { pid: p.id });
    this.ev('gossip', { pid: p.id });
  }
  do_suggest(p, b) {
    this.mustTurn(p);
    const t = this.turn, pos = this.pawnOf(p);
    if (pos.t !== 'r') bad('Puoi fare un\'ipotesi solo dentro una stanza.');
    if (t.suggested) bad('Un\'ipotesi per turno.');
    if (this.suora === pos.r) bad('C\'è la Suora di ronda in questa stanza: sotto i suoi occhi non puoi indagare!');
    if (!ALL_SUSPECTS.includes(b.s) || !ALL_WEAPONS.includes(b.w)) bad('Scegli il sospettato e l\'arma.');
    t.suggested = true;
    // il sospettato e l'arma vengono portati nella stanza
    if (this.pawns[b.s]) this.pawns[b.s] = { t: 'r', r: pos.r };
    this.weapons[b.w] = pos.r;
    const queue = [];
    for (let k = 1; k < this.players.length; k++) queue.push(this.players[(t.i + k) % this.players.length].id);
    this.suggestion = { by: p.id, s: b.s, w: b.w, r: pos.r, queue, cur: null, skipped: [], shownBy: null, card: null, none: false };
    this.say('suggest', `${p.name} ipotizza: ${this.nameOf(b.s)}, ${D.weapon(b.w).name}, ${D.room(pos.r).name}.`, { pid: p.id });
    this.ev('suggest', { pid: p.id, s: b.s, w: b.w, r: pos.r });
    this.nextResponder();
  }
  matching(p) {
    const sg = this.suggestion;
    return p.cards.filter((k) => k === key('s', sg.s) || k === key('w', sg.w) || k === key('r', sg.r));
  }
  nextResponder() {
    const sg = this.suggestion;
    while (sg.queue.length) {
      const id = sg.queue.shift();
      const q = this.player(id);
      const m = this.matching(q);
      if (!m.length) { sg.skipped.push(id); this.say('skip', `${q.name} non può smentire.`, { pid: id }); continue; }
      sg.cur = id;
      if (m.length === 1) { this.showCard(q, m[0]); return; }
      this.phase = 'disprove';
      return;
    }
    sg.cur = null; sg.none = true;
    this.phase = 'turn';
    this.say('nobody', 'Nessuno ha potuto smentire!');
    this.ev('nobody', {});
  }
  showCard(q, k) {
    const sg = this.suggestion;
    sg.shownBy = q.id; sg.card = k;
    this.player(sg.by).seen.push({ k, by: q.id });
    this.phase = 'turn';
    this.say('shown', `${q.name} smentisce l'ipotesi mostrando una carta a ${this.player(sg.by).name}.`, { pid: q.id });
    this.ev('shown', { by: q.id, to: sg.by });
  }
  do_show(p, b) {
    const sg = this.suggestion;
    if (this.phase !== 'disprove' || !sg || sg.cur !== p.id) bad('Non tocca a te smentire.');
    if (!this.matching(p).includes(b.card)) bad('Devi mostrare una delle carte dell\'ipotesi.');
    this.showCard(p, b.card);
  }
  do_end(p) {
    this.mustTurn(p);
    this.nextTurn();
  }
  nextTurn() {
    const n = this.players.length;
    let i = this.turn.i;
    for (let k = 1; k <= n; k++) {
      const j = (this.turn.i + k) % n;
      if (!this.players[j].out) { i = j; if (j <= this.turn.i) this.newRound(); break; }
    }
    this.turn = this.freshTurn(i);
    this.suggestion = null;
    this.turnCount++;
    this.say('turn', `Tocca a ${this.cur.name}.`);
  }
  newRound() {
    this.round++;
    const to = this.pick(D.PATROL.filter((r) => r !== this.suora));
    this.suora = to;
    this.say('suora', `La Suora di ronda si sposta: ora è in ${D.room(to).name}.`);
    this.ev('suora', { to });
  }
  do_accuse(p, b) {
    this.mustTurn(p);
    if (!ALL_SUSPECTS.includes(b.s) || !ALL_WEAPONS.includes(b.w) || !ALL_ROOMS.includes(b.r)) bad('Scegli sospettato, arma e stanza.');
    const ok = b.s === this.solution.s && b.w === this.solution.w && b.r === this.solution.r;
    const acc = `${this.nameOf(b.s)}, ${D.weapon(b.w).name}, ${D.room(b.r).name}`;
    this.say('accuse', `${p.name} lancia l'accusa finale: ${acc}!`, { pid: p.id });
    if (ok) {
      this.finish([p.id], `${p.name} ha risolto il mistero!`);
      this.ev('win', { pid: p.id });
    } else {
      p.out = true;
      this.say('wrong', `Accusa sbagliata! ${p.name} è fuori dalla caccia (ma continua a smentire le ipotesi).`, { pid: p.id });
      this.ev('wrong', { pid: p.id, s: b.s, w: b.w, r: b.r });
      if (!this.active().length) { this.finish([], 'Nessuna ha scoperto la verità: il mistero resta irrisolto.'); return; }
      this.nextTurn();
    }
  }
  finish(winners, text) {
    this.status = 'ended'; this.phase = 'ended';
    this.result = { winners, text, solution: this.solution };
    this.say('end', text);
  }

  // ---------- coprifuoco ----------
  tick(now) {
    now = now || Date.now();
    if (this.status !== 'playing') return false;
    if (this.phase !== 'curfew' && this.settings.curfew && this.curfewAt && now >= this.curfewAt && this.phase === 'turn') { this.startCurfew(now); return true; }
    if (this.phase === 'curfew' && now >= this.curfew.deadline) { this.resolveCurfew(); return true; }
    return false;
  }
  startCurfew(now) {
    this.phase = 'curfew';
    this.suggestion = null;
    const finals = {};
    for (const p of this.active()) finals[p.id] = null;
    this.curfew = { deadline: (now || Date.now()) + 4 * 60 * 1000, finals, done: {} };
    this.say('curfew', `Sono le ${this.settings.curfewHour}! Coprifuoco: tutte in camera. Ognuna scrive in segreto la sua accusa finale.`);
    this.ev('curfew', {});
  }
  do_curfewNow(p) {
    if (p.id !== this.hostId) bad('Solo chi ha creato la partita.');
    if (this.status !== 'playing' || this.phase !== 'turn') bad('Adesso non si può.');
    this.startCurfew();
  }
  do_final(p, b) {
    if (this.phase !== 'curfew') bad('Non è il momento.');
    if (p.out) bad('Sei già fuori dalla caccia.');
    if (this.curfew.done[p.id]) bad('Hai già consegnato la tua accusa.');
    if (b.pass) this.curfew.finals[p.id] = null;
    else {
      if (!ALL_SUSPECTS.includes(b.s) || !ALL_WEAPONS.includes(b.w) || !ALL_ROOMS.includes(b.r)) bad('Scegli sospettato, arma e stanza.');
      this.curfew.finals[p.id] = { s: b.s, w: b.w, r: b.r };
    }
    this.curfew.done[p.id] = true;
    this.say('final', `${p.name} ha consegnato la sua accusa.`, { pid: p.id });
    if (this.active().every((q) => this.curfew.done[q.id])) this.resolveCurfew();
  }
  resolveCurfew() {
    const sol = this.solution;
    const winners = this.active().filter((p) => { const f = this.curfew.finals[p.id]; return f && f.s === sol.s && f.w === sol.w && f.r === sol.r; }).map((p) => p.id);
    this.curfew.revealed = {};
    for (const p of this.active()) this.curfew.revealed[p.id] = this.curfew.finals[p.id];
    if (winners.length) this.finish(winners, winners.length === 1 ? `${this.player(winners[0]).name} ha indovinato tutto!` : `Hanno indovinato in ${winners.length}: ${winners.map((id) => this.player(id).name).join(', ')}!`);
    else this.finish([], 'Nessuna ha indovinato: all\'alba il mistero resta irrisolto…');
  }

  // ---------- comandi dal tabellone ----------
  admin(b) {
    if (b.type === 'skip') {
      if (this.status !== 'playing' || this.phase !== 'turn') return { ok: false, error: 'Adesso non si può.' };
      this.say('skipTurn', `${this.cur.name} salta il turno.`);
      this.nextTurn();
      return { ok: true };
    }
    if (b.type === 'start') {
      try { this.start(); return { ok: true }; } catch (e) { if (e instanceof GameError) return { ok: false, error: e.message }; throw e; }
    }
    if (b.type === 'curfewNow') {
      if (this.status !== 'playing' || this.phase !== 'turn') return { ok: false, error: 'Adesso non si può.' };
      this.startCurfew();
      return { ok: true };
    }
    if (b.type === 'kick') {
      if (this.status !== 'lobby') return { ok: false, error: 'Solo prima di cominciare.' };
      this.players = this.players.filter((p) => p.id !== b.id);
      if (this.hostId === b.id) this.hostId = this.players[0] ? this.players[0].id : null;
      return { ok: true };
    }
    return { ok: false, error: 'Comando sconosciuto.' };
  }

  // ---------- vista per un telefono / per il tabellone ----------
  view(pid, connected) {
    connected = connected || new Set();
    const me = pid ? this.player(pid) : null;
    const t = this.turn;
    const cur = this.cur;
    const v = {
      title: D.TITLE, created: this.createdAt, status: this.status, phase: this.phase, hostId: this.hostId, settings: this.settings,
      round: this.round, turnCount: this.turnCount, suora: this.suora, now: Date.now(),
      curfewAt: this.settings.curfew ? this.curfewAt : 0,
      players: this.players.map((p) => ({ id: p.id, name: p.name, suspect: p.suspect, out: p.out, connected: connected.has(p.id), nCards: p.cards.length })),
      pawns: this.pawns, weapons: this.weapons,
      turn: t && this.status === 'playing' ? { pid: cur.id, rolled: t.rolled, dice: t.dice, steps: t.steps, moved: t.moved, suggested: t.suggested, gossiped: t.gossiped } : null,
      log: this.log.slice(-40), evs: this.evs,
    };
    if (this.suggestion) {
      const sg = this.suggestion;
      v.suggestion = { by: sg.by, s: sg.s, w: sg.w, r: sg.r, cur: sg.cur, skipped: sg.skipped, shownBy: sg.shownBy, none: sg.none };
      if (me && me.id === sg.by && sg.card) v.suggestion.card = sg.card;
      if (me && this.phase === 'disprove' && sg.cur === me.id) v.suggestion.canShow = this.matching(me);
    }
    if (this.phase === 'curfew' && this.curfew) v.curfew = { deadline: this.curfew.deadline, done: Object.keys(this.curfew.done) };
    if (this.status === 'ended') { v.result = this.result; if (this.curfew && this.curfew.revealed) v.revealed = this.curfew.revealed; }
    if (me) {
      v.me = { id: me.id, name: me.name, suspect: me.suspect, cards: me.cards, seen: me.seen, gossips: me.gossips, out: me.out, host: me.id === this.hostId };
      if (this.status === 'playing' && this.phase === 'turn' && cur && cur.id === me.id && !me.out) {
        const pos = this.pawnOf(me);
        const my = { canRoll: !t.rolled && !t.moved, canPassage: !t.rolled && !t.moved && pos.t === 'r' && PASS.has(pos.r), passageTo: pos.t === 'r' ? PASS.get(pos.r) || null : null };
        my.canSuggest = pos.t === 'r' && !t.suggested && this.suora !== pos.r;
        my.suoraBlock = pos.t === 'r' && this.suora === pos.r;
        my.canGossip = pos.t === 'r' && D.GOSSIP_ROOMS.includes(pos.r) && !t.gossiped;
        if (t.rolled && !t.moved) {
          const rc = this.reach(pos, t.steps);
          my.tiles = Array.from(rc.tiles.keys());
          my.rooms = Array.from(rc.rooms.keys());
        }
        v.my = my;
      }
    }
    return v;
  }

  toJSON() {
    const o = {};
    for (const k of Object.keys(this)) if (k !== 'rng') o[k] = this[k];
    return o;
  }
  static fromJSON(o) {
    const g = new Game();
    Object.assign(g, o);
    return g;
  }
}

module.exports = { Game, GameError, nextCurfew, MAP };
