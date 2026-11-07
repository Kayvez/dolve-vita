// Dati del tabellone, delle carte e dei segnalini.
// Funziona sia nel server (require) sia nel browser (window.GAME_DATA).
// Vuoi cambiare tema? Modifica i nomi qui sotto (e solo i nomi: prezzi e affitti sono quelli classici).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GAME_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TITLE = 'Dolce Vita';

  const GROUP_COLORS = {
    brown: '#8b5a3c', lblue: '#8fd3f4', pink: '#e66fb0', orange: '#f59a3b',
    red: '#e04646', yellow: '#f4d93b', green: '#3fae6a', blue: '#2f5fd0',
  };
  const GROUP_NAMES = {
    brown: 'Marrone', lblue: 'Azzurro', pink: 'Rosa', orange: 'Arancione',
    red: 'Rosso', yellow: 'Giallo', green: 'Verde', blue: 'Blu',
  };
  const HOUSE_COST = { brown: 50, lblue: 50, pink: 100, orange: 100, red: 150, yellow: 150, green: 200, blue: 200 };

  const st = (name, group, price, rent) => ({ type: 'street', name, group, price, rent, houseCost: HOUSE_COST[group] });

  const BOARD = [
    { type: 'go', name: 'Partenza' },                                   // 0
    st('I Sassi', 'brown', 60, [2, 10, 30, 90, 160, 250]),             // 1
    { type: 'sorpresa', name: 'Sorpresa' },                            // 2
    st('Alberobello', 'brown', 60, [4, 20, 60, 180, 320, 450]),        // 3
    { type: 'tax', name: 'Tassa di soggiorno', amount: 200 },          // 4
    { type: 'station', name: 'Milano Centrale', price: 200 },          // 5
    st('Cinque Terre', 'lblue', 100, [6, 30, 90, 270, 400, 550]),      // 6
    { type: 'fortuna', name: 'Fortuna' },                              // 7
    st('Lago di Como', 'lblue', 100, [6, 30, 90, 270, 400, 550]),      // 8
    st('Portofino', 'lblue', 120, [8, 40, 100, 300, 450, 600]),        // 9
    { type: 'jail', name: 'Prigione' },                                // 10
    st('Assisi', 'pink', 140, [10, 50, 150, 450, 625, 750]),           // 11
    { type: 'util', name: 'Compagnia Elettrica', price: 150, icon: '💡' }, // 12
    st('Orvieto', 'pink', 140, [10, 50, 150, 450, 625, 750]),          // 13
    st('Spoleto', 'pink', 160, [12, 60, 180, 500, 700, 900]),          // 14
    { type: 'station', name: 'Roma Termini', price: 200 },             // 15
    st('Bologna', 'orange', 180, [14, 70, 200, 550, 750, 950]),        // 16
    { type: 'sorpresa', name: 'Sorpresa' },                            // 17
    st('Parma', 'orange', 180, [14, 70, 200, 550, 750, 950]),          // 18
    st('Modena', 'orange', 200, [16, 80, 220, 600, 800, 1000]),        // 19
    { type: 'parking', name: 'Pausa Aperitivo' },                      // 20
    st('Verona', 'red', 220, [18, 90, 250, 700, 875, 1050]),           // 21
    { type: 'fortuna', name: 'Fortuna' },                              // 22
    st('Padova', 'red', 220, [18, 90, 250, 700, 875, 1050]),           // 23
    st('Trieste', 'red', 240, [20, 100, 300, 750, 925, 1100]),         // 24
    { type: 'station', name: 'Napoli Centrale', price: 200 },          // 25
    st('Siena', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),        // 26
    st('Lucca', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),        // 27
    { type: 'util', name: 'Acquedotto', price: 150, icon: '🚰' },      // 28
    st('Pisa', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),        // 29
    { type: 'gotojail', name: 'Vai in prigione' },                     // 30
    st('Capri', 'green', 300, [26, 130, 390, 900, 1100, 1275]),        // 31
    st('Positano', 'green', 300, [26, 130, 390, 900, 1100, 1275]),     // 32
    { type: 'sorpresa', name: 'Sorpresa' },                            // 33
    st('Amalfi', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),      // 34
    { type: 'station', name: 'Firenze SMN', price: 200 },              // 35
    { type: 'fortuna', name: 'Fortuna' },                              // 36
    st('Venezia', 'blue', 350, [35, 175, 500, 1100, 1300, 1500]),      // 37
    { type: 'tax', name: 'Shopping di lusso', amount: 100 },           // 38
    st('Roma', 'blue', 400, [50, 200, 600, 1400, 1700, 2000]),         // 39
  ];

  // {n} nei testi viene sostituito col nome (del tema scelto) della casella n
  const CARDS = {
    fortuna: [
      { text: 'Avanza fino alla Partenza e ritira €200.', fx: 'moveTo', idx: 0 },
      { text: 'Biglietto in prima classe per {39}: avanza fin lì.', fx: 'moveTo', idx: 39 },
      { text: 'Weekend a {6}: avanza fin lì. Se passi dalla Partenza ritira €200.', fx: 'moveTo', idx: 6 },
      { text: 'Prendi il treno per {5}. Se passi dalla Partenza ritira €200.', fx: 'moveTo', idx: 5 },
      { text: 'Avanza alla stazione più vicina. Se è di qualcuno, paga il doppio dell\'affitto.', fx: 'nearest', kind: 'station' },
      { text: 'Avanza alla stazione più vicina. Se è di qualcuno, paga il doppio dell\'affitto.', fx: 'nearest', kind: 'station' },
      { text: 'Avanza alla società più vicina. Se è di qualcuno, tira i dadi e paga 10 volte il risultato.', fx: 'nearest', kind: 'util' },
      { text: '🥷 Colpo grosso! Rubi €100 a una giocatrice a caso (se non ha lo scudo).', fx: 'heist' },
      { text: 'Esci gratis di prigione. Conserva questa carta.', fx: 'jailCard' },
      { text: 'Torna indietro di 3 caselle.', fx: 'moveBy', n: -3 },
      { text: 'Vai direttamente in prigione. Non passare dalla Partenza.', fx: 'jail' },
      { text: 'Ripara i tuoi immobili: €25 per ogni casa, €100 per ogni albergo.', fx: 'repairs', house: 25, hotel: 100 },
      { text: 'Multa per eccesso di velocità: paga €15.', fx: 'pay', amount: 15 },
      { text: 'Sei eletto presidente del condominio: paga €50 a ogni giocatrice.', fx: 'payEach', amount: 50 },
      { text: '🏹 Robin Hood! Prendi €100 alla giocatrice più ricca e dalli alla più povera.', fx: 'robinHood' },
      { text: 'Vacanza a {37}: avanza fin lì. Se passi dalla Partenza ritira €200.', fx: 'moveTo', idx: 37 },
    ],
    sorpresa: [
      { text: 'Errore bancario a tuo favore: ritira €200.', fx: 'collect', amount: 200 },
      { text: 'Parcella del dottore: paga €50.', fx: 'pay', amount: 50 },
      { text: 'Vendi un quadro al mercatino: ritira €50.', fx: 'collect', amount: 50 },
      { text: 'Esci gratis di prigione. Conserva questa carta.', fx: 'jailCard' },
      { text: 'Vai direttamente in prigione. Non passare dalla Partenza.', fx: 'jail' },
      { text: 'È il tuo compleanno: ogni giocatrice ti dà €10.', fx: 'collectEach', amount: 10 },
      { text: '🃏 Fortuna sfacciata! Pesca una carta Asso nella manica.', fx: 'giveAce' },
      { text: 'L\'assicurazione sulla vita matura: ritira €100.', fx: 'collect', amount: 100 },
      { text: 'Spese d\'ospedale: paga €100.', fx: 'pay', amount: 100 },
      { text: 'Tasse scolastiche: paga €50.', fx: 'pay', amount: 50 },
      { text: 'Premio di consulenza: ritira €25.', fx: 'collect', amount: 25 },
      { text: 'Lavori in strada: paga €40 per ogni casa e €115 per ogni albergo.', fx: 'repairs', house: 40, hotel: 115 },
      { text: 'Secondo premio a un concorso di bellezza: ritira €10.', fx: 'collect', amount: 10 },
      { text: 'Eredità dalla zia: ritira €100.', fx: 'collect', amount: 100 },
      { text: '🔀 Che confusione! Scambi il posto con una giocatrice a caso.', fx: 'swapRandom' },
      { text: 'Multa per sosta vietata: paga €20.', fx: 'pay', amount: 20 },
    ],
  };

  // ---------- carte "Asso nella manica" ----------
  const ACES = {
    shield: { icon: '🛡️', name: 'Scudo', desc: 'Blocca il prossimo pagamento (affitto o tassa) o attacco che ti colpisce.', target: 'none' },
    x2:     { icon: '✖️2', name: 'Doppio affitto', desc: 'Il prossimo affitto che incassi vale il doppio.', target: 'none' },
    steal:  { icon: '🥷', name: 'Furto', desc: 'Rubi fino a €100 a una giocatrice.', target: 'player' },
    swap:   { icon: '🔀', name: 'Cambio posto', desc: 'Scambi la tua posizione con quella di una giocatrice.', target: 'player' },
    skip:   { icon: '⏭️', name: 'Salta turno', desc: 'Una giocatrice salta il suo prossimo turno.', target: 'player' },
    party:  { icon: '🎉', name: 'Festa a sorpresa', desc: 'Tutte le altre ti danno €30.', target: 'none' },
    warp:   { icon: '🚀', name: 'Teletrasporto', desc: 'Al posto del tiro, vai in qualsiasi casella.', target: 'square' },
  };

  // ---------- eventi di città (uno per ogni giro) ----------
  const EVENTS = {
    bonusGo: { icon: '🎰', title: 'Partenza d\'oro', text: 'Chi passa dalla Partenza incassa il doppio!' },
    strike:  { icon: '🚧', title: 'Sciopero dei treni', text: 'Le stazioni non incassano affitti.' },
    festa:   { icon: '🎪', title: 'Festa in città', text: 'Gli affitti del colore {group} valgono il doppio!' },
    saldi:   { icon: '🏷️', title: 'Saldi!', text: 'Le proprietà costano il 20% in meno.' },
    truce:   { icon: '🕊️', title: 'Tregua', text: 'Nessuno paga affitti in questo giro.' },
    bonus:   { icon: '🎁', title: 'Bonus di città', text: 'Tutte ricevono €50!' },
  };

  // ---------- temi del tabellone: cambiano solo i nomi ----------
  const T = (arr) => { const o = {}; [1, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29, 31, 32, 34, 35, 37, 39, 4, 38, 10, 20, 30].forEach((i, k) => { o[i] = arr[k]; }); return o; };
  const THEMES = {
    italia: { label: '🇮🇹 Italia', names: null },
    mondo: {
      label: '🌍 Giro del mondo',
      names: T(['Marrakech', 'Istanbul', 'Gare du Nord', 'Bangkok', 'Rio de Janeiro', 'Sydney', 'Praga', 'Centrale Solare', 'Vienna', 'Amsterdam', "King's Cross", 'Berlino', 'Madrid', 'Barcellona', 'Mosca', 'Dubai', 'Singapore', 'Grand Central', 'Toronto', 'Seul', 'Dissalatore', 'Shanghai', 'San Francisco', 'Londra', 'Parigi', 'Tokyo Station', 'New York', 'Hong Kong', 'Tassa sul bagaglio', 'Duty Free di lusso', 'Dogana', 'Lounge VIP', 'Vai in dogana']),
    },
    gola: {
      label: '🍕 Gola',
      names: T(['Pane e Olio', 'Caffè Corretto', 'Autogrill Nord', 'Gelato Pistacchio', 'Spritz', 'Tiramisù', 'Pizza Margherita', 'Forno a Legna', 'Lasagne', 'Carbonara', 'Autogrill Sud', 'Cannolo', 'Arancino', 'Panettone', 'Tartufo Bianco', 'Bistecca', 'Parmigiano', 'Trattoria Centro', 'Mozzarella', 'Prosciutto', 'Cantina', 'Aceto Balsamico', 'Barolo', 'Champagne', 'Caviale', 'Mercato Rionale', 'Tartufo Nero', 'Aragosta', 'Mancia obbligatoria', 'Cena da chef', 'Digiuno', 'Aperitivo', 'Vai a dieta']),
    },
  };
  const nameOf = (theme, i) => { const t = THEMES[theme]; return (t && t.names && t.names[i]) || BOARD[i].name; };

  const TOKENS = ['🚗', '🎩', '🐶', '🐱', '🚀', '👑', '🦄', '🍕', '🛵', '🍷', '🌸', '⚽'];
  const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60', '#6d4c41'];

  return { TITLE, GROUP_COLORS, GROUP_NAMES, HOUSE_COST, BOARD, CARDS, ACES, EVENTS, THEMES, nameOf, TOKENS, COLORS };
});
