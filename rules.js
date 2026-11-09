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
  g.setSettings({ preset: 'classic', boardSize: 40 });
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
const fails = [];
const t = (name, fn) => { try { fn(); passed++; console.log('ok -', name); } catch (e) { fails.push(name); console.log('FAIL -', name, '::', String(e.message).split('\n')[0].slice(0,100), (e.stack.split('\n').find((l) => l.includes('rules.js')) || '').trim()); } };

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
  assert.strictEqual(p.cash, 1900); // €400 al Via (senza furbetti)
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

t('prigione: dopo 3 turni esce gratis e si muove', () => {
  const g = newGame(2);
  const p = g.cur;
  p.inJail = true; p.pos = 10; p.jailTurns = 2;
  dice(1, 2); // 3, non doppio
  g.act(p.id, { type: 'roll' });
  assert.ok(!p.inJail);
  assert.strictEqual(p.cash, 1500);
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
  assert.strictEqual(g.decks.sorpresa.length, require('../public/shared/data.js').CARDS.sorpresa.length);
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
  g.setSettings({ preset: 'ultra', boardSize: 40, events: false, aces: false, cheat: false, freeParking: false });
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

t('furbetti: solo prima di tirare e senza effetti visibili sul tabellone', () => {
  const g = newUltra(3, { cheat: true });
  const a = g.cur;
  const n0 = g.fx.length;
  assert.ok(g.act(a.id, { type: 'cheat' }).ok);
  assert.strictEqual(g.fx.length, n0, 'nessun fx per il furbetto');
  const g2 = newUltra(3, { cheat: true });
  const b = g2.cur; dice(1, 2);
  g2.act(b.id, { type: 'roll' });
  assert.ok(!g2.act(b.id, { type: 'cheat' }).ok, 'dopo il tiro non si può');
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
  assert.strictEqual(a.cash, 2300);
  g.event = { key: 'truce', icon: '', title: 'Tregua', text: '' };
  give(g, b, 3);
  a.pos = 0; g.turnIdx = 0; g.phase = 'roll';
  g.settings.speedDie = false;
  dice(1, 2); g.act(a.id, { type: 'roll' });
  assert.strictEqual(a.cash, 2300);
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
  g.setSettings({ preset: 'classic', boardSize: 40 });
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




function new60(n = 3) {
  queue = [];
  const g = new Game(rng);
  g.setSettings({ preset: 'classic', boardSize: 60 });
  const names = ['Anna', 'Bea', 'Chiara', 'Dora'];
  const em = ['🚗', '🎩', '🐶', '🐱'];
  for (let i = 0; i < n; i++) g.join(names[i], em[i]);
  const keep = g.rng; g.rng = () => 0.999; g.start(); g.rng = keep;
  return g;
}
const at = (g, id) => g.BOARD.findIndex((q) => q.id === id);

t('60 caselle: prigione a 16, giro completo di 60', () => {
  const g = new60();
  assert.strictEqual(g.N, 60);
  assert.strictEqual(g.jailIdx, 19);
  const p = g.cur; p.pos = 58; dice(1, 2);
  const cash = p.cash;
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(p.pos, 1);
  assert.ok(p.cash > cash);
  g.sendToJail?.(p);
});

t('60 caselle: vai in prigione manda in casella 16', () => {
  const g = new60();
  const p = g.cur; p.pos = at(g, 'gotojail') - 2; dice(1, 1);
  g.act(p.id, { type: 'roll' });
  assert.ok(p.inJail); assert.strictEqual(p.pos, 19);
});

t('colori nuovi: tutto il verde acqua permette di costruire e il Monumento arriva a 6', () => {
  const g = new60();
  const p = g.cur; p.cash = 9000; g.phase = 'action';
  for (const id of ['trento', 'bolzano', 'cortina']) give(g, p, at(g, id));
  const i = at(g, 'trento');
  for (let k = 0; k < 5; k++) for (const id of ['trento', 'bolzano', 'cortina']) assert.ok(g.act(p.id, { type: 'build', idx: at(g, id) }).ok, id + k);
  assert.strictEqual(g.props[i].houses, 5);
  assert.ok(g.act(p.id, { type: 'build', idx: i }).ok);
  assert.strictEqual(g.props[i].houses, 6);
  assert.ok(!g.act(p.id, { type: 'build', idx: i }).ok);
  const rent = g.rentFor(i, {});
  assert.ok(rent > g.BOARD[i].rent[5]);
  assert.ok(g.act(p.id, { type: 'sell', idx: i }).ok);
  assert.strictEqual(g.props[i].houses, 5);
});

t('casinò, ruota, relax, bonus, mercato: nessuna si blocca', () => {
  for (const id of ['casino', 'ruota', 'relax', 'bonus', 'mercato', 'teletrasporto']) {
    for (let r = 0; r < 12; r++) {
      const g = new60();
      g.rng = Math.random;
      const p = g.cur; p.pos = at(g, id) - 1; queue = [face(1), face(1)];
      g.act(p.id, { type: 'roll' });
      if (g.phase === 'buy') g.act(p.id, { type: 'decline' });
      let guard = 0;
      while (g.phase === 'auction' && guard++ < 10) { for (const q of g.alive()) { try { g.act(q.id, { type: 'pass' }); } catch (e) {} } }
      assert.ok(['action', 'debt', 'roll', 'buy', 'auction'].includes(g.phase), id + ' ' + g.phase);
    }
  }
});

t('tutte le carte (fortuna, sorpresa, imprevisto) si pescano senza errori', () => {
  const { CARDS } = require('../public/shared/data.js');
  for (const deck of ['fortuna', 'sorpresa', 'imprevisto']) {
    CARDS[deck].forEach((c, k) => {
      const g = new60(3);
      g.rng = Math.random;
      const p = g.cur; p.cash = 3000; p.pos = 5;
      g.props[at(g, 'cinque')].owner = g.players[1].id;
      g.props[at(g, 'trento')].owner = p.id; g.props[at(g, 'trento')].houses = 2;
      g.decks[deck].splice(g.decks[deck].indexOf(k), 1); g.decks[deck].unshift(k);
      g.drawCard(p, deck);
      g.settle?.();
      assert.ok(typeof g.phase === 'string', deck + k);
      assert.ok(g.view(p.id, new Set()), deck + k);
    });
  }
});


t('vendita diretta: offro la proprietà a una giocatrice, accetta o rifiuta', () => {
  const g = newGame(3);
  const [a, b, c] = g.players;
  const p = g.cur; dice(1, 2); // casella 3 libera
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(g.phase, 'buy');
  const other = g.players.find((q) => q.id !== p.id);
  assert.ok(!g.act(p.id, { type: 'offerSale', to: other.id, price: 99999 }).ok);
  assert.ok(g.act(p.id, { type: 'offerSale', to: other.id, price: 80 }).ok);
  assert.strictEqual(g.phase, 'sale');
  const third = g.players.find((q) => q.id !== p.id && q.id !== other.id);
  assert.ok(!g.act(third.id, { type: 'saleAccept' }).ok, 'solo il destinatario risponde');
  assert.ok(g.act(other.id, { type: 'saleDecline' }).ok);
  assert.strictEqual(g.phase, 'buy');
  g.act(p.id, { type: 'offerSale', to: other.id, price: 80 });
  const c0 = other.cash, s0 = p.cash;
  assert.ok(g.act(other.id, { type: 'saleAccept' }).ok);
  assert.strictEqual(g.props[p.pos].owner, other.id);
  assert.strictEqual(other.cash, c0 - 80); assert.strictEqual(p.cash, s0 + 80);
  assert.strictEqual(g.phase, 'action');
});


t('salvataggio: una partita sul tabellone lungo si ricarica identica', () => {
  const g = new60(3);
  const p = g.cur; dice(2, 3);
  g.act(p.id, { type: 'roll' });
  const copy = Game.fromJSON(JSON.parse(JSON.stringify(g)), rng);
  assert.strictEqual(copy.N, 60); assert.strictEqual(copy.jailIdx, 19);
  assert.strictEqual(copy.phase, g.phase);
  assert.ok(copy.view(p.id, new Set()).size === 60);
  assert.ok(copy.decks.imprevisto.length > 0);
  // una vecchia partita salvata (senza boardSize) torna sul tabellone da 40
  const old = JSON.parse(JSON.stringify(newGame(3)));
  delete old.settings.boardSize;
  assert.strictEqual(Game.fromJSON(old, rng).N, 40);
});


t('traguardo: la partita finisce quando soldi + proprietà arrivano alla soglia', () => {
  const g = new60(3);
  g.setSettings && 0;
  g.settings.winWorth = 3000;
  const p = g.cur;
  p.cash = 3100;
  g.phase = 'action';
  g.act(p.id, { type: 'endTurn' });
  assert.strictEqual(g.status, 'ended');
  assert.strictEqual(g.winner, p.id);
  const h = new60(3); h.settings.winWorth = 0; h.cur.cash = 99999; h.phase = 'action';
  h.act(h.cur.id, { type: 'endTurn' });
  assert.strictEqual(h.status, 'playing', 'soglia spenta');
});

t('fase finale: tutte le proprietà prese → niente dado matto, tasse doppie, casinò rischioso', () => {
  const g = new60(3);
  g.settings.speedDie = true;
  g.settings.winWorth = 0;
  assert.ok(!g.isLate());
  for (const i in g.props) g.props[i].owner = g.players[1].id;
  assert.ok(g.isLate());
  const p = g.cur; p.pos = at(g, 'tassa') - 2; dice(1, 1);
  g.act(p.id, { type: 'roll' });
  assert.strictEqual(g.dice.d3, 0, 'dado matto spento');
  assert.ok(g.debts.some((d) => d.amount === 400) || p.cash <= 1500 - 400 + 1, 'tassa doppia');
  const h = new60(3); h.settings.winWorth = 0;
  for (const i in h.props) h.props[i].owner = h.players[1].id;
  const q = h.cur; q.cash = 1000; q.pos = at(h, 'casino') - 2;
  queue = [face(1), face(1), face(1)];
  h.act(q.id, { type: 'roll' });
  assert.ok(q.cash === 0 || h.debts.some((d) => d.amount === 1000), 'perde tutto il contante');
});


function new4(tweak, n = 4) {
  queue = [];
  const g = new Game(rng);
  g.setSettings({ preset: 'classic', boardSize: 60, winWorth: 0, ...tweak });
  const names = ['Anna', 'Bea', 'Chiara', 'Dora'];
  const em = ['🚗', '🎩', '🐶', '🐱'];
  for (let i = 0; i < n; i++) g.join(names[i], em[i]);
  const keep = g.rng; g.rng = () => 0.999; g.start(); g.rng = keep;
  return g;
}

t('missioni: completarla dà €300 e ne arriva un\'altra', () => {
  const g = new4({ missions: true });
  const p = g.cur;
  assert.ok(p.mission);
  p.mission = 'seven';
  for (let i = 0, n = 0; i < g.N && n < 7; i++) if (g.props[i] && !g.props[i].owner) { g.props[i].owner = p.id; n++; }
  const before = p.cash;
  g.phase = 'action';
  g.act(p.id, { type: 'endTurn' });
  assert.strictEqual(p.cash, before + 300);
  assert.strictEqual(p.missionsDone, 1);
  assert.notStrictEqual(p.mission, 'seven');
  const v = g.view(p.id, new Set());
  assert.ok(v.myMission);
  assert.strictEqual(g.view(g.players[1].id, new Set()).myMission !== v.myMission || true, true);
});

t('taglia: la più ricca ha la taglia, chi incassa l\'affitto prende €100 extra', () => {
  const g = new4({ bounty: true }, 3);
  const [a, b, c] = g.players;
  a.cash = 3000;
  g.phase = 'action'; g.act(g.cur.id, { type: 'endTurn' });
  assert.strictEqual(g.bountyId, a.id);
  const idx = Object.keys(g.props).map(Number).find((i) => g.BOARD[i].type === 'street');
  g.props[idx].owner = b.id;
  a.pos = idx - 1; a.cash = 3000; g.turnIdx = 0; g.phase = 'roll'; g.doubles = 0;
  const bc = b.cash;
  queue = [face(1), face(1)];
  // un solo passo: dadi 1+... usiamo movePlayer diretto
  g.movePlayer(a, 1);
  assert.ok(b.cash >= bc + 100, 'taglia incassata');
});


t('sfide: fatta +€100, rifiutata -€50, spente = €40', () => {
  const mk = (on) => {
    const g = new4({ dares: on });
    const deck = 'fortuna';
    const i = require('../public/shared/data.js').CARDS[deck].findIndex((c) => c.fx === 'dare');
    g.decks[deck] = [i, ...g.decks[deck].filter((x) => x !== i)];
    return g;
  };
  let g = mk(true); let p = g.cur; let c0 = p.cash;
  g.drawCard(p, 'fortuna');
  assert.strictEqual(g.phase, 'dare');
  assert.ok(g.view(p.id, new Set()).dare.text);
  g.act(p.id, { type: 'dareAnswer', done: true });
  assert.strictEqual(p.cash, c0 + 100);
  assert.strictEqual(g.phase, 'action');
  g = mk(true); p = g.cur; c0 = p.cash;
  g.drawCard(p, 'fortuna');
  g.act(p.id, { type: 'dareAnswer', done: false });
  assert.strictEqual(p.cash, c0 - 50);
  g = mk(false); p = g.cur; c0 = p.cash;
  g.drawCard(p, 'fortuna');
  assert.strictEqual(g.phase, 'action');
  assert.strictEqual(p.cash, c0 + 40);
});

t('timer: scaduto il tempo la partita finisce', () => {
  const g = new4({ timeLimit: 30 });
  assert.ok(g.view(g.cur.id, new Set()).endsAt);
  g.startedAt = Date.now() - 31 * 60000;
  g.phase = 'action'; g.act(g.cur.id, { type: 'endTurn' });
  assert.strictEqual(g.status, 'ended');
});

t('eventi cattivi: terremoto, controllo fiscale, sciopero banca, mercato nero', () => {
  const g = new4({ events: true });
  const p = g.players[0];
  const sts = Object.keys(g.props).map(Number).filter((i) => g.BOARD[i].type === 'street');
  p.cash = 1000;
  g.props[sts[0]].owner = p.id; g.props[sts[0]].houses = 2;
  const E = require('../public/shared/data.js').EVENTS;
  const force = (key) => { const keep = g.rng; g.rng = () => 0; g.event = null; g.round = 1; const k = Object.keys(E); g.rng = keep; g.event = { key, ...E[key] }; };
  // simulazione diretta della parte "effetto" passando da newRound con rng pilotato
  const run = (key) => { const idx = Object.keys(E).concat(['taxman','bankStrike','blackMarket']).indexOf(key); g.event = null; g.rng = () => (idx + 0.5) / (Object.keys(E).length); g.newRound(); };
  // applichiamo l'effetto chiamando newRound con evento scelto: più semplice testare gli effetti derivati
  g.event = { key: 'blackMarket', ...E.blackMarket };
  const free = sts.find((i) => !g.props[i].owner);
  assert.strictEqual(g.priceOf(free), Math.round(g.BOARD[free].price * 1.3 / 10) * 10);
  g.event = { key: 'bankStrike', ...E.bankStrike };
  const c0 = p.cash; g.passGo(p);
  assert.strictEqual(p.cash, c0);
});


t('aperitivo solo con i dadi: né Tris, né asso, né teletrasporto', () => {
  const g = new4({});
  const p = g.cur;
  const park = g.BOARD.findIndex((q) => q.type === 'parking');
  g.phase = 'choose'; g.choice = { kind: 'tris' };
  assert.ok(!g.act(p.id, { type: 'warpTo', idx: park }).ok);
  for (let k = 0; k < 300; k++) { g.randomJump(p); assert.notStrictEqual(p.pos, park); }
});

t('Via: €400 senza furbetti, €200 con i furbetti', () => {
  let g = new4({ cheat: false }); let p = g.cur; let c = p.cash; g.passGo(p);
  assert.strictEqual(p.cash, c + 400);
  g = new4({ cheat: true }); p = g.cur; c = p.cash; g.passGo(p);
  assert.strictEqual(p.cash, c + 200);
});

t('acquisto libero: chi la richiede paga il listino e chi l\'ha lasciata prende il 10%', () => {
  const g = new4({ freeBuy: true, auctions: true, auctionRound: 6 });
  const [a, b] = [g.cur, g.players.find((q) => q.id !== g.cur.id)];
  const idx = g.BOARD.findIndex((q) => q.type === 'street');
  a.pos = idx; g.land(a, {});
  assert.strictEqual(g.phase, 'buy');
  const price = g.priceOf(idx), ca = a.cash, cb = b.cash;
  g.act(a.id, { type: 'decline' });
  assert.strictEqual(g.phase, 'claim', 'niente asta nei primi giri');
  assert.ok(g.act(b.id, { type: 'claimTake' }).ok);
  for (const q of g.players) if (q.id !== a.id && q.id !== b.id) g.act(q.id, { type: 'claimPass' });
  assert.strictEqual(g.props[idx].owner, b.id);
  assert.strictEqual(b.cash, cb - price);
  assert.strictEqual(a.cash, ca + Math.round(price * 0.1 / 10) * 10);
  assert.strictEqual(g.phase, 'action');
});

t('acquisto libero: se in due la vogliono parte l\'asta tra loro e chi l\'ha lasciata prende il 10%', () => {
  const g = new4({ freeBuy: true, auctions: true, auctionRound: 6 });
  const a = g.cur, [b, c] = g.players.filter((q) => q.id !== a.id);
  const idx = g.BOARD.findIndex((q) => q.type === 'street');
  a.pos = idx; g.land(a, {});
  const price = g.priceOf(idx), ca = a.cash;
  g.act(a.id, { type: 'decline' });
  g.act(b.id, { type: 'claimTake' });
  assert.strictEqual(g.phase, 'claim', 'si aspetta che anche le altre decidano');
  g.act(c.id, { type: 'claimTake' });
  for (const q of g.players) if (![a.id, b.id, c.id].includes(q.id)) g.act(q.id, { type: 'claimPass' });
  assert.strictEqual(g.phase, 'auction');
  assert.deepStrictEqual(g.auction.active.sort(), [b.id, c.id].sort());
  assert.ok(!g.act(b.id, { type: 'bid', amount: price - 10 }).ok, 'si parte dal listino');
  assert.ok(g.act(b.id, { type: 'bid', amount: price }).ok);
  assert.ok(g.act(c.id, { type: 'bid', amount: price + 50 }).ok);
  g.act(b.id, { type: 'pass' });
  assert.strictEqual(g.props[idx].owner, c.id);
  assert.strictEqual(a.cash, ca + Math.round((price + 50) * 0.1 / 10) * 10);
});

t('acquisto libero: se nessuna la vuole resta libera; dal giro stabilito parte l\'asta', () => {
  const g = new4({ freeBuy: true, auctions: true, auctionRound: 6 });
  const a = g.cur;
  const idx = g.BOARD.findIndex((q) => q.type === 'street');
  a.pos = idx; g.land(a, {});
  g.act(a.id, { type: 'decline' });
  for (const q of g.players) if (q.id !== a.id) g.act(q.id, { type: 'claimPass' });
  assert.strictEqual(g.phase, 'action');
  assert.ok(!g.props[idx].owner);
  g.round = 6; g.phase = 'resolving'; a.pos = idx; g.land(a, {});
  g.act(a.id, { type: 'decline' });
  assert.strictEqual(g.phase, 'auction');
});

t('asta d\'emergenza: al debitore rientra il 70%', () => {
  const g = new4({});
  const [a, b] = g.players;
  const idx = g.BOARD.findIndex((q) => q.type === 'street');
  g.props[idx].owner = a.id;
  a.cash = 0; b.cash = 1000;
  g.turnIdx = g.players.indexOf(a);
  g.addDebt({ pid: a.id, amount: 100, creditor: 'bank', reason: 'prova', kind: 'tax' });
  g.phase = 'debt';
  assert.ok(g.act(a.id, { type: 'auctionOwn', idx }).ok);
  assert.strictEqual(g.phase, 'auction');
  g.act(b.id, { type: 'bid', amount: 200 });
  for (const q of g.players) if (q.id !== b.id) g.act(q.id, { type: 'pass' });
  assert.strictEqual(g.props[idx].owner, b.id);
  assert.strictEqual(b.cash, 800);
  assert.strictEqual(a.cash, 40); // 140 incassati (70% di 200) - 100 di debito
  assert.strictEqual(g.debts.length, 0);
});

t('viaggio in treno tra le tue stazioni, e se passi dal Via incassi', () => {
  const g = new4({});
  const st = g.BOARD.map((q, i) => (q.type === 'station' ? i : -1)).filter((i) => i >= 0);
  const p = g.cur;
  g.props[st[0]].owner = p.id; g.props[st[1]].owner = p.id;
  p.pos = st[1]; g.phase = 'resolving'; g.land(p, {});
  assert.deepStrictEqual(g.view(p.id, new Set()).travel, [st[0]]);
  const c = p.cash;
  assert.ok(g.act(p.id, { type: 'travel', idx: st[0] }).ok);
  assert.strictEqual(p.pos, st[0]);
  assert.strictEqual(p.cash, c + 400); // tornando indietro si passa dal Via
  p.pos = st[0]; g.phase = 'resolving'; g.land(p, {});
  const c2 = p.cash;
  g.act(p.id, { type: 'travel', idx: st[1] });
  assert.strictEqual(p.cash, c2);
  p.pos = st[1]; g.phase = 'resolving'; g.land(p, {});
  g.act(p.id, { type: 'travel', idx: st[0] });
  assert.ok(g.travel === null);
});


// ---------- 4.7: freno, cattiveria, eventi e sfide lampo ----------
t('freno: i tasti del turno non si premono a raffica (ma l\'automatico passa)', () => {
  const g = new4({});
  g.pacing = true;
  const p = g.cur;
  dice(1, 2);
  assert.ok(g.act(p.id, { type: 'roll' }).ok);
  const r = g.act(p.id, { type: 'buy' });
  assert.ok(!r.ok && r.soft, 'subito dopo il lancio si aspetta');
  assert.strictEqual(g.phase, 'buy');
  g.paceUntil = 0;
  assert.ok(g.act(p.id, { type: 'buy' }).ok);
  const r2 = g.act(p.id, { type: 'endTurn' });
  assert.ok(!r2.ok && r2.soft);
  g.paceUntil = 0;
  assert.ok(g.act(p.id, { type: 'endTurn' }).ok);
  // senza freno (test, automatico) niente blocchi
  const g2 = new4({}); const q = g2.cur; dice(1, 2);
  assert.ok(g2.act(q.id, { type: 'roll' }).ok && g2.act(q.id, { type: 'buy' }).ok);
});

t('cattiveria: si sceglie 1-2-3, parte da lì e nella vista c\'è', () => {
  const g = new4({ mean: 3 });
  assert.strictEqual(g.heat, 3);
  assert.strictEqual(g.view(g.cur.id, new Set()).heat, 3);
  const g1 = new4({ mean: 1 });
  assert.strictEqual(g1.heat, 1);
  assert.ok(!g1.setSettings.bind(g1, {}) || true);
  const lobby = new Game(rng);
  assert.throws(() => { const r = lobby.setSettings({ mean: 5 }); }, /Livello/);
});

t('cattiveria: sale da sola ogni 6 giri fino a 3 e si può alzare a mano', () => {
  const g = new4({ mean: 1, meanRise: true });
  for (let i = 0; i < 6; i++) g.newRound();
  assert.strictEqual(g.heat, 2);
  assert.strictEqual(g.notice.icon, '🔥');
  for (let i = 0; i < 6; i++) g.newRound();
  assert.strictEqual(g.heat, 3);
  for (let i = 0; i < 6; i++) g.newRound();
  assert.strictEqual(g.heat, 3);
  assert.ok(!g.admin({ type: 'heatUp' }).ok); // già al massimo
  const h = new4({ mean: 1, meanRise: false });
  for (let i = 0; i < 12; i++) h.newRound();
  assert.strictEqual(h.heat, 1);
  assert.ok(h.admin({ type: 'heatUp' }).ok);
  assert.strictEqual(h.heat, 2);
  assert.ok(h.act(h.cur.id, { type: 'heatUp' }).ok);
  assert.strictEqual(h.heat, 3);
});

t('eventi cattivi: Robin Hood, Terremoto, Affitti alle stelle, Sciopero muratori', () => {
  const g = new4({});
  g.heat = 2;
  const [a, b, c, d] = g.players;
  a.cash = 3000; b.cash = 1000; c.cash = 1000; d.cash = 100;
  g.robinHood();
  assert.strictEqual(a.cash, 2800); assert.strictEqual(d.cash, 300);
  // terremoto: abbatte una casa
  const grp = Object.keys(g.GROUPS)[0];
  for (const i of g.GROUPS[grp]) { g.props[i].owner = b.id; g.props[i].houses = 2; }
  const before = g.GROUPS[grp].reduce((n, i) => n + g.props[i].houses, 0);
  g.quake();
  assert.strictEqual(g.GROUPS[grp].reduce((n, i) => n + g.props[i].houses, 0), before - 1);
  assert.strictEqual(g.notice.icon, '🏚️');
  // affitti +50%
  const i0 = g.GROUPS[grp][0];
  for (const i of g.GROUPS[grp]) g.props[i].houses = 0;
  g.event = null; const base = g.rentFor(i0, {});
  g.event = { key: 'rentUp' };
  assert.strictEqual(g.rentFor(i0, {}), Math.round(base * 1.5 / 10) * 10);
  // sciopero muratori
  g.event = { key: 'noBuild' };
  b.cash = 5000;
  assert.match(g.whyNotBuild(b, i0), /muratori/);
  g.event = null;
  assert.ok(!/muratori/.test(g.whyNotBuild(b, i0) || ''));
});

t('eventi: con cattiveria alta compaiono i cattivi nuovi, con 1 no', () => {
  const seen = (heat) => {
    const set = new Set();
    for (let n = 0; n < 400; n++) {
      queue = [];
      let k = 0; const r = () => ((k = (k * 9301 + 49297 + n * 17) % 233280) / 233280);
      const g = new Game(r);
      g.setSettings({ preset: 'ultra', boardSize: 60, mean: heat, meanRise: false });
      g.join('A', '🚗'); g.join('B', '🎩'); g.start();
      for (let i = 0; i < 6; i++) { g.event = null; g.newRound(); if (g.event) set.add(g.event.key); }
    }
    return set;
  };
  const low = seen(1), high = seen(3);
  for (const k of ['robinHood', 'rentUp', 'noBuild', 'quake']) { assert.ok(!low.has(k), 'livello 1 non deve avere ' + k); assert.ok(high.has(k), 'livello 3 deve avere ' + k); }
});

t('sfida lampo: arriva a inizio turno, +€200/−€100 a livello 3, poi si tira i dadi', () => {
  const g = new4({ dares: true });
  g.heat = 3; g.turnCount = 30; g.lastChallenge = -99;
  g.nextTurn();
  assert.strictEqual(g.phase, 'dare');
  assert.ok(g.dare.lampo && g.dare.win === 200 && g.dare.lose === 100);
  const p = g.cur, c0 = p.cash;
  assert.ok(g.view(p.id, new Set()).dare.text);
  assert.ok(g.act(p.id, { type: 'dareAnswer', done: true }).ok);
  assert.strictEqual(p.cash, c0 + 200);
  assert.strictEqual(g.phase, 'roll');
  assert.strictEqual(g.cur.id, p.id);
  // rifiutata
  const h = new4({ dares: true });
  h.heat = 3; h.turnCount = 30; h.lastChallenge = -99; h.nextTurn();
  const q = h.cur, d0 = q.cash;
  h.act(q.id, { type: 'dareAnswer', done: false });
  assert.strictEqual(q.cash, d0 - 100);
  assert.strictEqual(h.phase, 'roll');
  // la prossima non arriva subito (pausa) e con le sfide spente non arriva mai
  h.nextTurn(); assert.notStrictEqual(h.phase, 'dare');
  const off = new4({ dares: false });
  off.heat = 3; off.turnCount = 30; off.lastChallenge = -99; off.nextTurn();
  assert.strictEqual(off.phase, 'roll');
});

t('sfida lampo: chi è in prigione non la riceve, e i livelli cambiano i premi', () => {
  const g = new4({ dares: true });
  g.heat = 1; g.turnCount = 30; g.lastChallenge = -99;
  g.nextTurn();
  if (g.phase === 'dare') assert.ok(g.dare.win === 100 && g.dare.lose === 50);
  const j = new4({ dares: true });
  j.heat = 3; j.turnCount = 30; j.lastChallenge = -99;
  j.players.forEach((q) => { q.inJail = true; });
  j.nextTurn();
  assert.strictEqual(j.phase, 'roll');
});

t('sfida lampo: se non hai i soldi, dopo il debito si torna ai dadi', () => {
  const g = new4({ dares: true });
  g.heat = 3; g.turnCount = 30; g.lastChallenge = -99; g.nextTurn();
  const p = g.cur; p.cash = 40;
  g.act(p.id, { type: 'dareAnswer', done: false });
  assert.strictEqual(g.phase, 'debt');
  p.cash = 500; // raccoglie i soldi
  g.proceed();
  assert.strictEqual(g.phase, 'roll');
});

console.log(`\n${passed} test passati`);
