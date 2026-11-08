'use strict';
// Simula partite complete con giocatori casuali per cercare bug, blocchi e stati impossibili.
// Uso: node test/simulate.js [numero_partite]
const { Game } = require('../game');
const { CARDS } = require('../public/shared/data.js');
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
const stats = { aces: 0, accuse: 0, chooses: 0, events: 0, ended: 0, capped: 0, stuck: 0, errors: 0, turns: 0, trades: 0, auctions: 0, bankrupt: 0, cards: 0 };

function invariants(g, label) {
  const bad = (m) => { throw new Error(`INVARIANT ${m} [${label}] phase=${g.phase}`); };
  for (const p of g.players) {
    if (p.cash < 0) bad(`cash negativo ${p.name} ${p.cash}`);
    if (!Number.isInteger(p.cash)) bad(`cash non intero ${p.cash}`);
    if (p.bankrupt && g.owned(p.id).length) bad('un fallito possiede ancora proprietà');
    if (p.aces.length > 3) bad('troppi assi');
    if (p.bankrupt && (p.aces.length || p.shield || p.x2)) bad('fallito con assi');
  }
  if (g.housesUsed() > 32) bad('troppe case');
  if (g.hotelsUsed() > 12) bad('troppi alberghi');
  for (const i in g.props) {
    const pr = g.props[i];
    if (pr.owner && !g.player(pr.owner)) bad('owner inesistente');
    if (pr.houses && (pr.mortgaged || g.BOARD[i].type !== 'street')) bad('case su ipotecata/non strada');
    if (!pr.owner && (pr.houses || pr.mortgaged)) bad('libera ma con case/ipoteca');
  }
  // carte uscita di prigione: 2 totali, in mano o nel mazzo
  let cards = 0;
  for (const p of g.players) cards += p.jailCards.length;
  const inDecks = (g.decks.fortuna.length - 15) + (g.decks.sorpresa.length - 15);
  if (cards + 2 + inDecks !== 2 + 0 + 0 + 2 - 2 + 0 && false) bad('carte');
  if (g.decks.fortuna.length + g.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === 'fortuna').length, 0) !== CARDS.fortuna.length) bad('mazzo fortuna');
  if (g.decks.sorpresa.length + g.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === 'sorpresa').length, 0) !== CARDS.sorpresa.length) bad('mazzo sorpresa');
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

function randomExtras(g, rng, cur) {
  if (cur.aces.length && rng() < 0.4) {
    const key = pick(rng, cur.aces);
    const others = g.alive().filter((q) => q.id !== cur.id);
    const a = { type: 'ace', ace: key, target: others.length ? pick(rng, others).id : null, idx: Math.floor(rng() * g.N) };
    const r = g.act(cur.id, a);
    if (r.ok) stats.aces++;
  }
  if (g.settings.cheat) {
    if (rng() < 0.3) g.act(cur.id, { type: 'cheat' });
    for (const q of g.alive()) if (q.id !== cur.id && rng() < 0.1) { if (g.act(q.id, { type: 'accuse' }).ok) stats.accuse++; }
  }
}

function bankerActs(g, rng) {
  const b = g.banker();
  if (b) for (const x of g.payouts.slice()) if (rng() < 0.7) g.act(b.id, { type: 'payBanker', id: x.id, pct: pick(rng, [100, 75, 50, 0]) });
  for (const q of g.alive()) if (rng() < 0.05) { if (g.act(q.id, { type: 'accuseBanker' }).ok) stats.accuse++; }
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
      randomExtras(g, rng, cur);
      if (g.phase !== 'roll') return true;
      const r = g.act(cur.id, { type: 'roll' });
      if (!r.ok) throw new Error('roll fallito: ' + r.error);
      return true;
    }
    case 'buy': {
      const sq = g.BOARD[cur.pos];
      if (rng() < 0.2) {
        const o = pick(rng, g.alive().filter((q) => q.id !== cur.id));
        const r = g.act(cur.id, { type: 'offerSale', to: o.id, price: Math.floor(rng() * 300) });
        if (r.ok) { stats.sales = (stats.sales || 0) + 1; return true; }
      }
      if (cur.cash >= g.priceOf(cur.pos) && rng() < 0.75) g.act(cur.id, { type: 'buy' });
      else g.act(cur.id, { type: 'decline' });
      return true;
    }
    case 'claim': {
      const c = g.claim;
      for (const id of c.eligible) {
        if (g.phase !== 'claim') break;
        const r = rng() < 0.4 ? g.act(id, { type: 'claimTake' }) : g.act(id, { type: 'claimPass' });
        if (!r.ok && !/soldi/.test(r.error)) throw new Error('claim: ' + r.error);
      }
      if (g.phase === 'claim') g.claimEnd();
      return true;
    }
    case 'dare': {
      stats.dares = (stats.dares || 0) + 1;
      const r = g.act(cur.id, { type: 'dareAnswer', done: rng() < 0.6 });
      if (!r.ok) throw new Error('dare: ' + r.error);
      return true;
    }
    case 'sale': {
      const sl = g.sale;
      const c = rng();
      if (c < 0.5) g.act(sl.to, { type: 'saleAccept' });
      else if (c < 0.8) g.act(sl.to, { type: 'saleDecline' });
      else g.act(sl.from, { type: 'saleCancel' });
      return true;
    }
    case 'auction': {
      stats.auctions += 0;
      const a = g.auction;
      const pid = pick(rng, a.active);
      const p = g.player(pid);
      const sq = g.BOARD[a.idx];
      if (rng() < 0.5 && a.bidder !== pid && p.cash > a.high && a.high < sq.price * 1.3) {
        const amt = Math.min(p.cash, a.high + 10 + Math.floor(rng() * 50));
        const r = g.act(pid, { type: 'bid', amount: amt });
        if (!r.ok && !/più|soldi|minima/.test(r.error)) throw new Error('bid: ' + r.error);
      } else g.act(pid, { type: 'pass' });
      return true;
    }
    case 'choose': {
      stats.chooses++;
      const c = g.choice;
      const r = c.kind === 'bus'
        ? g.act(cur.id, { type: 'busPick', pick: pick(rng, ['d1', 'd2', 'sum']) })
        : g.act(cur.id, { type: 'warpTo', idx: (() => { let i; do { i = (cur.pos + 1 + Math.floor(rng() * (g.N - 1))) % g.N; } while (g.BOARD[i].type === 'parking'); return i; })() });
      if (!r.ok) throw new Error('choose: ' + r.error);
      return true;
    }
    case 'action': {
      randomExtras(g, rng, cur);
      if (g.phase !== 'action') return true;
      if (g.view(cur.id, new Set()).travel && rng() < 0.7) {
        const t = g.view(cur.id, new Set()).travel;
        const r = g.act(cur.id, { type: 'travel', idx: pick(rng, t) });
        if (!r.ok) throw new Error('travel: ' + r.error);
        stats.travels = (stats.travels || 0) + 1;
        return true;
      }
      randomManage(g, rng, cur);
      if (rng() < 0.1) randomTrade(g, rng, cur);
      const r = g.act(cur.id, { type: 'endTurn' });
      if (!r.ok) throw new Error('endTurn: ' + r.error);
      return true;
    }
    case 'debt': {
      const d = g.debts[0];
      const p = g.player(d.pid);
      if (rng() < 0.3) {
        const mine = g.owned(p.id).find((i) => g.props[i].houses === 0 && !g.props[i].mortgaged);
        if (mine !== undefined && g.alive().length > 1) {
          const r = g.act(p.id, { type: 'auctionOwn', idx: mine });
          if (r.ok) { stats.emergency = (stats.emergency || 0) + 1; return true; }
        }
      }
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
  g.setSettings({ boardSize: n % 5 === 4 ? 40 : 60, preset: n % 4 === 3 ? 'classic' : 'ultra', missions: n % 4 !== 3, bounty: n % 3 !== 0, dares: n % 5 !== 2, theme: ['italia', 'mondo', 'gola', 'potter'][n % 4] });
  const np = 2 + (n % 7);
  for (let i = 0; i < np; i++) g.join('G' + i, TOKENS[i]);
  if (n % 3 === 0) g.settings.freeParking = !g.settings.freeParking;
  g.settings.auctions = n % 5 !== 0;
  g.settings.freeBuy = n % 3 !== 1;
  g.settings.auctionRound = [0, 4, 6, 10][n % 4];
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
  stats.events += g.eventSeq;
}
console.log(JSON.stringify(stats));
console.log('turni medi per partita finita:', Math.round(stats.turns / Math.max(1, stats.ended + stats.capped)));
if (stats.errors || stats.stuck) process.exit(1);
