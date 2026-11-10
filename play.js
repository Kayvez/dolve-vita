(() => {
  'use strict';
  const D = window.GAME_DATA;
  let BOARD = D.BOARDS[60].squares, curSize = 0;
  const $ = (s, el = document) => el.querySelector(s);
  const eur = (n) => '€' + n;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let GROUPS = {}, STATIONS = [];
  function useSize(size) {
    size = size || 40;
    if (size === curSize) return;
    curSize = size;
    BOARD = (D.BOARDS[size] || D.BOARDS[40]).squares;
    GROUPS = {};
    BOARD.forEach((sq, i) => { if (sq.type === 'street') (GROUPS[sq.group] = GROUPS[sq.group] || []).push(i); });
    STATIONS = BOARD.map((q, i) => (q.type === 'station' ? i : -1)).filter((i) => i >= 0);
  }
  useSize(60);
  const nm = (i) => D.nameOf(S ? S.settings.theme : 'italia', BOARD[i]);

  let token = localStorage.getItem('dv_token');
  let S = null, lastJson = '', es = null;
  let tab = 'turno';
  let draft = null;            // scambio in preparazione
  let selEmoji = null, typedName = '';
  let joinBuilt = false;
  let delta = null;            // { v, until }
  let salePick = null;         // { to, price } mentre preparo una vendita diretta
  let pick = null;             // { kind:'ace', key } mentre si sceglie il bersaglio
  let lastLogSeen = null;
  let lastCash = null, lastTurnMe = false, lastTradeIds = '', lastDebt = false;

  // ---------- rete ----------
  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Niente connessione al gioco. Controlla il Wi-Fi.' }; }
  }
  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, bad ? 5000 : 3600);
  }
  // i tasti del turno non si premono a raffica: dopo un tocco si aspetta un attimo
  const FLOW = new Set(['roll', 'buy', 'decline', 'endTurn', 'dareAnswer', 'busPick', 'warpTo', 'travel', 'payJail', 'useJailCard', 'offerSale', 'saleAccept', 'saleDecline', 'claimTake', 'claimPass']);
  let flowLock = 0;
  async function act(a) {
    if (FLOW.has(a.type)) {
      if (Date.now() < flowLock) return { ok: false, soft: true };
      flowLock = Date.now() + 250;
    }
    const r = await post('/api/act', Object.assign({ token }, a));
    if (!r.ok) {
            if (r.error) toast(r.error, !r.soft);
      if (/Sessione scaduta/.test(r.error || '')) logout();
    }
    return r;
  }
  function logout() {
    token = null; localStorage.removeItem('dv_token');
    draft = null; joinBuilt = false; lastJson = '';
    connect();
  }
  function connect() {
    if (es) es.close();
    es = new EventSource('/events' + (token ? '?token=' + encodeURIComponent(token) : ''));
    es.onmessage = (ev) => {
      if (ev.data === lastJson) return;
      lastJson = ev.data;
      try { onState(JSON.parse(ev.data)); } catch (e) { console.error(e); }
    };
    es.onerror = async () => {
      if (token) {
        const r = await post('/api/act', { token, type: 'noop' });
        if (/Sessione scaduta/.test(r.error || '')) { logout(); return; }
      }
      if (es.readyState === 2) setTimeout(connect, 2000);
    };
  }

  // ---------- utilità di stato ----------
  const P = (id) => S.players.find((p) => p.id === id);
  const me = () => P(S.you);
  // ordinate per colore (i colori nell'ordine del tabellone), poi stazioni e società
  const propRank = (i) => { const sq = BOARD[i]; return sq.type === 'street' ? Object.keys(GROUPS).indexOf(sq.group) : sq.type === 'station' ? 500 : 900; };
  const propsOf = (pid) => Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === pid).sort((a, b) => propRank(a) - propRank(b) || a - b);
  const ownsAll = (pid, group) => GROUPS[group].every((i) => S.props[i].owner === pid);
  const tradable = (i) => { const sq = BOARD[i]; return !(sq.type === 'street' && GROUPS[sq.group].some((j) => S.props[j].houses > 0)); };
  const colorOf = (i) => { const sq = BOARD[i]; return sq.type === 'street' ? D.GROUP_COLORS[sq.group] : sq.type === 'station' ? '#445066' : '#9aa7b8'; };
  const textOn = (c) => (['#f4d93b', '#8fd3f4'].includes(c) ? '#222' : '#fff');
  function rentNow(i) {
    const sq = BOARD[i], pr = S.props[i];
    const up = (n) => (S.event && S.event.key === 'rentUp' ? Math.round(n * 1.5 / 10) * 10 : n);
    if (sq.type === 'street') return pr.houses >= 6 ? eur(up(Math.round(sq.rent[5] * 1.6 / 10) * 10)) : pr.houses > 0 ? eur(up(sq.rent[pr.houses])) : eur(up(sq.rent[0] * (ownsAll(pr.owner, sq.group) ? 2 : 1)));
    if (sq.type === 'station') return eur(up(25 * Math.pow(2, STATIONS.filter((j) => S.props[j].owner === pr.owner).length - 1)));
    return '4× / 10× dadi';
  }
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieHTML = (n) => `<div class="dot-die land">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
  const speedHTML = (f) => `<div class="dot-die speed land"><b>${f === 'J' ? '🃏' : f === 'B' ? '🚌' : f}</b></div>`;
  const diceHTML = (d) => (d && d.d1 ? `<div class="dice">${dieHTML(d.d1)}${dieHTML(d.d2)}${d.d3 ? speedHTML(d.d3) : ''}</div>` : '');
  const eventHTML = () => (S.event && S.status === 'playing' ? `<div class="evbox">${S.event.icon} <b>${esc(S.event.title)}</b> · ${esc(S.event.text)}</div>` : '');

  function sideText(side, giverId) {
    const parts = [];
    if (side.cash) parts.push(eur(side.cash));
    side.props.forEach((i) => parts.push(nm(i) + (S.props[i] && S.props[i].mortgaged ? ' (ipotecata)' : '')));
    if (side.jail) parts.push(`${side.jail} carta${side.jail > 1 ? 'e' : ''} "esci di prigione"`);
    return parts.length ? parts.join(', ') : 'niente';
  }

  // ---------- notifiche ----------
  // suoni sul telefono (si sbloccano al primo tocco)
  let pctx = null, silentP = null, pSound = true;
  try { pSound = localStorage.getItem('dv_psound') !== '0'; } catch (e) { /* */ }
  function pEnsure() {
    if (!pSound) return false;
    if (!pctx) { try { pctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; } }
    if (pctx.state !== 'running') pctx.resume();
    if (!silentP) {
      try {
        const n = 8000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        silentP = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))); silentP.loop = true; silentP.setAttribute('playsinline', '');
      } catch (e) { /* */ }
    }
    if (silentP && silentP.paused) silentP.play().catch(() => {});
    return pctx.state === 'running';
  }
  ['pointerdown', 'touchend', 'click'].forEach((ev) => document.addEventListener(ev, pEnsure, { passive: true }));
  function ptone(f, t0, d, type, vol) {
    const o = pctx.createOscillator(), g = pctx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    const t = pctx.currentTime + t0;
    g.gain.setValueAtTime(vol || 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(pctx.destination); o.start(t); o.stop(t + d + 0.03);
  }
  function psfx(k) {
    if (!pSound || !pEnsure()) return;
    if (k === 'turn') { ptone(660, 0, 0.14); ptone(880, 0.14, 0.14); ptone(1320, 0.28, 0.3); }
    if (k === 'gain') { ptone(880, 0, 0.1); ptone(1175, 0.09, 0.16); }
    if (k === 'lose') { ptone(330, 0, 0.12, 'triangle'); ptone(247, 0.1, 0.2, 'triangle'); }
    if (k === 'alert') { ptone(500, 0, 0.12, 'square', 0.15); ptone(500, 0.18, 0.12, 'square', 0.15); }
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* */ } }
  function notifications() {
    const m = me();
    if (!m || S.status !== 'playing') return;
    const myTurn = S.turn === S.you && ['roll', 'buy', 'action'].includes(S.phase);
    if (S.turn === S.you && S.phase === 'roll' && !lastTurnMe) { toast('🎲 Tocca a te!'); buzz([200, 100, 200]); psfx('turn'); }
    lastTurnMe = S.turn === S.you && S.phase === 'roll' ? true : (S.turn === S.you ? lastTurnMe : false);
    const ids = S.trades.filter((t) => t.to === S.you).map((t) => t.id).join(',');
    if (ids && ids !== lastTradeIds && ids.split(',').some((x) => !lastTradeIds.split(',').includes(x))) { toast('🤝 Hai una proposta di scambio!'); buzz([120, 80, 120]); psfx('alert'); }
    lastTradeIds = ids;
    const inDebt = S.debts.some((d) => d.pid === S.you);
    if (inDebt && !lastDebt) buzz([300]);
    lastDebt = inDebt;
    if (S.phase === 'auction' && S.auction && S.auction.active.includes(S.you) && !notifications.auc) { notifications.auc = true; buzz([100]); }
    if (S.phase !== 'auction') notifications.auc = false;
  }

  function onState(s) {
    useSize(s.size);
    if (s.phase !== 'buy' || s.turn !== s.you) salePick = null;
    S = s;
    if (token && s.you === null) { logout(); return; }
    const m = me();
    if (m && m.cash !== null) {
      if (lastCash !== null && lastCash > 0 && m.cash !== lastCash) {
        delta = { v: m.cash - lastCash, until: Date.now() + 2400 };
        psfx(m.cash > lastCash ? 'gain' : 'lose');
        setTimeout(render, 2500);
      }
      lastCash = m.cash;
    }
    notifications();
    logToasts();
    render();
  }
  // ---------- avvisi a tutto schermo (come sul tabellone) ----------
  const bQ = [];
  let bBusy = false, bEl = null, lastNoticeSeq = null, lastCardSeq = null, lastEventSeq = null, lastDiceSeq = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function banner(icon, title, text, cls, amount) {
    if (bQ.length >= 4) { const i = bQ.findIndex((x) => x.cls !== 'big'); bQ.splice(i >= 0 ? i : 0, 1); } // se ce ne sono troppi, salta i meno importanti
    bQ.push({ icon, title, text, cls, amount });
    if (!bBusy) runBanner();
  }
  async function runBanner() {
    bBusy = true;
    if (!bEl) { bEl = document.createElement('div'); bEl.id = 'banner'; document.body.appendChild(bEl); bEl.addEventListener('click', () => { bEl.className = ''; }); }
    while (bQ.length) {
      const a = bQ.shift();
      bEl.className = 'show ' + (a.cls || '');
      bEl.innerHTML = `<div class="bi">${a.icon}</div><div class="bt">${esc(a.title)}</div>${a.amount ? `<div class="ba">${esc(a.amount)}</div>` : ''}<div class="bx">${esc(a.text || '')}</div>`;
      if (a.cls === 'bad') psfx('lose'); else if (a.cls === 'good') psfx('gain'); else psfx('alert');
      await wait(bQ.length > 1 ? 2100 : a.cls === 'big' ? 3800 : 3000);
      bEl.className = '';
      await wait(350);
    }
    bBusy = false;
  }
  const euroIn = (t) => { const m = /€\s?(\d+)/.exec(t || ''); return m ? '€' + m[1] : ''; };
  const plain = (t) => String(t || '').replace(/^[^\p{L}\p{N}€]+/u, '');
  const DECKI = { fortuna: ['🍀', 'Fortuna'], sorpresa: ['🎁', 'Sorpresa'], imprevisto: ['⚠️', 'Imprevisto'] };
  function announceFrom(fresh) {
    const me0 = me();
    const mine = (t) => !!(me0 && t.includes(me0.name));
    for (const l of fresh) {
      const t = l.text;
      if (l.kind === 'rent') { banner('💸', mine(t) ? 'Devi pagare un affitto' : 'Affitto', plain(t), 'bad', euroIn(t)); if (mine(t)) buzz([120, 60, 120]); }
      else if (l.kind === 'tax') { banner('🧾', 'Tassa / multa', plain(t), 'bad', euroIn(t)); if (mine(t)) buzz([120, 60, 120]); }
      else if (l.kind === 'go') banner(/d'oro/.test(t) ? '🎰' : '➡️', /d'oro/.test(t) ? 'Partenza d\'oro: doppio!' : /piatto/.test(t) ? 'Piatto dell\'aperitivo!' : 'Partenza!', plain(t), /d'oro/.test(t) ? 'big' : 'good', euroIn(t));
      else if (l.kind === 'pay' && /€/.test(t)) banner('💶', 'Pagamento', plain(t), 'bad', euroIn(t));
      else if (l.kind === 'land' && /oggi niente affitto/.test(t)) banner('🚧', 'Niente affitto oggi!', plain(t), 'big');
      else if (l.kind === 'mission') banner('🎯', 'Missione compiuta!', plain(t), 'big', euroIn(t));
      else if (l.kind === 'dare') banner('🎭', /rifiuta/.test(t) ? 'Sfida rifiutata' : 'Sfida superata!', plain(t), /rifiuta/.test(t) ? 'bad' : 'good', euroIn(t));
      else if (l.kind === 'sale') banner('🤝', 'Offerta diretta', plain(t), '', euroIn(t));
      else if (l.kind === 'dice' && /TRIS/.test(t)) banner('✨', 'TRIS!', plain(t), 'big');
      else if (l.kind === 'dice' && /navetta/.test(t)) banner('🚌', 'Navetta!', plain(t));
      else if (l.kind === 'move' && /Jolly/.test(t)) banner('🃏', 'Jolly!', plain(t));
      else if (l.kind === 'move' && /scambiano/.test(t)) banner('🔀', 'Si cambia posto!', plain(t));
      else if (l.kind === 'ace') banner('🃏', 'Asso nella manica', plain(t), /scudo/i.test(t) ? 'good' : '');
      else if (l.kind === 'cheat') banner('🕵️', 'Furbetti!', plain(t), 'big', euroIn(t));
      else if (l.kind === 'jail' && /va in prigione|tre doppi/.test(t)) banner('🚔', 'In prigione!', plain(t), 'bad');
      else if (l.kind === 'bankrupt') banner('💀', 'Fuori dal gioco', plain(t), 'bad');
      else if (l.kind === 'build' && mine(t)) toast(t);
    }
  }
  function logToasts() {
    const last = S.log.length ? S.log[S.log.length - 1].id : 0;
    const first = lastLogSeen === null;
    const fresh = first ? [] : S.log.filter((l) => l.id > lastLogSeen);
    lastLogSeen = last;
    const rolled = lastDiceSeq !== null && S.dice.seq !== lastDiceSeq;
    lastDiceSeq = S.dice.seq;
    if (first) { lastNoticeSeq = S.notice ? S.notice.seq : 0; lastCardSeq = S.card ? S.card.seq : 0; lastEventSeq = S.event ? S.event.seq : 0; return; }
    const lag = rolled ? 1200 : 150; // dopo un lancio aspetta che il tabellone abbia mostrato la mossa
    const items = [];
    // evento di città
    if (S.event && S.event.seq !== lastEventSeq) { lastEventSeq = S.event.seq; const e = S.event; items.push(() => banner(e.icon, e.title, e.text, 'big')); }
    // carta pescata
    if (S.card && S.card.seq !== lastCardSeq) { lastCardSeq = S.card.seq; const c = S.card, who = P(c.pid), d = DECKI[c.deck] || ['🃏', 'Carta']; items.push(() => banner(d[0], `${d[1]}${who ? ' · ' + who.emoji + ' ' + who.name : ''}`, plain(c.text), 'big')); }
    // avviso di casella speciale
    if (S.notice && S.notice.seq !== lastNoticeSeq) { lastNoticeSeq = S.notice.seq; const n = S.notice; items.push(() => { banner(n.icon, n.title, n.text, n.tone === 'bad' ? 'bad' : n.tone === 'good' ? 'good' : 'big'); if (n.tone === 'bad') buzz([100, 50, 100]); }); }
    const snap = fresh.filter((l) => !['event', 'card', 'notice'].includes(l.kind));
    setTimeout(() => { snap.length && announceFrom(snap); items.forEach((f) => f()); }, lag);
  }

  // ---------- schermata di ingresso ----------
  function renderJoin() {
    const app = $('#app');
    if (!joinBuilt) {
      app.innerHTML = `<div class="wrap">
        <div class="logo">${esc(D.TITLE)}</div>
        <div class="sub">Scegli nome e pedina</div>
        <div class="card">
          <input id="nameInp" class="inp" maxlength="14" placeholder="Il tuo nome" autocomplete="off" value="${esc(typedName)}">
          <div id="emojiGrid" class="emojis"></div>
          <button class="btn gold" data-act="join">Entra in partita</button>
        </div>
        <div id="reclaim"></div></div>`;
      $('#nameInp').addEventListener('input', (e) => { typedName = e.target.value; });
      joinBuilt = true;
    }
    const taken = new Set(S.players.map((p) => p.emoji));
    if (selEmoji && taken.has(selEmoji)) selEmoji = null;
    $('#emojiGrid').innerHTML = D.TOKENS.map((e) => `<button class="${taken.has(e) ? 'taken' : ''}${e === selEmoji ? ' sel' : ''}" data-act="pick" data-e="${e}">${e}</button>`).join('');
    const off = S.players.filter((p) => !p.connected && !p.bankrupt);
    const started = S.status !== 'lobby';
    $('#reclaim').innerHTML = (off.length || started) ? `<div class="card"><h3>${started ? 'La partita è già iniziata' : 'Eri già dentro?'}</h3>
      <p class="muted">${off.length ? 'Se hai cambiato telefono o ricaricato la pagina, tocca il tuo nome:' : 'Aspetta la prossima partita.'}</p>
      <div class="chips">${off.map((p) => `<button class="chip" data-act="claim" data-id="${p.id}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div></div>` : '';
    if (S.status === 'ended') $('#reclaim').innerHTML = '<div class="card"><h3>La partita è finita</h3><p class="muted">Chiedi di iniziarne una nuova dal tabellone.</p></div>';
  }

  // ---------- parti della schermata di gioco ----------
  function fmtLeft(ms) { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function extraBar(m) {
    let h = '';
    if (S.status !== 'playing') return h;
    const bits = [];
    if (S.endsAt) bits.push(`<span>⏰ <b class="cd" data-end="${S.endsAt}">${fmtLeft(S.endsAt - Date.now())}</b></span>`);
    if (S.teamsOn && m.team != null) { const mates = S.players.filter((q) => q.team === m.team && q.id !== m.id).map((q) => q.emoji + ' ' + esc(q.name)).join(', '); bits.push(`<span>👯 ${TEAMICON[m.team] || ''} con ${mates}</span>`); }
    if (S.bountyId === S.you) bits.push('<span class="bad">💰 Hai la taglia! Chi ti fa pagare guadagna</span>');
    else if (S.bountyId) { const b = P(S.bountyId); bits.push(`<span>💰 Taglia su ${b.emoji} ${esc(b.name)}</span>`); }
    if (bits.length) h += `<div class="xbar">${bits.join('')}</div>`;
    if (S.myMission) h += `<div class="mission">🎯 <b>Missione segreta:</b> ${esc(S.myMission)} <small>(+€300)${m.missionsDone ? ' · fatte: ' + m.missionsDone : ''}</small></div>`;
    return h;
  }
  setInterval(() => { document.querySelectorAll('.cd').forEach((el) => { el.textContent = fmtLeft(Number(el.dataset.end) - Date.now()); }); }, 1000);
  const heatTxt = () => { const H = D.HEAT[S.heat || 2]; return S.status === 'playing' && H ? ` · ${H.icon} ${H.name}` : ''; };
  function headerHTML(m) {
    const cur = S.status === 'playing' ? P(S.turn) : null;
    let bar = '';
    const round = S.settings.maxRounds ? ` · giro ${Math.min(S.round + 1, S.settings.maxRounds)}/${S.settings.maxRounds}` : '';
    if (cur) bar = S.turn === S.you ? `<div class="turnbar me">⭐ Tocca a te!${round}</div>` : `<div class="turnbar">Tocca a ${cur.emoji} ${esc(cur.name)}${round}</div>`;
    const d = delta && Date.now() < delta.until ? `<span class="delta ${delta.v > 0 ? 'up' : 'down'}">${delta.v > 0 ? '+' : '−'}${Math.abs(delta.v)}</span>` : '';
    return `<header><div class="hrow"><div class="av" style="--c:${m.color}">${m.emoji}</div>
      <div><div class="hname">${esc(m.name)}</div><div class="hsub">${m.bankrupt ? 'fuori dal gioco' : m.inJail ? '🚔 in prigione' : nm(m.pos)}${S.settings.winWorth && S.myWorth != null ? ' · 💎 ' + S.myWorth + '/' + S.settings.winWorth : ''}${S.late ? ' · 🔥 fase finale' : ''}${heatTxt()}</div></div>
      <button class="hq" data-act="help">?</button>
      <div class="hbadges">${m.shield ? '🛡️' : ''}${m.x2 ? '✖️2' : ''}${m.skip ? '⏭️' : ''}</div>
      <div class="hcash">${m.cash !== null ? eur(m.cash) : ''}${d}</div></div>${bar}${extraBar(m)}</header>`;
  }

  function deedMini(idx) {
    const sq = BOARD[idx];
    const col = colorOf(idx);
    let rows = '';
    if (sq.type === 'street') rows = `<div class="db"><span>Affitto</span><b>${eur(sq.rent[0])}</b></div><div class="db"><span>Con tutto il colore</span><b>${eur(sq.rent[0] * 2)}</b></div><div class="db"><span>Una casa</span><b>${eur(sq.rent[1])}</b></div><div class="db"><span>Albergo</span><b>${eur(sq.rent[5])}</b></div><div class="db"><span>🗽 Monumento</span><b>${eur(Math.round(sq.rent[5] * 1.6 / 10) * 10)}</b></div>`;
    else if (sq.type === 'station') rows = '<div class="db"><span>Affitto</span><b>€25 – €200</b></div>';
    else rows = '<div class="db"><span>Affitto</span><b>4× o 10× dadi</b></div>';
    return `<div class="deed"><div class="dh" style="background:${col};color:${textOn(col)}">${esc(nm(idx))}</div>
      <div class="db"><span>Prezzo</span><b>${eur(S.buy && S.buy.idx === idx ? S.buy.price : sq.price)}</b></div>${rows}</div>`;
  }

  function logHTML(n) {
    return `<div class="log">${S.log.slice(-n).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function acesHTML(m, usable) {
    if (!S.settings.aces) return '';
    const hand = S.aces || [];
    if (!hand.length) return '<div class="card acehand"><h3>🃏 Assi nella manica</h3><p class="muted">Non ne hai. Passando dalla Partenza ne puoi guadagnare uno.</p></div>';
    const cards = hand.map((k) => {
      const A = D.ACES[k];
      const off = !usable || ((k === 'swap' || k === 'warp') && S.phase !== 'roll') || (k === 'shield' && m.shield) || (k === 'x2' && m.x2) || ((k === 'swap' || k === 'warp') && m.inJail);
      return `<button class="ace ${off ? 'off' : ''}" data-act="ace" data-k="${k}"><span class="ai">${A.icon}</span><b>${A.name}</b><small>${A.desc}</small></button>`;
    }).join('');
    return `<div class="card acehand"><h3>🃏 Assi nella manica</h3><div class="aces">${cards}</div>${usable ? '' : '<p class="muted">Si giocano nel tuo turno.</p>'}</div>`;
  }
  function cheatHTML(mine) {
    const c = S.cheat;
    if (!c) return '';
    if (mine) {
      if (c.pending) return '<p class="muted">🕵️ Hai barato… speriamo che nessuna se ne accorga!</p>';
      if (c.canCheat) return '<button class="btn sm ghost" data-act="cheat" style="margin-top:10px">🕵️ Fai il furbo (+€100 di nascosto, prima di tirare)</button>';
      return '';
    }
    if (c.canAccuse) return '<button class="btn gold" data-act="accuse">🔎 Accusa di aver barato</button><p class="muted">Giusta: lei paga €200 a te. Sbagliata: paghi €50 tu.</p>';
    return '';
  }
  function pickerHTML(m) {
    const A = pick.kind === 'tris' ? { icon: '✨', name: 'Tris', target: 'square' } : D.ACES[pick.key];
    let body = '';
    if (A.target === 'player') {
      const others = S.players.filter((p) => !p.bankrupt && p.id !== S.you);
      body = `<div class="chips">${others.map((p) => `<button class="chip" data-act="acetarget" data-id="${p.id}">${p.emoji} ${esc(p.name)}${p.shield ? ' 🛡️' : ''}</button>`).join('')}</div>`;
    } else {
      body = `<div class="sqgrid">${BOARD.map((sq, i) => (i === m.pos ? '' : `<button class="chip sqb" data-act="${pick.kind === 'tris' ? 'warpTo' : 'acesq'}" data-i="${i}"><i style="background:${colorOf(i)}"></i>${esc(nm(i))}</button>`)).join('')}</div>`;
    }
    return `<div class="card"><h3>${A.icon} ${A.name}: ${A.target === 'player' ? 'scegli chi' : 'scegli dove andare'}</h3>${body}${pick.kind === 'tris' ? '' : '<button class="btn ghost" data-act="cancelPick">Annulla</button>'}</div>`;
  }

  function autoHTML() {
    if (!S.settings.autoEnd) return '<p class="muted">Prima di finire puoi costruire, ipotecare o fare scambi.</p>';
    if (S.hold) return '<p class="muted">⏸ Turno in pausa: premi il pulsante quando hai finito.</p>';
    if (S.autoLeft > 0) return `<div class="autobar"><div class="fill" style="animation-duration:${S.autoLeft}ms"></div><span>Il turno passa da solo…</span><button class="btn sm ghost" data-act="hold">⏸ Aspetta</button></div>`;
    return '<p class="muted">Prima di finire puoi costruire, ipotecare o fare scambi.</p>';
  }
  function auctionOwnHTML() {
    const mine = propsOf(S.you).filter((i) => !S.props[i].mortgaged && !S.props[i].houses);
    if (!mine.length) return '';
    return `<p class="muted" style="margin-top:10px">🔨 Oppure metti all'asta una tua proprietà: se qualcuna la compra ti rientra il 70%.</p><div class="row" style="flex-wrap:wrap">${mine.map((i) => `<button class="btn ghost" data-act="auctionOwn" data-i="${i}">${esc(nm(i))}</button>`).join('')}</div>`;
  }
  function bankerHTML(m) {
    if (!S.settings.banker || !S.bankerId) return '';
    const b = P(S.bankerId);
    if (S.bankerId === S.you) {
      let h = '<div class="card bankcard"><h3>🏦 Sei il banchiere</h3>';
      if (!S.payouts.length) h += '<p class="muted">Quando la banca deve pagare qualcuno (Partenza, carte), comparirà qui. Quello che non dai lo tieni tu, di nascosto… ma se ti accusano giusto restituisci il doppio.</p>';
      for (const x of S.payouts) {
        const q = P(x.pid);
        h += `<div class="payrow"><p><b>Paga ${q.emoji} ${esc(q.name)}</b>: ${eur(x.amount)} <span class="muted">(${esc(x.reason)})</span></p>
          <div class="row">${[[100, 'Tutto'], [75, '¾'], [50, 'Metà'], [0, 'Niente']].map(([pc, lb]) => `<button class="btn sm ${pc === 100 ? 'green' : 'ghost'}" data-act="payBanker" data-id="${x.id}" data-pct="${pc}">${lb}<br><small>${eur(Math.floor(x.amount * pc / 100))}</small></button>`).join('')}</div></div>`;
      }
      return h + '</div>';
    }
    let h = '';
    if (S.incoming.length) h += `<div class="evbox" style="background:linear-gradient(90deg,#1c7a4f,#27a56a)">💰 Il banchiere ti deve pagare ${eur(S.incoming.reduce((n, x) => n + x.amount, 0))}</div>`;
    if (S.canAccuseBanker) h += `<div class="card bankcard" style="padding:10px"><p class="muted" style="margin:0 0 6px">🏦 Il banchiere è ${b.emoji} ${esc(b.name)}. Ti ha dato meno del dovuto?</p><button class="btn sm gold" data-act="accuseBanker">🔎 Accusa il banchiere</button></div>`;
    return h;
  }

  function panelTurn(m) {
    if (m.bankrupt) return '<div class="card"><h3>Sei fuori dal gioco 😢</h3><p class="muted">Puoi guardare il resto della partita sul tabellone.</p></div>';
    const myTurn = S.turn === S.you;
    const cur = P(S.turn);
    const sqCur = BOARD[cur.pos];
    let html = bankerHTML(m) + eventHTML();
    if (myTurn && S.phase === 'choose' && S.choice && S.choice.kind === 'tris') pick = { kind: 'tris' };
    if (pick && myTurn && ['roll', 'action', 'choose'].includes(S.phase)) return html + pickerHTML(m);
    pick = null;
    const myDebts = S.debts.filter((d) => d.pid === S.you);

    if (myDebts.length) {
      const total = myDebts.reduce((n, d) => n + d.amount, 0);
      html += `<div class="card"><h3>💸 Devi pagare ${eur(total)}</h3>
        ${myDebts.map((d) => `<p>${eur(d.amount)} a ${d.creditor === 'bank' || d.creditor === 'pot' ? 'la banca' : esc(P(d.creditor).name)} <span class="muted">(${esc(d.reason)})</span></p>`).join('')}
        <p class="muted">Hai ${eur(m.cash)}. Raccogli i soldi: ipoteca proprietà, vendi case o proponi uno scambio. Appena ne hai abbastanza, si paga da solo.</p>
        <div class="row"><button class="btn ghost" data-tab="props">🏠 Proprietà</button><button class="btn ghost" data-tab="scambi">🤝 Scambi</button></div>
        ${S.phase === 'debt' ? auctionOwnHTML() : ''}
        <button class="btn red" data-act="bankrupt">Dichiaro bancarotta</button></div>`;
      return html + logHTML(3);
    }

    if (S.phase === 'auction' && S.auction) {
      const a = S.auction;
      const active = a.active.includes(S.you);
      const sq = BOARD[a.idx];
      const bidder = a.bidder ? P(a.bidder) : null;
      html += `<div class="card"><h3>🔨 Asta: ${esc(nm(a.idx))}</h3>${deedMini(a.idx)}
        <div class="bigtxt">${eur(a.high)}</div>
        <p class="muted" style="text-align:center">${bidder ? `${bidder.emoji} ${esc(bidder.name)} è in testa` : 'Nessuna offerta ancora'}</p>`;
      if (active) {
        const can = (inc) => a.bidder !== S.you && a.high + inc <= m.cash;
        html += `<div class="row">${a.minBid && a.high === 0 ? [0, 10, 50].map((inc) => `<button class="btn ${a.bidder !== S.you && a.minBid + inc <= m.cash ? '' : 'off'}" data-act="bid" data-amt="${a.minBid + inc}">${eur(a.minBid + inc)}</button>`).join('') : [10, 50, 100].map((inc) => `<button class="btn ${can(inc) ? '' : 'off'}" data-act="bid" data-amt="${a.high + inc}">+${inc}</button>`).join('')}</div>
          <button class="btn ghost" data-act="pass">Mi ritiro</button>`;
      } else html += '<p class="muted" style="text-align:center">Ti sei ritirato dall\'asta.</p>';
      return html + '</div>' + logHTML(3);
    }

    if (S.phase === 'sale' && S.sale) {
      const sl = S.sale, seller = P(sl.from), to = P(sl.to);
      html += `<div class="card"><h3>🤝 Offerta diretta</h3>${deedMini(sl.idx)}
        <p class="bigtxt">${eur(sl.price)}</p>`;
      if (sl.to === S.you) html += `<p style="text-align:center"><b>${seller.emoji} ${esc(seller.name)}</b> ti offre <b>${esc(nm(sl.idx))}</b> per ${eur(sl.price)}. Ti conviene?</p>
        <div class="row"><button class="btn green ${m.cash >= sl.price ? '' : 'off'}" data-act="${m.cash >= sl.price ? 'saleAccept' : 'why'}" data-w="Non hai abbastanza soldi">✅ Accetto</button><button class="btn ghost" data-act="saleDecline">❌ No grazie</button></div>`;
      else if (sl.from === S.you) html += `<p class="muted" style="text-align:center">Aspetta la risposta di ${to.emoji} ${esc(to.name)}…</p><button class="btn ghost" data-act="saleCancel">Ritira l'offerta</button>`;
      else html += `<p class="muted" style="text-align:center">${seller.emoji} ${esc(seller.name)} offre la proprietà a ${to.emoji} ${esc(to.name)}.</p>`;
      return html + '</div>' + logHTML(3);
    }

    if (S.phase === 'claim' && S.claim) {
      const c = S.claim, from = P(c.from);
      html += `<div class="card"><h3>🙋 Chi la vuole?</h3>${deedMini(c.idx)}<p class="bigtxt">${eur(c.price)}</p>`;
      if (c.from === S.you) html += `<p class="muted" style="text-align:center">Hai lasciato libera <b>${esc(nm(c.idx))}</b>. Se qualcuna la prende, ti spetta il 10% (${eur(Math.round(c.price * 0.1 / 10) * 10)}).</p>`;
      else if ((c.claimed || []).includes(S.you)) html += `<p style="text-align:center">🙋 Hai detto che la vuoi! Se anche qualcun'altra la vuole, parte un'<b>asta</b> tra voi.</p>${(c.claimed || []).length > 1 ? `<p class="muted" style="text-align:center">La vogliono: ${(c.claimed || []).map((id) => esc(P(id).name)).join(', ')}</p>` : ''}`;
      else if (c.eligible.includes(S.you) && !c.passed.includes(S.you)) html += `<p style="text-align:center">${from.emoji} ${esc(from.name)} non l'ha voluta. Prezzo di listino: la prendi tu? (Se la vogliono in due, si fa l'asta)</p>
        <div class="row"><button class="btn green" data-act="claimTake">🙋 La voglio!</button><button class="btn ghost" data-act="claimPass">No grazie</button></div>`;
      else html += '<p class="muted" style="text-align:center">Stai guardando: aspetta che decidano le altre.</p>';
      return html + '</div>' + logHTML(3);
    }

    if (S.phase === 'dare' && S.dare) {
      const dp = P(S.dare.pid);
      const dw = S.dare.win || 100, dl = S.dare.lose || 50;
      html += `<div class="card"><h3>${S.dare.lampo ? '⚡ Sfida lampo!' : '🎭 Sfida!'}</h3><p class="bigtxt" style="font-size:20px">${dp.emoji} ${esc(dp.name)} ${esc(S.dare.text)}</p>`;
      if (S.dare.pid === S.you) html += `<div class="row"><button class="btn green" data-act="dareYes">✅ Fatto +€${dw}</button><button class="btn ghost" data-act="dareNo">🙈 Passo −€${dl}</button></div>`;
      else html += `<p class="muted" style="text-align:center">Guardate bene: se ${esc(dp.name)} lo fa davvero, prende €${dw}!</p>`;
      return html + '</div>' + logHTML(3);
    }

    if (S.phase === 'debt') {
      const d = S.debts[0];
      return `<div class="card"><h3>⏳ Aspetta…</h3><p>${P(d.pid).emoji} ${esc(P(d.pid).name)} deve raccogliere ${eur(d.amount)}.</p></div>` + logHTML(3);
    }

    if (!myTurn) {
      html += `<div class="card"><h3>Tocca a ${cur.emoji} ${esc(cur.name)}</h3>${diceHTML(S.dice)}`;
      if (S.phase === 'choose') html += '<p class="muted">Sta scegliendo come muoversi.</p>';
      else if (S.phase === 'buy') html += `<p class="muted">Sta decidendo se comprare <b>${esc(nm(cur.pos))}</b> (${eur(S.buy ? S.buy.price : sqCur.price)}).</p>`;
      else if (S.phase === 'roll') html += '<p class="muted">Sta per tirare i dadi.</p>';
      else html += '<p class="muted">Sta decidendo cosa fare.</p>';
      html += `<p class="muted">Nel frattempo puoi sistemare le tue proprietà o proporre scambi.</p>${cheatHTML(false)}</div>`;
      html += acesHTML(m, false);
      return html + logHTML(4);
    }

    // ---- è il mio turno ----
    if (S.phase === 'roll') {
      html += '<div class="card">';
      if (m.inJail) {
        html += `<h3>🚔 Sei in prigione</h3><p class="muted">Prova a fare doppio, oppure esci subito.</p>
          <div class="row"><button class="btn ${m.cash >= 50 ? 'gold' : 'off'}" data-act="payJail">Paga €50</button>
          ${S.jailCardsMine ? '<button class="btn green" data-act="useJailCard">Usa la carta</button>' : ''}</div>`;
      } else if (S.doubles) html += '<h3>Doppio! 🎉</h3><p class="muted">Tira ancora.</p>';
      html += `<button class="btn green huge" data-act="roll">🎲 ${m.inJail ? 'Tira (doppio = libera)' : 'Tira i dadi'}</button>${cheatHTML(true)}</div>`;
      html += acesHTML(m, true);
      return html + logHTML(3);
    }
    if (S.phase === 'choose' && S.choice) {
      const c = S.choice;
      html += `<div class="card"><h3>🚌 Navetta!</h3>${diceHTML(S.dice)}<p class="muted">Di quanto vuoi muoverti?</p>
        <div class="row"><button class="btn green" data-act="busPick" data-p="d1">${c.d1}</button><button class="btn green" data-act="busPick" data-p="d2">${c.d2}</button><button class="btn gold" data-act="busPick" data-p="sum">${c.d1 + c.d2}</button></div></div>`;
      return html + logHTML(3);
    }
    if (S.phase === 'buy' && salePick) {
      const idx = S.buy.idx;
      const others = S.players.filter((p) => !p.bankrupt && p.id !== S.you);
      html += `<div class="card"><h3>🤝 Offri ${esc(nm(idx))} a una giocatrice</h3>
        <p class="muted">Scegli a chi e a che prezzo. Se accetta, la proprietà è sua e i soldi li prendi tu. Se rifiuta, torni a decidere.</p>
        <div class="chips">${others.map((p) => `<button class="chip ${salePick.to === p.id ? 'on' : ''}" data-act="saleTo" data-id="${p.id}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div>
        <div class="bigtxt">${eur(salePick.price)}</div>
        <div class="row">${[-50, -10, 10, 50].map((d) => `<button class="btn ghost sm" data-act="salePrice" data-d="${d}">${d > 0 ? '+' : ''}${d}</button>`).join('')}</div>
        <button class="btn green ${salePick.to ? '' : 'off'}" data-act="${salePick.to ? 'saleSend' : 'why'}" data-w="Scegli prima a chi offrirla">Invia l'offerta</button>
        <button class="btn ghost" data-act="saleClose">Annulla</button></div>`;
      return html + logHTML(3);
    }
    if (S.phase === 'buy') {
      const idx = S.buy.idx;
      const can = m.cash >= S.buy.price;
      html += `<div class="card"><h3>Sei su ${esc(nm(idx))}</h3>${diceHTML(S.dice)}${deedMini(idx)}
        <button class="btn green ${can ? '' : 'off'}" data-act="buy">Compra per ${eur(S.buy.price)}</button>
        <button class="btn ghost" data-act="decline">${S.settings.freeBuy ? 'Non comprare (la lascio libera)' : S.settings.auctions ? 'Non comprare (asta)' : 'Non comprare'}</button>
        <button class="btn ghost" data-act="saleOpen">🤝 Offri a una giocatrice</button>
        ${can ? '' : '<p class="muted">Non hai abbastanza soldi: puoi ipotecare qualcosa nel tab Proprietà.</p>'}</div>`;
      return html + logHTML(3);
    }
    if (S.phase === 'action') {
      const again = S.canRollAgain && !m.inJail;
      html += `<div class="card"><h3>${again ? 'Doppio! 🎉' : 'Il tuo turno'}</h3>
        ${diceHTML(S.dice)}
        ${autoHTML()}
        ${S.travel && S.travel.length ? `<p class="muted" style="margin:6px 0 2px">🚆 Sei su una tua stazione: puoi viaggiare gratis</p><div class="row" style="flex-wrap:wrap">${S.travel.map((i) => `<button class="btn ghost" data-act="travel" data-i="${i}">🚆 ${esc(nm(i))}</button>`).join('')}</div>` : ''}
        <button class="btn ${again ? 'green' : 'gold'}" data-act="endTurn">${again ? '🎲 Tira ancora' : 'Fine turno'}</button>${cheatHTML(true)}</div>`;
      html += acesHTML(m, true);
      return html + logHTML(4);
    }
    return logHTML(3);
  }

  function panelProps(m) {
    const mine = propsOf(S.you);
    if (!mine.length) return '<div class="card"><h3>Non hai ancora proprietà</h3><p class="muted">Quando compri qualcosa, lo gestisci da qui: costruire case, ipotecare.</p></div>';
    const perms = S.perms || {};
    const out = [`<div class="sec">Case in banca: ${S.housesLeft} · Alberghi: ${S.hotelsLeft}${m.jailCards ? ` · 🎫 ${m.jailCards}` : ''}</div>`];
    for (const i of mine) {
      const sq = BOARD[i], pr = S.props[i], pm = perms[i] || {};
      const full = sq.type === 'street' && ownsAll(S.you, sq.group);
      const hs = sq.type === 'street' && pr.houses ? `<span class="hs">${pr.houses === 6 ? '🗽' : pr.houses === 5 ? '<i class="hotel"></i>' : '<i></i>'.repeat(pr.houses)}</span>` : '';
      const why = pm.why || {};
      const B = (act, cls, label, ok) => `<button class="btn sm ${cls} ${ok ? '' : 'off'}" data-act="${ok ? act : 'why'}" data-i="${i}" data-w="${esc(why[act] || '')}">${label}</button>`;
      let btns = '';
      if (sq.type === 'street' && full) {
        btns += B('build', pr.houses === 5 ? 'gold' : 'green', `${pr.houses === 5 ? '🗽 Monumento' : pr.houses === 4 ? '🏨 Albergo' : '🏠 Casa'} −${pr.houses >= 5 ? sq.houseCost * 2 : sq.houseCost}`, pm.build);
        if (pr.houses > 0) btns += B('sell', 'ghost', `Vendi +${Math.floor((pr.houses > 5 ? sq.houseCost * 2 : sq.houseCost) / 2)}`, pm.sell);
      }
      if (!pr.mortgaged) btns += B('mortgage', 'ghost', `Ipoteca +${sq.price / 2}`, pm.mortgage);
      else btns += B('unmortgage', 'gold', `Riscatta −${Math.ceil(sq.price * 0.55)}`, pm.unmortgage);
      out.push(`<div class="prop${pr.mortgaged ? ' mort' : ''}"><div class="bar" style="background:${colorOf(i)}"></div><div class="pc">
        <div class="pn"><span>${esc(nm(i))}</span>${hs}</div>
        <div class="ps">${pr.mortgaged ? '<span class="tag red">IPOTECATA</span>' : `Affitto ora: <b>${rentNow(i)}</b>`} ${full ? '<span class="tag gold">★ colore completo</span>' : ''}</div>
        <div class="pb">${btns}</div></div></div>`);
    }
    return out.join('');
  }

  function propChips(list, side, selected, theirs) {
    if (!list.length) return '<span class="muted">nessuna proprietà</span>';
    return `<div class="chips">${list.map((i) => `<button class="chip ${selected.includes(i) ? 'on' : ''} ${tradable(i) ? '' : 'dis'}" data-act="tprop" data-side="${side}" data-i="${i}">${esc(nm(i))}${S.props[i].mortgaged ? ' 🔒' : ''}</button>`).join('')}</div>`;
  }

  function stepper(side, val, max) {
    return `<div class="stepper"><button data-act="tcash" data-side="${side}" data-d="-50">−50</button><button data-act="tcash" data-side="${side}" data-d="-10">−10</button>
      <b>${eur(val)}</b><button data-act="tcash" data-side="${side}" data-d="10">+10</button><button data-act="tcash" data-side="${side}" data-d="50">+50</button><button data-act="tcash" data-side="${side}" data-d="100">+100</button></div>`;
  }

  function panelTrade(m) {
    if (m.bankrupt) return '';
    let html = '';
    if (draft) {
      const others = S.players.filter((p) => !p.bankrupt && p.id !== S.you);
      html += `<div class="card"><h3>Nuovo scambio</h3><p class="muted">Con chi?</p><div class="chips">${others.map((p) => `<button class="chip ${draft.to === p.id ? 'on' : ''}" data-act="tto" data-id="${p.id}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div>`;
      if (draft.to) {
        const o = P(draft.to);
        html += `<div class="tcol"><h4>Tu dai</h4>${stepper('offer', draft.offer.cash)}${propChips(propsOf(S.you), 'offer', draft.offer.props)}
          ${S.jailCardsMine ? `<div class="chips" style="margin-top:8px"><button class="chip ${draft.offer.jail ? 'on' : ''}" data-act="tjail" data-side="offer">🎫 Carta esci di prigione</button></div>` : ''}</div>
          <div class="tcol"><h4>Tu ricevi da ${esc(o.name)}</h4>${stepper('request', draft.request.cash)}${propChips(propsOf(o.id), 'request', draft.request.props)}
          ${o.jailCards ? `<div class="chips" style="margin-top:8px"><button class="chip ${draft.request.jail ? 'on' : ''}" data-act="tjail" data-side="request">🎫 Carta esci di prigione</button></div>` : ''}</div>
          <button class="btn green" data-act="tsend">Invia la proposta</button>`;
      }
      html += '<button class="btn ghost" data-act="tcancelDraft">Annulla</button></div>';
      return html;
    }
    const incoming = S.trades.filter((t) => t.to === S.you);
    const outgoing = S.trades.filter((t) => t.from === S.you);
    html += '<button class="btn gold" data-act="tnew">🤝 Nuovo scambio</button>';
    for (const t of incoming) {
      const f = P(t.from);
      html += `<div class="card" style="margin-top:12px"><h3>${f.emoji} ${esc(f.name)} ti propone</h3>
        <p><b>Ti dà:</b> ${esc(sideText(t.offer))}</p><p><b>Vuole:</b> ${esc(sideText(t.request))}</p>
        <p class="muted">Le proprietà ipotecate costano subito il 10% a chi le riceve.</p>
        <div class="row"><button class="btn green" data-act="accept" data-id="${t.id}">Accetta</button><button class="btn red" data-act="reject" data-id="${t.id}">Rifiuta</button></div></div>`;
    }
    for (const t of outgoing) {
      const to = P(t.to);
      html += `<div class="card" style="margin-top:12px"><h3>Proposta a ${to.emoji} ${esc(to.name)}</h3>
        <p><b>Dai:</b> ${esc(sideText(t.offer))}</p><p><b>Chiedi:</b> ${esc(sideText(t.request))}</p>
        <button class="btn ghost" data-act="reject" data-id="${t.id}">Annulla proposta</button></div>`;
    }
    if (!incoming.length && !outgoing.length) html += '<p class="sub" style="margin-top:20px">Nessuno scambio in corso.<br>Puoi scambiare soldi, proprietà e carte.</p>';
    return html;
  }

  function panelPlayers(m) {
    let html = S.players.map((p) => {
      const pr = propsOf(p.id);
      return `<div class="card" style="padding:10px"><div class="hrow" style="color:var(--ink)"><div class="av" style="--c:${p.color}">${p.emoji}</div>
        <div><div class="hname">${esc(p.name)}${p.id === S.turn && S.status === 'playing' ? ' ⭐' : ''}</div>
        <div class="hsub" style="color:var(--muted);opacity:1">${p.bankrupt ? '💀 fuori' : p.inJail ? '🚔 in prigione' : nm(p.pos)}${p.connected ? '' : ' · offline'}</div></div>
        <div class="hcash" style="font-size:20px;color:var(--ink)">${p.cash !== null ? eur(p.cash) : ''}</div></div>
        <div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap">${pr.map((i) => `<span style="width:14px;height:14px;border-radius:3px;background:${colorOf(i)};opacity:${S.props[i].mortgaged ? .35 : 1};border:1px solid rgba(0,0,0,.3)"></span>`).join('')}</div></div>`;
    }).join('');
if (S.status === 'playing') { const H = D.HEAT[S.heat || 2]; html = `<div class="card"><h3>${H.icon} Cattiveria: livello ${S.heat || 2} · ${H.name}</h3><p class="muted">${S.settings.meanRise ? 'Sale da sola ogni tanto. ' : ''}Più è alta, più arrivano eventi cattivi e sfide lampo.</p>${(S.heat || 2) < 3 ? '<button class="btn sm gold" data-act="heatUp">🔥 Alza la cattiveria</button>' : '<p class="muted">È già al massimo! 😈</p>'}</div>` + html; }
    if (S.status === 'playing' && !m.bankrupt) html += '<button class="btn ghost" data-act="resign" style="margin-top:6px">🏳️ Mi arrendo</button>';
    return html;
  }

  let modal = null;            // null | 'help' | 'intro'
  let introFor = null;
  const openRules = new Set();
  const FEAT = ['speedDie', 'aces', 'events', 'missions', 'bounty', 'dares', 'cheat', 'freeParking', 'auctions', 'freeBuy'];
  const ARLAB = (v) => (v ? 'dal giro ' + v : 'subito');
  const TLAB = { 0: 'senza timer', 30: '30 minuti', 45: '45 minuti', 60: '1 ora', 90: '1 ora e mezza' };
  const TEAMICON = ['🟥', '🟦', '🟩', '🟨'];
  const DUR = { 0: 'senza limite', 20: '20 giri', 30: '30 giri', 50: '50 giri' };

  function ruleDetail(k) { return D.RULES[k].long.map((x) => `<p>${x}</p>`).join(''); }

  function renderLobby(m) {
    const host = S.hostId === S.you;
    const st = S.settings;
    const mv = S.myVotes || {};
    const rows = FEAT.map((k) => {
      const R = D.RULES[k], t = (S.votes || {})[k] || { yes: 0, no: 0 };
      const on = !!st[k];
      return `<div class="vrule"><div class="vt"><span class="vi">${R.icon}</span><div><b>${R.title}</b><small>${R.short}</small></div>
        <button class="info" data-act="rinfo" data-k="${k}">${openRules.has(k) ? '▲' : 'ℹ︎'}</button></div>
        ${openRules.has(k) ? `<div class="rdet">${ruleDetail(k)}</div>` : ''}
        <div class="vb"><button class="vote ${mv[k] ? 'on' : ''}" data-act="vote" data-k="${k}" data-v="1">👍 Sì</button><button class="vote ${mv[k] === false ? 'on no' : ''}" data-act="vote" data-k="${k}" data-v="0">👎 No</button>
        <span class="vr ${on ? 'yes' : ''}">${t.yes} sì · ${t.no} no → ${on ? '✅ attiva' : '⬜ spenta'}</span></div></div>`;
    }).join('');
    return `<div class="wrap"><div class="logo">${esc(D.TITLE)}</div><div class="sub">In attesa di iniziare…</div>
      <div class="card"><h3>Giocatrici (${S.players.length})</h3>
      ${S.players.map((p) => `<p style="display:flex;align-items:center;gap:10px"><span class="av" style="--c:${p.color};width:38px;height:38px;font-size:20px">${p.emoji}</span><b>${esc(p.name)}</b>${p.id === S.hostId ? ' ⭐' : ''}${p.id === S.you ? ' <span class="muted">(tu)</span>' : ''}</p>`).join('')}</div>
      <div class="card"><h3>🗳️ Scegliamo le regole</h3>
        <p class="muted">Vota quello che vuoi: vince la maggioranza. In caso di pareggio decide ${esc(P(S.hostId).name)} ⭐.</p>
        <div class="row"><button class="btn sm gold" data-act="vpreset" data-k="ultra">🎉 Voglio tutto (Ultra)</button><button class="btn sm ghost" data-act="vpreset" data-k="classic">📜 Solo classico</button></div>
        ${rows}</div>
      ${host ? `<div class="card"><h3>Impostazioni di ${esc(m.name)} ⭐</h3><div class="chips">
        <button class="chip" data-act="set" data-k="winWorth">🏁 ${st.winWorth ? 'Traguardo ' + eur(st.winWorth) : 'Nessun traguardo'}</button>
        <button class="chip" data-act="set" data-k="boardSize">🗺️ Tabellone: ${st.boardSize === 40 ? 'classico 40' : 'lungo 60'}</button>
        <button class="chip" data-act="set" data-k="startCash">💰 Si parte con ${eur(st.startCash)}</button>
        <button class="chip" data-act="set" data-k="mean">${D.HEAT[st.mean || 2].icon} Cattiveria: ${D.HEAT[st.mean || 2].name}</button>
        <button class="chip ${st.meanRise ? 'on' : ''}" data-act="set" data-k="meanRise">📈 Sale col tempo</button>
        <button class="chip" data-act="set" data-k="theme">${esc((D.THEMES[st.theme] || D.THEMES.italia).label)}</button>
        <button class="chip" data-act="set" data-k="maxRounds">⏱️ Durata: ${DUR[st.maxRounds]}</button>
        <button class="chip" data-act="set" data-k="auctionRound">🔨 Aste: ${ARLAB(st.auctionRound)}</button>
        <button class="chip" data-act="set" data-k="timeLimit">⏰ Timer: ${TLAB[st.timeLimit || 0]}</button>
        <button class="chip ${st.autoEnd ? 'on' : ''}" data-act="set" data-k="autoEnd">⏭️ Fine turno automatico</button>
        <button class="chip ${st.showCash && !st.cheat ? 'on' : ''}" data-act="set" data-k="showCash">👀 Soldi visibili a tutti</button></div>
        <button class="btn green ${S.players.length < 2 ? 'off' : ''}" data-act="start">Inizia la partita</button></div>`
        : `<div class="card"><p class="muted">Aspetta che ${esc(P(S.hostId).name)} avvii la partita (o dal tabellone). Partita: ${(D.THEMES[st.theme] || D.THEMES.italia).label}, cattiveria ${D.HEAT[st.mean || 2].name.toLowerCase()}, ${eur(st.startCash)}, durata ${DUR[st.maxRounds]}, tabellone ${st.boardSize === 40 ? 'classico' : 'lungo'}.</p></div>`}
      <button class="btn ghost" data-act="help">❓ Come si gioca</button>
      <button class="btn ghost" data-act="leave">Esci</button></div>`;
  }

  function activeRulesHTML(detailed) {
    const st = S.settings;
    const on = FEAT.filter((k) => st[k]);
    const off = FEAT.filter((k) => !st[k]);
    return `${on.length ? on.map((k) => `<div class="rl"><b>${D.RULES[k].icon} ${D.RULES[k].title}</b>${detailed ? ruleDetail(k) : `<p>${D.RULES[k].short}</p>`}</div>`).join('') : '<p class="muted">Si gioca con le regole classiche.</p>'}
      ${off.length ? `<p class="muted">Spente: ${off.map((k) => D.RULES[k].icon + ' ' + D.RULES[k].title).join(', ')}.</p>` : ''}
      <p class="muted">${D.THEMES[st.theme] ? D.THEMES[st.theme].label : ''} · si parte con ${eur(st.startCash)} · durata ${DUR[st.maxRounds]}</p>`;
  }
  function modalHTML() {
    if (modal === 'intro') {
      return `<div class="modal"><div class="mbox"><h2>🎉 Si comincia!</h2><p class="muted">Queste sono le regole di stasera:</p>${activeRulesHTML(true)}
        <button class="btn green" data-act="closeModal">Ho capito, si gioca!</button></div></div>`;
    }
    if (modal === 'help') {
      return `<div class="modal"><div class="mbox"><h2>❓ Come si gioca</h2>${D.BASICS.map((x) => `<p class="step">${x}</p>`).join('')}${S.size === 60 ? `<h3 style="margin-top:14px">Caselle speciali</h3>${D.SPECIALS.map((x) => `<p class="step">${x}</p>`).join('')}` : ''}
        <h3 style="margin-top:14px">Regole speciali di questa partita</h3>${S.status === 'lobby' ? '<p class="muted">Si decidono con il voto qui sotto.</p>' + FEAT.map((k) => `<div class="rl"><b>${D.RULES[k].icon} ${D.RULES[k].title}</b>${ruleDetail(k)}</div>`).join('') : activeRulesHTML(true)}
        <button class="btn ghost" data-act="snd">${pSound ? '🔊 Suoni attivi (tocca per spegnere)' : '🔇 Suoni spenti (tocca per accendere)'}</button><button class="btn gold" data-act="closeModal">Chiudi</button></div></div>`;
    }
    return '';
  }

  function renderEnded(m) {
    const ws = (S.winners && S.winners.length ? S.winners : [S.winner]).map(P).filter(Boolean);
    return `<div class="wrap"><div class="logo">🏆</div><div class="sub" style="font-size:24px;color:var(--gold);font-weight:800">${ws.map((w) => w.emoji + ' ' + esc(w.name)).join(' + ')} ${ws.length > 1 ? 'hanno vinto' : 'ha vinto'}!</div>
      <div class="card"><h3>Classifica finale</h3>${(S.ranking || []).map((r, i) => { const p = P(r.id); return `<p>${i + 1}. ${p.emoji} <b>${esc(p.name)}</b> — ${eur(r.worth)}</p>`; }).join('')}</div>
      <p class="sub">Per rigiocare: "Menu → Nuova partita" sul tabellone.</p></div>`;
  }

  function render() {
    if (!S) return;
    const app = $('#app');
    const m = me();
    if (!m) { renderJoin(); return; }
    joinBuilt = false;
    if (S.status === 'playing' && S.gameId && introFor !== S.gameId) {
      introFor = S.gameId;
      let seen = null; try { seen = localStorage.getItem('dv_seen'); } catch (e) { /* */ }
      if (seen !== S.gameId) modal = 'intro';
    }
    if (S.status === 'lobby') { app.innerHTML = renderLobby(m) + modalHTML(); return; }
    if (S.status === 'ended') { app.innerHTML = renderEnded(m); return; }
    const incoming = S.trades.filter((t) => t.to === S.you).length;
    const body = tab === 'turno' ? panelTurn(m) : tab === 'props' ? panelProps(m) : tab === 'scambi' ? panelTrade(m) : panelPlayers(m);
    app.innerHTML = headerHTML(m) + `<div class="wrap">${body}</div>
      <nav>${[['turno', '🎲', 'Turno'], ['props', '🏠', 'Proprietà'], ['scambi', '🤝', 'Scambi'], ['gioc', '👥', 'Giocatori']]
        .map(([k, ic, lb]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}"><span>${ic}</span>${lb}${k === 'scambi' && incoming ? `<i class="bd">${incoming}</i>` : ''}</button>`).join('')}</nav>` + modalHTML();
  }

  // ---------- eventi ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  document.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab;
      if (S && S.status === 'playing' && S.turn === S.you && S.phase === 'action' && !S.hold && (tab === 'props' || tab === 'scambi')) act({ type: 'hold' }); // sto gestendo: niente fine turno automatico
      render(); window.scrollTo(0, 0); return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || !S) return;
    const a = b.dataset.act;
    const d = b.dataset;
    switch (a) {
      case 'pick': selEmoji = d.e; render(); return;
      case 'join': {
        if (!typedName.trim()) { toast('Scrivi il tuo nome', true); return; }
        if (!selEmoji) { toast('Scegli una pedina', true); return; }
        const r = await post('/api/join', { name: typedName, emoji: selEmoji });
        if (!r.ok) { toast(r.error, true); return; }
        token = r.token; localStorage.setItem('dv_token', token); lastJson = ''; joinBuilt = false; connect();
        return;
      }
      case 'claim': {
        const r = await post('/api/claim', { id: d.id });
        if (!r.ok) { toast(r.error, true); return; }
        token = r.token; localStorage.setItem('dv_token', token); lastJson = ''; joinBuilt = false; connect();
        return;
      }
      case 'roll': case 'buy': case 'decline': case 'pass': case 'endTurn': case 'payJail': case 'useJailCard': case 'start': case 'leave':
        if (a === 'leave' && !confirm('Uscire dalla partita?')) return;
        await act({ type: a }); if (a === 'leave') logout(); return;
      case 'bid': await act({ type: 'bid', amount: Number(d.amt) }); return;
      case 'payBanker': await act({ type: 'payBanker', id: Number(d.id), pct: Number(d.pct) }); return;
      case 'accuseBanker': { const r = await act({ type: 'accuseBanker' }); return r; }
      case 'hold': await act({ type: 'hold' }); return;
      case 'heatUp': await act({ type: 'heatUp' }); return;
      case 'snd': pSound = !pSound; try { localStorage.setItem('dv_psound', pSound ? '1' : '0'); } catch (e) { /* */ } if (pSound) { pEnsure(); psfx('gain'); } render(); return;
      case 'help': modal = 'help'; render(); return;
      case 'closeModal': { if (modal === 'intro' && S.gameId) { try { localStorage.setItem('dv_seen', S.gameId); } catch (e) { /* */ } } modal = null; render(); return; }
      case 'why': if (d.w) toast(d.w, true); return;
      case 'rinfo': if (openRules.has(d.k)) openRules.delete(d.k); else openRules.add(d.k); render(); return;
      case 'vote': await act({ type: 'vote', key: d.k, value: d.v === '1' }); return;
      case 'vpreset': await act({ type: 'vote', preset: d.k }); return;
      case 'busPick': await act({ type: 'busPick', pick: d.p }); buzz(30); return;
      case 'warpTo': { const r = await act({ type: 'warpTo', idx: Number(d.i) }); if (r.ok) pick = null; return; }
      case 'cheat': { const r = await act({ type: 'cheat' }); if (r.ok) toast('🕵️ Fatto… nessuno ha visto'); return; }
      case 'accuse': await act({ type: 'accuse' }); return;
      case 'ace': {
        const A = D.ACES[d.k];
        if (A.target === 'none') { const r = await act({ type: 'ace', ace: d.k }); if (r.ok) buzz(40); }
        else { pick = { kind: 'ace', key: d.k }; render(); window.scrollTo(0, 0); }
        return;
      }
      case 'cancelPick': pick = null; render(); return;
      case 'saleOpen': salePick = { to: null, price: S.buy ? S.buy.price : 100 }; render(); return;
      case 'saleClose': salePick = null; render(); return;
      case 'saleTo': if (salePick) salePick.to = d.id; render(); return;
      case 'salePrice': if (salePick) salePick.price = Math.max(0, salePick.price + Number(d.d)); render(); return;
      case 'saleSend': { if (!salePick || !salePick.to) return; const r = await act({ type: 'offerSale', to: salePick.to, price: salePick.price }); if (r.ok) salePick = null; render(); return; }
      case 'saleAccept': case 'saleDecline': case 'saleCancel': await act({ type: a }); return;
      case 'acetarget': { const r = await act({ type: 'ace', ace: pick.key, target: d.id }); if (r.ok) { pick = null; buzz(40); } render(); return; }
      case 'acesq': { const r = await act({ type: 'ace', ace: pick.key, idx: Number(d.i) }); if (r.ok) { pick = null; buzz(40); } render(); return; }
      case 'build': case 'sell': case 'mortgage': case 'unmortgage': await act({ type: a, idx: Number(d.i) }); return;
      case 'bankrupt': if (confirm('Confermi? Perdi tutto e esci dal gioco.')) await act({ type: 'bankrupt' }); return;
      case 'resign': if (confirm('Vuoi davvero arrenderti? Esci dal gioco e lasci tutto alla banca.')) await act({ type: 'bankrupt' }); return;
      case 'claimTake': await act({ type: 'claimTake' }); return;
      case 'claimPass': await act({ type: 'claimPass' }); return;
      case 'auctionOwn': await act({ type: 'auctionOwn', idx: Number(d.i) }); return;
      case 'travel': await act({ type: 'travel', idx: Number(d.i) }); return;
      case 'dareYes': await act({ type: 'dareAnswer', done: true }); return;
      case 'dareNo': await act({ type: 'dareAnswer', done: false }); return;
      case 'set': {
        const st = S.settings;
        if (d.k === 'winWorth') { const o = [0, 3000, 5000, 8000]; await act({ type: 'settings', winWorth: o[(o.indexOf(st.winWorth) + 1) % o.length] }); }
        else if (d.k === 'boardSize') await act({ type: 'settings', boardSize: st.boardSize === 40 ? 60 : 40 });
        else if (d.k === 'startCash') { const o = [1000, 1500, 2000, 3000]; await act({ type: 'settings', startCash: o[(o.indexOf(st.startCash) + 1) % o.length] }); }
        else if (d.k === 'maxRounds') { const o = [0, 20, 30, 50]; await act({ type: 'settings', maxRounds: o[(o.indexOf(st.maxRounds) + 1) % o.length] }); }
        else if (d.k === 'auctionRound') { const o = [0, 4, 6, 10, 15]; await act({ type: 'settings', auctionRound: o[(o.indexOf(st.auctionRound) + 1) % o.length] }); }
        else if (d.k === 'timeLimit') { const o = [0, 30, 45, 60, 90]; await act({ type: 'settings', timeLimit: o[(o.indexOf(st.timeLimit || 0) + 1) % o.length] }); }
        else if (d.k === 'mean') await act({ type: 'settings', mean: (st.mean || 2) % 3 + 1 });
        else if (d.k === 'theme') { const o = Object.keys(D.THEMES); await act({ type: 'settings', theme: o[(o.indexOf(st.theme) + 1) % o.length] }); }
        else await act({ type: 'settings', [d.k]: !st[d.k] });
        return;
      }
      case 'accept': { const r = await act({ type: 'accept', id: Number(d.id) }); if (r.ok) toast('🤝 Scambio concluso!'); return; }
      case 'reject': await act({ type: 'reject', id: Number(d.id) }); return;
      // ---- composizione scambio ----
      case 'tnew': draft = { to: null, offer: { cash: 0, props: [], jail: 0 }, request: { cash: 0, props: [], jail: 0 } }; render(); return;
      case 'tcancelDraft': draft = null; render(); return;
      case 'tto': draft.to = d.id; draft.request = { cash: 0, props: [], jail: 0 }; render(); return;
      case 'tcash': {
        const side = draft[d.side];
        const max = d.side === 'offer' ? me().cash : 3000;
        side.cash = clamp(side.cash + Number(d.d), 0, max);
        render(); return;
      }
      case 'tprop': {
        const side = draft[d.side], i = Number(d.i);
        side.props = side.props.includes(i) ? side.props.filter((x) => x !== i) : side.props.concat(i);
        render(); return;
      }
      case 'tjail': draft[d.side].jail = draft[d.side].jail ? 0 : 1; render(); return;
      case 'tsend': {
        const r = await act({ type: 'propose', to: draft.to, offer: draft.offer, request: draft.request });
        if (r.ok) { draft = null; toast('Proposta inviata!'); render(); }
        return;
      }
      default:
    }
  });

  connect();
  setInterval(() => { if (S && delta && Date.now() > delta.until) { delta = null; } }, 1000);
})();
