'use strict';
// Motore di gioco: tutte le regole stanno qui, il server decide tutto.
const crypto = require('crypto');
let DATA;
try { DATA = require('./public/shared/data.js'); } catch (e) { DATA = require('./data.js'); } // funziona anche con i file tutti nella stessa cartella
const { TITLE, BOARD, BOARDS, CARDS, ACES, EVENTS, THEMES, GROUP_NAMES, TOKENS, COLORS } = DATA;

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
const DECK_NAMES = { fortuna: 'Fortuna', sorpresa: 'Sorpresa', imprevisto: 'Imprevisto' };
const MAX_HOUSES = 32;
const MAX_HOTELS = 12;
const GO_BONUS = 200;
const JAIL_FINE = 50;
const MISSION_REWARD = 300;
const BOUNTY_RENT = 100;
const BOUNTY_JAIL = 150;
const DARE_WIN = 100;
const DARE_LOSE = 50;
const BAD_EVENTS = ['taxman', 'bankStrike', 'blackMarket'];
// eventi cattivi extra: compaiono solo se la cattiveria è alta
const BAD_BY_HEAT = { 1: BAD_EVENTS, 2: BAD_EVENTS.concat(['robinHood', 'rentUp', 'noBuild']), 3: BAD_EVENTS.concat(['robinHood', 'rentUp', 'noBuild', 'quake']) };
const ALL_BAD = BAD_BY_HEAT[3];
const HEAT_RISE_EVERY = 6; // ogni quanti giri sale la cattiveria
const PACE_FLOW = new Set(['roll', 'buy', 'decline', 'endTurn', 'dareAnswer', 'busPick', 'warpTo', 'travel', 'payJail', 'useJailCard', 'offerSale', 'saleAccept', 'saleDecline', 'saleCancel']);
const PACE_MS = { roll: 3200, endTurn: 1700, buy: 1500, decline: 1100, dareAnswer: 1500, busPick: 2600, warpTo: 2600, travel: 2200, offerSale: 800, saleAccept: 1500, saleDecline: 900, saleCancel: 700, payJail: 1000, useJailCard: 1000 };
// sfide lampo: arrivano ogni tanto all'inizio del turno, anche senza pescare una carta
const LAMPO = [
  'dice una cosa bella a ciascuna delle altre giocatrici',
  'imita una delle altre giocatrici e le altre devono indovinare chi è',
  'racconta una figuraccia che non ha mai raccontato a nessuna',
  'canta il ritornello di una canzone a scelta (senza vergogna!)',
  'dice tre cose che ama della giocatrice alla sua sinistra',
  'fa un complimento in rima alla giocatrice alla sua destra',
  'mima un animale: chi lo indovina per prima riceve un applauso',
  'dice tutti i nomi delle altre giocatrici al contrario, senza sbagliare',
  'racconta il sogno più strano che ricorda',
  'fa 10 secondi di ballo come se fosse al concerto della vita',
  'dice una cosa che le altre non sanno di lei',
  'racconta il ricordo più bello con una di voi',
  'fa la voce da telegiornale e annuncia le ultime notizie del tabellone',
  'sfida la giocatrice alla sua sinistra a chi resta seria più a lungo guardandosi negli occhi',
  'sfida la giocatrice alla sua destra a una gara di braccio di ferro: vince chi ci riesce!',
  'sfida chi vuole a una sfida di sguardi: chi ride per prima perde (lei deve resistere)',
  'dice in 10 secondi 5 nomi di città che iniziano con la stessa lettera, scelta dalle altre',
  'dice una parola e ogni altra giocatrice deve aggiungerne una per fare una storia',
  'parla per 15 secondi senza dire mai "sì", "no" o "ma"',
  'indovina in tre tentativi il numero (da 1 a 10) pensato dalla giocatrice alla sua destra',
  'mima un film: le altre devono indovinarlo',
  'fa il gesto più buffo che conosce, le altre votano se è abbastanza buffo',
];
// missioni segrete: ognuna ha un testo e un controllo
const MISSIONS = {
  stations: { text: 'Possiedi 3 stazioni', check: (g, p) => g.owned(p.id).filter((i) => g.BOARD[i].type === 'station').length >= 3 },
  group: { text: 'Possiedi tutte le strade di un colore', check: (g, p) => Object.keys(g.GROUPS).some((k) => g.ownsGroup(p.id, k)) },
  twoGroups: { text: 'Possiedi tutte le strade di DUE colori', check: (g, p) => Object.keys(g.GROUPS).filter((k) => g.ownsGroup(p.id, k)).length >= 2 },
  rich: { text: 'Arriva ad avere €2500 in contanti', check: (g, p) => p.cash >= 2500 },
  hotel: { text: 'Costruisci un albergo', check: (g, p) => g.owned(p.id).some((i) => g.props[i].houses >= 5) },
  seven: { text: 'Possiedi 7 proprietà', check: (g, p) => g.owned(p.id).length >= 7 },
  houses: { text: 'Costruisci 5 case in totale', check: (g, p) => g.owned(p.id).reduce((n, i) => n + Math.min(5, g.props[i].houses), 0) >= 5 },
  utils: { text: 'Possiedi tutte le società (acqua, luce…)', check: (g, p) => g.UTILS.length > 0 && g.UTILS.every((i) => g.props[i].owner === p.id) },
};
const MAX_PLAYERS = 8;
const MAX_ACES = 3;
const SPEED_FACES = [1, 2, 3, 'J', 'J', 'B']; // Dado Matto: numeri, 2 Jolly, 1 Navetta
const PRESETS = {
  classic: { mean: 1, meanRise: false, freeParking: false, auctions: true, speedDie: false, aces: false, events: false, cheat: false, missions: false, bounty: false, dares: false, freeBuy: false },
  ultra: { mean: 2, meanRise: true, freeParking: true, auctions: true, speedDie: true, aces: true, events: true, cheat: false, missions: true, bounty: true, dares: true, freeBuy: true },
};
const FEATURES = ['speedDie', 'aces', 'events', 'missions', 'bounty', 'dares', 'cheat', 'freeParking', 'auctions', 'freeBuy']; // regole su cui si vota
const DEFAULT_SETTINGS = { startCash: 1500, showCash: false, theme: 'italia', maxRounds: 0, autoEnd: true, boardSize: 60, winWorth: 5000, timeLimit: 0, auctionRound: 6, mean: 2, meanRise: true, ...PRESETS.ultra };

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
    this.gameId = '';
    this.settings = { ...DEFAULT_SETTINGS };
    this.players = [];
    this.setBoard(this.settings.boardSize);
    this.hostId = null;
    this.heat = 2;           // cattiveria attuale 1-3
    this.lastChallenge = -99;
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
    this.claim = null;
    this.claimSeq = 0;
    this.travel = null;
    this.dare = null;        // sfida in corso
    this.dareSeq = 0;
    this.startedAt = 0;
    this.bountyId = null;
    this.teamsOn = false;
    this.winners = [];
    this.cheat = null;       // imbroglio in corso nel turno
    this.cheatDone = false;
    this.accused = [];
    this.fx = [];
    this.fxSeq = 0;
    this.hold = false;       // chi sta giocando ha messo in pausa il fine turno automatico
    this.bankerId = null;    // chi fa il banchiere (regola Banchiere furbo)
    this.payouts = [];       // pagamenti della banca in attesa del banchiere
    this.payoutSeq = 0;
    this.shorts = [];        // pagamenti 'ridotti' dal banchiere, accusabili
    this.accusedB = {};      // giro dell'ultima accusa al banchiere per giocatrice
    this.auction = null;
    this.debts = [];
    this.cont = null;
    this.trades = [];
    this.tradeSeq = 0;
    this.log = [];
    this.logSeq = 0;
    this.card = null;
    this.notice = null;
    this.noticeSeq = 0;
    this.sale = null;        // offerta diretta di una proprietà a una giocatrice
    this.lateNotified = false;
    this.cardSeq = 0;
    this.pot = 0;
    this.winner = null;
    this.ranking = null;
    this.turnCount = 0;
    this.decks = {
      fortuna: shuffle(CARDS.fortuna.map((_, i) => i), this.rng),
      sorpresa: shuffle(CARDS.sorpresa.map((_, i) => i), this.rng),
      imprevisto: shuffle(CARDS.imprevisto.map((_, i) => i), this.rng),
    };
  }

  // tabellone: 40 o 60 caselle (le proprietà si azzerano solo se chiesto)
  setBoard(size, keepProps) {
    const b = BOARDS[size] || BOARDS[60];
    this.size = b.size;
    this.BOARD = b.squares;
    this.cols = b.cols;
    this.rows = b.rows;
    this.N = b.squares.length;
    this.jailIdx = b.squares.findIndex((q) => q.type === 'jail');
    this.GROUPS = {};
    this.STATIONS = [];
    this.UTILS = [];
    this.BOARD.forEach((sq, i) => {
      if (sq.type === 'street') (this.GROUPS[sq.group] = this.GROUPS[sq.group] || []).push(i);
      if (sq.type === 'station') this.STATIONS.push(i);
      if (sq.type === 'util') this.UTILS.push(i);
    });
    if (!keepProps) {
      this.props = {};
      this.BOARD.forEach((sq, i) => { if (isOwnable(sq)) this.props[i] = { owner: null, houses: 0, mortgaged: false }; });
    }
  }

  // ---------- persistenza ----------
  toJSON() {
    const o = {};
    const skip = ['rng', 'pacing', 'paceUntil', 'BOARD', 'GROUPS', 'STATIONS', 'UTILS', 'N', 'cols', 'rows', 'jailIdx', 'size'];
    for (const k of Object.keys(this)) if (!skip.includes(k)) o[k] = this[k];
    return o;
  }
  static fromJSON(obj, rng) {
    const g = new Game(rng);
    Object.assign(g, obj);
    g.settings = { ...DEFAULT_SETTINGS, boardSize: 40, ...(obj.settings || {}) };
    g.setBoard(g.settings.boardSize, true);
    if (!g.heat) g.heat = g.settings.mean || 2;
    if (g.lastChallenge === undefined) g.lastChallenge = -99;
    if (!g.decks.imprevisto) g.decks.imprevisto = shuffle(CARDS.imprevisto.map((_, i) => i), g.rng);
    for (const p of g.players) {
      if (!p.aces) p.aces = [];
      if (p.skip === undefined) p.skip = 0;
      if (p.shield === undefined) p.shield = false;
      if (p.x2 === undefined) p.x2 = false;
      if (!p.votes) p.votes = Object.fromEntries(FEATURES.map((k) => [k, !!g.settings[k]]));
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
  nm(i) { return DATA.nameOf(this.settings.theme, this.BOARD[i]); }
  priceOf(i) {
    const base = this.BOARD[i].price;
    if (this.event && this.event.key === 'saldi') return Math.round((base * 0.8) / 10) * 10;
    if (this.event && this.event.key === 'blackMarket') return Math.round((base * 1.3) / 10) * 10;
    return base;
  }
  owned(pid) { return Object.keys(this.props).map(Number).filter((i) => this.props[i].owner === pid); }
  ownsGroup(pid, group) { return this.GROUPS[group].every((i) => this.props[i].owner === pid); }
  housesUsed() { let n = 0; for (const i in this.props) { const h = this.props[i].houses; if (h > 0 && h < 5) n += h; } return n; }
  hotelsUsed() { let n = 0; for (const i in this.props) if (this.props[i].houses === 5) n++; return n; }
  housesLeft() { return MAX_HOUSES - this.housesUsed(); }
  hotelsLeft() { return MAX_HOTELS - this.hotelsUsed(); }
  netWorth(p) {
    let w = p.cash;
    for (const i of this.owned(p.id)) {
      const sq = this.BOARD[i], pr = this.props[i];
      w += pr.mortgaged ? sq.price / 2 : sq.price;
      if (sq.type === 'street') w += pr.houses >= 6 ? 7 * sq.houseCost : pr.houses * sq.houseCost;
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
      votes: Object.fromEntries(FEATURES.map((k) => [k, !!this.settings[k]])),
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.addLog('join', `${p.emoji} ${p.name} entra in partita`);
    this.recompute();
    return p;
  }

  leave(p) {
    if (this.status !== 'lobby') fail('Non puoi uscire a partita iniziata.');
    this.players = this.players.filter((q) => q.id !== p.id);
    if (this.hostId === p.id) this.hostId = this.players[0] ? this.players[0].id : null;
    this.recompute();
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
    if (s.boardSize !== undefined) {
      const v = Number(s.boardSize);
      if (![40, 60].includes(v)) fail('Tabellone non valido.');
      this.settings.boardSize = v;
      this.setBoard(v);
    }
    if (s.theme !== undefined) {
      if (!THEMES[s.theme]) fail('Tema non valido.');
      this.settings.theme = s.theme;
    }
    for (const k of ['freeParking', 'showCash', 'auctions', 'speedDie', 'aces', 'events', 'cheat', 'missions', 'bounty', 'dares', 'freeBuy', 'autoEnd']) if (s[k] !== undefined) this.settings[k] = !!s[k];
    if (s.mean !== undefined) {
      const v = Number(s.mean);
      if (![1, 2, 3].includes(v)) fail('Livello non valido.');
      this.settings.mean = v;
    }
    if (s.meanRise !== undefined) this.settings.meanRise = !!s.meanRise;
    if (s.winWorth !== undefined) {
      const v = Number(s.winWorth);
      if (![0, 3000, 5000, 8000].includes(v)) fail('Traguardo non valido.');
      this.settings.winWorth = v;
    }
    if (s.auctionRound !== undefined) {
      const v = Number(s.auctionRound);
      if (![0, 4, 6, 10, 15].includes(v)) fail('Valore non valido.');
      this.settings.auctionRound = v;
    }
    if (s.timeLimit !== undefined) {
      const v = Number(s.timeLimit);
      if (![0, 30, 45, 60, 90].includes(v)) fail('Tempo non valido.');
      this.settings.timeLimit = v;
    }
    if (s.maxRounds !== undefined) {
      const v = Number(s.maxRounds);
      if (![0, 20, 30, 50].includes(v)) fail('Durata non valida.');
      this.settings.maxRounds = v;
    }
    // chi cambia le regole "d'autorità" (preset o interruttori) allinea i voti di tutte
    for (const k of FEATURES) if (s[k] !== undefined || s.preset !== undefined) for (const q of this.players) q.votes[k] = !!this.settings[k];
    this.recompute();
    if (this.settings.cheat || this.settings.banker) this.settings.showCash = false; // con i furbetti i soldi restano segreti
  }

  // la maggioranza decide; in caso di pareggio vale il voto di chi ha creato la partita
  recompute() {
    if (this.status !== 'lobby' || !this.players.length) return;
    const host = this.player(this.hostId);
    for (const k of FEATURES) {
      const yes = this.players.filter((q) => q.votes[k]).length;
      const no = this.players.length - yes;
      this.settings[k] = yes > no ? true : no > yes ? false : (host ? !!host.votes[k] : !!this.settings[k]);
    }
    if (this.settings.cheat || this.settings.banker) this.settings.showCash = false;
  }

  vote(p, a) {
    if (this.status !== 'lobby') fail('Le regole si votano prima di iniziare.');
    if (a.preset !== undefined) {
      if (!PRESETS[a.preset]) fail('Preset non valido.');
      for (const k of FEATURES) p.votes[k] = !!PRESETS[a.preset][k];
    } else {
      if (!FEATURES.includes(a.key)) fail('Regola sconosciuta.');
      p.votes[a.key] = !!a.value;
    }
    this.recompute();
  }

  tally() {
    const t = {};
    for (const k of FEATURES) { const yes = this.players.filter((q) => q.votes[k]).length; t[k] = { yes, no: this.players.length - yes }; }
    return t;
  }

  start() {
    if (this.status !== 'lobby') fail('Partita già avviata.');
    if (this.players.length < 2) fail('Servono almeno 2 giocatori.');
    this.players = shuffle(this.players, this.rng);
    for (const p of this.players) { p.cash = this.settings.startCash; p.pos = 0; p.aces = []; p.shield = false; p.x2 = false; p.skip = 0; }
    if (this.settings.aces) for (const p of this.players) this.giveAce(p, true);
    this.recompute();
    this.bankerId = null;
    if (this.settings.banker) {
      const b = this.players[Math.floor(this.rng() * this.players.length)];
      this.bankerId = b.id;
      this.addLog('banker', `🏦 ${b.emoji} ${b.name} fa il banchiere`);
    }
    this.startedAt = Date.now();
    this.heat = this.settings.mean || 2;
    this.lastChallenge = -99;
    this.dare = null; this.bountyId = null; this.winners = [];
    const np = this.players.length;
    this.settings.teams = false; this.settings.banker = false; this.bankerId = null;
    if (this.settings.auctionRound === undefined) this.settings.auctionRound = 6;
    this.teamsOn = false;
    for (const [i, q] of this.players.entries()) {
      q.team = this.teamsOn ? i % (np / 2) : null;
      q.mission = null; q.missionsDone = 0;
    }
    if (this.teamsOn) {
      const names = [];
      for (let t = 0; t < np / 2; t++) names.push(this.players.filter((q) => q.team === t).map((q) => `${q.emoji} ${q.name}`).join(' + '));
      this.addLog('start', `👯 Squadre: ${names.join('  ⚔️  ')}`);
    } else if (this.settings.teams) this.addLog('start', '👯 Squadre non possibili (servono 4 o 6 giocatrici): si gioca tutte contro tutte');
    if (this.settings.missions) for (const q of this.players) this.newMission(q);
    this.gameId = crypto.randomBytes(4).toString('hex');
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
    const useSpeed = this.settings.speedDie && !p.inJail && !this.isLate();
    const d3 = useSpeed ? SPEED_FACES[Math.floor(this.rng() * 6)] : 0;
    const num3 = typeof d3 === 'number' ? d3 : 0;
    const total = d1 + d2 + num3, dbl = d1 === d2;
    this.dice = { d1, d2, d3, seq: this.dice.seq + 1 };
    this.card = null;
    this.travel = null;
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
          this.addLog('jail', `${p.name} ha scontato 3 turni: esce di prigione gratis!`);
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
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.N) fail('Casella non valida.');
    if (idx === p.pos) fail('Sei già lì.');
    if (this.BOARD[idx].type === 'parking') fail('La Pausa Aperitivo si raggiunge solo con i dadi!');
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
    p.pos = this.jailIdx;
    p.inJail = true;
    p.jailTurns = 0;
    this.doubles = 0;
    this.canRollAgain = false;
    this.addLog('jail', `${p.emoji} ${p.name} va in prigione`);
  }

  movePlayer(p, steps) {
    const old = p.pos;
    const np = (((old + steps) % this.N) + this.N) % this.N;
    if (steps > 0 && np < old) this.passGo(p);
    p.pos = np;
    this.land(p, {});
  }

  passGo(p) {
    if (this.event && this.event.key === 'bankStrike') {
      this.addLog('go', `🏦 ${p.name} passa dalla Partenza ma la banca è in sciopero: niente soldi!`);
      return;
    }
    const gold = this.event && this.event.key === 'bonusGo';
    const amount = (this.settings.cheat ? 200 : 400) * (gold ? 2 : 1);
    this.bankPay(p, amount, 'Partenza');
    this.addLog('go', `${p.name} passa dalla Partenza e ritira ${eur(amount)}${gold ? ' (Partenza d\'oro!)' : ''}`);
    if (this.settings.aces && this.rng() < 0.6) this.giveAce(p);
  }

  // ---------- banchiere furbo ----------
  banker() { const b = this.bankerId && this.player(this.bankerId); return b && !b.bankrupt ? b : null; }

  // la banca deve dei soldi a p: se c'è un banchiere, li paga lui a mano
  bankPay(p, amount, reason) {
    const b = this.settings.banker ? this.banker() : null;
    if (!b || b.id === p.id) { p.cash += amount; return; }
    this.payouts.push({ id: ++this.payoutSeq, pid: p.id, amount, reason });
    this.addLog('banker', `🏦 Il banchiere deve pagare ${p.name}`);
  }

  payBanker(p, id, pct) {
    if (!this.banker() || this.banker().id !== p.id) fail('Non sei il banchiere.');
    const i = this.payouts.findIndex((x) => x.id === id);
    if (i < 0) fail('Pagamento non trovato.');
    if (![100, 75, 50, 0].includes(pct)) fail('Importo non valido.');
    const x = this.payouts.splice(i, 1)[0];
    const q = this.player(x.pid);
    if (!q || q.bankrupt) return;
    const given = Math.floor((x.amount * pct) / 100);
    const kept = x.amount - given;
    q.cash += given;
    if (kept > 0) {
      p.cash += kept;
      this.shorts.push({ pid: q.id, kept, round: this.round });
    }
    this.addLog('banker', `🏦 Il banchiere paga ${q.name}`);
  }

  flushPayouts() { // a fine turno i pagamenti non gestiti arrivano per intero
    for (const x of this.payouts) { const q = this.player(x.pid); if (q && !q.bankrupt) q.cash += x.amount; }
    this.payouts = [];
  }

  accuseBanker(p) {
    const b = this.banker();
    if (!this.settings.banker || !b) fail('Non c\'è un banchiere.');
    if (this.status !== 'playing') fail('La partita non è in corso.');
    if (p.id === b.id) fail('Sei tu il banchiere.');
    if (this.accusedB[p.id] === this.round) fail('Hai già accusato il banchiere in questo giro.');
    this.accusedB[p.id] = this.round;
    this.shorts = this.shorts.filter((x) => this.round - x.round <= 2);
    const i = this.shorts.findIndex((x) => x.pid === p.id);
    if (i >= 0) {
      const x = this.shorts.splice(i, 1)[0];
      const n = this.takeCash(b, p, x.kept * 2);
      this.addLog('cheat', `🕵️ ${p.name} ha scoperto il banchiere ${b.name}! Gli fa restituire ${eur(n)}`);
    } else {
      const n = this.takeCash(p, b, 50);
      this.addLog('cheat', `🕵️ ${p.name} accusa il banchiere ${b.name} ma era onesto: paga ${eur(n)}`);
    }
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
        if (this.BOARD[q.pos].type === 'parking') fail('Non puoi scambiare con chi è alla Pausa Aperitivo.');
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
        if (!Number.isInteger(idx) || idx < 0 || idx >= this.N || idx === p.pos) fail('Casella non valida.');
        if (this.BOARD[idx].type === 'parking') fail('La Pausa Aperitivo si raggiunge solo con i dadi!');
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
    if (this.phase !== 'roll' || this.doubles > 0 || p.inJail) fail('Il furbetto si fa solo a inizio turno, prima di tirare i dadi.');
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
    const r = this.rentBase(idx, opts);
    return this.event && this.event.key === 'rentUp' ? Math.round((r * 1.5) / 10) * 10 : r;
  }
  rentBase(idx, opts) {
    const sq = this.BOARD[idx], pr = this.props[idx];
    const ev = this.event ? this.event.key : null;
    if (ev === 'truce') return 0;
    if (sq.type === 'street') {
      let r = pr.houses >= 6 ? Math.round(sq.rent[5] * 1.6 / 10) * 10 : pr.houses > 0 ? sq.rent[pr.houses] : sq.rent[0] * (this.ownsGroup(pr.owner, sq.group) ? 2 : 1);
      if (ev === 'festa' && this.event.group === sq.group) r *= 2;
      return r;
    }
    if (sq.type === 'station') {
      if (ev === 'strike') return 0;
      const n = this.STATIONS.filter((i) => this.props[i].owner === pr.owner).length;
      return 25 * Math.pow(2, n - 1) * (opts.rentMult || 1);
    }
    const n = this.UTILS.filter((i) => this.props[i].owner === pr.owner).length;
    const mult = opts.utilTen ? 10 : (n >= 2 ? 10 : 4);
    return mult * (this.dice.d1 + this.dice.d2);
  }

  land(p, opts) {
    const sq = this.BOARD[p.pos];
    this.phase = 'resolving';
    switch (sq.type) {
      case 'street': case 'station': case 'util': {
        const pr = this.props[p.pos];
        if (!pr.owner) {
          this.phase = 'buy';
          this.addLog('land', `${p.emoji} ${p.name} arriva a ${this.nm(p.pos)} (libera, ${eur(this.priceOf(p.pos))})`);
          return;
        }
        if (pr.owner === p.id) {
          this.addLog('land', `${p.name} è a casa sua: ${this.nm(p.pos)}`);
          if (sq.type === 'station' && !opts.noTravel && this.stationsOf(p).length > 1) this.travel = { pid: p.id, from: p.pos };
          break;
        }
        if (this.teamsOn && this.player(pr.owner) && this.player(pr.owner).team === p.team) { this.addLog('land', `${p.name} è da una compagna di squadra: niente affitto`); break; }
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
        this.addDebt({ pid: p.id, amount, creditor: pr.owner, reason: 'affitto ' + this.nm(p.pos), kind: 'rent' });
        if (this.settings.bounty && this.bountyId === p.id) {
          this.bankPay(owner, BOUNTY_RENT, 'taglia');
          this.notify('💰', 'Taglia!', `${owner.name} incassa ${eur(BOUNTY_RENT)} di taglia perché ${p.name} è la più ricca`, 'good', owner.id);
        }
        break;
      }
      case 'tax':
        if (p.shield) { p.shield = false; this.addLog('ace', `🛡️ ${p.name} schiva la tassa con lo scudo!`); break; }
        this.addLog('tax', `${p.name} paga ${eur(sq.amount)}: ${this.nm(p.pos)}`);
        this.addDebt({ pid: p.id, amount: sq.amount, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: this.nm(p.pos), kind: 'tax' });
        break;
      case 'gotojail':
        this.sendToJail(p);
        break;
      case 'fortuna': case 'sorpresa': case 'imprevisto':
        this.drawCard(p, sq.type);
        return;
      case 'casino': this.casino(p); break;
      case 'wheel': this.wheel(p); break;
      case 'market':
        if (this.settings.aces) { this.giveAce(p); this.notify('🃏', 'Mercato degli Assi', `${p.name} compra un asso al mercato (gratis!)`, 'good', p.id); }
        else { this.bankPay(p, 50, 'mercato'); this.notify('🃏', 'Mercato', `${p.name} vende qualcosa e incassa €50`, 'good', p.id); }
        break;
      case 'teleport':
        this.notify('🌀', 'Teletrasporto!', `${p.name} entra nel portale…`, 'info', p.id);
        this.randomJump(p);
        return;
      case 'relax':
        p.skip += 1;
        this.bankPay(p, 100, 'relax');
        this.notify('🧖', 'Giornata di relax', `${p.name} si riposa: incassa €100 ma salta il prossimo turno`, 'info', p.id);
        break;
      case 'bonus':
        this.bankPay(p, 100, 'premio');
        this.notify('🏆', 'Premio di città', `${p.name} vince il premio: +€100`, 'good', p.id);
        break;
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

  // tutte le proprietà vendute? Comincia la fase finale: i malus peggiorano
  // quanta parte delle proprietà è già comprata (0..1): misura quanto siamo avanti nella partita
  progress() {
    const ks = Object.keys(this.props);
    return ks.length ? ks.filter((i) => this.props[i].owner).length / ks.length : 0;
  }
  isLate() {
    for (const i in this.props) if (!this.props[i].owner) return false;
    return true;
  }
  addDebt(d) {
    if (d.kind === 'tax' && !d.fixed && this.isLate()) d.amount *= 2;
    this.debts.push(d);
  }

  notify(icon, title, text, tone, pid) {
    this.notice = { seq: ++this.noticeSeq, icon, title, text, tone: tone || 'info', pid: pid || null };
    this.addLog('notice', `${icon} ${title}: ${text}`);
  }

  randomJump(p) {
    const ok = [];
    this.BOARD.forEach((q, i) => { if (i !== p.pos && !['jail', 'gotojail', 'teleport', 'parking'].includes(q.type)) ok.push(i); });
    const idx = ok[Math.floor(this.rng() * ok.length)];
    p.pos = idx;
    this.addLog('move', `🌀 ${p.emoji} ${p.name} compare a ${this.nm(idx)}`);
    this.land(p, {});
  }

  casino(p) {
    const d = this.die();
    const gains = { 1: -150, 2: -50, 3: 0, 4: 50, 5: 150, 6: 300 };
    let v = gains[d];
    if (d === 1 && this.isLate()) {
      const all = Math.max(p.cash, 150);
      this.addDebt({ pid: p.id, amount: all, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: 'casinò', kind: 'tax', fixed: true });
      this.notify('🎰', 'Casinò: esce 1', `FASE FINALE! ${p.name} perde TUTTO il contante: ${eur(all)}!`, 'bad', p.id);
      return;
    }
    if (v < 0) {
      this.addDebt({ pid: p.id, amount: -v, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: 'casinò', kind: 'tax' });
      this.notify('🎰', `Casinò: esce ${d}`, `${p.name} perde ${eur(-v)}!`, 'bad', p.id);
    } else if (v > 0) {
      this.bankPay(p, v, 'casinò');
      this.notify('🎰', `Casinò: esce ${d}`, `${p.name} vince ${eur(v)}!`, 'good', p.id);
    } else this.notify('🎰', `Casinò: esce ${d}`, `${p.name} pareggia, non succede nulla`, 'info', p.id);
  }

  wheel(p) {
    const slots = ['c200', 'p100', 'c50', 'ace', 'shield', 'tele', 'skip', 'c300'];
    if (this.isLate()) slots.push('all', 'all');
    const k = slots[Math.floor(this.rng() * slots.length)];
    const nm = p.name;
    switch (k) {
      case 'c200': this.bankPay(p, 200, 'ruota'); this.notify('🎡', 'Ruota della fortuna', `${nm} vince €200!`, 'good', p.id); break;
      case 'c300': this.bankPay(p, 300, 'ruota'); this.notify('🎡', 'Ruota della fortuna', `${nm} vince il super premio da €300!`, 'good', p.id); break;
      case 'c50': this.bankPay(p, 50, 'ruota'); this.notify('🎡', 'Ruota della fortuna', `${nm} vince €50`, 'good', p.id); break;
      case 'p100':
        this.addDebt({ pid: p.id, amount: 100, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: 'ruota', kind: 'tax' });
        this.notify('🎡', 'Ruota della fortuna', `${nm} perde €100`, 'bad', p.id);
        break;
      case 'ace':
        if (this.settings.aces) { this.giveAce(p); this.notify('🎡', 'Ruota della fortuna', `${nm} vince un asso!`, 'good', p.id); }
        else { this.bankPay(p, 100, 'ruota'); this.notify('🎡', 'Ruota della fortuna', `${nm} vince €100`, 'good', p.id); }
        break;
      case 'all': {
        const all = Math.max(p.cash, 100);
        this.addDebt({ pid: p.id, amount: all, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: 'ruota', kind: 'tax', fixed: true });
        this.notify('🎡', 'Ruota della fortuna', `FASE FINALE! ${nm} perde tutto il contante: ${eur(all)}!`, 'bad', p.id);
        break;
      }
      case 'shield': p.shield = true; this.notify('🎡', 'Ruota della fortuna', `${nm} vince uno scudo 🛡️`, 'good', p.id); break;
      case 'skip': p.skip += 1; this.notify('🎡', 'Ruota della fortuna', `${nm} si gira male: salta il prossimo turno`, 'bad', p.id); break;
      case 'tele': this.notify('🎡', 'Ruota della fortuna', `${nm} viene sparata altrove!`, 'info', p.id); this.randomJump(p); return;
      default: break;
    }
  }

  drawCard(p, deckName) {
    const deck = this.decks[deckName];
    const id = deck.shift();
    const card = CARDS[deckName][id];
    if (card.fx === 'jailCard') p.jailCards.push({ deck: deckName, id });
    else deck.push(id);
    const noDare = card.fx === 'dare' && !this.settings.dares;
    const text = noDare ? '🎭 Sfida saltata: ricevi €40 di consolazione.' : card.text.replace(/\{(\w+)\}/g, (m, k) => DATA.nameOf(this.settings.theme, k));
    this.cardSeq++;
    this.card = { seq: this.cardSeq, deck: deckName, text, pid: p.id };
    this.addLog('card', `${p.emoji} ${p.name} pesca (${DECK_NAMES[deckName]}): ${text}`);
    const pot = this.settings.freeParking ? 'pot' : 'bank';
    switch (card.fx) {
      case 'dare':
        if (noDare) { this.bankPay(p, 40, 'carta'); break; }
        this.dare = { seq: ++this.dareSeq, pid: p.id, text: card.dare, win: DARE_WIN, lose: DARE_LOSE };
        this.phase = 'dare';
        return;
      case 'collect':
        this.bankPay(p, card.amount, 'carta');
        break;
      case 'pay':
        this.addDebt({ pid: p.id, amount: card.amount, creditor: pot, reason: 'carta', kind: 'tax' });
        break;
      case 'moveTo': {
        const to = this.BOARD.findIndex((q) => q.id === card.key);
        if (to < p.pos) this.passGo(p);
        p.pos = to;
        this.land(p, {});
        return;
      }
      case 'moveBy':
        p.pos = (p.pos + card.n + this.N) % this.N;
        this.land(p, {});
        return;
      case 'nearest': {
        const list = card.kind === 'station' ? this.STATIONS : this.UTILS;
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
        const vs = this.alive().filter((q) => q.id !== p.id && !q.inJail && q.pos !== p.pos && this.BOARD[q.pos].type !== 'parking');
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
          if (h >= 5) hotels++; else houses += h;
        }
        const amount = houses * card.house + hotels * card.hotel;
        if (amount > 0) this.addDebt({ pid: p.id, amount, creditor: pot, reason: 'lavori', kind: 'tax' });
        else this.addLog('card', `${p.name} non ha immobili da riparare`);
        break;
      }
      case 'giveShield': p.shield = true; this.notify('🛡️', 'Scudo!', `${p.name} riceve uno scudo`, 'good', p.id); break;
      case 'giveX2': p.x2 = true; this.notify('✖️2', 'Doppio affitto', `${p.name} incasserà il doppio al prossimo affitto`, 'good', p.id); break;
      case 'loseShield':
        if (p.shield) { p.shield = false; this.notify('🛡️', 'Scudo rubato', `${p.name} perde lo scudo`, 'bad', p.id); }
        else this.addDebt({ pid: p.id, amount: card.amount, creditor: pot, reason: 'carta', kind: 'tax' });
        break;
      case 'skipSelf': p.skip += 1; this.notify('😴', 'Turno saltato', `${p.name} salterà il prossimo turno`, 'bad', p.id); break;
      case 'relaxCard': p.skip += 1; this.bankPay(p, card.amount, 'carta'); break;
      case 'flu':
        p.skip += 1;
        this.addDebt({ pid: p.id, amount: card.amount, creditor: pot, reason: 'carta', kind: 'tax' });
        break;
      case 'extraRoll': if (!p.inJail) this.canRollAgain = true; break;
      case 'toStart': p.pos = 0; this.land(p, {}); return;
      case 'teleportRand': this.randomJump(p); return;
      case 'goFree': {
        for (let k = 1; k < this.N; k++) {
          const idx = (p.pos + k) % this.N;
          if (isOwnable(this.BOARD[idx]) && !this.props[idx].owner) { this.movePlayer(p, k); return; }
        }
        this.addLog('card', 'Non ci sono proprietà libere');
        break;
      }
      case 'payAce':
        this.addDebt({ pid: p.id, amount: card.amount, creditor: pot, reason: 'festa', kind: 'tax' });
        if (this.settings.aces) this.giveAce(p);
        break;
      case 'collectPct': {
        const a = Math.max(10, Math.floor((Math.max(0, p.cash) * card.pct) / 100 / 10) * 10);
        this.bankPay(p, a, 'carta');
        break;
      }
      case 'payPct': {
        const a = Math.max(10, Math.floor((Math.max(0, p.cash) * card.pct) / 100 / 10) * 10);
        this.addDebt({ pid: p.id, amount: a, creditor: pot, reason: 'carta', kind: 'tax' });
        break;
      }
      case 'giveToPoorest': {
        const others = this.alive().filter((q) => q.id !== p.id).sort((x, y) => x.cash - y.cash);
        if (others.length) this.addDebt({ pid: p.id, amount: card.amount, creditor: others[0].id, reason: 'donazione', kind: 'gift' });
        break;
      }
      case 'jailOther': {
        const vs = this.alive().filter((q) => q.id !== p.id && !q.inJail);
        if (!vs.length) break;
        const q = vs[Math.floor(this.rng() * vs.length)];
        if (this.attackOk(q)) {
          q.pos = this.jailIdx; q.inJail = true; q.jailTurns = 0;
          this.notify('👮', 'In prigione!', `${q.name} finisce in prigione per colpa di ${p.name}`, 'bad', q.id);
          if (this.settings.bounty && this.bountyId === q.id) {
            this.bankPay(p, BOUNTY_JAIL, 'taglia');
            this.notify('💰', 'Taglia incassata!', `${p.name} prende ${eur(BOUNTY_JAIL)} per aver fermato la più ricca`, 'good', p.id);
          }
        }
        break;
      }
      case 'loseAce': {
        if (p.aces.length) {
          const k = Math.floor(this.rng() * p.aces.length);
          p.aces.splice(k, 1);
          this.notify('🥷', 'Ladri!', `${p.name} perde un asso`, 'bad', p.id);
        } else this.addDebt({ pid: p.id, amount: card.amount, creditor: pot, reason: 'ladri', kind: 'tax' });
        break;
      }
      case 'stormHouse': {
        const list = this.owned(p.id).filter((i) => { const h = this.props[i].houses; return h > 0 && !(h === 5 && this.housesLeft() < 4) && !(h === 6 && this.hotelsLeft() <= 0); });
        if (list.length) {
          const i = list[Math.floor(this.rng() * list.length)];
          this.props[i].houses--;
          this.notify('🌩️', 'Danno!', `${p.name} perde un edificio a ${this.nm(i)}`, 'bad', p.id);
        } else this.addDebt({ pid: p.id, amount: card.amount, creditor: pot, reason: 'danni', kind: 'tax' });
        break;
      }
      case 'collectEach':
        for (const q of this.alive()) if (q.id !== p.id) this.addDebt({ pid: q.id, amount: card.amount, creditor: p.id, reason: 'regalo di compleanno', kind: 'gift' });
        break;
      case 'payEach':
        for (const q of this.alive()) if (q.id !== p.id) this.addDebt({ pid: p.id, amount: card.amount, creditor: q.id, reason: 'carta', kind: 'gift' });
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
      if (c.type === 'toRoll') { this.phase = 'roll'; return; }
      if (c.type === 'jolly') {
        const p = this.cur;
        if (!p.inJail && !p.bankrupt) {
          for (let k = 1; k < this.N; k++) {
            const idx = (p.pos + k) % this.N;
            if (isOwnable(this.BOARD[idx]) && !this.props[idx].owner) {
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
    if (this.checkWin()) return;
    this.checkMissions();
    this.updateBounty();
    this.dare = null;
    this.travel = null;
    this.doubles = 0;
    this.canRollAgain = false;
    this.cont = null;
    this.flushPayouts();
    this.hold = false;
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
    if (this.status === 'playing') this.maybeChallenge();
  }

  // la partita finisce quando qualcuna arriva al traguardo (soldi + proprietà + edifici)
  checkWin() {
    if (this.status !== 'playing') return false;
    if (this.isLate() && !this.lateNotified) {
      this.lateNotified = true;
      this.notify('🔥', 'FASE FINALE!', 'Tutte le proprietà sono state prese: niente più Dado matto, tasse e multe DOPPIE e il casinò può svuotarti le tasche!', 'bad', null);
    }
    const tl = this.settings.timeLimit;
    if (tl && this.startedAt && Date.now() - this.startedAt >= tl * 60000) {
      this.addLog('event', `⏱️ Tempo scaduto (${tl} minuti): vince chi ha il patrimonio più alto!`);
      this.finish(null);
      return true;
    }
    const goal = this.settings.winWorth;
    if (!goal) return false;
    if (this.teamsOn) {
      const tgoal = Math.round(goal * 1.6);
      const t = this.teamTotals().find((x) => x.w >= tgoal);
      if (t) {
        const best = t.members.map((m) => ({ m, w: this.netWorth(m) })).sort((a, b) => b.w - a.w)[0].m;
        this.addLog('win', `💰 La squadra ${t.members.map((m) => m.emoji + ' ' + m.name).join(' + ')} arriva a ${eur(t.w)}: la partita finisce!`);
        this.finish(best);
        return true;
      }
      return false;
    }
    const top = this.alive().map((p) => ({ p, w: this.netWorth(p) })).sort((a, b) => b.w - a.w)[0];
    if (top && top.w >= goal) {
      this.addLog('win', `💰 ${top.p.emoji} ${top.p.name} arriva a ${eur(top.w)} tra soldi e proprietà: la partita finisce!`);
      this.finish(top.p);
      return true;
    }
    return false;
  }

  stationsOf(p) { return this.owned(p.id).filter((i) => this.BOARD[i].type === 'station' && !this.props[i].mortgaged); }
  travelTo(p, idx) {
    this.needTurn(p, 'action');
    const t = this.travel;
    if (!t || t.pid !== p.id || p.pos !== t.from) fail('Puoi viaggiare solo appena arrivi su una tua stazione.');
    if (!this.stationsOf(p).includes(idx) || idx === p.pos) fail('Scegli un\'altra tua stazione.');
    this.travel = null;
    if (idx < p.pos) this.passGo(p);
    p.pos = idx;
    this.addLog('move', `🚆 ${p.emoji} ${p.name} viaggia in treno fino a ${this.nm(idx)}`);
    this.land(p, { noTravel: true });
  }

  // ---------- squadre, missioni, taglia ----------
  teamTotals() {
    const map = {};
    for (const p of this.players) {
      if (p.team === null || p.team === undefined) continue;
      const t = map[p.team] = map[p.team] || { team: p.team, w: 0, members: [] };
      t.members.push(p);
      if (!p.bankrupt) t.w += this.netWorth(p);
    }
    return Object.values(map).sort((a, b) => b.w - a.w);
  }
  newMission(p) {
    const keys = Object.keys(MISSIONS).filter((k) => k !== p.mission && !MISSIONS[k].check(this, p));
    p.mission = keys.length ? keys[Math.floor(this.rng() * keys.length)] : null;
  }
  checkMissions() {
    if (!this.settings.missions) return;
    for (const p of this.alive()) {
      const m = p.mission && MISSIONS[p.mission];
      if (!m || !m.check(this, p)) continue;
      p.missionsDone = (p.missionsDone || 0) + 1;
      this.bankPay(p, MISSION_REWARD, 'missione');
      this.addLog('mission', `🎯 ${p.emoji} ${p.name} ha completato una missione segreta! (${m.text}) +${eur(MISSION_REWARD)}`);
      this.notify('🎯', 'Missione compiuta!', `${p.name} completa una missione segreta e incassa ${eur(MISSION_REWARD)}`, 'good', p.id);
      this.newMission(p);
    }
  }
  updateBounty() {
    if (!this.settings.bounty) { this.bountyId = null; return; }
    const al = this.alive();
    if (al.length < 3) { this.bountyId = null; return; }
    const sorted = al.map((p) => ({ p, w: this.netWorth(p) })).sort((a, b) => b.w - a.w);
    const cur = sorted.find((x) => x.p.id === this.bountyId);
    if (cur && cur.w >= sorted[0].w) return; // in caso di parità la taglia resta dov'è
    if (this.bountyId === sorted[0].p.id) return;
    this.bountyId = sorted[0].p.id;
    this.notify('💰', 'Taglia!', `${sorted[0].p.name} è la più ricca: ha una taglia sulla testa! Chi le fa pagare un affitto incassa ${eur(BOUNTY_RENT)} extra.`, 'bad', null);
  }

  dareAnswer(p, done) {
    this.needTurn(p, 'dare');
    const d = this.dare || {};
    const win = d.win || DARE_WIN, lose = d.lose || DARE_LOSE;
    this.dare = null;
    if (done) {
      this.bankPay(p, win, 'sfida');
      this.addLog('dare', `🎭 ${p.name} ha fatto la sfida: +${eur(win)}`);
    } else {
      this.addLog('dare', `🎭 ${p.name} rifiuta la sfida: paga ${eur(lose)}`);
      this.addDebt({ pid: p.id, amount: lose, creditor: this.settings.freeParking ? 'pot' : 'bank', reason: 'sfida rifiutata', kind: 'tax', fixed: true });
    }
    if (d.lampo) this.cont = { type: 'toRoll' }; // dopo la sfida lampo si tira i dadi come al solito
    this.proceed();
  }

  // ogni tanto, all'inizio del turno, arriva una sfida anche senza pescare una carta
  maybeChallenge() {
    if (!this.settings.dares || this.status !== 'playing' || this.phase !== 'roll') return;
    const p = this.cur;
    const h = this.heat || 2;
    if (!p || p.bankrupt || p.inJail || this.turnCount < this.alive().length + 1) return;
    if (this.turnCount - this.lastChallenge < [5, 4, 3][h - 1]) return;
    if (this.rng() > [0.35, 0.5, 0.65][h - 1]) return;
    this.lastChallenge = this.turnCount;
    const text = LAMPO[Math.floor(this.rng() * LAMPO.length)];
    const win = [100, 150, 200][h - 1], lose = [50, 75, 100][h - 1];
    this.dare = { seq: ++this.dareSeq, pid: p.id, text, win, lose, lampo: true };
    this.phase = 'dare';
    this.notify('⚡', 'Sfida lampo!', `${p.name} ${text}. Fatta: +${eur(win)} · Rifiutata: −${eur(lose)}`, 'info', p.id);
  }

  heatUp(auto) {
    if ((this.heat || 2) >= 3) fail('La cattiveria è già al massimo!');
    this.heat = (this.heat || 2) + 1;
    const H = DATA.HEAT[this.heat];
    this.notify('🔥', 'Si scalda!', `${auto ? 'Il tempo passa e la partita si fa più cattiva' : 'Si alza la cattiveria'}: livello ${this.heat} · ${H.name} ${H.icon}`, 'bad', null);
  }

  newRound() {
    this.round++;
    const max = this.settings.maxRounds;
    if (max && this.round > max) {
      this.addLog('event', `⏱️ Finiti i ${max} giri: vince chi ha il patrimonio più alto!`);
      this.finish(null);
      return;
    }
    if (this.settings.meanRise && (this.heat || 2) < 3 && this.round % HEAT_RISE_EVERY === 0) this.heatUp(true);
    if (!this.settings.events) return;
    // la cattiveria decide quanti eventi arrivano e quanti sono cattivi
    const h = this.heat || 2;
    const late = this.isLate();
    const pr = this.progress();
    const evChance = h === 1 ? (late ? 0.7 : 0.3 + 0.2 * pr) : h === 2 ? (late ? 0.85 : 0.55 + 0.2 * pr) : 0.95;
    const badChance = h === 1 ? (late ? 0.6 : Math.max(0, (pr - 0.5) / 0.5) * 0.4) : h === 2 ? (late ? 0.65 : 0.2 + 0.3 * pr) : (late ? 0.75 : 0.4 + 0.2 * pr);
    if (this.rng() > evChance) { this.event = null; return; }
    const allowBad = this.rng() < badChance;
    const pool = BAD_BY_HEAT[h];
    let keys = Object.keys(EVENTS).filter((k) => !ALL_BAD.includes(k));
    if (allowBad) keys = pool.slice();
    let key = keys[Math.floor(this.rng() * keys.length)];
    if (this.event && key === this.event.key) key = keys[(keys.indexOf(key) + 1) % keys.length];
    const ev = { key, ...EVENTS[key] };
    if (key === 'festa') {
      const gs = Object.keys(this.GROUPS);
      ev.group = gs[Math.floor(this.rng() * gs.length)];
      ev.text = ev.text.replace('{group}', GROUP_NAMES[ev.group].toLowerCase());
    }
    ev.seq = ++this.eventSeq;
    this.event = ev;
    this.addLog('event', `${ev.icon} ${ev.title}: ${ev.text}`);
    if (key === 'bonus') for (const q of this.alive()) q.cash += 50;
    if (key === 'robinHood') this.robinHood();
    if (key === 'quake') this.quake();
    if (key === 'taxman') {
      for (const q of this.alive()) {
        const amt = Math.min(q.cash, Math.round((q.cash * 0.03) / 10) * 10);
        if (amt <= 0) continue;
        q.cash -= amt;
        if (this.settings.freeParking) this.pot += amt;
        this.addLog('tax', `🧾 ${q.name} paga ${eur(amt)} al controllo fiscale`);
      }
    }
  }

  // il più ricco regala soldi alla più povera
  robinHood() {
    const al = this.alive().slice().sort((a, b) => this.netWorth(b) - this.netWorth(a));
    if (al.length < 2) return;
    const rich = al[0], poor = al[al.length - 1];
    if (rich.id === poor.id || this.netWorth(rich) === this.netWorth(poor)) { this.addLog('event', '🏹 Robin Hood non trova nessuno da derubare'); return; }
    const amt = Math.min(rich.cash, 100 * (this.heat || 2));
    if (amt <= 0) return;
    rich.cash -= amt; poor.cash += amt;
    this.addLog('pay', `🏹 ${rich.name} regala ${eur(amt)} a ${poor.name}`);
    this.notify('🏹', 'Robin Hood!', `${rich.name} (la più ricca) regala ${eur(amt)} a ${poor.name}`, 'bad', rich.id);
  }
  // il terremoto abbatte una casa a caso
  quake() {
    const cand = Object.keys(this.props).map(Number).filter((i) => this.props[i].owner && this.props[i].houses >= 1 && this.props[i].houses <= 4);
    if (!cand.length) { this.addLog('event', '🏚️ Il terremoto non trova case da abbattere'); return; }
    const i = cand[Math.floor(this.rng() * cand.length)];
    this.props[i].houses -= 1;
    const o = this.player(this.props[i].owner);
    this.notify('🏚️', 'Terremoto!', `Crolla una casa a ${this.nm(i)}: la perde ${o ? o.name : 'qualcuna'}`, 'bad', o ? o.id : null);
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
    const fb = this.settings.freeBuy;
    const aucOk = this.settings.auctions && (!fb || this.round >= (this.settings.auctionRound || 0));
    if (aucOk) this.startAuction(p.pos);
    else if (fb) this.startClaim(p);
    else { this.addLog('buy', `${p.name} non compra ${this.nm(p.pos)}`); this.proceed(); }
  }

  // acquisto libero: chi non compra la lascia libera; le altre possono "richiederla" a prezzo di listino
  // e chi l'ha lasciata prende il 10% come commissione
  startClaim(p) {
    const price = this.priceOf(p.pos);
    const eligible = this.alive().filter((q) => q.id !== p.id && q.cash >= price).map((q) => q.id);
    this.addLog('buy', `${p.name} non compra ${this.nm(p.pos)}`);
    if (!eligible.length) { this.proceed(); return; }
    this.claim = { seq: ++this.claimSeq, idx: p.pos, from: p.id, price, eligible, passed: [], until: Date.now() + 25000 };
    this.phase = 'claim';
    this.addLog('sale', `🙋 ${this.nm(p.pos)} è libera a ${eur(price)}: chi la vuole? (${p.name} prende il 10%)`);
  }
  claimTake(p) {
    const c = this.claim;
    if (this.phase !== 'claim' || !c) fail('Nessuna proprietà da richiedere.');
    if (!c.eligible.includes(p.id)) fail('Non puoi richiederla.');
    if (p.cash < c.price) fail('Non hai abbastanza soldi.');
    if (!c.claimed) c.claimed = [];
    if (c.claimed.includes(p.id)) return;
    c.claimed.push(p.id);
    c.passed = c.passed.filter((id) => id !== p.id);
    // alle altre restano pochi secondi per unirsi: se in due la vogliono, si fa l'asta
    if (c.claimed.length === 1) c.until = Math.min(c.until, Date.now() + 7000);
    this.addLog('sale', `🙋 ${p.emoji} ${p.name} la vuole!`);
    this.checkClaimDone();
  }
  checkClaimDone() {
    const c = this.claim;
    if (c && c.eligible.every((id) => (c.claimed || []).includes(id) || c.passed.includes(id))) this.claimEnd();
  }
  claimPass(p) {
    const c = this.claim;
    if (this.phase !== 'claim' || !c) fail('Nessuna proprietà da richiedere.');
    if ((c.claimed || []).includes(p.id)) return;
    if (!c.passed.includes(p.id)) c.passed.push(p.id);
    this.checkClaimDone();
  }
  claimEnd() {
    if (this.phase !== 'claim') return;
    const c = this.claim;
    this.claim = null;
    if (!c) { this.proceed(); return; }
    const from = this.player(c.from);
    const who = (c.claimed || []).map((id) => this.player(id)).filter((q) => q && !q.bankrupt && q.cash >= c.price);
    if (!who.length) { this.addLog('buy', `Nessuna vuole ${this.nm(c.idx)}: resta libera`); this.proceed(); return; }
    if (who.length === 1) {
      const p = who[0];
      const fee = Math.round((c.price * 0.1) / 10) * 10;
      p.cash -= c.price;
      if (from && !from.bankrupt) from.cash += fee;
      this.props[c.idx].owner = p.id;
      this.addLog('buy', `🙋 ${p.emoji} ${p.name} la richiede e prende ${this.nm(c.idx)} per ${eur(c.price)} (${from ? from.name : ''} prende ${eur(fee)})`);
      this.notify('🙋', 'La voglio io!', `${p.name} prende ${this.nm(c.idx)} per ${eur(c.price)}`, 'good', p.id);
      this.proceed();
      return;
    }
    // in due o più la vogliono: asta tra loro, si parte dal prezzo di listino
    this.auction = { idx: c.idx, high: 0, bidder: null, active: who.map((q) => q.id), minBid: c.price, feeTo: c.from };
    this.phase = 'auction';
    this.addLog('auction', `🔨 ${who.map((q) => q.name).join(' e ')} vogliono ${this.nm(c.idx)}: asta tra loro, si parte da ${eur(c.price)}!`);
  }

  // asta d'emergenza: per pagare un debito metti all'asta una tua proprietà (senza edifici). Ti rientra il 70%.
  auctionOwn(p, idx) {
    if (this.phase !== 'debt' || !this.debts.length || this.debts[0].pid !== p.id) fail('Puoi farlo solo quando devi pagare un debito.');
    const pr = this.props[idx];
    if (!pr || pr.owner !== p.id) fail('Non è tua.');
    if (pr.houses > 0) fail('Prima vendi gli edifici.');
    if (pr.mortgaged) fail('È ipotecata.');
    const others = this.alive().filter((q) => q.id !== p.id).map((q) => q.id);
    if (!others.length) fail('Non c\'è nessuna a cui venderla.');
    this.auction = { idx, high: 0, bidder: null, active: others, seller: p.id };
    this.phase = 'auction';
    this.addLog('auction', `🔨 ${p.name} mette all'asta ${this.nm(idx)} per pagare i debiti (le rientra il 70%)`);
  }

  // Invece di comprare o fare l'asta: offro la proprietà a UNA giocatrice a un prezzo deciso da me
  offerSale(p, toId, price) {
    this.needTurn(p, 'buy');
    const to = this.player(toId);
    if (!to || to.bankrupt || to.id === p.id) fail('Scegli a chi offrirla.');
    price = Math.floor(price);
    if (!(price >= 0) || price > 5000) fail('Prezzo non valido.');
    if (price > to.cash) fail(`${to.name} non ha tutti quei soldi.`);
    this.sale = { idx: p.pos, from: p.id, to: to.id, price };
    this.phase = 'sale';
    this.addLog('sale', `🤝 ${p.name} offre ${this.nm(p.pos)} a ${to.name} per ${eur(price)}`);
  }
  saleAnswer(p, yes) {
    const sl = this.sale;
    if (this.phase !== 'sale' || !sl) fail('Nessuna offerta in corso.');
    if (sl.to !== p.id) fail('L\'offerta non è per te.');
    const seller = this.player(sl.from);
    if (!yes) {
      this.sale = null;
      this.phase = 'buy';
      this.addLog('sale', `${p.name} rifiuta l'offerta`);
      return;
    }
    if (p.cash < sl.price) fail('Non hai abbastanza soldi.');
    p.cash -= sl.price;
    seller.cash += sl.price;
    this.props[sl.idx].owner = p.id;
    this.sale = null;
    this.addLog('buy', `🤝 ${p.emoji} ${p.name} compra ${this.nm(sl.idx)} da ${seller.name} per ${eur(sl.price)}`);
    this.notify('🤝', 'Affare fatto!', `${p.name} prende ${this.nm(sl.idx)} per ${eur(sl.price)}`, 'good', p.id);
    this.proceed();
  }
  saleCancel(p) {
    const sl = this.sale;
    if (this.phase !== 'sale' || !sl) fail('Nessuna offerta in corso.');
    if (sl.from !== p.id) fail('Solo chi ha fatto l\'offerta può ritirarla.');
    this.sale = null;
    this.phase = 'buy';
    this.addLog('sale', `${p.name} ritira l'offerta`);
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
    if (a.high === 0 && amount < (a.minBid || 10)) fail(`L'offerta minima è ${eur(a.minBid || 10)}.`);
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
    if (!a.bidder && a.minBid && a.active.length === 1) {
      const only = this.player(a.active[0]);
      if (only && only.cash >= a.minBid) { a.bidder = only.id; a.high = a.minBid; }
    }
    const others = a.active.filter((id) => id !== a.bidder);
    const over = force || (a.bidder ? others.length === 0 : a.active.length === 0);
    if (!over) return;
    this.auction = null;
    const sq = { name: this.nm(a.idx) };
    const w = a.bidder ? this.player(a.bidder) : null;
    if (w && !w.bankrupt && w.cash >= a.high) {
      w.cash -= a.high;
      if (a.seller) {
        const sl = this.player(a.seller);
        const back = Math.floor(a.high * 0.7);
        if (sl) sl.cash += back;
        this.addLog('buy', `🔨 ${sl ? sl.name : ''} incassa ${eur(back)} (70%) dall'asta`);
      }
      if (a.feeTo) {
        const fo = this.player(a.feeTo), fee = Math.round((a.high * 0.1) / 10) * 10;
        if (fo && !fo.bankrupt && fee > 0) { fo.cash += fee; this.addLog('buy', `${fo.name} prende ${eur(fee)} (10%)`); }
      }
      this.props[a.idx].owner = w.id;
      this.addLog('buy', `${w.emoji} ${w.name} vince l'asta e prende ${sq.name} per ${eur(a.high)}`);
    } else this.addLog('auction', `Nessuno compra ${sq.name}`);
    this.proceed();
  }

  // ---------- costruzioni e ipoteche ----------
  // costo del prossimo livello (o del livello 'from' se indicato): il Monumento costa il doppio
  buildCost(idx, from) {
    const sq = this.BOARD[idx], h = from === undefined ? this.props[idx].houses : from;
    return h >= 5 ? sq.houseCost * 2 : sq.houseCost;
  }
  whyNotBuild(p, idx) {
    const sq = this.BOARD[idx], pr = this.props[idx];
    if (!sq || sq.type !== 'street') return 'Qui non si può costruire.';
    if (pr.owner !== p.id) return 'Non è tua.';
    if (this.event && this.event.key === 'noBuild') return 'Sciopero dei muratori: in questo giro non si costruisce.';
    if (!this.ownsGroup(p.id, sq.group)) return 'Ti serve tutto il colore.';
    const grp = this.GROUPS[sq.group];
    if (grp.some((i) => this.props[i].mortgaged)) return 'C\'è una proprietà ipotecata nel gruppo.';
    if (pr.houses >= 6) return 'C\'è già il Monumento!';
    if (pr.houses > Math.min(...grp.map((i) => this.props[i].houses))) return 'Costruisci in modo uniforme.';
    if (pr.houses < 5 && (pr.houses === 4 ? this.hotelsLeft() <= 0 : this.housesLeft() <= 0)) return 'Finiti gli edifici in banca.';
    if (p.cash < this.buildCost(idx)) return 'Non hai abbastanza soldi.';
    return null;
  }
  whyNotSell(p, idx) {
    const sq = this.BOARD[idx], pr = this.props[idx];
    if (!sq || sq.type !== 'street' || pr.owner !== p.id) return 'Non puoi.';
    if (pr.houses <= 0) return 'Non ci sono edifici.';
    const grp = this.GROUPS[sq.group];
    if (pr.houses < Math.max(...grp.map((i) => this.props[i].houses))) return 'Vendi in modo uniforme.';
    if (pr.houses === 6 && this.hotelsLeft() <= 0) return 'Non ci sono alberghi in banca per sostituire il Monumento.';
    if (pr.houses === 5 && this.housesLeft() < 4) return 'Non ci sono abbastanza case in banca per sostituire l\'albergo.';
    return null;
  }
  whyNotMortgage(p, idx) {
    const sq = this.BOARD[idx], pr = this.props[idx];
    if (!pr || pr.owner !== p.id) return 'Non è tua.';
    if (pr.mortgaged) return 'È già ipotecata.';
    if (sq.type === 'street' && this.GROUPS[sq.group].some((i) => this.props[i].houses > 0)) return 'Prima vendi gli edifici del colore.';
    return null;
  }
  whyNotUnmortgage(p, idx) {
    const sq = this.BOARD[idx], pr = this.props[idx];
    if (!pr || pr.owner !== p.id) return 'Non è tua.';
    if (!pr.mortgaged) return 'Non è ipotecata.';
    if (p.cash < Math.ceil(sq.price * 0.55)) return 'Non hai abbastanza soldi.';
    return null;
  }

  build(p, idx) {
    const why = this.whyNotBuild(p, idx); if (why) fail(why);
    const sq = this.BOARD[idx], pr = this.props[idx];
    p.cash -= this.buildCost(idx);
    pr.houses++;
    this.addLog('build', `${p.name} costruisce ${pr.houses === 6 ? '🗽 il MONUMENTO' : pr.houses === 5 ? 'un albergo' : 'una casa'} a ${this.nm(idx)}`);
    if (pr.houses === 6) this.notify('🗽', 'Monumento!', `${p.name} costruisce il Monumento a ${this.nm(idx)}: affitto altissimo!`, 'good', p.id);
  }
  sell(p, idx) {
    const why = this.whyNotSell(p, idx); if (why) fail(why);
    const sq = this.BOARD[idx], pr = this.props[idx];
    p.cash += Math.floor(this.buildCost(idx, pr.houses - 1) / 2);
    pr.houses--;
    this.addLog('build', `${p.name} vende ${pr.houses === 5 ? 'il Monumento' : pr.houses === 4 ? 'l\'albergo' : 'una casa'} a ${this.nm(idx)}`);
  }
  mortgage(p, idx) {
    const why = this.whyNotMortgage(p, idx); if (why) fail(why);
    const sq = this.BOARD[idx];
    this.props[idx].mortgaged = true;
    p.cash += sq.price / 2;
    this.addLog('mortgage', `${p.name} ipoteca ${this.nm(idx)} (+${eur(sq.price / 2)})`);
  }
  unmortgage(p, idx) {
    const why = this.whyNotUnmortgage(p, idx); if (why) fail(why);
    const sq = this.BOARD[idx];
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
      const sq = this.BOARD[i];
      if (sq.type === 'street' && this.GROUPS[sq.group].some((j) => this.props[j].houses > 0))
        fail(`Per scambiare ${this.nm(i)} vendi prima gli edifici del suo colore.`);
    }
    if (side.jail > p.jailCards.length) fail(`${label} non ha tutte quelle carte "esci di prigione".`);
  }
  tradeFee(receiverSideProps) {
    // chi riceve una proprietà ipotecata paga subito il 10% del valore dell'ipoteca
    let f = 0;
    for (const i of receiverSideProps) if (this.props[i].mortgaged) f += Math.ceil(this.BOARD[i].price * 0.05);
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
    this.payouts = this.payouts.filter((x) => x.pid !== p.id);
    if (this.bankerId === p.id) {
      const nb = this.alive().find((q) => q.id !== p.id);
      this.bankerId = nb ? nb.id : null;
      if (nb) this.addLog('banker', `🏦 ${nb.name} è il nuovo banchiere`);
    }
    this.debts = this.debts
      .filter((d) => d.pid !== p.id)
      .map((d) => (d.creditor === p.id ? { ...d, creditor: 'bank' } : d));
    this.trades = this.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    const left = this.alive();
    if (left.length <= 1 || (this.teamsOn && left.every((q) => q.team === left[0].team))) { this.finish(left[0]); return; }
    if (this.auction) {
      this.auction.active = this.auction.active.filter((id) => id !== p.id);
      if (this.auction.bidder === p.id) { this.auction.bidder = null; this.auction.high = 0; }
    }
    if (this.sale && (this.sale.to === p.id || this.sale.from === p.id)) { this.sale = null; if (this.phase === 'sale') this.phase = 'buy'; }
    if (this.cur.id === p.id) {
      // il turno passa al prossimo (dopo aver chiuso i debiti degli altri)
      this.auction = null;
      this.cont = { type: 'endTurn' };
      this.proceed();
    } else if (this.phase === 'auction') this.checkAuction();
    else if (this.phase === 'debt') this.proceed();
  }

  finish(winner) {
    this.flushPayouts();
    this.status = 'ended';
    this.phase = 'ended';
    this.auction = null;
    this.debts = [];
    this.ranking = this.players
      .map((p) => ({ id: p.id, worth: p.bankrupt ? 0 : this.netWorth(p) }))
      .sort((a, b) => b.worth - a.worth);
    let top = winner;
    if (!top) {
      if (this.teamsOn) {
        const t = this.teamTotals()[0];
        top = t ? t.members.slice().sort((a, b) => (b.bankrupt ? 0 : this.netWorth(b)) - (a.bankrupt ? 0 : this.netWorth(a)))[0] : null;
      } else top = this.player(this.ranking[0].id);
    }
    this.winner = top ? top.id : null;
    this.winners = top ? (this.teamsOn ? this.players.filter((q) => q.team === top.team).map((q) => q.id) : [top.id]) : [];
    if (top) {
      const names = this.winners.map((id) => this.player(id)).map((q) => `${q.emoji} ${q.name}`).join(' + ');
      this.addLog('win', `🏆 ${names} ${this.winners.length > 1 ? 'vincono' : 'vince'} la partita!`);
    }
  }

  endGameNow() {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    this.finish(null);
  }

  // sblocco d'emergenza dal tabellone: chiude qualsiasi cosa in sospeso e passa il turno
  forceNext() {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    const p = this.cur;
    this.addLog('skip', `⏭️ Il turno di ${p.emoji} ${p.name} viene saltato dal tabellone`);
    if (this.debts.some((d) => d.pid === p.id)) { this.declareBankrupt(p); return; }
    this.auction = null; this.claim = null; this.sale = null; this.dare = null; this.choice = null;
    this.cont = null; this.cheat = null; this.travel = null; this.card = null;
    this.nextTurn();
  }
  // fa uscire dal gioco una giocatrice (telefono perso, amica andata via...)
  kickPlayerNow(id) {
    if (this.status !== 'playing') fail('La partita non è in corso.');
    const p = this.player(id);
    if (!p || p.bankrupt) fail('Giocatrice non trovata.');
    this.eliminate(p, null);
  }

  endAuctionNow() {
    if (this.phase === 'auction') this.checkAuction(true);
    else if (this.phase === 'sale') { this.sale = null; this.phase = 'buy'; }
    else if (this.phase === 'dare') this.dareAnswer(this.cur, false);
    else if (this.phase === 'claim') this.claimEnd();
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
  // freno: i tasti del turno non si possono premere a raffica (il tabellone deve fare in tempo a mostrare tutto)
  paceCheck(pid, a) {
    if (!this.pacing || this.status !== 'playing' || !a) return null;
    const now = Date.now();
    if (PACE_FLOW.has(a.type) && now < (this.paceUntil || 0)) return '⏳ Piano piano… il tabellone sta ancora mostrando cosa è successo.';
    if (a.type === 'claimTake' || a.type === 'claimPass') {
      const p = this.player(pid);
      if (p && now < (p.paceAt || 0)) return '⏳ Un attimo…';
    }
    return null;
  }
  paceMark(pid, a) {
    if (!this.pacing || !a) return;
    const now = Date.now();
    if (PACE_FLOW.has(a.type)) this.paceUntil = now + (PACE_MS[a.type] || 900);
    if (a.type === 'claimTake' || a.type === 'claimPass') { const p = this.player(pid); if (p) p.paceAt = now + 700; }
  }

  act(pid, a) {
    const err = this.paceCheck(pid, a);
    if (err) return { ok: false, error: err, soft: true };
    const before = new Map(this.players.map((q) => [q.id, q.cash]));
    const seq0 = this.logSeq;
    const r = this._act(pid, a);
    if (r && r.ok) this.paceMark(pid, a);
    if (!(a && a.type === 'cheat')) this.trackFx(before, seq0); // il furbetto non si deve vedere sul tabellone
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
          case 'vote': this.vote(p, a); break;
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
        case 'offerSale': this.offerSale(p, a.to, Number(a.price)); break;
        case 'saleAccept': this.saleAnswer(p, true); break;
        case 'saleDecline': this.saleAnswer(p, false); break;
        case 'saleCancel': this.saleCancel(p); break;
        case 'dareAnswer': this.dareAnswer(p, !!a.done); break;
        case 'claimTake': this.claimTake(p); break;
        case 'claimPass': this.claimPass(p); break;
        case 'auctionOwn': this.auctionOwn(p, Number(a.idx)); break;
        case 'travel': this.travelTo(p, Number(a.idx)); break;
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
        case 'hold': this.needTurn(p); this.hold = true; break;
        case 'heatUp': this.heatUp(false); break;
        case 'payBanker': this.payBanker(p, Number(a.id), Number(a.pct)); break;
        case 'accuseBanker': this.accuseBanker(p); break;
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
        case 'forceNext': this.forceNext(); break;
        case 'heatUp': this.heatUp(false); break;
        case 'dropPlayer': this.kickPlayerNow(a.id); break;
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
    const showCash = (p) => (s.showCash && !s.cheat && !s.banker) || this.status === 'ended' || (me && me.id === p.id);
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, color: p.color, pos: p.pos,
      inJail: p.inJail, jailCards: p.jailCards.length, bankrupt: p.bankrupt,
      connected: connected ? connected.has(p.id) : true,
      cash: showCash(p) ? p.cash : null,
      worth: this.status === 'ended' ? this.netWorth(p) : null,
      shield: p.shield, x2: p.x2, skip: p.skip, aceCount: p.aces.length,
      team: this.teamsOn ? p.team : null, missionsDone: p.missionsDone || 0,
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
          why: { build: this.whyNotBuild(me, i), sell: this.whyNotSell(me, i), mortgage: this.whyNotMortgage(me, i), unmortgage: this.whyNotUnmortgage(me, i) },
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
      sale: this.phase === 'sale' ? this.sale : null,
      card: this.card, log: this.log.slice(-30), pot: s.freeParking ? this.pot : null,
      housesLeft: this.housesLeft(), hotelsLeft: this.hotelsLeft(),
      winner: this.winner, winners: this.winners, ranking: this.ranking,
      dare: this.phase === 'dare' ? this.dare : null,
      claim: this.phase === 'claim' ? this.claim : null,
      travel: me && this.travel && this.travel.pid === me.id && me.pos === this.travel.from && this.stationsOf(me).includes(me.pos) && this.phase === 'action' ? this.stationsOf(me).filter((i) => i !== me.pos) : null,
      bountyId: s.bounty ? this.bountyId : null,
      teamsOn: this.teamsOn,
      endsAt: this.status === 'playing' && s.timeLimit && this.startedAt ? this.startedAt + s.timeLimit * 60000 : null,
      myMission: me && s.missions && this.status === 'playing' && me.mission ? MISSIONS[me.mission].text : null,
      teamTotals: this.teamsOn ? this.teamTotals().map((t) => ({ team: t.team, w: this.status === 'ended' ? t.w : null, ids: t.members.map((m) => m.id) })) : null,
      you: me ? me.id : null, perms,
      jailCardsMine: me ? me.jailCards.length : 0,
      trades: me ? this.trades.filter((t) => t.from === me.id || t.to === me.id) : [],
      tradeCount: this.trades.length,
      turnCount: this.turnCount,
      choice: this.choice, gameId: this.gameId, hold: this.hold,
      size: this.size, cols: this.cols, rows: this.rows, notice: this.notice, late: this.isLate(), myWorth: me && !me.bankrupt ? this.netWorth(me) : null,
      bankerId: s.banker ? this.bankerId : null,
      payouts: me && this.bankerId === me.id ? this.payouts : [],
      incoming: me ? this.payouts.filter((x) => x.pid === me.id).map((x) => ({ id: x.id, amount: x.amount, reason: x.reason })) : [],
      payoutCount: this.payouts.length,
      canAccuseBanker: !!(s.banker && this.banker() && me && !me.bankrupt && me.id !== this.bankerId && this.accusedB[me.id] !== this.round),
      votes: this.status === 'lobby' ? this.tally() : null,
      myVotes: me ? me.votes : null,
      event: this.event, round: this.round, heat: this.heat || 2,
      aces: me ? me.aces : [],
      fx: this.fx.slice(-12),
      cheat: s.cheat && this.status === 'playing' && me ? {
        canCheat: cur && cur.id === me.id && !this.cheatDone && this.phase === 'roll' && this.doubles === 0 && !cur.inJail,
        pending: !!(this.cheat && this.cheat.pid === me.id),
        canAccuse: !!cur && cur.id !== me.id && !me.bankrupt && !this.accused.includes(me.id),
      } : null,
    };
  }
}

module.exports = { FEATURES, Game, GameError, BOARD, GROUPS, STATIONS, UTILS, BOARDS: DATA.BOARDS, TOKENS, MAX_PLAYERS, PRESETS, ACES };
