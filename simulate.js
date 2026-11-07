'use strict';
// Simula partite complete con giocatori casuali per cercare bug, blocchi e stati impossibili.
// Uso: node test/simulate.js [numero_partite]
const { Game, BOARD } = require('../game');
const { TOKENS } = require('../public/shared/data.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = Number(process.argv[2] || 300);
const stats = { ended: 0, capped: 0, stuck: 0, errors: 0, turns: 0, trades: 0, auctions: 0, bankrupt: 0, cards: 0 };

function invariants(g, label) {
  const bad = (m) => { throw new Error(`INVARIANT ${m} [${label}] phase=${g.phase}`); };
  for (const p of g.players) {
    if (p.cash < 0) bad(`cash negativo ${p.name} ${p.cash}`);
    if (!Number.isInteger(p.cash)) bad(`cash non intero ${p.cash}`);
    if (p.bankrupt && g.owned(p.id).length) bad('un fallito possiede ancora proprietà');
  }
  if (g.housesUsed() > 32) bad('troppe case');
  if (g.hotelsUsed() > 12) bad('troppi alberghi');
  for (const i in g.props) {
    const pr = g.props[i];
    if (pr.owner && !g.player(pr.owner)) bad('owner inesistente');
    if (pr.houses && (pr.mortgaged || BOARD[i].type !== 'street')) bad('case su ipotecata/non strada');
    if (!pr.owner && (pr.houses || pr.mortgaged)) bad('libera ma con case/ipoteca');
  }
  // carte uscita di prigione: 2 totali, in mano o nel mazzo
  let cards = 0;
  for (const p of g.players) cards += p.jailCards.length;
  const inDecks = (g.decks.fortuna.length - 15) + (g.decks.sorpresa.length - 15);
  if (cards + 2 + inDecks !== 2 + 0 + 0 + 2 - 2 + 0 && false) bad('carte');
  if (g.decks.fortuna.length + g.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === 'fortuna').length, 0) !== 16) bad('mazzo fortuna');
  if (g.decks.sorpresa.length + g.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === 'sorpresa').length, 0) !== 16) bad('mazzo sorpresa');
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Prova una serie di azioni casuali di gestione per un giocatore
function randomManage(g, rng, p) {
  const mine = g.owned(p.id);
  if (!mine.length) return;
  for (let k = 0; k < 3; k++) {
    const idx = pick(rng, mine);
    const t = pick(rng, ['build', 'build', 'sell', 'mortgage', 'unmortgage']);
    g.act(p.id, { type: t, idx });
  }
}

function randomTrade(g, rng, p) {
  const others = g.alive().filter((q) => q.id !== p.id);
  if (!others.length) return;
  const q = pick(rng, others);
  const mineP = g.owned(p.id), theirP = g.owned(q.id);
  const offer = { cash: Math.floor(rng() * 200), props: mineP.length && rng() < 0.6 ? [pick(rng, mineP)] : [], jail: p.jailCards.length && rng() < 0.5 ? 1 : 0 };
  const request = { cash: Math.floor(rng() * 200), props: theirP.length && rng() < 0.6 ? [pick(rng, theirP)] : [], jail: 0 };
  const r = g.act(p.id, { type: 'propose', to: q.id, offer, request });
  if (r.ok) {
    stats.trades++;
    const tr = g.trades.find((x) => x.from === p.id);
    if (tr) g.act(q.id, { type: rng() < 0.6 ? 'accept' : 'reject', id: tr.id });
  }
}

function step(g, rng) {
  const cur = g.cur;
  switch (g.phase) {
    case 'roll': {
      if (cur.inJail) {
        const c = rng();
        if (c < 0.3 && cur.jailCards.length) g.act(cur.id, { type: 'useJailCard' });
        else if (c < 0.5) g.act(cur.id, { type: 'payJail' });
      }
      if (rng() < 0.1) randomManage(g, rng, cur);
      if (rng() < 0.05) randomTrade(g, rng, cur);
      const r = g.act(cur.id, { type: 'roll' });
      if (!r.ok) throw new Error('roll fallito: ' + r.error);
      return true;
    }
    case 'buy': {
      const sq = BOARD[cur.pos];
      if (cur.cash >= sq.price && rng() < 0.75) g.act(cur.id, { type: 'buy' });
      else g.act(cur.id, { type: 'decline' });
      return true;
    }
    case 'auction': {
      stats.auctions += 0;
      const a = g.auction;
      const pid = pick(rng, a.active);
      const p = g.player(pid);
      const sq = BOARD[a.idx];
      if (rng() < 0.5 && a.bidder !== pid && p.cash > a.high && a.high < sq.price * 1.3) {
        const amt = Math.min(p.cash, a.high + 10 + Math.floor(rng() * 50));
        const r = g.act(pid, { type: 'bid', amount: amt });
        if (!r.ok && !/più|soldi|minima/.test(r.error)) throw new Error('bid: ' + r.error);
      } else g.act(pid, { type: 'pass' });
      return true;
    }
    case 'action': {
      randomManage(g, rng, cur);
      if (rng() < 0.1) randomTrade(g, rng, cur);
      const r = g.act(cur.id, { type: 'endTurn' });
      if (!r.ok) throw new Error('endTurn: ' + r.error);
      return true;
    }
    case 'debt': {
      const d = g.debts[0];
      const p = g.player(d.pid);
      // prova a raccogliere soldi: vende edifici, ipoteca
      for (const i of g.owned(p.id)) {
        if (p.cash >= d.amount) break;
        g.act(p.id, { type: 'sell', idx: i });
        g.act(p.id, { type: 'sell', idx: i });
      }
      for (const i of g.owned(p.id)) {
        if (g.phase !== 'debt' || !g.debts.some((x) => x.pid === p.id)) break;
        for (let k = 0; k < 5; k++) g.act(p.id, { type: 'sell', idx: i });
        g.act(p.id, { type: 'mortgage', idx: i });
      }
      if (g.phase === 'debt' && g.debts.some((x) => x.pid === p.id && g.player(x.pid).cash < x.amount)) {
        const before = g.debts.length;
        const r = g.act(p.id, { type: 'bankrupt' });
        if (!r.ok) throw new Error('bankrupt: ' + r.error);
        stats.bankrupt++;
      }
      return true;
    }
    default:
      return false;
  }
}

for (let n = 0; n < N; n++) {
  const seed = 1000 + n;
  const rng = mulberry32(seed);
  const g = new Game(rng);
  const np = 2 + (n % 7);
  for (let i = 0; i < np; i++) g.join('G' + i, TOKENS[i]);
  g.settings.freeParking = n % 3 === 0;
  g.settings.auctions = n % 5 !== 0;
  const hostId = g.hostId;
  g.act(hostId, { type: 'start' });
  let steps = 0;
  try {
    while (g.status === 'playing' && steps < 20000) {
      steps++;
      const ok = step(g, rng);
      if (!ok) { stats.stuck++; console.log('STUCK seed', seed, 'phase', g.phase); break; }
      invariants(g, 'seed ' + seed + ' step ' + steps);
      // il json deve poter essere salvato e ricaricato
      if (steps % 500 === 0) {
        const copy = Game.fromJSON(JSON.parse(JSON.stringify(g)), rng);
        if (JSON.stringify(copy.view('x')) !== JSON.stringify(g.view('x'))) throw new Error('save/load diverso');
      }
    }
  } catch (e) {
    stats.errors++;
    console.log('ERRORE seed', seed, e.stack.split('\n').slice(0, 4).join('\n'));
    continue;
  }
  if (g.status === 'ended') stats.ended++; else if (steps >= 20000) stats.capped++;
  stats.turns += g.turnCount;
  stats.cards += g.cardSeq;
}
console.log(JSON.stringify(stats));
console.log('turni medi per partita finita:', Math.round(stats.turns / Math.max(1, stats.ended + stats.capped)));
if (stats.errors || stats.stuck) process.exit(1);
