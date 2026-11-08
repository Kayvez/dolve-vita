'use strict';
// Prove automatiche: node test.js   (partite simulate: node test.js 200)
const assert = require('assert');
const { Game, nextCurfew } = require('./game');
const D = require('./data.js');
let seed = 12345; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const SUS = D.SUSPECTS.map((s) => s.id), WEA = D.WEAPONS.map((w) => w.id), ROO = D.ROOMS.map((r) => r.id);
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; };

function mk(n) {
  const g = new Game(rng);
  for (let i = 0; i < n; i++) { const p = g.join('G' + i); ok(g.act(p.id, { type: 'pick', suspect: SUS[i] }).ok, 'pick'); }
  g.start(); return g;
}
function bot(g, cap) {
  let steps = 0;
  while (g.status === 'playing' && steps++ < cap) {
    if (g.phase === 'curfew') { for (const p of g.active()) if (!g.curfew.done[p.id]) g.act(p.id, { type: 'final', s: g.pick(SUS), w: g.pick(WEA), r: g.pick(ROO) }); continue; }
    if (g.phase === 'disprove') { const sg = g.suggestion, q = g.player(sg.cur); const r = g.act(q.id, { type: 'show', card: g.pick(g.matching(q)) }); ok(r.ok, r.error); continue; }
    const p = g.cur, v = g.view(p.id);
    // la bot a volte accusa, altrimenti gira
    if (g.turnCount > 60 && g.rng() < 0.25) { const r = g.act(p.id, { type: 'accuse', s: g.pick(SUS), w: g.pick(WEA), r: g.pick(ROO) }); ok(r.ok, r.error); continue; }
    if (v.my.canPassage && g.rng() < 0.4) { ok(g.act(p.id, { type: 'passage' }).ok); }
    else if (v.my.canRoll) { ok(g.act(p.id, { type: 'roll' }).ok); const w = g.view(p.id).my; const opts = [...w.rooms.map((r) => ({ room: r })), ...w.tiles.map((t) => { const [x, y] = t.split(',').map(Number); return { x, y }; })]; if (opts.length) { const pr = opts.filter((o) => o.room); const o = pr.length && g.rng() < 0.7 ? g.pick(pr) : g.pick(opts); const r = g.act(p.id, Object.assign({ type: 'move' }, o)); ok(r.ok, r.error); } }
    const w2 = g.view(p.id).my;
    if (w2.canGossip) g.act(p.id, { type: 'gossip' });
    if (w2.canSuggest) { const r = g.act(p.id, { type: 'suggest', s: g.pick(SUS), w: g.pick(WEA) }); ok(r.ok, r.error); if (g.phase === 'disprove') continue; }
    if (g.status === 'playing' && g.phase === 'turn' && g.cur.id === p.id) ok(g.act(p.id, { type: 'end' }).ok);
  }
  return steps;
}

// carte e distribuzione
{
  const g = mk(5);
  const all = g.players.flatMap((p) => p.cards);
  ok(all.length === 9 + 9 + 14 - 3, 'tutte le carte tranne 3 distribuite');
  ok(new Set(all).size === all.length, 'nessun doppione');
  ok(!all.includes('s:' + g.solution.s) && !all.includes('w:' + g.solution.w) && !all.includes('r:' + g.solution.r), 'la soluzione non è in mano a nessuna');
  ok(new Set(Object.values(g.weapons)).size === 9, 'armi in stanze diverse');
}
// movimento: non si passa dentro i pedoni, non si rientra nella stessa stanza
{
  const g = mk(3);
  const p = g.cur; g.pawns[p.suspect] = { t: 'r', r: 'cucina' };
  g.turn.rolled = true; g.turn.steps = 12;
  const rc = g.reach(g.pawns[p.suspect], 12);
  ok(!rc.rooms.has('cucina'), 'non rientri nella stanza da cui parti');
  ok(rc.rooms.has('lavaggio'), 'raggiungi la cucina piccola');
}
// passaggio segreto
{
  const g = mk(3); const p = g.cur; g.pawns[p.suspect] = { t: 'r', r: 'cucina' };
  ok(g.act(p.id, { type: 'passage' }).ok && g.pawns[p.suspect].r === 'ghiacciaia', 'passaggio cucina->ghiacciaia');
  ok(!g.act(p.id, { type: 'roll' }).ok, 'dopo il passaggio non si tirano i dadi'); g.suora = 'cappella'; ok(g.view(p.id).my.canSuggest, 'ma si può fare un\'ipotesi');
}
// ipotesi e smentita
{
  const g = mk(3); const p = g.cur; g.pawns[p.suspect] = { t: 'r', r: 'reception' }; g.suora = 'cappella';
  const other = g.players[(g.turn.i + 1) % 3];
  const k = other.cards.find((c) => c[0] === 's');
  const r = g.act(p.id, { type: 'suggest', s: k.slice(2), w: 'coltello' });
  ok(r.ok, r.error); ok(g.suggestion.card || g.phase === 'disprove' || g.suggestion.none || g.suggestion.shownBy, 'smentita avviata');
  ok(g.pawns[k.slice(2)].r === 'reception' && g.weapons.coltello === 'reception', 'sospettato e arma portati nella stanza');
  ok(!g.act(p.id, { type: 'suggest', s: 'zita', w: 'scopa' }).ok, 'una sola ipotesi per turno');
}
// suora blocca
{
  const g = mk(3); const p = g.cur; g.pawns[p.suspect] = { t: 'r', r: 'reception' }; g.suora = 'reception';
  ok(!g.act(p.id, { type: 'suggest', s: 'zita', w: 'scopa' }).ok, 'la suora blocca le ipotesi');
}
// accusa giusta e sbagliata
{
  const g = mk(3); const p = g.cur; const s = g.solution;
  ok(g.act(p.id, { type: 'accuse', s: s.s, w: s.w, r: s.r }).ok && g.status === 'ended' && g.result.winners[0] === p.id, 'accusa giusta vince');
  const h = mk(3); const q = h.cur; const bs = SUS.find((x) => x !== h.solution.s);
  h.act(q.id, { type: 'accuse', s: bs, w: h.solution.w, r: h.solution.r });
  ok(q.out && h.status === 'playing' && h.cur.id !== q.id, 'accusa sbagliata: fuori, si va avanti');
}
// coprifuoco
{
  const g = mk(3); g.curfewAt = Date.now() - 1; ok(g.tick(Date.now()) && g.phase === 'curfew', 'scatta il coprifuoco');
  const s = g.solution; const [a, b, c] = g.players;
  g.act(a.id, { type: 'final', s: s.s, w: s.w, r: s.r }); g.act(b.id, { type: 'final', pass: true }); g.act(c.id, { type: 'final', s: s.s, w: s.w, r: s.r });
  ok(g.status === 'ended' && g.result.winners.length === 2, 'due vincitrici a pari merito');
  const v = g.view(a.id); ok(v.revealed && v.result.solution, 'a fine partita si rivela tutto');
}
{
  const t = nextCurfew(Date.parse('2026-11-08T20:00:00Z'), 23); // 21:00 a Roma -> stesso giorno 23:00 = 22:00Z
  ok(t === Date.parse('2026-11-08T22:00:00Z'), 'ora legale/solare: 23:00 Roma d\'inverno = 22:00Z');
  const u = nextCurfew(Date.parse('2026-07-08T12:00:00Z'), 23);
  ok(u === Date.parse('2026-07-08T21:00:00Z'), 'estate = 21:00Z');
}
// la vista non rivela segreti
{
  const g = mk(3); const a = g.players[0], b = g.players[1];
  const vb = JSON.stringify(g.view(b.id));
  ok(!vb.includes(a.cards[0]) || b.cards.includes(a.cards[0]), 'non vedi le carte altrui');
  ok(!vb.includes('"solution"'), 'la soluzione non viaggia');
}
// salvataggio
{
  const g = mk(4); bot(g, 30); const h = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  ok(h.solution.s === g.solution.s && h.players.length === 4, 'si salva e si riprende');
}
// partite intere
const N = Number(process.argv[2]) || 40; let ended = 0;
for (let i = 0; i < N; i++) { const g = mk(2 + (i % 8)); g.curfewAt = Date.now() + 1e9; const n = bot(g, 6000); if (g.status === 'ended') ended++; else { g.startCurfew(); bot(g, 100); if (g.status === 'ended') ended++; } ok(g.status === 'ended', 'partita ' + i + ' finita'); }
console.log(`OK: ${pass} controlli, ${ended}/${N} partite simulate concluse senza errori`);
