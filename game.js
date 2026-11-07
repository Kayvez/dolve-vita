'use strict';
// Motore di gioco: tutte le regole stanno qui, il server decide tutto.
const crypto = require('crypto');
let DATA;
try { DATA = require('./public/shared/data.js'); } catch (e) { DATA = require('./data.js'); } // funziona anche con i file tutti nella stessa cartella
const { TITLE, BOARD, CARDS, ACES, EVENTS, THEMES, GROUP_NAMES, TOKENS, COLORS } = DATA;

class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };

const isOwnable = (sq) => sq.type === 'street' || sq.type === 'station' || sq.type === 'util';
const GROUPS = {};
const STATIONS = [];
const UTILS = [];
BOARD.forEach((sq, i) => {
  if (sq.type === 'street') (GROUPS[sq.group] = GROUPS[sq.group] || []).push(i);
  if (sq.type === 'station') STATIONS.push(i);
  if (sq.type === 'util') UTILS.push(i);
});
const MAX_HOUSES = 32;
const MAX_HOTELS = 12;
const GO_BONUS = 200;
const JAIL_FINE = 50;
const MAX_PLAYERS = 8;
const MAX_ACES = 3;
const SPEED_FACES = [1, 2, 3, 'J', 'J', 'B']; // Dado Matto: numeri, 2 Jolly, 1 Navetta
const PRESETS = {
  classic: { freeParking: false, auctions: true, speedDie: false, aces: false, events: false, cheat: false },
  ultra: { freeParking: true, auctions: true, speedDie: true, aces: true, events: true, cheat: false },
};
const DEFAULT_SETTINGS = { startCash: 1500, showCash: false, theme: 'italia', ...PRESETS.ultra };

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const eur = (n) => '€' + n;

class Game {
  constructor(rng) {
    this.rng = rng || Math.random;
    this.init();
  }

  init() {
    this.status = 'lobby'; // lobby | playing | ended
    this.settings = { ...DEFAULT_SETTINGS };
    this.players = [];
    this.props = {};
    BOARD.forEach((sq, i) => { if (isOwnable(sq)) this.props[i] = { owner: null, houses: 0, mortgaged: false }; });
    this.hostId = null;
    this.turnIdx = 0;
    this.phase = 'lobby'; // lobby | roll | buy | auction | action | debt | ended
    this.doubles = 0;
    this.canRollAgain = false;
    this.dice = { d1: 0, d2: 0, d3: 0, seq: 0 };
    this.choice = null;      // scelta in sospeso: navetta o tris
    this.event = null;       // evento di città del giro
    this.eventSeq = 0;
    this.round = 0;
    this.roundTurns = 0;
    this.cheat = null;       // imbroglio in corso nel turno
    this.cheatDone = false;
    this.accused = [];
    this.fx = [];
    this.fxSeq = 0;
    this.auction = null;
    this.debts = [];
    this.cont = null;
    this.trades = [];
    this.tradeSeq = 0;
    this.log = [];
    this.logSeq = 0;
    this.card = null;
    this.cardSeq = 0;
    this.pot = 0;
    this.winner = null;
    this.ranking = null;
    this.turnCount = 0;
    this.decks = {
      fortuna: shuffle(CARDS.fortuna.map((_, i) => i), this.rng),
      sorpresa: shuffle(CARDS.sorpresa.map((_, i) => i), this.rng),
    };
  }

  // ---------- persistenza ----------
  toJSON() {
    const o = {};
    for (const k of Object.keys(this)) if (k !== 'rng') o[k] = this[k];
    return o;
  }
  static fromJSON(obj, rng) {
    const g = new Game(rng);
    Object.assign(g, obj);
    g.settings = { ...DEFAULT_SETTINGS, ...(obj.settings || {}) };
    for (const p of g.players) {
      if (!p.aces) p.aces = [];
      if (p.skip === undefined) p.skip = 0;
      if (p.shield === undefined) p.shield = false;
      if (p.x2 === undefined) p.x2 = false;
    }
    return g;
  }

  // ---------- utilità ----------
  get cur() { return this.players[this.turnIdx]; }
  player(id) { return this.players.find((p) => p.id === id); }
  byToken(token) { return token ? this.players.find((p) => p.token === token) : undefined; }
  alive() { return this.players.filter((p) => !p.bankrupt); }
  die() { return 1 + Math.floor(this.rng() * 6); }
  addLog(kind, text) {
    this.log.push({ id: ++this.logSeq, kind, text });
    if (this.log.length > 80) this.log.shift();
  }
  nm(i) { return DATA.nameOf(this.settings.theme, i); }
  priceOf(i) {
    const base = BOARD[i].price;
    return this.event && this.event.key === 'saldi' ? Math.round((base * 0.8) / 10) * 10 : base;
  }
  owned(pid) { return Object.keys(this.props).map(Number).filter((i) => this.props[i].owner === pid); }
  ownsGroup(pid, group) { return GROUPS[group].every((i) => this.props[i].owner === pid); }
  housesUsed() { let n = 0; for (const i in this.props) { const h = this.props[i].houses; if (h > 0 && h < 5) n += h; } return n; }
  hotelsUsed() { let n = 0; for (const i in this.props) if (this.props[i].houses === 5) n++; return n; }
  housesLeft() { return MAX_HOUSES - this.housesUsed(); }
  hotelsLeft() { return MAX_HOTELS - this.hotelsUsed(); }
  netWorth(p) {
    let w = p.cash;
    for (const i of this.owned(p.id)) {
      const sq = BOARD[i], pr = this.props[i];
      w += pr.mortgaged ? sq.price / 2 : sq.price;
      if (sq.type === 'street') w += pr.houses * sq.houseCost;
    }
    return w;
  }

  // ---------- lobby ----------
  join(name, emoji) {
    if (this.status !== 'lobby') fail('La partita è già iniziata.');
    if (this.players.length >= MAX_PLAYERS) fail('La partita è piena (massimo 8).');
    name = String(name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 14);
    if (!name) fail('Scrivi il tuo nome.');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('Questo nome è già preso.');
    if (!TOKENS.includes(emoji)) fail('Scegli una pedina.');
    if (this.players.some((p) => p.emoji === emoji)) fail('Questa pedina è già presa.');
    const used = this.players.map((p) => p.color);
    const color = COLORS.find((c) => !used.includes(c)) || COLORS[0];
    const p = {
      id: 'p' + (this.players.length + 1) + crypto.randomBytes(2).toString('hex'),
      token: crypto.randomBytes(12).toString('hex'),
      name, emoji, color, cash: 0, pos: 0,
      inJail: false, jailTurns: 0, jailCards: [], bankrupt: false,
      aces: [], shield: false, x2: false, skip: 0,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.addLog('join', `${p.emoji} ${p.name} entra in partita`);
    return p;
  }

  leave(p) {
    if (this.status !== 'lobby') fail('Non puoi uscire a partita iniziata.');
    this.players = this.players.filter((q) => q.id !== p.id);
    if (this.hostId === p.id) this.hostId = this.players[0] ? this.players[0].id : null;
  }

  setSettings(s) {
    if (this.status !== 'lobby') fail('Le regole si cambiano prima di iniziare.');
    if (s.startCash !== undefined) {
      const v = Number(s.startCash);
      if (![1000, 1500, 2000, 3000].includes(v)) fail('Importo non valido.');
      this.settings.startCash = v;
    }
    if (s.preset !== undefined) {
      if (!PRESETS[s.preset]) fail('Preset non valido.');
      Object.assign(this.settings, PRESETS[s.preset]);
    }
    if (s.theme !== undefined) {
      if (!THEMES[s.theme]) fail('Tema non valido.');
      this.settings.theme = s.theme;
    }
    for (const k of ['freeParking', 'showCash', 'auctions', 'speedDie', 'aces', 'events', 'cheat']) if (s[k] !== undefined) this.settings[k] = !!s[k];
    if (this.settings.cheat) this.settings.showCash = false; // con i furbetti i soldi restano segreti
  }

  start() {
    if (this.status !== 'lobby') fail('Partita già avviata.');
    if (this.players.length < 2) fail('Servono almeno 2 giocatori.');
    this.players = shuffle(this.players, this.rng);
    for (const p of this.players) { p.cash = this.settings.startCash; p.pos = 0; p.aces = []; p.shield = false; p.x2 = false; p.skip = 0; }
    if (this.settings.aces) for (const p of this.players) this.giveAce(p, true);
    this.status = 'playing';
    this.turnIdx = 0;
    this.phase = 'roll';
    this.addLog('start', `Si comincia! Per prima gioca ${this.cur.emoji} ${this.cur.name}`);
  }

  // ---------- turni ----------
  needTurn(p, phase) {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    if (this.cur.id !== p.id) fail('Non è il tuo turno.');
    if (phase && this.phase !== phase) fail('Non puoi farlo adesso.');
  }

  roll(p) {
    this.needTurn(p, 'roll');
    const d1 = this.die(), d2 = this.die();
    const useSpeed = this.settings.speedDie && !p.inJail;
    const d3 = useSpeed ? SPEED_FACES[Math.floor(this.rng() * 6)] : 0;
    const num3 = typeof d3 === 'number' ? d3 : 0;
    const total = d1 + d2 + num3, dbl = d1 === d2;
    this.dice = { d1, d2, d3, seq: this.dice.seq + 1 };
    this.card = null;
    const extra = d3 === 'J' ? ' + 🃏 Jolly' : d3 === 'B' ? ' + 🚌 Navetta' : num3 ? ` + ${num3}` : '';
    this.addLog('dice', `${p.emoji} ${p.name} tira ${d1} + ${d2}${extra}${dbl ? ' (doppio!)' : ''}`);
    if (p.inJail) {
      if (dbl) {
        this.releaseFromJail(p);
        this.addLog('jail', `${p.name} esce di prigione con un doppio`);
        this.doubles = 0;
        this.canRollAgain = false;
        this.movePlayer(p, total);
      } else {
        p.jailTurns++;
        this.canRollAgain = false;
        if (p.jailTurns >= 3) {
          this.addLog('jail', `${p.name} paga la multa di ${eur(JAIL_FINE)} ed esce di prigione`);
          this.debts.push({ pid: p.id, amount: JAIL_FINE, creditor: 'bank', reason: 'multa di uscita' });
          this.cont = { type: 'jailMove', steps: total };
          this.proceed();
        } else {
          this.addLog('jail', `${p.name} non fa doppio e resta in prigione`);
          this.phase = 'action';
        }
      }
      return;
    }
    if (dbl) {
      this.doubles++;
      if (this.doubles >= 3) {
        this.addLog('jail', `${p.name} fa tre doppi di fila: in prigione!`);
        this.sendToJail(p);
        this.proceed();
        return;
      }
      this.canRollAgain = true;
    } else {
      this.doubles = 0;
      this.canRollAgain = false;
    }
    if (dbl && num3 === d1) {
      this.choice = { kind: 'tris', pid: p.id, d1, d2 };
      this.phase = 'choose';
      this.addLog('dice', `✨ TRIS! ${p.name} può andare dove vuole`);
      return;
    }
    if (d3 === 'B') {
      this.choice = { kind: 'bus', pid: p.id, d1, d2 };
      this.phase = 'choose';
      this.addLog('dice', `🚌 ${p.name} sale sulla navetta: sceglie quanto muoversi`);
      return;
    }
    if (d3 === 'J') this.cont = { type: 'jolly' };
    this.movePlayer(p, total);
  }

  busPick(p, pick) {
    this.needTurn(p, 'choose');
    const c = this.choice;
    if (!c || c.kind !== 'bus') fail('Nessuna scelta da fare.');
    const steps = pick === 'd1' ? c.d1 : pick === 'd2' ? c.d2 : pick === 'sum' ? c.d1 + c.d2 : 0;
    if (!steps) fail('Scelta non valida.');
    this.choice = null;
    this.addLog('dice', `${p.name} sceglie di muoversi di ${steps}`);
    this.movePlayer(p, steps);
  }

  warpTo(p, idx) {
    this.needTurn(p, 'choose');
    const c = this.choice;
    if (!c || c.kind !== 'tris') fail('Nessuna scelta da fare.');
    if (!Number.isInteger(idx) || idx < 0 || idx > 39) fail('Casella non valida.');
    if (idx === p.pos) fail('Sei già lì.');
    this.choice = null;
    this.teleport(p, idx);
  }

  teleport(p, idx) {
    if (idx < p.pos) this.passGo(p);
    p.pos = idx;
    this.addLog('move', `${p.emoji} ${p.name} vola a ${this.nm(idx)}`);
    this.land(p, {});
  }

  releaseFromJail(p) { p.inJail = false; p.jailTurns = 0; }

  sendToJail(p) {
    p.pos = 10;
    p.inJail = true;
    p.jailTurns = 0;
    this.doubles = 0;
    this.canRollAgain = false;
    this.addLog('jail', `${p.emoji} ${p.name} va in prigione`);
  }

  movePlayer(p, steps) {
    const old = p.pos;
    const np = (((old + steps) % 40) + 40) % 40;
    if (steps > 0 && np < old) this.passGo(p);
    p.pos = np;
    this.land(p, {});
  }

  passGo(p) {
    const gold = this.event && this.event.key === 'bonusGo';
    const amount = GO_BONUS * (gold ? 2 : 1);
    p.cash += amount;
    this.addLog('go', `${p.name} passa dalla Partenza e ritira ${eur(amount)}${gold ? ' (Partenza d\'oro!)' : ''}`);
    if (this.settings.aces && this.rng() < 0.6) this.giveAce(p);
  }

  // ---------- carte Asso nella manica ----------
  giveAce(p, quiet) {
    if (p.aces.length >= MAX_ACES) { if (!quiet) this.addLog('ace', `${p.name} ha già 3 assi: questo va perso`); return; }
    const keys = Object.keys(ACES);
    const key = keys[Math.floor(this.rng() * keys.length)];
    p.aces.push(key);
    if (!quiet) this.addLog('ace', `🃏 ${p.name} guadagna un Asso nella manica`);
  }

  // true se l'attacco passa, false se lo scudo lo blocca
  attackOk(victim) {
    if (victim.shield) {
      victim.shield = false;
      this.addLog('ace', `🛡️ Lo scudo di ${victim.name} blocca tutto!`);
      return false;
    }
    return true;
  }

  takeCash(from, to, amount) {
    const n = Math.max(0, Math.min(amount, from.cash));
    from.cash -= n;
    if (to) to.cash += n;
    return n;
  }

  playAce(p, a) {
    this.needTurn(p);
    if (this.phase !== 'roll' && this.phase !== 'action') fail('Non puoi giocare un asso adesso.');
    const key = a.ace;
    if (!ACES[key] || !p.aces.includes(key)) fail('Non hai questo asso.');
    const other = () => {
      const q = this.player(a.target);
      if (!q || q.bankrupt || q.id === p.id) fail('Scegli un\'altra giocatrice.');
      return q;
    };
    const use = () => { p.aces.splice(p.aces.indexOf(key), 1); };
    switch (key) {
      case 'shield':
        if (p.shield) fail('Hai già uno scudo.');
        use(); p.shield = true;
        this.addLog('ace', `🛡️ ${p.name} alza lo scudo`);
        break;
      case 'x2':
        if (p.x2) fail('Hai già il doppio affitto attivo.');
        use(); p.x2 = true;
        this.addLog('ace', `✖️2 ${p.name} prepara il doppio affitto`);
        break;
      case 'steal': {
        const q = other();
        if (q.cash <= 0) fail('Non ha soldi da rubare.');
        use();
        this.addLog('ace', `🥷 ${p.name} tenta un furto ai danni di ${q.name}`);
        if (this.attackOk(q)) {
          const n = this.takeCash(q, p, 100);
          this.addLog('ace', `🥷 ${p.name} ruba ${eur(n)} a ${q.name}`);
        }
        break;
      }
      case 'skip': {
        const q = other();
        if (q.skip > 0) fail('Salta già un turno.');
        use();
        if (this.attackOk(q)) {
          q.skip = 1;
          this.addLog('ace', `⏭️ ${q.name} salterà il prossimo turno`);
        }
        break;
      }
      case 'party': {
        use();
        let tot = 0;
        for (const q of this.alive()) if (q.id !== p.id) tot += this.takeCash(q, p, 30);
        this.addLog('ace', `🎉 ${p.name} dà una festa a sorpresa e incassa ${eur(tot)}`);
        break;
      }
      case 'swap': {
        if (this.phase !== 'roll') fail('Il cambio posto si gioca al posto del tiro.');
        if (p.inJail) fail('Sei in prigione.');
        const q = other();
        if (q.inJail || q.pos === p.pos) fail('Non puoi scambiare con lei adesso.');
        use();
        if (!this.attackOk(q)) { break; }
        [p.pos, q.pos] = [q.pos, p.pos];
        this.addLog('ace', `🔀 ${p.name} e ${q.name} si scambiano il posto`);
        this.canRollAgain = false;
        this.land(p, {});
        break;
      }
      case 'warp': {
        if (this.phase !== 'roll') fail('Il teletrasporto si gioca al posto del tiro.');
        if (p.inJail) fail('Sei in prigione.');
        const idx = Number(a.idx);
        if (!Number.isInteger(idx) || idx < 0 || idx > 39 || idx === p.pos) fail('Casella non valida.');
        use();
        this.canRollAgain = false;
        this.teleport(p, idx);
        break;
      }
      default: fail('Asso sconosciuto.');
    }
  }

  // ---------- furbetti ----------
  doCheat(p) {
    if (!this.settings.cheat) fail('I furbetti non sono attivi.');
    this.needTurn(p);
    if (this.phase !== 'roll' && this.phase !== 'action') fail('Non adesso.');
    if (this.cheatDone) fail('Hai già fatto il furbo in questo turno.');
    this.cheatDone = true;
    this.cheat = { pid: p.id };
    p.cash += 100; // di nascosto, niente nel registro
  }

  accuse(p) {
    if (!this.settings.cheat) fail('I furbetti non sono attivi.');
    if (this.status !== 'playing') fail('La partita non è in corso.');
    const c = this.cur;
    if (p.id === c.id) fail('Non puoi accusare te stessa.');
    if (this.accused.includes(p.id)) fail('Hai già fatto un\'accusa in questo turno.');
    this.accused.push(p.id);
    if (this.cheat && this.cheat.pid === c.id) {
      const n = this.takeCash(c, p, 200);
      this.cheat = null;
      this.addLog('cheat', `🕵️ ${p.name} ha scoperto ${c.name} che barava! Paga ${eur(n)}`);
    } else {
      const n = this.takeCash(p, c, 50);
      this.addLog('cheat', `🕵️ ${p.name} accusa ${c.name} ma era innocente: paga ${eur(n)}`);
    }
  }

  rentFor(idx, opts) {
    const sq = BOARD[idx], pr = this.props[idx];
    const ev = this.event ? this.event.key : null;
    if (ev === 'truce') return 0;
    if (sq.type === 'street') {
      let r = pr.houses > 0 ? sq.rent[pr.houses] : sq.rent[0] * (this.ownsGroup(pr.owner, sq.group) ? 2 : 1);
      if (ev === 'festa' && this.event.group === sq.group) r *= 2;
      return r;
    }
    if (sq.type === 'station') {
      if (ev === 'strike') return 0;
      const n = STATIONS.filter((i) => this.props[i].owner === pr.owner).length;
      return 25 * Math.pow(2, n - 1) * (opts.rentMult || 1);
    }
    const n = UTILS.filter((i) => this.props[i].owner === pr.owner).length;
    const mult = opts.utilTen ? 10 : (n >= 2 ? 10 : 4);
    return mult * (this.dice.d1 + this.dice.d2);
  }

  land(p, opts) {
    const sq = BOARD[p.pos];
    this.phase = 'resolving';
    switch (sq.type) {
      case 'street': case 'station': case 'util': {
        const pr = this.props[p.pos];
        if (!pr.owner) {
          this.phase = 'buy';
          this.addLog('land', `${p.emoji} ${p.name} arriva a ${this.nm(p.pos)} (libera, ${eur(this.priceOf(p.pos))})`);
          return;
        }
        if (pr.owner === p.id) { this.addLog('land', `${p.name} è a casa sua: ${this.nm(p.pos)}`); break; }
        if (pr.mortgaged) { this.addLog('land', `${this.nm(p.pos)} è ipotecata: nessun affitto`); break; }
        if (sq.type === 'util' && opts.utilTen) {
          const d1 = this.die(), d2 = this.die();
          this.dice = { d1, d2, d3: 0, seq: this.dice.seq + 1 };
          this.addLog('dice', `${p.name} ritira i dadi per la società: ${d1} + ${d2}`);
        }
        let amount = this.rentFor(p.pos, opts);
        const owner = this.player(pr.owner);
        if (amount === 0) { this.addLog('land', `${p.name} è a ${this.nm(p.pos)}: oggi niente affitto (${this.event.title})`); break; }
        if (owner.x2) { amount *= 2; owner.x2 = false; this.addLog('ace', `✖️2 Doppio affitto per ${owner.name}!`); }
        if (p.shield) { p.shield = false; this.addLog('ace', `🛡️ ${p.name} para l'affitto di ${this.nm(p.pos)} con lo scudo!`); break; }
        this.addLog('rent', `${p.emoji} ${p.name} paga ${eur(amount)} di affitto a ${owner.name} (${this.nm(p.pos)})`);
        this.debts.push({ pid: p.id, amount, creditor: pr.owner, reason: 'affitto ' + this.nm(p.pos), kind: 'rent' });
        break;
      }
      case 'tax':
        if (p.shield) { p.shield = false; this.addLog('ace', `🛡️ ${p.name} schiva la tassa con lo scudo!`); break; }
        this.addLog('tax', `${p.name} paga ${eur(sq.amount)}: ${this.nm(p.pos)}`);
        this.debts.push({ pid: p.id, amount: sq.amount, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: this.nm(p.pos), kind: 'tax' });
        break;
      case 'gotojail':
        this.sendToJail(p);
        break;
      case 'fortuna': case 'sorpresa':
        this.drawCard(p, sq.type);
        return;
      case 'parking':
        if (this.settings.freeParking && this.pot > 0) {
          p.cash += this.pot;
          this.addLog('go', `${p.name} si prende il piatto del parcheggio: ${eur(this.pot)}!`);
          this.pot = 0;
        } else this.addLog('land', `${p.name} fa una pausa aperitivo`);
        break;
      default:
        break;
    }
    this.proceed();
  }

  drawCard(p, deckName) {
    const deck = this.decks[deckName];
    const id = deck.shift();
    const card = CARDS[deckName][id];
    if (card.fx === 'jailCard') p.jailCards.push({ deck: deckName, id });
    else deck.push(id);
    const text = card.text.replace(/\{(\d+)\}/g, (m, n) => this.nm(Number(n)));
    this.cardSeq++;
    this.card = { seq: this.cardSeq, deck: deckName, text, pid: p.id };
    this.addLog('card', `${p.emoji} ${p.name} pesca (${deckName === 'fortuna' ? 'Fortuna' : 'Sorpresa'}): ${text}`);
    const pot = this.settings.freeParking ? 'pot' : 'bank';
    switch (card.fx) {
      case 'collect':
        p.cash += card.amount;
        break;
      case 'pay':
        this.debts.push({ pid: p.id, amount: card.amount, creditor: pot, reason: 'carta', kind: 'tax' });
        break;
      case 'moveTo': {
        if (card.idx < p.pos) this.passGo(p);
        p.pos = card.idx;
        this.land(p, {});
        return;
      }
      case 'moveBy':
        p.pos = (p.pos + card.n + 40) % 40;
        this.land(p, {});
        return;
      case 'nearest': {
        const list = card.kind === 'station' ? STATIONS : UTILS;
        let target = list.find((i) => i > p.pos);
        if (target === undefined) { target = list[0]; this.passGo(p); }
        p.pos = target;
        this.land(p, card.kind === 'station' ? { rentMult: 2 } : { utilTen: true });
        return;
      }
      case 'jail':
        this.sendToJail(p);
        break;
      case 'jailCard':
        break;
      case 'heist': {
        const vs = this.alive().filter((q) => q.id !== p.id && q.cash > 0);
        if (!vs.length) break;
        const q = vs[Math.floor(this.rng() * vs.length)];
        if (this.attackOk(q)) this.addLog('ace', `🥷 ${p.name} ruba ${eur(this.takeCash(q, p, 100))} a ${q.name}`);
        break;
      }
      case 'robinHood': {
        const live = this.alive();
        if (live.length < 2) break;
        const sorted = live.slice().sort((x, y) => y.cash - x.cash);
        const rich = sorted[0], poor = sorted[sorted.length - 1];
        if (rich.id === poor.id || rich.cash === poor.cash) { this.addLog('card', 'Tutte hanno gli stessi soldi: Robin Hood torna nel bosco'); break; }
        if (this.attackOk(rich)) this.addLog('card', `🏹 ${eur(this.takeCash(rich, poor, 100))} da ${rich.name} a ${poor.name}`);
        break;
      }
      case 'giveAce':
        if (this.settings.aces) this.giveAce(p);
        else { p.cash += 50; this.addLog('card', `${p.name} incassa ${eur(50)} al posto dell'asso`); }
        break;
      case 'swapRandom': {
        const vs = this.alive().filter((q) => q.id !== p.id && !q.inJail && q.pos !== p.pos);
        if (!vs.length || p.inJail) break;
        const q = vs[Math.floor(this.rng() * vs.length)];
        if (!this.attackOk(q)) break;
        [p.pos, q.pos] = [q.pos, p.pos];
        this.addLog('move', `🔀 ${p.name} e ${q.name} si scambiano il posto`);
        this.land(p, {});
        return;
      }
      case 'repairs': {
        let houses = 0, hotels = 0;
        for (const i of this.owned(p.id)) {
          const h = this.props[i].houses;
          if (h === 5) hotels++; else houses += h;
        }
        const amount = houses * card.house + hotels * card.hotel;
        if (amount > 0) this.debts.push({ pid: p.id, amount, creditor: pot, reason: 'lavori', kind: 'tax' });
        else this.addLog('card', `${p.name} non ha immobili da riparare`);
        break;
      }
      case 'collectEach':
        for (const q of this.alive()) if (q.id !== p.id) this.debts.push({ pid: q.id, amount: card.amount, creditor: p.id, reason: 'regalo di compleanno', kind: 'gift' });
        break;
      case 'payEach':
        for (const q of this.alive()) if (q.id !== p.id) this.debts.push({ pid: p.id, amount: card.amount, creditor: q.id, reason: 'carta', kind: 'gift' });
        break;
      default:
        break;
    }
    this.proceed();
  }

  // Paga i debiti che si possono pagare. Chi non ha abbastanza resta bloccato.
  settle() {
    const blocked = new Set();
    const rest = [];
    for (const d of this.debts) {
      const p = this.player(d.pid);
      if (!p || p.bankrupt) continue;
      if (blocked.has(d.pid)) { rest.push(d); continue; }
      if (p.cash >= d.amount) {
        p.cash -= d.amount;
        if (d.creditor === 'pot') this.pot += d.amount;
        else if (d.creditor !== 'bank') {
          const c = this.player(d.creditor);
          if (c && !c.bankrupt) c.cash += d.amount;
        }
        if (d.kind === 'gift') {
          const c = this.player(d.creditor);
          this.addLog('pay', `${p.name} paga ${eur(d.amount)} a ${c ? c.name : 'la banca'}`);
        }
      } else {
        blocked.add(d.pid);
        rest.push(d);
      }
    }
    this.debts = rest;
  }

  // Dopo ogni evento: salda i debiti, esegue eventuali azioni in sospeso, passa alla fase "action".
  proceed() {
    if (this.status !== 'playing') return;
    this.settle();
    if (this.debts.length) { this.phase = 'debt'; return; }
    const c = this.cont;
    this.cont = null;
    if (c) {
      if (c.type === 'jailMove') {
        const p = this.cur;
        this.releaseFromJail(p);
        this.movePlayer(p, c.steps);
        return;
      }
      if (c.type === 'endTurn') { this.nextTurn(); return; }
      if (c.type === 'jolly') {
        const p = this.cur;
        if (!p.inJail && !p.bankrupt) {
          for (let k = 1; k < 40; k++) {
            const idx = (p.pos + k) % 40;
            if (isOwnable(BOARD[idx]) && !this.props[idx].owner) {
              this.addLog('move', `🃏 Jolly! ${p.name} corre fino a ${this.nm(idx)}`);
              this.movePlayer(p, k);
              return;
            }
          }
          this.addLog('move', '🃏 Jolly: non ci sono più proprietà libere');
        }
      }
    }
    this.phase = 'action';
  }

  endTurn(p) {
    this.needTurn(p, 'action');
    if (this.canRollAgain && !p.inJail) {
      this.phase = 'roll';
      this.addLog('dice', `${p.name} ha fatto doppio: tira ancora`);
    } else this.nextTurn();
  }

  nextTurn() {
    this.doubles = 0;
    this.canRollAgain = false;
    this.cont = null;
    this.choice = null;
    this.cheat = null;
    this.cheatDone = false;
    this.accused = [];
    let i = this.turnIdx;
    for (let guard = 0; guard < 100; guard++) {
      do { i = (i + 1) % this.players.length; } while (this.players[i].bankrupt);
      const q = this.players[i];
      if (q.skip > 0) { q.skip--; this.addLog('ace', `⏭️ ${q.name} salta il turno`); continue; }
      break;
    }
    this.turnIdx = i;
    this.phase = 'roll';
    this.turnCount++;
    this.roundTurns++;
    if (this.roundTurns >= this.alive().length) { this.roundTurns = 0; this.newRound(); }
  }

  newRound() {
    this.round++;
    if (!this.settings.events) return;
    const keys = Object.keys(EVENTS);
    let key = keys[Math.floor(this.rng() * keys.length)];
    if (this.event && key === this.event.key) key = keys[(keys.indexOf(key) + 1) % keys.length];
    const ev = { key, ...EVENTS[key] };
    if (key === 'festa') {
      const gs = Object.keys(GROUPS);
      ev.group = gs[Math.floor(this.rng() * gs.length)];
      ev.text = ev.text.replace('{group}', GROUP_NAMES[ev.group].toLowerCase());
    }
    ev.seq = ++this.eventSeq;
    this.event = ev;
    this.addLog('event', `${ev.icon} ${ev.title}: ${ev.text}`);
    if (key === 'bonus') for (const q of this.alive()) q.cash += 50;
  }

  // ---------- acquisto e asta ----------
  buy(p) {
    this.needTurn(p, 'buy');
    const price = this.priceOf(p.pos);
    if (p.cash < price) fail('Non hai abbastanza soldi.');
    p.cash -= price;
    this.props[p.pos].owner = p.id;
    this.addLog('buy', `${p.emoji} ${p.name} compra ${this.nm(p.pos)} per ${eur(price)}`);
    this.proceed();
  }

  declineBuy(p) {
    this.needTurn(p, 'buy');
    const sq = BOARD[p.pos];
    if (this.settings.auctions) this.startAuction(p.pos);
    else { this.addLog('buy', `${p.name} non compra ${this.nm(p.pos)}`); this.proceed(); }
  }

  startAuction(idx) {
    this.phase = 'auction';
    this.auction = { idx, high: 0, bidder: null, active: this.alive().map((q) => q.id) };
    this.addLog('auction', `Asta per ${this.nm(idx)}!`);
  }

  bid(p, amount) {
    const a = this.auction;
    if (this.phase !== 'auction' || !a) fail('Nessuna asta in corso.');
    if (!a.active.includes(p.id)) fail('Ti sei ritirato da questa asta.');
    amount = Math.floor(Number(amount));
    if (!(amount > a.high)) fail('Devi offrire più dell\'offerta attuale.');
    if (a.high === 0 && amount < 10) fail('L\'offerta minima è €10.');
    if (amount > p.cash) fail('Non hai abbastanza soldi.');
    if (a.bidder === p.id) fail('Hai già l\'offerta più alta.');
    a.high = amount;
    a.bidder = p.id;
    this.addLog('bid', `${p.emoji} ${p.name} offre ${eur(amount)}`);
  }

  passAuction(p) {
    const a = this.auction;
    if (this.phase !== 'auction' || !a) fail('Nessuna asta in corso.');
    if (!a.active.includes(p.id)) return;
    a.active = a.active.filter((id) => id !== p.id);
    this.addLog('bid', `${p.name} si ritira dall'asta`);
    this.checkAuction();
  }

  checkAuction(force) {
    const a = this.auction;
    if (!a) return;
    const others = a.active.filter((id) => id !== a.bidder);
    const over = force || (a.bidder ? others.length === 0 : a.active.length === 0);
    if (!over) return;
    this.auction = null;
    const sq = { name: this.nm(a.idx) };
    const w = a.bidder ? this.player(a.bidder) : null;
    if (w && !w.bankrupt && w.cash >= a.high) {
      w.cash -= a.high;
      this.props[a.idx].owner = w.id;
      this.addLog('buy', `${w.emoji} ${w.name} vince l'asta e prende ${sq.name} per ${eur(a.high)}`);
    } else this.addLog('auction', `Nessuno compra ${sq.name}`);
    this.proceed();
  }

  // ---------- costruzioni e ipoteche ----------
  whyNotBuild(p, idx) {
    const sq = BOARD[idx], pr = this.props[idx];
    if (!sq || sq.type !== 'street') return 'Qui non si può costruire.';
    if (pr.owner !== p.id) return 'Non è tua.';
    if (!this.ownsGroup(p.id, sq.group)) return 'Ti serve tutto il colore.';
    const grp = GROUPS[sq.group];
    if (grp.some((i) => this.props[i].mortgaged)) return 'C\'è una proprietà ipotecata nel gruppo.';
    if (pr.houses >= 5) return 'C\'è già l\'albergo.';
    if (pr.houses > Math.min(...grp.map((i) => this.props[i].houses))) return 'Costruisci in modo uniforme.';
    if (pr.houses === 4 ? this.hotelsLeft() <= 0 : this.housesLeft() <= 0) return 'Finiti gli edifici in banca.';
    if (p.cash < sq.houseCost) return 'Non hai abbastanza soldi.';
    return null;
  }
  whyNotSell(p, idx) {
    const sq = BOARD[idx], pr = this.props[idx];
    if (!sq || sq.type !== 'street' || pr.owner !== p.id) return 'Non puoi.';
    if (pr.houses <= 0) return 'Non ci sono edifici.';
    const grp = GROUPS[sq.group];
    if (pr.houses < Math.max(...grp.map((i) => this.props[i].houses))) return 'Vendi in modo uniforme.';
    if (pr.houses === 5 && this.housesLeft() < 4) return 'Non ci sono abbastanza case in banca per sostituire l\'albergo.';
    return null;
  }
  whyNotMortgage(p, idx) {
    const sq = BOARD[idx], pr = this.props[idx];
    if (!pr || pr.owner !== p.id) return 'Non è tua.';
    if (pr.mortgaged) return 'È già ipotecata.';
    if (sq.type === 'street' && GROUPS[sq.group].some((i) => this.props[i].houses > 0)) return 'Prima vendi gli edifici del colore.';
    return null;
  }
  whyNotUnmortgage(p, idx) {
    const sq = BOARD[idx], pr = this.props[idx];
    if (!pr || pr.owner !== p.id) return 'Non è tua.';
    if (!pr.mortgaged) return 'Non è ipotecata.';
    if (p.cash < Math.ceil(sq.price * 0.55)) return 'Non hai abbastanza soldi.';
    return null;
  }

  build(p, idx) {
    const why = this.whyNotBuild(p, idx); if (why) fail(why);
    const sq = BOARD[idx], pr = this.props[idx];
    p.cash -= sq.houseCost;
    pr.houses++;
    this.addLog('build', `${p.name} costruisce ${pr.houses === 5 ? 'un albergo' : 'una casa'} a ${this.nm(idx)}`);
  }
  sell(p, idx) {
    const why = this.whyNotSell(p, idx); if (why) fail(why);
    const sq = BOARD[idx], pr = this.props[idx];
    p.cash += sq.houseCost / 2;
    pr.houses--;
    this.addLog('build', `${p.name} vende ${pr.houses === 4 ? 'l\'albergo' : 'una casa'} a ${this.nm(idx)}`);
  }
  mortgage(p, idx) {
    const why = this.whyNotMortgage(p, idx); if (why) fail(why);
    const sq = BOARD[idx];
    this.props[idx].mortgaged = true;
    p.cash += sq.price / 2;
    this.addLog('mortgage', `${p.name} ipoteca ${this.nm(idx)} (+${eur(sq.price / 2)})`);
  }
  unmortgage(p, idx) {
    const why = this.whyNotUnmortgage(p, idx); if (why) fail(why);
    const sq = BOARD[idx];
    this.props[idx].mortgaged = false;
    p.cash -= Math.ceil(sq.price * 0.55);
    this.addLog('mortgage', `${p.name} riscatta l'ipoteca di ${this.nm(idx)}`);
  }

  // ---------- scambi ----------
  cleanSide(side) {
    side = side || {};
    const cash = Math.max(0, Math.floor(Number(side.cash) || 0));
    const props = Array.from(new Set((side.props || []).map(Number))).filter((i) => this.props[i]);
    const jail = Math.max(0, Math.floor(Number(side.jail) || 0));
    return { cash, props, jail };
  }
  checkTradeSide(p, side, label) {
    for (const i of side.props) {
      const pr = this.props[i];
      if (pr.owner !== p.id) fail(`${this.nm(i)} non è di ${label}.`);
      const sq = BOARD[i];
      if (sq.type === 'street' && GROUPS[sq.group].some((j) => this.props[j].houses > 0))
        fail(`Per scambiare ${this.nm(i)} vendi prima gli edifici del suo colore.`);
    }
    if (side.jail > p.jailCards.length) fail(`${label} non ha tutte quelle carte "esci di prigione".`);
  }
  tradeFee(receiverSideProps) {
    // chi riceve una proprietà ipotecata paga subito il 10% del valore dell'ipoteca
    let f = 0;
    for (const i of receiverSideProps) if (this.props[i].mortgaged) f += Math.ceil(BOARD[i].price * 0.05);
    return f;
  }

  proposeTrade(p, t) {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    const to = this.player(t.to);
    if (!to || to.bankrupt || to.id === p.id) fail('Scegli con chi scambiare.');
    const offer = this.cleanSide(t.offer), request = this.cleanSide(t.request);
    const empty = (s) => !s.cash && !s.props.length && !s.jail;
    if (empty(offer) && empty(request)) fail('Lo scambio è vuoto.');
    this.checkTradeSide(p, offer, p.name);
    this.checkTradeSide(to, request, to.name);
    if (offer.cash > p.cash) fail('Non hai tutti quei soldi.');
    this.trades = this.trades.filter((x) => x.from !== p.id);
    this.trades.push({ id: ++this.tradeSeq, from: p.id, to: to.id, offer, request });
    this.addLog('trade', `${p.emoji} ${p.name} propone uno scambio a ${to.emoji} ${to.name}`);
  }

  acceptTrade(p, id) {
    const t = this.trades.find((x) => x.id === id);
    if (!t || t.to !== p.id) fail('Scambio non trovato.');
    const from = this.player(t.from);
    try {
      if (!from || from.bankrupt) fail('Chi ha proposto lo scambio non è più in gioco.');
      this.checkTradeSide(from, t.offer, from.name);
      this.checkTradeSide(p, t.request, p.name);
      const feeTo = this.tradeFee(t.offer.props);      // p riceve le proprietà di from
      const feeFrom = this.tradeFee(t.request.props);  // from riceve quelle di p
      const fromAfter = from.cash - t.offer.cash + t.request.cash - feeFrom;
      const toAfter = p.cash + t.offer.cash - t.request.cash - feeTo;
      if (fromAfter < 0) fail(`${from.name} non ha abbastanza soldi per questo scambio.`);
      if (toAfter < 0) fail('Non hai abbastanza soldi per questo scambio.');
      from.cash = fromAfter;
      p.cash = toAfter;
      for (const i of t.offer.props) this.props[i].owner = p.id;
      for (const i of t.request.props) this.props[i].owner = from.id;
      p.jailCards.push(...from.jailCards.splice(0, t.offer.jail));
      from.jailCards.push(...p.jailCards.splice(0, t.request.jail));
    } catch (e) {
      if (e instanceof GameError) this.trades = this.trades.filter((x) => x.id !== id);
      throw e;
    }
    this.trades = this.trades.filter((x) => x.id !== id);
    this.addLog('trade', `Scambio concluso tra ${from.emoji} ${from.name} e ${p.emoji} ${p.name}!`);
  }

  rejectTrade(p, id) {
    const t = this.trades.find((x) => x.id === id);
    if (!t || (t.to !== p.id && t.from !== p.id)) return;
    this.trades = this.trades.filter((x) => x.id !== id);
    if (t.to === p.id) this.addLog('trade', `${p.name} rifiuta lo scambio`);
  }

  // ---------- bancarotta ----------
  declareBankrupt(p) {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    const first = this.debts.find((d) => d.pid === p.id);
    const creditor = first && first.creditor !== 'bank' && first.creditor !== 'pot' ? this.player(first.creditor) : null;
    this.eliminate(p, creditor && !creditor.bankrupt ? creditor : null);
  }

  eliminate(p, creditor) {
    p.bankrupt = true;
    this.addLog('bankrupt', `${p.emoji} ${p.name} esce dal gioco${creditor ? ` e lascia tutto a ${creditor.name}` : ''}`);
    if (creditor) creditor.cash += p.cash;
    p.cash = 0;
    for (const i of this.owned(p.id)) {
      const pr = this.props[i];
      pr.houses = 0;
      if (creditor) pr.owner = creditor.id;
      else { pr.owner = null; pr.mortgaged = false; }
    }
    for (const jc of p.jailCards) this.decks[jc.deck].push(jc.id);
    p.jailCards = [];
    p.aces = []; p.shield = false; p.x2 = false; p.skip = 0;
    p.inJail = false;
    this.debts = this.debts
      .filter((d) => d.pid !== p.id)
      .map((d) => (d.creditor === p.id ? { ...d, creditor: 'bank' } : d));
    this.trades = this.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    const left = this.alive();
    if (left.length <= 1) { this.finish(left[0]); return; }
    if (this.auction) {
      this.auction.active = this.auction.active.filter((id) => id !== p.id);
      if (this.auction.bidder === p.id) { this.auction.bidder = null; this.auction.high = 0; }
    }
    if (this.cur.id === p.id) {
      // il turno passa al prossimo (dopo aver chiuso i debiti degli altri)
      this.auction = null;
      this.cont = { type: 'endTurn' };
      this.proceed();
    } else if (this.phase === 'auction') this.checkAuction();
    else if (this.phase === 'debt') this.proceed();
  }

  finish(winner) {
    this.status = 'ended';
    this.phase = 'ended';
    this.auction = null;
    this.debts = [];
    this.ranking = this.players
      .map((p) => ({ id: p.id, worth: p.bankrupt ? 0 : this.netWorth(p) }))
      .sort((a, b) => b.worth - a.worth);
    const top = winner || this.player(this.ranking[0].id);
    this.winner = top ? top.id : null;
    if (top) this.addLog('win', `🏆 ${top.emoji} ${top.name} vince la partita!`);
  }

  endGameNow() {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    this.finish(null);
  }

  endAuctionNow() {
    if (this.phase === 'auction') this.checkAuction(true);
  }

  // ---------- jail ----------
  payJail(p) {
    this.needTurn(p, 'roll');
    if (!p.inJail) fail('Non sei in prigione.');
    if (p.cash < JAIL_FINE) fail('Non hai abbastanza soldi.');
    p.cash -= JAIL_FINE;
    this.releaseFromJail(p);
    this.addLog('jail', `${p.name} paga ${eur(JAIL_FINE)} ed esce di prigione`);
  }
  useJailCard(p) {
    this.needTurn(p, 'roll');
    if (!p.inJail) fail('Non sei in prigione.');
    if (!p.jailCards.length) fail('Non hai la carta.');
    const jc = p.jailCards.pop();
    this.decks[jc.deck].push(jc.id);
    this.releaseFromJail(p);
    this.addLog('jail', `${p.name} usa la carta e esce di prigione`);
  }

  // ---------- punto di ingresso delle azioni dei giocatori ----------
  act(pid, a) {
    const before = new Map(this.players.map((q) => [q.id, q.cash]));
    const seq0 = this.logSeq;
    const r = this._act(pid, a);
    this.trackFx(before, seq0);
    return r;
  }

  trackFx(before, seq0) {
    const kinds = this.log.filter((l) => l.id > seq0).map((l) => l.kind);
    const pri = ['rent', 'tax', 'go', 'buy', 'card', 'ace', 'cheat', 'event', 'pay', 'bid'];
    const kind = pri.find((k) => kinds.includes(k)) || kinds[0] || '';
    for (const q of this.players) {
      const d = q.cash - (before.get(q.id) || 0);
      if (d !== 0 && (before.get(q.id) || 0) > 0) {
        this.fx.push({ id: ++this.fxSeq, pid: q.id, d, k: kind });
      }
    }
    if (this.fx.length > 24) this.fx = this.fx.slice(-24);
  }

  _act(pid, a) {
    try {
      const p = this.player(pid);
      if (!p) fail('Giocatore non trovato.');
      if (this.status === 'ended') fail('La partita è finita.');
      if (this.status === 'lobby') {
        switch (a.type) {
          case 'start': if (this.hostId !== p.id) fail('Solo chi ha creato la partita può avviarla.'); this.start(); break;
          case 'settings': if (this.hostId !== p.id) fail('Solo chi ha creato la partita cambia le regole.'); this.setSettings(a); break;
          case 'leave': this.leave(p); break;
          default: fail('La partita non è ancora iniziata.');
        }
        return { ok: true };
      }
      if (p.bankrupt) fail('Sei fuori dal gioco.');
      switch (a.type) {
        case 'roll': this.roll(p); break;
        case 'buy': this.buy(p); break;
        case 'decline': this.declineBuy(p); break;
        case 'bid': this.bid(p, a.amount); break;
        case 'pass': this.passAuction(p); break;
        case 'endTurn': this.endTurn(p); break;
        case 'payJail': this.payJail(p); break;
        case 'useJailCard': this.useJailCard(p); break;
        case 'build': this.build(p, Number(a.idx)); break;
        case 'sell': this.sell(p, Number(a.idx)); break;
        case 'mortgage': this.mortgage(p, Number(a.idx)); break;
        case 'unmortgage': this.unmortgage(p, Number(a.idx)); break;
        case 'propose': this.proposeTrade(p, a); break;
        case 'accept': this.acceptTrade(p, Number(a.id)); break;
        case 'reject': this.rejectTrade(p, Number(a.id)); break;
        case 'bankrupt': this.declareBankrupt(p); break;
        case 'busPick': this.busPick(p, a.pick); break;
        case 'warpTo': this.warpTo(p, Number(a.idx)); break;
        case 'ace': this.playAce(p, a); break;
        case 'cheat': this.doCheat(p); break;
        case 'accuse': this.accuse(p); break;
        default: fail('Azione sconosciuta.');
      }
      // se qualcuno ha raccolto abbastanza soldi, salda subito i debiti
      if (this.status === 'playing' && this.phase === 'debt') this.proceed();
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      throw e;
    }
  }

  // azioni del tabellone (iPad), senza identità di giocatore
  admin(a) {
    const before = new Map(this.players.map((q) => [q.id, q.cash]));
    const seq0 = this.logSeq;
    const r = this._admin(a);
    this.trackFx(before, seq0);
    return r;
  }

  _admin(a) {
    try {
      switch (a.type) {
        case 'start': this.start(); break;
        case 'settings': this.setSettings(a); break;
        case 'endgame': this.endGameNow(); break;
        case 'endAuction': this.endAuctionNow(); break;
        case 'kick': {
          const p = this.player(a.id);
          if (p && this.status === 'lobby') this.leave(p);
          break;
        }
        default: fail('Azione sconosciuta.');
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      throw e;
    }
  }

  // ---------- vista per i client ----------
  view(pid, connected) {
    const me = this.player(pid) || null;
    const s = this.settings;
    const showCash = (p) => (s.showCash && !s.cheat) || this.status === 'ended' || (me && me.id === p.id);
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, color: p.color, pos: p.pos,
      inJail: p.inJail, jailCards: p.jailCards.length, bankrupt: p.bankrupt,
      connected: connected ? connected.has(p.id) : true,
      cash: showCash(p) ? p.cash : null,
      worth: this.status === 'ended' ? this.netWorth(p) : null,
      shield: p.shield, x2: p.x2, skip: p.skip, aceCount: p.aces.length,
    }));
    let perms = null;
    if (me && this.status === 'playing' && !me.bankrupt) {
      perms = {};
      for (const i of this.owned(me.id)) {
        perms[i] = {
          build: !this.whyNotBuild(me, i),
          sell: !this.whyNotSell(me, i),
          mortgage: !this.whyNotMortgage(me, i),
          unmortgage: !this.whyNotUnmortgage(me, i),
        };
      }
    }
    const cur = this.status === 'playing' ? this.cur : null;
    return {
      title: TITLE,
      status: this.status, settings: s, hostId: this.hostId, phase: this.phase,
      turn: cur ? cur.id : null, canRollAgain: this.canRollAgain, doubles: this.doubles,
      dice: this.dice, players, props: this.props,
      auction: this.auction,
      debts: this.debts.map((d) => ({ pid: d.pid, amount: d.amount, creditor: d.creditor, reason: d.reason })),
      buy: this.phase === 'buy' && cur ? { idx: cur.pos, price: this.priceOf(cur.pos) } : null,
      card: this.card, log: this.log.slice(-30), pot: s.freeParking ? this.pot : null,
      housesLeft: this.housesLeft(), hotelsLeft: this.hotelsLeft(),
      winner: this.winner, ranking: this.ranking,
      you: me ? me.id : null, perms,
      jailCardsMine: me ? me.jailCards.length : 0,
      trades: me ? this.trades.filter((t) => t.from === me.id || t.to === me.id) : [],
      tradeCount: this.trades.length,
      turnCount: this.turnCount,
      choice: this.choice,
      event: this.event, round: this.round,
      aces: me ? me.aces : [],
      fx: this.fx.slice(-12),
      cheat: s.cheat && this.status === 'playing' && me ? {
        canCheat: cur && cur.id === me.id && !this.cheatDone && (this.phase === 'roll' || this.phase === 'action'),
        pending: !!(this.cheat && this.cheat.pid === me.id),
        canAccuse: !!cur && cur.id !== me.id && !me.bankrupt && !this.accused.includes(me.id),
      } : null,
    };
  }
}

module.exports = { Game, GameError, BOARD, GROUPS, STATIONS, UTILS, TOKENS, MAX_PLAYERS, PRESETS, ACES };
