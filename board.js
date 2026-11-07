(() => {
  'use strict';
  const D = window.GAME_DATA;
  const BOARD = D.BOARD;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const eur = (n) => '€' + n;

  let S = null;            // ultimo stato ricevuto
  let info = null;         // indirizzi del server
  let lastDiceSeq = null, lastCardSeq = null, lastLogId = null, lastStatus = null;
  let moveAfter = 0;       // le pedine aspettano la fine dell'animazione dei dadi
  const shown = {};        // posizione "mostrata" di ogni pedina
  const tokenEls = {};

  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server non raggiungibile' }; }
  }

  // ---------- suoni ----------
  let actx = null;
  let soundOn = localStorage.getItem('dv_sound') === '1';
  function ensureCtx() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; } }
    if (actx.state === 'suspended') actx.resume();
    return true;
  }
  function tone(freq, t0, dur, type, vol) {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    const t = actx.currentTime + t0;
    g.gain.setValueAtTime(vol || 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const SFX = {
    dice: () => { for (let i = 0; i < 7; i++) tone(180 + Math.random() * 260, i * 0.075, 0.05, 'square', 0.07); },
    buy: () => { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.28); },
    rent: () => { tone(320, 0, 0.14, 'sawtooth', 0.09); tone(230, 0.12, 0.28, 'sawtooth', 0.09); },
    pay: () => { tone(400, 0, 0.1, 'triangle'); tone(300, 0.09, 0.2, 'triangle'); },
    go: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16)); },
    jail: () => { tone(190, 0, 0.3, 'square', 0.1); tone(140, 0.28, 0.45, 'square', 0.1); },
    card: () => { tone(700, 0, 0.1, 'triangle'); tone(930, 0.09, 0.18, 'triangle'); },
    build: () => { tone(420, 0, 0.07, 'square', 0.09); tone(520, 0.09, 0.09, 'square', 0.09); },
    mortgage: () => { tone(260, 0, 0.2, 'triangle'); },
    bid: () => { tone(880, 0, 0.07, 'sine', 0.12); },
    auction: () => { tone(660, 0, 0.1); tone(660, 0.14, 0.1); tone(880, 0.28, 0.2); },
    trade: () => { tone(600, 0, 0.1); tone(800, 0.1, 0.16); },
    bankrupt: () => { [400, 330, 260, 200].forEach((f, i) => tone(f, i * 0.16, 0.2, 'sawtooth', 0.1)); },
    win: () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.14, 0.25)); },
    start: () => { SFX.go(); },
  };
  function sfx(kind) { if (soundOn && ensureCtx() && SFX[kind]) SFX[kind](); }

  // ---------- struttura del tabellone ----------
  function gridPos(i) {
    if (i <= 10) return [11, 11 - i];
    if (i <= 19) return [21 - i, 1];
    if (i === 20) return [1, 1];
    if (i <= 29) return [1, i - 19];
    if (i === 30) return [1, 11];
    return [i - 29, 11];
  }
  const sideOf = (i) => (i % 10 === 0 ? 'corner' : i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');
  function iconOf(sq) {
    return { go: '➡️', jail: '🚔', parking: '🍹', gotojail: '👮', fortuna: '🍀', sorpresa: '🎁', tax: '💸', station: '🚆' }[sq.type] || sq.icon || '';
  }

  function buildBoard() {
    const el = $('#board');
    el.innerHTML = '';
    BOARD.forEach((sq, i) => {
      const d = document.createElement('div');
      const [r, c] = gridPos(i);
      d.className = `sq t-${sq.type} ${sideOf(i)}`;
      d.dataset.i = i;
      d.style.gridRow = r; d.style.gridColumn = c;
      let band = '';
      if (sq.type === 'street') band = `<div class="band" style="background:${D.GROUP_COLORS[sq.group]}"><span class="houses"></span></div>`;
      let price = '';
      if (sq.price) price = `<div class="price">${eur(sq.price)}</div>`;
      if (sq.type === 'tax') price = `<div class="price">paga ${eur(sq.amount)}</div>`;
      if (sq.type === 'go') price = `<div class="price">+${eur(200)}</div>`;
      d.innerHTML = `${band}<div class="body"><div class="icon">${iconOf(sq)}</div><div class="name">${sq.name}</div>${price}</div><div class="owner"></div><div class="tokens"></div>`;
      el.appendChild(d);
    });
    const c = document.createElement('div');
    c.id = 'center';
    c.innerHTML = `
      <div id="title">${D.TITLE}</div>
      <div id="subtitle">il gioco delle serate</div>
      <div id="turn"></div>
      <div id="hint"></div>
      <div id="dice"></div>
      <div id="cMain"></div>
      <div id="log"></div>
      <div id="cardPop"></div>`;
    el.appendChild(c);
  }

  function layout() {
    const w = innerWidth, h = innerHeight;
    const portrait = w < h * 1.25;
    $('#app').classList.toggle('portrait', portrait);
    const b = portrait ? Math.min(w - 16, h - 190) : Math.min(h - 16, w - 16 - 14 - 270);
    document.documentElement.style.setProperty('--b', Math.max(320, b) + 'px');
  }

  // ---------- dadi ----------
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(n, rolling) {
    let s = `<div class="die${rolling ? ' roll' : ''}">`;
    for (let i = 0; i < 9; i++) s += `<i class="${n && PIPS[n].includes(i) ? 'on' : ''}"></i>`;
    return s + '</div>';
  }
  let diceTimer = null;
  function showDice(d, animate) {
    const el = $('#dice');
    clearInterval(diceTimer);
    if (!d || !d.d1) { el.innerHTML = ''; return; }
    if (!animate) { el.innerHTML = dieHTML(d.d1) + dieHTML(d.d2); return; }
    sfx('dice');
    moveAfter = Date.now() + 900;
    let n = 0;
    diceTimer = setInterval(() => {
      n++;
      if (n >= 8) { clearInterval(diceTimer); el.innerHTML = dieHTML(d.d1) + dieHTML(d.d2); return; }
      el.innerHTML = dieHTML(1 + Math.floor(Math.random() * 6), true) + dieHTML(1 + Math.floor(Math.random() * 6), true);
    }, 100);
  }

  // ---------- pedine ----------
  function tokenFor(p) {
    let t = tokenEls[p.id];
    if (!t) {
      t = document.createElement('div');
      t.className = 'tok';
      t.style.setProperty('--c', p.color);
      t.textContent = p.emoji;
      tokenEls[p.id] = t;
    }
    return t;
  }
  function placeToken(p, idx) {
    const t = tokenFor(p);
    const sq = $(`.sq[data-i="${idx}"] .tokens`);
    const old = t.parentNode;
    if (sq && old !== sq) sq.appendChild(t);
    if (old && old !== sq) old.classList.toggle('many', old.children.length > 3);
    if (sq) sq.classList.toggle('many', sq.children.length > 3);
    shown[p.id] = idx;
  }
  setInterval(() => {
    if (!S || Date.now() < moveAfter) return;
    for (const p of S.players) {
      const t = tokenFor(p);
      t.classList.toggle('out', !!p.bankrupt);
      if (p.bankrupt) continue;
      if (shown[p.id] === undefined) { placeToken(p, p.pos); continue; }
      if (shown[p.id] !== p.pos) {
        const d = (p.pos - shown[p.id] + 40) % 40;
        if (d > 0 && d <= 12 && !p.inJail) placeToken(p, (shown[p.id] + 1) % 40);
        else placeToken(p, p.pos);
        if (shown[p.id] === p.pos) sfx('hop');
      }
    }
  }, 170);

  // ---------- rendering ----------
  const P = (id) => S.players.find((p) => p.id === id);
  const nameOf = (id) => { const p = P(id); return p ? `${p.emoji} ${p.name}` : 'la banca'; };

  function renderSquares() {
    const cur = S.status === 'playing' ? P(S.turn) : null;
    $$('.sq').forEach((el) => {
      const i = Number(el.dataset.i);
      const pr = S.props[i];
      el.classList.toggle('cur', !!cur && !cur.bankrupt && cur.pos === i && shown[cur.id] === i);
      if (!pr) return;
      const own = pr.owner ? P(pr.owner) : null;
      const ob = $('.owner', el);
      ob.classList.toggle('on', !!own);
      el.classList.toggle('owned', !!own);
      ob.style.background = own ? own.color : '';
      ob.textContent = own ? own.emoji : '';
      el.classList.toggle('mort', !!pr.mortgaged);
      const h = $('.houses', el);
      if (h) h.innerHTML = pr.houses === 5 ? '<span class="h hotel"></span>' : '<span class="h"></span>'.repeat(pr.houses);
    });
  }

  function renderPlayers() {
    const el = $('#players');
    el.innerHTML = S.players.map((p) => {
      const mine = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === p.id);
      const pips = mine.map((i) => {
        const sq = BOARD[i];
        const col = sq.type === 'street' ? D.GROUP_COLORS[sq.group] : sq.type === 'station' ? '#445066' : '#9aa7b8';
        return `<span class="pip${S.props[i].mortgaged ? ' m' : ''}" style="background:${col}"></span>`;
      }).join('');
      const badge = p.bankrupt ? '💀' : p.inJail ? '🚔' : '';
      const cards = p.jailCards ? ' 🎫'.repeat(p.jailCards) : '';
      return `<div class="pl${S.turn === p.id && S.status === 'playing' ? ' turn' : ''}${p.bankrupt ? ' out' : ''}${p.connected ? '' : ' off'}" style="--c:${p.color}">
        <div class="tk">${p.emoji}</div>
        <div class="info"><div class="nm">${p.name}</div>
        <div class="cash">${p.cash !== null ? eur(p.cash) : '€ ···'}${cards}</div>
        <div class="pips">${pips}</div></div>
        <div class="badge">${badge}</div></div>`;
    }).join('');
  }

  function textOn(color) { return ['#f4d93b', '#8fd3f4'].includes(color) ? '#222' : '#fff'; }
  function deedHTML(idx, extra) {
    const sq = BOARD[idx];
    let head = '', rows = '';
    if (sq.type === 'street') {
      const col = D.GROUP_COLORS[sq.group];
      head = `<div class="dh" style="background:${col};color:${textOn(col)}">${sq.name}</div>`;
      rows = `<tr><td>Affitto</td><td>${eur(sq.rent[0])}</td></tr><tr><td>Colore completo</td><td>${eur(sq.rent[0] * 2)}</td></tr>`
        + [1, 2, 3, 4].map((n) => `<tr><td>Con ${n} cas${n === 1 ? 'a' : 'e'}</td><td>${eur(sq.rent[n])}</td></tr>`).join('')
        + `<tr><td>Albergo</td><td>${eur(sq.rent[5])}</td></tr><tr><td>Costruzione</td><td>${eur(sq.houseCost)}</td></tr>`;
    } else if (sq.type === 'station') {
      head = `<div class="dh" style="background:#445066;color:#fff">🚆 ${sq.name}</div>`;
      rows = [1, 2, 3, 4].map((n) => `<tr><td>${n} stazion${n === 1 ? 'e' : 'i'}</td><td>${eur(25 * Math.pow(2, n - 1))}</td></tr>`).join('');
    } else {
      head = `<div class="dh" style="background:#9aa7b8;color:#fff">${sq.icon || ''} ${sq.name}</div>`;
      rows = '<tr><td>1 società</td><td>4× dadi</td></tr><tr><td>2 società</td><td>10× dadi</td></tr>';
    }
    return `<div class="deed">${head}<div class="dp">${eur(sq.price)}</div><table>${rows}</table>${extra || ''}</div>`;
  }

  function hintFor() {
    const cur = P(S.turn);
    if (!cur) return '';
    const sq = BOARD[cur.pos];
    switch (S.phase) {
      case 'roll': return cur.inJail ? 'è in prigione: tira per fare doppio, paga €50 o usa la carta' : (S.doubles ? 'Doppio! Tira ancora' : 'tocca a te: tira i dadi');
      case 'buy': return `è su ${sq.name}: compra o va all'asta`;
      case 'auction': return 'Asta in corso';
      case 'action': return S.canRollAgain && !cur.inJail ? 'può costruire e scambiare, poi tira ancora (doppio!)' : 'può costruire, scambiare e finire il turno';
      case 'debt': return 'deve raccogliere dei soldi';
      default: return '';
    }
  }

  function renderCenter() {
    const turn = $('#turn'), hint = $('#hint'), main = $('#cMain');
    $('#title').textContent = S.title || D.TITLE;
    if (S.status === 'lobby') {
      turn.textContent = 'Si entra in partita!';
      hint.textContent = 'Ogni giocatrice scansiona il QR con il telefono';
      const url = joinUrl();
      let qrSvg = '';
      try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qrSvg = q.createSvgTag(4, 0); } catch (e) { qrSvg = ''; }
      const players = S.players.map((p) => `<div class="lp" style="--c:${p.color}"><span class="tk">${p.emoji}</span>${p.name}${p.id === S.hostId ? ' ⭐' : ''}</div>`).join('');
      const st = S.settings;
      main.innerHTML = `
        <div class="lobbyBox"><div id="qr">${qrSvg}</div>
          <div class="joinTxt">Oppure apri sul telefono:<br><b>${url.replace('http://', '')}</b>
          <div class="chips">
            <button class="chip" data-set="startCash">💰 Si parte con ${eur(st.startCash)}</button>
            <button class="chip" data-set="freeParking">🍹 Piatto aperitivo: ${st.freeParking ? 'sì' : 'no'}</button>
            <button class="chip" data-set="showCash">👀 Soldi visibili a tutti: ${st.showCash ? 'sì' : 'no'}</button>
            <button class="chip" data-set="auctions">🔨 Aste: ${st.auctions ? 'sì' : 'no'}</button>
          </div></div></div>
        <div class="lobbyPlayers">${players || '<span style="opacity:.6;font-size:1.2em">Nessuna giocatrice ancora…</span>'}</div>
        <button class="startBtn" id="btnStart" ${S.players.length < 2 ? 'disabled' : ''}>Inizia la partita</button>`;
      return;
    }
    if (S.status === 'ended') {
      $('#cardPop').classList.remove('show');
      $('#dice').innerHTML = '';
      turn.textContent = '';
      hint.textContent = '';
      const w = P(S.winner);
      const rk = (S.ranking || []).map((r, i) => { const p = P(r.id); return `<li>${i + 1}. ${p.emoji} ${p.name} — ${eur(r.worth)}</li>`; }).join('');
      main.innerHTML = `<div class="podium"><div class="trophy">🏆</div><div class="w">${w ? w.emoji + ' ' + w.name : ''}</div><div>ha vinto!</div><ol>${rk}</ol></div>`;
      return;
    }
    const cur = P(S.turn);
    turn.innerHTML = `<span style="color:var(--gold)">${cur.emoji} ${cur.name}</span>`;
    hint.textContent = hintFor();
    let html = '';
    if (S.phase === 'buy') {
      html = deedHTML(S.buy.idx);
    } else if (S.phase === 'auction' && S.auction) {
      const a = S.auction;
      const chips = S.players.filter((p) => !p.bankrupt).map((p) => `<span class="chip${a.active.includes(p.id) ? '' : ' off'}">${p.emoji} ${p.name}</span>`).join('');
      html = `<div class="mainRow">${deedHTML(a.idx)}<div class="auctionBox"><div>🔨 Offerta più alta</div><div class="big">${eur(a.high)}</div><div>${a.bidder ? nameOf(a.bidder) : 'nessuna offerta'}</div><div class="chips">${chips}</div></div></div>`;
    } else if (S.phase === 'debt' && S.debts.length) {
      const d = S.debts[0];
      html = `<div class="auctionBox"><div style="font-size:1.4em">💸 ${nameOf(d.pid)} deve</div><div class="big">${eur(d.amount)}</div><div>a ${nameOf(d.creditor)} · ${d.reason}</div></div>`;
    } else if (S.pot) {
      html = `<div class="chip">🍹 Piatto della Pausa Aperitivo: ${eur(S.pot)}</div>`;
    }
    main.innerHTML = html;
  }

  function renderLog() {
    $('#log').innerHTML = S.log.slice(-6).map((l) => `<div>${l.text}</div>`).join('');
  }

  let cardTimer = null;
  function showCard(c) {
    const el = $('#cardPop');
    const p = P(c.pid);
    el.style.setProperty('--cc', c.deck === 'fortuna' ? '#f59a3b' : '#2f87d0');
    el.innerHTML = `<small>${c.deck === 'fortuna' ? 'Fortuna' : 'Sorpresa'} · ${p ? p.name : ''}</small>${c.text}`;
    el.classList.add('show');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => el.classList.remove('show'), 5500);
  }

  function joinUrl() {
    const h = location.hostname;
    if (h && h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]') return `${location.protocol}//${location.host}/play`;
    if (info && info.addresses && info.addresses.length) return `http://${info.addresses[0]}:${info.port}/play`;
    return `${location.origin}/play`;
  }

  function render() {
    renderSquares();
    renderPlayers();
    renderCenter();
    renderLog();
  }

  function onState(s) {
    const firstTime = S === null;
    S = s;
    if (firstTime) {
      buildBoard();
      layout();
      lastDiceSeq = s.dice.seq;
      lastCardSeq = s.card ? s.card.seq : 0;
      lastLogId = s.log.length ? s.log[s.log.length - 1].id : 0;
      showDice(s.dice, false);
    }
    // nuovi lanci di dadi
    if (s.dice.seq !== lastDiceSeq) { lastDiceSeq = s.dice.seq; showDice(s.dice, true); }
    // nuova carta (dopo un attimo, così prima si vede la pedina arrivare)
    if (s.card && s.card.seq !== lastCardSeq) { lastCardSeq = s.card.seq; setTimeout(() => { if (S && S.status === 'playing') showCard(s.card); }, 1400); }
    // suoni per i nuovi eventi
    const fresh = s.log.filter((l) => l.id > lastLogId);
    if (fresh.length) {
      lastLogId = fresh[fresh.length - 1].id;
      const kinds = [...new Set(fresh.map((l) => l.kind))].filter((k) => k !== 'dice').slice(0, 3);
      kinds.forEach((k, i) => setTimeout(() => sfx(k), 700 + i * 450));
    }
    if (lastStatus === 'lobby' && s.status === 'playing') { /* inizio */ }
    lastStatus = s.status;
    render();
  }

  // ---------- eventi dell'interfaccia ----------
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'btnStart') { const r = await post('/api/board', { type: 'start' }); if (!r.ok) alert(r.error); }
    if (t.dataset.set && S) {
      const k = t.dataset.set;
      if (k === 'startCash') { const opts = [1000, 1500, 2000, 3000]; post('/api/board', { type: 'settings', startCash: opts[(opts.indexOf(S.settings.startCash) + 1) % opts.length] }); }
      else post('/api/board', { type: 'settings', [k]: !S.settings[k] });
    }
  });
  $('#btnSound').addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('dv_sound', soundOn ? '1' : '0');
    if (soundOn) { ensureCtx(); SFX.go(); }
    updateSoundBtn();
  });
  function updateSoundBtn() { $('#btnSound').textContent = soundOn ? '🔊 Suoni attivi' : '🔇 Attiva suoni'; }
  updateSoundBtn();
  document.body.addEventListener('pointerdown', () => { if (soundOn) ensureCtx(); }, { once: true });
  const fsEl = document.documentElement;
  if (!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen)) $('#btnFull').style.display = 'none';
  $('#btnFull').addEventListener('click', () => { (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl); });
  $('#btnMenu').addEventListener('click', () => $('#menu').classList.remove('hidden'));
  $('#mClose').addEventListener('click', () => $('#menu').classList.add('hidden'));
  $('#mEnd').addEventListener('click', async () => {
    if (!confirm('Terminare la partita adesso? Vince chi ha il patrimonio più alto.')) return;
    const r = await post('/api/board', { type: 'endgame' }); if (!r.ok) alert(r.error);
    $('#menu').classList.add('hidden');
  });
  $('#mAuction').addEventListener('click', async () => { await post('/api/board', { type: 'endAuction' }); $('#menu').classList.add('hidden'); });
  $('#mReset').addEventListener('click', async () => {
    if (!confirm('Cancellare la partita e ricominciare da zero?')) return;
    await post('/api/board', { type: 'reset' });
    $('#menu').classList.add('hidden');
    S = null; Object.keys(shown).forEach((k) => delete shown[k]); Object.keys(tokenEls).forEach((k) => delete tokenEls[k]);
  });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  // ---------- collegamento al server ----------
  fetch('/api/info').then((r) => r.json()).then((i) => { info = i; if (S) render(); }).catch(() => {});
  function connect() {
    const es = new EventSource('/events?role=board');
    es.onmessage = (ev) => { try { onState(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    es.onerror = () => { /* il browser riprova da solo */ };
  }
  connect();
})();
