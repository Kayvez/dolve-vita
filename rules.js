'use strict';
// Test mirati sulle regole principali, con dadi decisi a mano.  Uso: node test/rules.js
const assert = require('assert');
const { Game } = require('../game');

let queue = [];
const rng = () => (queue.length ? queue.shift() : 0.5);
const face = (n) => (n - 1) / 6 + 0.01; // valore di rng che dà la faccia n
const dice = (a, b) => { queue.push(face(a), face(b)); };

function newGame(n = 3) {
  queue = [];
  const g = new Game(rng);
  const names = ['Anna', 'Bea', 'Chiara', 'Dora'];
  const em = ['🚗', '🎩', '🐶', '🐱'];
  g.setSettings({ preset: 'classic' });
  for (let i = 0; i < n; i++) g.join(names[i], em[i]);
  g.players = g.players.slice(); // niente shuffle: ordine di ingresso
  const shuffled = g.rng;
  g.rng = () => 0.999; // start() mescola: forziamo un ordine noto
  g.start();
  g.rng = shuffled;
  return g;
}
const by = (g, name) => g.players.find((p) => p.name === name);
const give = (g, p, idx) => { g.props[idx].owner = p.id; };

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };

t('lancio, movimento e acquisto', () => {
  const g = newGame();
  const p = g.cur;
  dice(1, 2); // 3 -> Alberobello
  assert.ok(g.act(p.id, { type: 'roll' }).ok);
  assert.strictEqual(p.pos, 3);
  assert.strictEqual(g.phase, 'buy');
  assert.ok(g.act(p.id, { type: 'buy' }).ok);
  assert.strictEqual(p.cash, 1500 - 60);
  assert.strictEqual(g.props[3].owner, p.id);
  assert.strictEqual(g.phase, 'action');
  g.act(p.id, { type: 'endTurn' });
  assert.notStrictEqual(g.cur.id, p.id);
});

t('affitto base e doppio con colore completo', () => {
  const g = newGame();
  const [a, b] = g.players;
  give(g, a, 1); give(g, a, 3);
  b.pos = 0; g.turnIdx = 1; g.phase = 'roll';
  dice(1, 2); // Alberobello: affitto base 4, x2 = 8
  g.act(b.id, { type: 'roll' });
  assert.strictEqual(b.cash, 1500 - 8);
  assert.strictEqual(a.cash, 1500 + 8);
});

t('affitto stazioni (2 stazioni = 50) e società (10x con due)', () => {
  const g = newGame();
  const [a, b] = g.players;
  give(g, a, 5); give(g, a, 15);
  b.pos = 0; g.turnIdx = 1; g.phase = 'roll';
  dice(2, 3);
  g.act(b.id, { type: 'roll' });
  assert.strictEqual(b.cash, 1450);
  const g2 = newGame();
  const [c, d] = g2.players;
  give(g2, c, 12); give(g2, c, 28);
  d.pos = 7; g2.turnIdx = 1; g2.phase = 'roll';
  dice(1, 4); // 12: società, 10 x 5 = 50
  g2.act(d.id, { type: 'roll' });
  assert.strictEqual(d.cash, 1450);
});

t('passaggio dalla Partenza', () => {
  const g = newGame();
  const p = g.cur;
  p.pos = 38;
  dice(1, 2); // -> 1 (I Sassi)
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(p.pos, 1);
  assert.strictEqual(p.cash, 1700);
});

t('tre doppi di fila = prigione', () => {
  const g = newGame();
  const p = g.cur;
  dice(1, 1); g.act(p.id, { type: 'roll' });           // 2: Sorpresa (carta)
  if (g.phase === 'buy') g.act(p.id, { type: 'decline' });
  while (g.phase === 'auction') g.act(g.auction.active[0], { type: 'pass' });
  g.act(p.id, { type: 'endTurn' });
  assert.strictEqual(g.phase, 'roll');
  assert.strictEqual(g.cur.id, p.id);
  p.pos = 0; dice(2, 2); g.act(p.id, { type: 'roll' });
  while (g.phase === 'auction') g.act(g.auction.active[0], { type: 'pass' });
  if (g.phase === 'buy') g.act(p.id, { type: 'decline' });
  while (g.phase === 'auction') g.act(g.auction.active[0], { type: 'pass' });
  g.act(p.id, { type: 'endTurn' });
  p.pos = 0; dice(3, 3); g.act(p.id, { type: 'roll' });
  assert.ok(p.inJail);
  assert.strictEqual(p.pos, 10);
  g.act(p.id, { type: 'endTurn' });
  assert.notStrictEqual(g.cur.id, p.id);
});

t('prigione: pagare e tirare, o fare doppio', () => {
  const g = newGame();
  const p = g.cur;
  p.inJail = true; p.pos = 10;
  assert.ok(g.act(p.id, { type: 'payJail' }).ok);
  assert.strictEqual(p.cash, 1450);
  assert.ok(!p.inJail);
  const g2 = newGame();
  const q = g2.cur;
  q.inJail = true; q.pos = 10;
  dice(3, 3); // doppio: esce e si muove di 6 -> 16 (Bologna)
  g2.act(q.id, { type: 'roll' });
  assert.ok(!q.inJail);
  assert.strictEqual(q.pos, 16);
  assert.strictEqual(g2.canRollAgain, false);
});

t('prigione: dopo 3 tentativi paga e si muove', () => {
  const g = newGame(2);
  const p = g.cur;
  p.inJail = true; p.pos = 10; p.jailTurns = 2;
  dice(1, 2); // 3, non doppio
  g.act(p.id, { type: 'roll' });
  assert.ok(!p.inJail);
  assert.strictEqual(p.cash, 1450);
  assert.strictEqual(p.pos, 13);
});

t('costruzione: serve il colore, regola uniforme, vendita', () => {
  const g = newGame();
  const [a] = g.players;
  give(g, a, 1);
  assert.ok(!g.act(a.id, { type: 'build', idx: 1 }).ok);
  give(g, a, 3);
  assert.ok(g.act(a.id, { type: 'build', idx: 1 }).ok);
  assert.ok(!g.act(a.id, { type: 'build', idx: 1 }).ok, 'regola uniforme');
  assert.ok(g.act(a.id, { type: 'build', idx: 3 }).ok);
  assert.strictEqual(a.cash, 1400);
  assert.ok(g.act(a.id, { type: 'sell', idx: 1 }).ok);
  assert.strictEqual(a.cash, 1425);
  // affitto con una casa
  g.props[1].houses = 1; g.props[3].houses = 1;
  assert.strictEqual(g.rentFor(1, {}), 10);
});

t('ipoteca: incassa metà, non con case, riscatto +10%', () => {
  const g = newGame();
  const [a] = g.players;
  give(g, a, 1); give(g, a, 3);
  g.props[1].houses = 1; g.props[3].houses = 1;
  assert.ok(!g.act(a.id, { type: 'mortgage', idx: 1 }).ok);
  g.props[1].houses = 0; g.props[3].houses = 0;
  assert.ok(g.act(a.id, { type: 'mortgage', idx: 1 }).ok);
  assert.strictEqual(a.cash, 1530);
  assert.ok(g.act(a.id, { type: 'unmortgage', idx: 1 }).ok);
  assert.strictEqual(a.cash, 1530 - 33);
});

t('asta: rilancio, ritiro e vincitore', () => {
  const g = newGame();
  const p = g.cur;
  dice(1, 2);
  g.act(p.id, { type: 'roll' });
  g.act(p.id, { type: 'decline' });
  assert.strictEqual(g.phase, 'auction');
  const [a, b, c] = g.players;
  assert.ok(g.act(a.id, { type: 'bid', amount: 20 }).ok);
  assert.ok(!g.act(b.id, { type: 'bid', amount: 20 }).ok);
  assert.ok(g.act(b.id, { type: 'bid', amount: 30 }).ok);
  g.act(a.id, { type: 'pass' });
  assert.strictEqual(g.phase, 'auction');
  g.act(c.id, { type: 'pass' });
  assert.strictEqual(g.phase, 'action');
  assert.strictEqual(g.props[3].owner, b.id);
  assert.strictEqual(b.cash, 1470);
});

t('debito: serve ipotecare, poi si salda da solo', () => {
  const g = newGame();
  const [a, b] = g.players;
  give(g, b, 39); // Roma, affitto 50
  a.cash = 20; give(g, a, 1);
  a.pos = 35; g.turnIdx = 0; g.phase = 'roll';
  dice(2, 2); // 4 -> 39
  g.act(a.id, { type: 'roll' });
  assert.strictEqual(g.phase, 'debt');
  assert.ok(!g.act(a.id, { type: 'endTurn' }).ok);
  assert.ok(g.act(a.id, { type: 'mortgage', idx: 1 }).ok); // +30 = 50 -> paga
  assert.strictEqual(g.phase, 'action');
  assert.strictEqual(a.cash, 0);
  assert.strictEqual(b.cash, 1550);
});

t('bancarotta verso un giocatore: eredita tutto', () => {
  const g = newGame(3);
  const [a, b, c] = g.players;
  give(g, b, 39); give(g, a, 1);
  a.cash = 5;
  a.pos = 35; g.turnIdx = 0; g.phase = 'roll';
  dice(2, 2);
  g.act(a.id, { type: 'roll' });
  assert.strictEqual(g.phase, 'debt');
  g.act(a.id, { type: 'mortgage', idx: 1 });
  assert.strictEqual(g.phase, 'debt');
  assert.ok(g.act(a.id, { type: 'bankrupt' }).ok);
  assert.ok(a.bankrupt);
  assert.strictEqual(g.props[1].owner, b.id);
  assert.strictEqual(g.cur.id, b.id);
  assert.strictEqual(g.phase, 'roll');
});

t('vince l\'ultimo rimasto', () => {
  const g = newGame(2);
  const [a, b] = g.players;
  g.act(a.id, { type: 'bankrupt' });
  assert.strictEqual(g.status, 'ended');
  assert.strictEqual(g.winner, b.id);
});

t('scambio con proprietà ipotecata: chi riceve paga il 10%', () => {
  const g = newGame();
  const [a, b] = g.players;
  give(g, a, 6); g.props[6].mortgaged = true; // Cinque Terre, prezzo 100 -> fee 5
  const r = g.act(a.id, { type: 'propose', to: b.id, offer: { cash: 0, props: [6], jail: 0 }, request: { cash: 100, props: [], jail: 0 } });
  assert.ok(r.ok, r.error);
  const id = g.trades[0].id;
  assert.ok(g.act(b.id, { type: 'accept', id }).ok);
  assert.strictEqual(g.props[6].owner, b.id);
  assert.strictEqual(b.cash, 1500 - 100 - 5);
  assert.strictEqual(a.cash, 1600);
});

t('scambio rifiutato se mancano i soldi, e non si scambia con edifici', () => {
  const g = newGame();
  const [a, b] = g.players;
  give(g, a, 1); give(g, a, 3); g.props[1].houses = 1;
  assert.ok(!g.act(a.id, { type: 'propose', to: b.id, offer: { props: [3] }, request: { cash: 1 } }).ok);
  const r = g.act(a.id, { type: 'propose', to: b.id, offer: { cash: 5000 }, request: {} });
  assert.ok(!r.ok);
});

t('carta "esci di prigione" torna nel mazzo dopo l\'uso', () => {
  const g = newGame();
  const p = g.cur;
  const idx = g.decks.sorpresa.indexOf(3); // carta jail della Sorpresa
  g.decks.sorpresa.splice(idx, 1); g.decks.sorpresa.unshift(3);
  p.pos = 0; dice(1, 1); // 2: Sorpresa
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(p.jailCards.length, 1);
  g.phase = 'roll'; p.inJail = true;
  g.act(p.id, { type: 'useJailCard' });
  assert.strictEqual(p.jailCards.length, 0);
  assert.strictEqual(g.decks.sorpresa.length, 16);
  assert.ok(!p.inJail);
});

t('salvataggio e ripresa', () => {
  const g = newGame();
  const copy = Game.fromJSON(JSON.parse(JSON.stringify(g)), rng);
  assert.deepStrictEqual(copy.view('x'), g.view('x'));
});

// ---------- regole 2.0 ----------
const speed = (d) => queue.push(d === 'J' ? 0.7 : d === 'B' ? 0.99 : (d - 1) / 6 + 0.01); // facce: 1,2,3,J,J,B
function newUltra(n = 3, tweak) {
  queue = [];
  const g = new Game(rng);
  g.setSettings({ preset: 'ultra', events: false, aces: false, cheat: false, freeParking: false });
  if (tweak) g.setSettings(tweak);
  const names = ['Anna', 'Bea', 'Chiara', 'Dora'];
  const em = ['🚗', '🎩', '🐶', '🐱'];
  for (let i = 0; i < n; i++) g.join(names[i], em[i]);
  const keep = g.rng; g.rng = () => 0.999; g.start(); g.rng = keep;
  return g;
}

t('dado matto: il terzo dado si somma', () => {
  const g = newUltra();
  const p = g.cur;
  dice(1, 2); speed(3); // 1+2+3 = 6
  assert.ok(g.act(p.id, { type: 'roll' }).ok);
  assert.strictEqual(p.pos, 6);
  assert.strictEqual(g.dice.d3, 3);
});

t('dado matto: jolly porta alla prossima proprietà libera', () => {
  const g = newUltra();
  const p = g.cur;
  give(g, g.players.find((q) => q.id !== p.id), 3);
  dice(1, 2); speed('J'); // arriva a 3 (di altri, paga), poi jolly -> prima libera dopo 3 = 5
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(p.pos, 5); // la 4 è una tassa, la 5 è la stazione libera
  assert.strictEqual(g.phase, 'buy');
});

t('dado matto: navetta lascia scegliere il dado', () => {
  const g = newUltra();
  const p = g.cur;
  dice(2, 5); speed('B');
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(g.phase, 'choose');
  assert.ok(!g.act(p.id, { type: 'busPick', pick: 'zzz' }).ok);
  assert.ok(g.act(p.id, { type: 'busPick', pick: 'd2' }).ok);
  assert.strictEqual(p.pos, 5);
});

t('dado matto: tris permette di andare dove si vuole', () => {
  const g = newUltra();
  const p = g.cur;
  dice(2, 2); speed(2);
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(g.phase, 'choose');
  assert.strictEqual(g.choice.kind, 'tris');
  assert.ok(g.act(p.id, { type: 'warpTo', idx: 24 }).ok);
  assert.strictEqual(p.pos, 24);
  assert.ok(g.canRollAgain);
});

t('dado matto: in prigione non si usa', () => {
  const g = newUltra();
  const p = g.cur;
  p.inJail = true; p.pos = 10;
  dice(1, 2);
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(g.dice.d3, 0);
});

t('asso scudo: blocca un affitto', () => {
  const g = newUltra(3, { aces: true });
  const [a, b] = g.players;
  give(g, b, 3);
  a.aces = ['shield'];
  a.pos = 0; g.turnIdx = 0; g.phase = 'roll';
  assert.ok(g.act(a.id, { type: 'ace', ace: 'shield' }).ok);
  assert.ok(a.shield);
  dice(1, 2); speed(1); // 1+2+1 = 4... usiamo 3 caselle: niente terzo dado numerico
  queue = []; dice(1, 2); speed(1); g.settings.speedDie = false; queue = []; dice(1, 2);
  g.act(a.id, { type: 'roll' });
  assert.strictEqual(a.cash, 1500);
  assert.ok(!a.shield);
});

t('asso furto, doppio affitto e salto turno', () => {
  const g = newUltra(3, { aces: true });
  const [a, b, c] = g.players;
  a.aces = ['steal', 'skip', 'x2'];
  const r = g.act(a.id, { type: 'ace', ace: 'steal', target: b.id });
  assert.ok(r.ok);
  assert.strictEqual(a.cash, 1600); assert.strictEqual(b.cash, 1400);
  g.act(a.id, { type: 'ace', ace: 'skip', target: b.id });
  assert.strictEqual(b.skip, 1);
  g.act(a.id, { type: 'ace', ace: 'x2' });
  assert.ok(a.x2);
  assert.ok(!g.act(a.id, { type: 'ace', ace: 'steal', target: b.id }).ok); // non ce l'ha più
  g.phase = 'action';
  g.act(a.id, { type: 'endTurn' });
  assert.strictEqual(g.cur.id, c.id); // Bea salta
  assert.strictEqual(b.skip, 0);
});

t('furbetti: accusa giusta e sbagliata', () => {
  const g = newUltra(3, { cheat: true });
  const [a, b, c] = g.players;
  assert.ok(g.act(a.id, { type: 'cheat' }).ok);
  assert.strictEqual(a.cash, 1600);
  assert.ok(!g.act(a.id, { type: 'cheat' }).ok);
  g.act(b.id, { type: 'accuse' });
  assert.strictEqual(a.cash, 1400); assert.strictEqual(b.cash, 1700);
  g.act(c.id, { type: 'accuse' }); // ormai innocente: c paga 50
  assert.strictEqual(c.cash, 1450); assert.strictEqual(a.cash, 1450);
  assert.ok(!g.act(c.id, { type: 'accuse' }).ok);
});

t('eventi: partenza d\'oro, tregua, saldi', () => {
  const g = newUltra(3, { events: true });
  const [a, b] = g.players;
  g.event = { key: 'bonusGo', icon: '', title: 'x', text: '' };
  g.passGo(a);
  assert.strictEqual(a.cash, 1900);
  g.event = { key: 'truce', icon: '', title: 'Tregua', text: '' };
  give(g, b, 3);
  a.pos = 0; g.turnIdx = 0; g.phase = 'roll';
  g.settings.speedDie = false;
  dice(1, 2); g.act(a.id, { type: 'roll' });
  assert.strictEqual(a.cash, 1900);
  g.event = { key: 'saldi', icon: '', title: 'Saldi', text: '' };
  assert.strictEqual(g.priceOf(1), 50); // 60 -> 48 -> 50
});

t('temi: i nomi cambiano', () => {
  const g = newUltra(3, { theme: 'mondo' });
  assert.strictEqual(g.nm(39), 'Hong Kong');
});

t('carte nuove: furto da carta, scambio posto', () => {
  const g = newUltra(3);
  const [a, b, c] = g.players;
  // trova indice della carta heist
  const { CARDS } = require('../public/shared/data.js');
  const id = CARDS.fortuna.findIndex((c2) => c2.fx === 'heist');
  g.decks.fortuna = [id, ...g.decks.fortuna.filter((x) => x !== id)];
  g.rng = () => 0; // sceglie la prima vittima
  g.drawCard(a, 'fortuna');
  assert.strictEqual(a.cash + b.cash + c.cash, 4500);
  assert.strictEqual(a.cash, 1600);
});

t('voto delle regole: maggioranza, pareggio e durata', () => {
  queue = [];
  const g = new Game(rng);
  g.setSettings({ preset: 'classic' });
  const a = g.join('Anna', '🚗'), b = g.join('Bea', '🎩'), c = g.join('Chiara', '🐶');
  assert.strictEqual(g.settings.aces, false);
  g.act(b.id, { type: 'vote', key: 'aces', value: true });
  assert.strictEqual(g.settings.aces, false); // 1 a 2
  g.act(c.id, { type: 'vote', key: 'aces', value: true });
  assert.strictEqual(g.settings.aces, true);  // 2 a 1
  g.act(c.id, { type: 'vote', preset: 'classic' });
  assert.strictEqual(g.settings.aces, false);
  const d = g.join('Dora', '🐱');
  g.act(b.id, { type: 'vote', key: 'events', value: true });
  g.act(d.id, { type: 'vote', key: 'events', value: true });
  assert.strictEqual(g.settings.events, false); // 2 a 2: decide chi ha creato la partita (Anna, no)
});

t('durata: dopo N giri vince il patrimonio più alto', () => {
  const g = newGame(3);
  g.settings.maxRounds = 20;
  g.round = 20; g.roundTurns = 2; g.cur.cash = 5000;
  g.phase = 'action'; g.act(g.cur.id, { type: 'endTurn' });
  assert.strictEqual(g.status, 'ended');
  assert.ok(g.winner);
});

t('perms: i bottoni grigi hanno un motivo', () => {
  const g = newGame(2);
  const p = g.players[0]; give(g, p, 1);
  const v = g.view(p.id);
  assert.ok(v.perms[1].why.build);
});

t('banchiere furbo: paga a mano, trattiene, accusa giusta e sbagliata', () => {
  const g = newUltra(3, { banker: true });
  const b = g.banker();
  const [x, y] = g.players.filter((q) => q.id !== b.id);
  g.bankPay(x, 200, 'Partenza');
  assert.strictEqual(x.cash, 1500);              // non ancora pagata
  assert.strictEqual(g.view(x.id).incoming[0].amount, 200);
  assert.ok(!g.act(x.id, { type: 'payBanker', id: g.payouts[0].id, pct: 100 }).ok); // solo il banchiere
  const bank0 = b.cash;
  assert.ok(g.act(b.id, { type: 'payBanker', id: g.payouts[0].id, pct: 50 }).ok);
  assert.strictEqual(x.cash, 1600); assert.strictEqual(b.cash, bank0 + 100);
  g.act(x.id, { type: 'accuseBanker' });          // giusta: il banchiere restituisce il doppio (200)
  assert.strictEqual(x.cash, 1800); assert.strictEqual(b.cash, bank0 - 100);
  assert.ok(!g.act(x.id, { type: 'accuseBanker' }).ok); // una a giro
  g.act(y.id, { type: 'accuseBanker' });          // sbagliata: paga 50
  assert.strictEqual(y.cash, 1450);
});

t('banchiere: i pagamenti non gestiti arrivano interi a fine turno', () => {
  const g = newUltra(3, { banker: true });
  const x = g.players.find((q) => q.id !== g.bankerId);
  g.bankPay(x, 100, 'carta');
  g.phase = 'action'; g.nextTurn();
  assert.strictEqual(x.cash, 1600);
  assert.strictEqual(g.payouts.length, 0);
});

console.log(`\n${passed} test passati`);
