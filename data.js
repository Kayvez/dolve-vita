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
    teal: '#1fb5a5', violet: '#8e5bd0',
  };
  const GROUP_NAMES = {
    brown: 'Marrone', lblue: 'Azzurro', pink: 'Rosa', orange: 'Arancione',
    red: 'Rosso', yellow: 'Giallo', green: 'Verde', blue: 'Blu', teal: 'Verde acqua', violet: 'Viola',
  };
  const HOUSE_COST = { brown: 50, lblue: 50, pink: 100, orange: 100, red: 150, yellow: 150, green: 200, blue: 200, teal: 75, violet: 150 };

  const st = (id, name, group, price, rent) => ({ id, type: 'street', name, group, price, rent, houseCost: HOUSE_COST[group] });
  const stn = (id, name) => ({ id, type: 'station', name, price: 200 });
  const ut = (id, name, icon) => ({ id, type: 'util', name, price: 150, icon });
  const SORP = { type: 'sorpresa', name: 'Sorpresa' }, FORT = { type: 'fortuna', name: 'Fortuna' }, IMPR = { type: 'imprevisto', name: 'Imprevisto' };

  // tutte le caselle con nome interno (id): i tabelloni sono liste di queste
  const SQ = {
    go: { id: 'go', type: 'go', name: 'Partenza' },
    sassi: st('sassi', 'I Sassi', 'brown', 60, [2, 10, 30, 90, 160, 250]),
    albero: st('albero', 'Alberobello', 'brown', 60, [4, 20, 60, 180, 320, 450]),
    tassa: { id: 'tassa', type: 'tax', name: 'Tassa di soggiorno', amount: 200 },
    milano: stn('milano', 'Milano Centrale'),
    cinque: st('cinque', 'Cinque Terre', 'lblue', 100, [6, 30, 90, 270, 400, 550]),
    como: st('como', 'Lago di Como', 'lblue', 100, [6, 30, 90, 270, 400, 550]),
    portofino: st('portofino', 'Portofino', 'lblue', 120, [8, 40, 100, 300, 450, 600]),
    jail: { id: 'jail', type: 'jail', name: 'Prigione' },
    assisi: st('assisi', 'Assisi', 'pink', 140, [10, 50, 150, 450, 625, 750]),
    elettrica: ut('elettrica', 'Compagnia Elettrica', '💡'),
    orvieto: st('orvieto', 'Orvieto', 'pink', 140, [10, 50, 150, 450, 625, 750]),
    spoleto: st('spoleto', 'Spoleto', 'pink', 160, [12, 60, 180, 500, 700, 900]),
    termini: stn('termini', 'Roma Termini'),
    bologna: st('bologna', 'Bologna', 'orange', 180, [14, 70, 200, 550, 750, 950]),
    parma: st('parma', 'Parma', 'orange', 180, [14, 70, 200, 550, 750, 950]),
    modena: st('modena', 'Modena', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
    parking: { id: 'parking', type: 'parking', name: 'Pausa Aperitivo' },
    verona: st('verona', 'Verona', 'red', 220, [18, 90, 250, 700, 875, 1050]),
    padova: st('padova', 'Padova', 'red', 220, [18, 90, 250, 700, 875, 1050]),
    trieste: st('trieste', 'Trieste', 'red', 240, [20, 100, 300, 750, 925, 1100]),
    napoli: stn('napoli', 'Napoli Centrale'),
    siena: st('siena', 'Siena', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
    lucca: st('lucca', 'Lucca', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
    acquedotto: ut('acquedotto', 'Acquedotto', '🚰'),
    pisa: st('pisa', 'Pisa', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
    gotojail: { id: 'gotojail', type: 'gotojail', name: 'Vai in prigione' },
    capri: st('capri', 'Capri', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
    positano: st('positano', 'Positano', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
    amalfi: st('amalfi', 'Amalfi', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
    firenze: stn('firenze', 'Firenze SMN'),
    venezia: st('venezia', 'Venezia', 'blue', 350, [35, 175, 500, 1100, 1300, 1500]),
    shopping: { id: 'shopping', type: 'tax', name: 'Shopping di lusso', amount: 100 },
    roma: st('roma', 'Roma', 'blue', 400, [50, 200, 600, 1400, 1700, 2000]),
    // --- solo tabellone lungo ---
    trento: st('trento', 'Trento', 'teal', 130, [9, 45, 135, 400, 560, 700]),
    bolzano: st('bolzano', 'Bolzano', 'teal', 130, [9, 45, 135, 400, 560, 700]),
    cortina: st('cortina', 'Cortina', 'teal', 150, [11, 55, 160, 470, 650, 800]),
    palermo: st('palermo', 'Palermo', 'violet', 240, [19, 95, 275, 725, 900, 1075]),
    taormina: st('taormina', 'Taormina', 'violet', 240, [19, 95, 275, 725, 900, 1075]),
    cefalu: st('cefalu', 'Cefalù', 'violet', 260, [21, 105, 310, 775, 950, 1125]),
    torino: stn('torino', 'Torino Porta Nuova'),
    bari: stn('bari', 'Bari Centrale'),
    rete: ut('rete', 'Rete Internet', '📶'),
    casino: { id: 'casino', type: 'casino', name: 'Casinò', icon: '🎰' },
    ruota: { id: 'ruota', type: 'wheel', name: 'Ruota della fortuna', icon: '🎡' },
    mercato: { id: 'mercato', type: 'market', name: 'Mercato degli Assi', icon: '🃏' },
    teletrasporto: { id: 'teletrasporto', type: 'teleport', name: 'Teletrasporto', icon: '🌀' },
    relax: { id: 'relax', type: 'relax', name: 'Giornata di relax', icon: '🧖' },
    terme: { id: 'terme', type: 'tax', name: 'Terme di lusso', amount: 75 },
    bonus: { id: 'bonus', type: 'bonus', name: 'Premio di città', icon: '🏆' },
  };
  const ids = (list) => list.map((x) => (typeof x === 'string' ? SQ[x] : x));
  const BOARD40 = ids(['go', 'sassi', SORP, 'albero', 'tassa', 'milano', 'cinque', FORT, 'como', 'portofino',
    'jail', 'assisi', 'elettrica', 'orvieto', 'spoleto', 'termini', 'bologna', SORP, 'parma', 'modena',
    'parking', 'verona', FORT, 'padova', 'trieste', 'napoli', 'siena', 'lucca', 'acquedotto', 'pisa',
    'gotojail', 'capri', 'positano', SORP, 'amalfi', 'firenze', FORT, 'venezia', 'shopping', 'roma']);
  const BOARD60 = ids(['go', 'sassi', SORP, 'albero', 'tassa', 'milano', 'cinque', FORT, 'como', 'portofino',
    'casino', 'trento', 'bolzano', IMPR, 'cortina', 'torino', 'mercato', 'relax', 'bonus',
    'jail', 'assisi', 'elettrica', 'orvieto', 'spoleto', 'ruota', 'termini', 'bologna', SORP, 'parma', 'modena',
    'parking', 'verona', FORT, 'padova', 'trieste', 'teletrasporto', 'napoli', 'siena', 'lucca', 'palermo', 'acquedotto', 'pisa', 'taormina', IMPR, 'cefalu', 'bari', 'terme', 'rete', SORP,
    'gotojail', 'capri', 'positano', SORP, 'amalfi', 'firenze', FORT, 'venezia', 'shopping', IMPR, 'roma']);
  // ogni tabellone: colonne x righe (i quattro angoli sono 0, cols-1, ...)
  const BOARDS = {
    40: { size: 40, cols: 11, rows: 11, squares: BOARD40, label: 'Classico (40 caselle)' },
    60: { size: 60, cols: 20, rows: 12, squares: BOARD60, label: 'Lungo (60 caselle)' },
  };
  const BOARD = BOARD40; // compatibilità

  // {chiave} nei testi viene sostituito col nome (del tema scelto) della casella con quell'id
  const CARDS = {
    fortuna: [
      { text: 'Avanza fino alla Partenza e incassa il bonus.', fx: 'moveTo', key: 'go' },
      { text: 'Biglietto in prima classe per {roma}: avanza fin lì.', fx: 'moveTo', key: 'roma' },
      { text: 'Weekend a {cinque}: avanza fin lì. Se passi dalla Partenza incassi il bonus.', fx: 'moveTo', key: 'cinque' },
      { text: 'Prendi il treno per {milano}. Se passi dalla Partenza incassi il bonus.', fx: 'moveTo', key: 'milano' },
      { text: 'Vacanza a {venezia}: avanza fin lì. Se passi dalla Partenza incassi il bonus.', fx: 'moveTo', key: 'venezia' },
      { text: 'Avanza alla stazione più vicina. Se è di qualcuno, paga il doppio dell\'affitto.', fx: 'nearest', kind: 'station' },
      { text: 'Avanza alla stazione più vicina. Se è di qualcuno, paga il doppio dell\'affitto.', fx: 'nearest', kind: 'station' },
      { text: 'Avanza alla società più vicina. Se è di qualcuno, tira i dadi e paga 10 volte il risultato.', fx: 'nearest', kind: 'util' },
      { text: '🥷 Colpo grosso! Rubi €100 a una giocatrice a caso (se non ha lo scudo).', fx: 'heist' },
      { text: 'Esci gratis di prigione. Conserva questa carta.', fx: 'jailCard' },
      { text: 'Torna indietro di 3 caselle.', fx: 'moveBy', n: -3 },
      { text: 'Vai direttamente in prigione. Non passare dalla Partenza.', fx: 'jail' },
      { text: 'Ripara i tuoi immobili: €25 per ogni casa, €100 per ogni albergo.', fx: 'repairs', house: 25, hotel: 100 },
      { text: 'Multa per eccesso di velocità: paga €15.', fx: 'pay', amount: 15 },
      { text: 'Sei eletta presidente del condominio: paga €50 a ogni giocatrice.', fx: 'payEach', amount: 50 },
      { text: '🏹 Robin Hood! Prendi €100 alla giocatrice più ricca e dalli alla più povera.', fx: 'robinHood' },
      { text: '🛡️ Una buona stella ti protegge: ricevi uno scudo.', fx: 'giveShield' },
      { text: '🏃 Corri alla prossima proprietà libera!', fx: 'goFree' },
      { text: '🎤 Vinci un talent: ogni giocatrice ti dà €20.', fx: 'collectEach', amount: 20 },
      { text: '🍀 Trovi un quadrifoglio: ritira €75.', fx: 'collect', amount: 75 },
      { text: '🚁 Un elicottero ti porta in una casella a caso!', fx: 'teleportRand' },
      { text: '✖️2 Ricevi il doppio affitto per il prossimo affitto che incassi.', fx: 'giveX2' },
      { text: '🥳 Festa di quartiere: paga €30 e pesca un asso.', fx: 'payAce', amount: 30 },
      { text: 'Rimborso delle tasse: ritira €60.', fx: 'collect', amount: 60 },
      { text: '🎣 Pesca fortunata: ritira €40.', fx: 'collect', amount: 40 },
      { text: '🤝 Fai una donazione: dai €25 alla giocatrice più povera.', fx: 'giveToPoorest', amount: 25 },
      { text: '🕶️ Fai il turista: salta il prossimo turno ma ritira €100.', fx: 'relaxCard', amount: 100 },
      { text: '🎲 Tira ancora i dadi dopo questo turno!', fx: 'extraRoll' },
      { text: '🎭 Sfida! dice una cosa bella a ciascuna delle altre giocatrici. Fatta: +€100. Rifiutata: -€50.', fx: 'dare', dare: 'dice una cosa bella a ciascuna delle altre giocatrici' },
      { text: '🎭 Sfida! balla per 10 secondi senza musica. Fatta: +€100. Rifiutata: -€50.', fx: 'dare', dare: 'balla per 10 secondi senza musica' },
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
      { text: '🎁 Regalo inaspettato: ritira €150.', fx: 'collect', amount: 150 },
      { text: '💼 Bonus di fine anno: ritira €120.', fx: 'collect', amount: 120 },
      { text: '📈 Investimento riuscito: ritira il 10% dei tuoi soldi.', fx: 'collectPct', pct: 10 },
      { text: '🧾 Arriva il commercialista: paga il 10% dei tuoi soldi.', fx: 'payPct', pct: 10 },
      { text: '👮 Una soffiata! Manda una giocatrice a caso in prigione.', fx: 'jailOther' },
      { text: '🍕 Cena offerta da te: paga €20 a ogni giocatrice.', fx: 'payEach', amount: 20 },
      { text: '🚀 Teletrasporto! Vai dove vuoi al prossimo turno… per ora ritira €50.', fx: 'collect', amount: 50 },
      { text: '🛡️ Assicurazione scudo: ricevi uno scudo.', fx: 'giveShield' },
      { text: '🔮 Un indovino ti dice di andare avanti di 5 caselle.', fx: 'moveBy', n: 5 },
      { text: '🧸 Vinci un peluche gigante: pesca un asso.', fx: 'giveAce' },
      { text: '🎭 Sfida! mima un film e le altre devono indovinarlo. Fatta: +€100. Rifiutata: -€50.', fx: 'dare', dare: 'mima un film e le altre devono indovinarlo' },
      { text: '🎭 Sfida! racconta il ricordo più bello che ha con una di voi. Fatta: +€100. Rifiutata: -€50.', fx: 'dare', dare: 'racconta il ricordo più bello che ha con una di voi' },
    ],
    // mazzo "Imprevisti": per lo più guai! (solo tabellone lungo)
    imprevisto: [
      { text: '🌩️ Grandinata sul tetto: perdi una casa (o paga €80 se non ne hai).', fx: 'stormHouse', amount: 80 },
      { text: '🕳️ Ti cade il portafoglio: paga €60.', fx: 'pay', amount: 60 },
      { text: '🧯 Incendio in cucina: paga €120.', fx: 'pay', amount: 120 },
      { text: '🥷 Ladri in casa! Perdi un asso (o paga €50).', fx: 'loseAce', amount: 50 },
      { text: '🚓 Controllo della finanza: paga €150.', fx: 'pay', amount: 150 },
      { text: '🌊 Allagamento: paga €40 per ogni casa e €100 per ogni albergo.', fx: 'repairs', house: 40, hotel: 100 },
      { text: '😴 Ti addormenti: salta il prossimo turno.', fx: 'skipSelf' },
      { text: '🦵 Ti rompi una gamba: paga €90 di ospedale.', fx: 'pay', amount: 90 },
      { text: '🧑‍⚖️ Causa legale: paga €200.', fx: 'pay', amount: 200 },
      { text: '📉 Crollo in borsa: paga il 15% dei tuoi soldi.', fx: 'payPct', pct: 15 },
      { text: '🚗 Auto in panne: torna indietro di 4 caselle.', fx: 'moveBy', n: -4 },
      { text: '🤡 Scherzo di cattivo gusto: vai in prigione.', fx: 'jail' },
      { text: '🍝 Offri da mangiare a tutte: paga €30 a ogni giocatrice.', fx: 'payEach', amount: 30 },
      { text: '🧨 Petardo in tasca! Paga €70.', fx: 'pay', amount: 70 },
      { text: '🦠 Influenza: paga €50 e salta il prossimo turno.', fx: 'flu', amount: 50 },
      { text: '🏚️ Terremoto: perdi una casa (o paga €100 se non ne hai).', fx: 'stormHouse', amount: 100 },
      { text: '💸 Multa per rumore: paga €35.', fx: 'pay', amount: 35 },
      { text: '🐕 Il cane ti morde il vicino: paga €45.', fx: 'pay', amount: 45 },
      { text: '🔧 Il tubo scoppia: paga €85.', fx: 'pay', amount: 85 },
      { text: '🌪️ Una tromba d\'aria ti porta in una casella a caso!', fx: 'teleportRand' },
      { text: '🎭 Ti rubano lo scudo! (e se non ce l\'hai, paga €40)', fx: 'loseShield', amount: 40 },
      { text: '🚧 Strade chiuse: torna alla Partenza senza incassare nulla.', fx: 'toStart' },
      { text: '🍀 Trovi una banconota per terra: incassa €100.', fx: 'collect', amount: 100 },
      { text: '🎁 Eredità dalla zia: incassa €150.', fx: 'collect', amount: 150 },
      { text: '🏆 Vinci un concorso di cucina: incassa €120.', fx: 'collect', amount: 120 },
      { text: '💼 Rimborso delle tasse: incassa €90.', fx: 'collect', amount: 90 },
      { text: '🎟️ Gratta e vinci! Incassa €200.', fx: 'collect', amount: 200 },
      { text: '🛠️ Lavoretto extra: incassa €70.', fx: 'collect', amount: 70 },
      { text: '📺 Ti invitano in TV: incassa €130.', fx: 'collect', amount: 130 },
      { text: '🧸 Vinci un peluche gigante: pesca un asso.', fx: 'giveAce' },
      { text: '🎤 Ti scelgono per un talent: ogni giocatrice ti dà €20.', fx: 'collectEach', amount: 20 },
      { text: '🎭 Sfida! dice tre cose che ama della giocatrice alla sua destra. Fatta: +€100. Rifiutata: -€50.', fx: 'dare', dare: 'dice tre cose che ama della giocatrice alla sua destra' },
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
    taxman: { icon: '🧾', title: 'Controllo fiscale', text: 'Tutte pagano subito il 3% dei loro soldi.' },
    bankStrike: { icon: '🏦', title: 'Sciopero della banca', text: 'La banca è chiusa: la Partenza non paga niente!' },
    blackMarket: { icon: '🕶️', title: 'Mercato nero', text: 'Le proprietà costano il 30% in più.' },
    robinHood: { icon: '🏹', title: 'Robin Hood', text: 'La più ricca regala soldi alla più povera!' },
    rentUp: { icon: '📈', title: 'Affitti alle stelle', text: 'In questo giro tutti gli affitti costano il 50% in più.' },
    noBuild: { icon: '👷', title: 'Sciopero dei muratori', text: 'In questo giro nessuno può costruire.' },
    quake: { icon: '🏚️', title: 'Terremoto!', text: 'Crolla una casa a caso. Meglio non avere troppi edifici…' },
  };

  // ---------- temi del tabellone: cambiano solo i nomi ----------
  const T = (arr, extra) => { const o = {}; [1, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29, 31, 32, 34, 35, 37, 39, 4, 38, 10, 20, 30].forEach((i, k) => { o[BOARD40[i].id] = arr[k]; }); return Object.assign(o, extra || {}); };
  const THEMES = {
    italia: { label: '🇮🇹 Italia', names: null },
    mondo: {
      label: '🌍 Giro del mondo',
      names: T(['Marrakech', 'Istanbul', 'Gare du Nord', 'Bangkok', 'Rio de Janeiro', 'Sydney', 'Praga', 'Centrale Solare', 'Vienna', 'Amsterdam', "King's Cross", 'Berlino', 'Madrid', 'Barcellona', 'Mosca', 'Dubai', 'Singapore', 'Grand Central', 'Toronto', 'Seul', 'Dissalatore', 'Shanghai', 'San Francisco', 'Londra', 'Parigi', 'Tokyo Station', 'New York', 'Hong Kong', 'Tassa sul bagaglio', 'Duty Free di lusso', 'Dogana', 'Lounge VIP', 'Vai in dogana'], { trento: 'Oslo', bolzano: 'Stoccolma', cortina: 'Helsinki', palermo: 'Lisbona', taormina: 'Atene', cefalu: 'Malta', torino: 'Gare de Lyon', bari: 'Hauptbahnhof', rete: 'Wi-Fi Globale', casino: 'Las Vegas', ruota: 'Luna Park', mercato: 'Bazar', teletrasporto: 'Portale', relax: 'Spa', terme: 'Resort di lusso', bonus: 'Premio Nobel' }),
    },
    gola: {
      label: '🍕 Gola',
      names: T(['Pane e Olio', 'Caffè Corretto', 'Autogrill Nord', 'Gelato Pistacchio', 'Spritz', 'Tiramisù', 'Pizza Margherita', 'Forno a Legna', 'Lasagne', 'Carbonara', 'Autogrill Sud', 'Cannolo', 'Arancino', 'Panettone', 'Tartufo Bianco', 'Bistecca', 'Parmigiano', 'Trattoria Centro', 'Mozzarella', 'Prosciutto', 'Cantina', 'Aceto Balsamico', 'Barolo', 'Champagne', 'Caviale', 'Mercato Rionale', 'Tartufo Nero', 'Aragosta', 'Mancia obbligatoria', 'Cena da chef', 'Digiuno', 'Aperitivo', 'Vai a dieta'], { trento: 'Speck', bolzano: 'Strudel', cortina: 'Polenta', palermo: 'Cassata', taormina: 'Granita', cefalu: 'Pasta alla Norma', torino: 'Gianduiotto', bari: 'Orecchiette', rete: 'Delivery', casino: 'Bisca', ruota: 'Giostra dei dolci', mercato: 'Mercato del gusto', teletrasporto: 'Teleporto', relax: 'Sonnellino', terme: 'Buffet extra', bonus: 'Stella Michelin' }),
    },
    potter: {
      label: '⚡ Maghi',
      names: {
        go: 'Binario 9¾', sassi: 'Sottoscala', albero: 'Privet Drive', tassa: 'Tassa Gringott', milano: 'Hogwarts Express',
        cinque: 'Diagon Alley', como: 'Tiri Vispi Weasley', portofino: 'Olivander', jail: 'Azkaban', assisi: 'Hogsmeade',
        elettrica: 'Candele Fluttuanti', orvieto: 'Mielandia', spoleto: 'Testa di Porco', termini: 'Stazione di Hogsmeade',
        bologna: 'Casa Grifondoro', parma: 'Casa Serpeverde', modena: 'Casa Corvonero', parking: 'Tre Manici di Scopa',
        verona: 'Foresta Proibita', padova: 'Torre di Astronomia', trieste: 'Camera dei Segreti', napoli: 'Camino Metropolvere',
        siena: 'Casa Tassorosso', lucca: 'Stanza delle Necessità', acquedotto: 'Lago Nero', pisa: 'Campo da Quidditch',
        gotojail: 'Dissennatori', capri: 'La Tana', positano: 'Villa Conchiglia', amalfi: 'Grimmauld Place', firenze: 'Nottetempo',
        venezia: 'Castello di Hogwarts', shopping: 'Shopping a Diagon Alley', roma: 'Banca Gringott',
        trento: 'Valle di Godric', bolzano: 'Notturn Alley', cortina: 'Sala Grande', palermo: 'Ministero della Magia',
        taormina: 'Reparto Misteri', cefalu: 'Sala dei Trofei', torino: 'Passaporta', bari: 'Thestral', rete: 'Gufi Postali',
        casino: 'Sala da Gioco Magica', ruota: 'Giratempo', mercato: 'Mercato Magico', teletrasporto: 'Smaterializzazione',
        relax: 'Pausa Burrobirra', terme: 'Bagno dei Prefetti', bonus: 'Coppa delle Case',
      },
    },
  };
  // nameOf(tema, casella) – la casella è un oggetto del tabellone (o il suo id)
  const nameOf = (theme, sq) => { const id = typeof sq === 'string' ? sq : sq && sq.id; const t = THEMES[theme]; return (t && t.names && id && t.names[id]) || (sq && sq.name) || (id && SQ[id] && SQ[id].name) || ''; };

  const TOKENS = ['🚗', '🎩', '🐶', '🐱', '🚀', '👑', '🦄', '🍕', '🛵', '🍷', '🌸', '⚽'];
  const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60', '#6d4c41'];


  // ---------- spiegazioni delle regole (usate da telefoni e tabellone) ----------
  const BASICS = [
    '1️⃣ <b>Tira i dadi.</b> La tua pedina cammina da sola sul tabellone.',
    '2️⃣ <b>Casella libera?</b> Puoi comprarla. Se non vuoi puoi lasciarla libera (le altre possono richiederla e tu prendi il 10%), farla andare all\'asta (si sblocca dopo qualche giro) oppure offrirla a una sola giocatrice a un prezzo tuo.',
    '3️⃣ <b>Casella di un\'altra?</b> Paghi l\'affitto a lei. Tasse e multe vanno alla banca (o al piatto dell\'aperitivo).',
    '4️⃣ <b>Hai TUTTE le caselle dello stesso colore?</b> L\'affitto raddoppia subito e puoi costruire: 🏠 case, poi 🏨 albergo, poi 🗽 Monumento (l\'affitto più alto di tutti). Si costruisce dal tab Proprietà.',
    '🚆 <b>Stazioni:</b> se arrivi su una tua stazione puoi spostarti gratis in un\'altra tua stazione (e se passi dal Via incassi).',
    '🔨 <b>Senza soldi?</b> Puoi mettere all\'asta una tua proprietà: se qualcuna la compra ti rientra il 70%.',
    '5️⃣ <b>Quando hai finito</b> il turno passa da solo dopo qualche secondo (puoi anche premere Fine turno, o fermare il conto alla rovescia se devi ancora fare qualcosa).',
    '🤝 <b>Scambi:</b> in qualsiasi momento puoi scambiare soldi e proprietà con un\'altra dal tab Scambi.',
    '🏁 <b>Come si vince:</b> se non riesci a pagare esci dal gioco. Vince l\'ultima rimasta, o chi ha più patrimonio quando finiscono i giri scelti.',
  ];
  // caselle speciali del tabellone lungo
  const SPECIALS = [
    '🎰 <b>Casinò</b>: tira un dado. 1 perdi €150 · 2 perdi €50 · 3 niente · 4 vinci €50 · 5 vinci €150 · 6 vinci €300.',
    '🎡 <b>Ruota della fortuna</b>: la ruota decide… soldi, un asso, uno scudo, ma anche guai!',
    '🃏 <b>Mercato degli Assi</b>: prendi un asso gratis.',
    '🌀 <b>Teletrasporto</b>: vieni sparata in una casella a caso.',
    '🧖 <b>Relax</b>: incassi €100 ma salti un turno.',
    '🏆 <b>Premio di città</b>: incassi €100.',
    '⚡ <b>Imprevisto</b>: pesca una carta: di solito sfortunata (danni, multe, turni persi), ma a volte si guadagna!',
    '🍀 <b>Fortuna</b> e 🎁 <b>Sorpresa</b>: carte con soldi, spostamenti e sorprese.',
  ];
  const RULES = {
    speedDie: { icon: '🎲', title: 'Dado matto', short: 'Un terzo dado arancione con effetti speciali.',
      long: ['I numeri 1-2-3 si sommano ai due dadi normali.', '🃏 Jolly: dopo esserti mossa, corri alla prossima proprietà libera.', '🚌 Navetta: scegli se muoverti col primo dado, col secondo o con la somma.', '✨ Tris: se i due dadi sono uguali e il terzo è lo stesso numero, vai dove vuoi!'] },
    aces: { icon: '🃏', title: 'Assi nella manica', short: 'Carte speciali da giocare nel tuo turno.',
      long: ['Ne hai al massimo 3. Se ne pesca uno passando dalla Partenza o da certe carte. La Pausa Aperitivo si raggiunge solo con i dadi.', '🛡️ Scudo, 🥷 Furto, ✖️2 Doppio affitto, ⏭️ Salta turno, 🔀 Cambio posto, 🎉 Festa a sorpresa, 🚀 Teletrasporto.', 'Si giocano dalla scheda Turno, nel proprio turno.'] },
    events: { icon: '🎪', title: 'Eventi di città', short: 'A ogni giro cambia una regola per tutte.',
      long: ['Esempi: Partenza d\'oro (si incassa il doppio), Saldi (-20%), Sciopero treni (le stazioni non incassano), Tregua (niente affitti), Festa di un colore (affitti doppi), Bonus €50 per tutte.', 'L\'evento attuale è sempre scritto sul tabellone.'] },
    cheat: { icon: '🕵️', title: 'Furbetti', short: 'Si può barare di nascosto… e si può essere scoperte.',
      long: ['Solo a inizio turno, prima di tirare i dadi, puoi prendere €100 dalla banca di nascosto: sul tabellone non si vede nulla.', 'Le altre possono accusarti: se avevi barato paghi €200 a chi ti ha scoperta, se era un\'accusa a vuoto paga €50 lei a te.', 'I soldi di tutte restano segreti sul tabellone.'] },
    banker: { icon: '🏦', title: 'Banchiere furbo', short: 'Uno di voi fa il banchiere e paga a mano… e può fregarvi.',
      long: ['A sorte uno diventa banchiere (gioca anche lui). I soldi della banca (Partenza e carte) li paga lui a mano.', 'Può dare tutto, tre quarti, metà o niente: quello che trattiene lo tiene per sé, di nascosto.', 'Se sospetti di aver ricevuto meno, accusalo: se ha davvero trattenuto, restituisce il doppio; se era onesto, paghi €50 tu. Una accusa a giro.', 'I soldi di tutte restano segreti sul tabellone.'] },
    missions: { icon: '🎯', title: 'Missioni segrete', short: 'Ognuna ha un obiettivo segreto da compiere.',
      long: ['A inizio partita ricevi una missione che vedi solo tu (es. possiedi 3 stazioni).', 'Quando la compi prendi €300 e ne arriva una nuova.', 'Le altre vedono solo quante missioni hai completato.'] },
    bounty: { icon: '💰', title: 'Taglia sulla più ricca', short: 'Chi è in testa ha una taglia sulla testa.',
      long: ['La giocatrice con più patrimonio ha la taglia: tutte lo vedono.', 'Chi si fa pagare l\'affitto da lei incassa €100 in più; chi la manda in prigione con una carta prende €150.'] },
    teams: { icon: '👯', title: 'Squadre', short: 'Si gioca in coppie (con 4 o 6 giocatrici).',
      long: ['Le squadre si formano a caso. Le compagne non si pagano affitti.', 'Vince la squadra che arriva a 1,6 volte il traguardo di patrimonio (somma delle due), o l\'ultima rimasta.', 'Funziona solo con un numero pari di giocatrici, almeno 4: altrimenti si gioca tutte contro tutte.'] },
    dares: { icon: '🎭', title: 'Sfide', short: 'Obblighi da fare dal vivo, anche a sorpresa.',
      long: ['Nei mazzi ci sono carte Sfida, e ogni tanto arriva una ⚡ Sfida lampo a inizio turno: devi fare una cosa buffa davanti a tutte.', 'Se la fai prendi dei soldi, se rifiuti ne paghi (di più se la cattiveria è alta). Decidete voi se vale!'] },
    freeBuy: { icon: '🙋', title: 'Acquisto libero', short: 'Puoi non comprare: le altre possono prenderla.',
      long: ['Se non vuoi comprare una proprietà la lasci libera (niente asta nei primi giri).', 'Le altre possono richiederla al prezzo di listino: a te va il 10%.', 'L\'asta si sblocca dal giro scelto nella lobby (chip 🔨).'] },
    freeParking: { icon: '🍹', title: 'Piatto dell\'aperitivo', short: 'Tasse e multe finiscono al centro.',
      long: ['Chi si ferma sulla Pausa Aperitivo si prende tutto il piatto.'] },
    auctions: { icon: '🔨', title: 'Aste', short: 'Se non compri, la proprietà va all\'asta.',
      long: ['Tutte possono rilanciare (+10, +50, +100). Vince l\'offerta più alta. In alternativa chi è arrivata sulla proprietà può offrirla a una sola giocatrice a un prezzo suo.'] },
  };

  const HEAT = { 1: { icon: '😇', name: 'Dolce' }, 2: { icon: '😏', name: 'Pepata' }, 3: { icon: '😈', name: 'Cattivissima' } };
  return { HEAT, BASICS, SPECIALS, RULES, TITLE, GROUP_COLORS, GROUP_NAMES, HOUSE_COST, BOARD, BOARDS, SQ, CARDS, ACES, EVENTS, THEMES, nameOf, TOKENS, COLORS };
});
