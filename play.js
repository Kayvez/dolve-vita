(() => {
  'use strict';
  const D = window.GAME_DATA;
  const BOARD = D.BOARD;
  const $ = (s, el = document) => el.querySelector(s);
  const eur = (n) => '€' + n;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const GROUPS = {};
  BOARD.forEach((sq, i) => { if (sq.type === 'street') (GROUPS[sq.group] = GROUPS[sq.group] || []).push(i); });
  const STATIONS = BOARD.map((s, i) => (s.type === 'station' ? i : -1)).filter((i) => i >= 0);

  let token = localStorage.getItem('dv_token');
  let S = null, lastJson = '', es = null;
  let tab = 'turno';
  let draft = null;            // scambio in preparazione
  let selEmoji = null, typedName = '';
  let joinBuilt = false;
  let delta = null;            // { v, until }
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
    toastTimer = setTimeout(() => { t.className = ''; }, bad ? 3200 : 2200);
  }
  async function act(a) {
    const r = await post('/api/act', Object.assign({ token }, a));
    if (!r.ok) {
      toast(r.error || 'Errore', true);
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
  const propsOf = (pid) => Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === pid);
  const ownsAll = (pid, group) => GROUPS[group].every((i) => S.props[i].owner === pid);
  const tradable = (i) => { const sq = BOARD[i]; return !(sq.type === 'street' && GROUPS[sq.group].some((j) => S.props[j].houses > 0)); };
  const colorOf = (i) => { const sq = BOARD[i]; return sq.type === 'street' ? D.GROUP_COLORS[sq.group] : sq.type === 'station' ? '#445066' : '#9aa7b8'; };
  const textOn = (c) => (['#f4d93b', '#8fd3f4'].includes(c) ? '#222' : '#fff');
  function rentNow(i) {
    const sq = BOARD[i], pr = S.props[i];
    if (sq.type === 'street') return pr.houses > 0 ? eur(sq.rent[pr.houses]) : eur(sq.rent[0] * (ownsAll(pr.owner, sq.group) ? 2 : 1));
    if (sq.type === 'station') return eur(25 * Math.pow(2, STATIONS.filter((j) => S.props[j].owner === pr.owner).length - 1));
    return '4× / 10× dadi';
  }
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieHTML = (n) => `<div class="dot-die">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;

  function sideText(side, giverId) {
    const parts = [];
    if (side.cash) parts.push(eur(side.cash));
    side.props.forEach((i) => parts.push(BOARD[i].name + (S.props[i] && S.props[i].mortgaged ? ' (ipotecata)' : '')));
    if (side.jail) parts.push(`${side.jail} carta${side.jail > 1 ? 'e' : ''} "esci di prigione"`);
    return parts.length ? parts.join(', ') : 'niente';
  }

  // ---------- notifiche ----------
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* */ } }
  function notifications() {
    const m = me();
    if (!m || S.status !== 'playing') return;
    const myTurn = S.turn === S.you && ['roll', 'buy', 'action'].includes(S.phase);
    if (S.turn === S.you && S.phase === 'roll' && !lastTurnMe) { toast('🎲 Tocca a te!'); buzz([200, 100, 200]); }
    lastTurnMe = S.turn === S.you && S.phase === 'roll' ? true : (S.turn === S.you ? lastTurnMe : false);
    const ids = S.trades.filter((t) => t.to === S.you).map((t) => t.id).join(',');
    if (ids && ids !== lastTradeIds && ids.split(',').some((x) => !lastTradeIds.split(',').includes(x))) { toast('🤝 Hai una proposta di scambio!'); buzz([120, 80, 120]); }
    lastTradeIds = ids;
    const inDebt = S.debts.some((d) => d.pid === S.you);
    if (inDebt && !lastDebt) buzz([300]);
    lastDebt = inDebt;
    if (S.phase === 'auction' && S.auction && S.auction.active.includes(S.you) && !notifications.auc) { notifications.auc = true; buzz([100]); }
    if (S.phase !== 'auction') notifications.auc = false;
  }

  function onState(s) {
    S = s;
    if (token && s.you === null) { logout(); return; }
    const m = me();
    if (m && m.cash !== null) {
      if (lastCash !== null && lastCash > 0 && m.cash !== lastCash) {
        delta = { v: m.cash - lastCash, until: Date.now() + 2400 };
        setTimeout(render, 2500);
      }
      lastCash = m.cash;
    }
    notifications();
    render();
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
  function headerHTML(m) {
    const cur = S.status === 'playing' ? P(S.turn) : null;
    let bar = '';
    if (cur) bar = S.turn === S.you ? '<div class="turnbar me">⭐ Tocca a te!</div>' : `<div class="turnbar">Tocca a ${cur.emoji} ${esc(cur.name)}</div>`;
    const d = delta && Date.now() < delta.until ? `<span class="delta ${delta.v > 0 ? 'up' : 'down'}">${delta.v > 0 ? '+' : '−'}${Math.abs(delta.v)}</span>` : '';
    return `<header><div class="hrow"><div class="av" style="--c:${m.color}">${m.emoji}</div>
      <div><div class="hname">${esc(m.name)}</div><div class="hsub">${m.bankrupt ? 'fuori dal gioco' : m.inJail ? '🚔 in prigione' : BOARD[m.pos].name}</div></div>
      <div class="hcash">${m.cash !== null ? eur(m.cash) : ''}${d}</div></div>${bar}</header>`;
  }

  function deedMini(idx) {
    const sq = BOARD[idx];
    const col = colorOf(idx);
    let rows = '';
    if (sq.type === 'street') rows = `<div class="db"><span>Affitto</span><b>${eur(sq.rent[0])}</b></div><div class="db"><span>Con tutto il colore</span><b>${eur(sq.rent[0] * 2)}</b></div><div class="db"><span>Una casa</span><b>${eur(sq.rent[1])}</b></div><div class="db"><span>Albergo</span><b>${eur(sq.rent[5])}</b></div>`;
    else if (sq.type === 'station') rows = '<div class="db"><span>Affitto</span><b>€25 – €200</b></div>';
    else rows = '<div class="db"><span>Affitto</span><b>4× o 10× dadi</b></div>';
    return `<div class="deed"><div class="dh" style="background:${col};color:${textOn(col)}">${esc(sq.name)}</div>
      <div class="db"><span>Prezzo</span><b>${eur(sq.price)}</b></div>${rows}</div>`;
  }

  function logHTML(n) {
    return `<div class="log">${S.log.slice(-n).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function panelTurn(m) {
    if (m.bankrupt) return '<div class="card"><h3>Sei fuori dal gioco 😢</h3><p class="muted">Puoi guardare il resto della partita sul tabellone.</p></div>';
    const myTurn = S.turn === S.you;
    const cur = P(S.turn);
    const sqCur = BOARD[cur.pos];
    let html = '';
    const myDebts = S.debts.filter((d) => d.pid === S.you);

    if (myDebts.length) {
      const total = myDebts.reduce((n, d) => n + d.amount, 0);
      html += `<div class="card"><h3>💸 Devi pagare ${eur(total)}</h3>
        ${myDebts.map((d) => `<p>${eur(d.amount)} a ${d.creditor === 'bank' || d.creditor === 'pot' ? 'la banca' : esc(P(d.creditor).name)} <span class="muted">(${esc(d.reason)})</span></p>`).join('')}
        <p class="muted">Hai ${eur(m.cash)}. Raccogli i soldi: ipoteca proprietà, vendi case o proponi uno scambio. Appena ne hai abbastanza, si paga da solo.</p>
        <div class="row"><button class="btn ghost" data-tab="props">🏠 Proprietà</button><button class="btn ghost" data-tab="scambi">🤝 Scambi</button></div>
        <button class="btn red" data-act="bankrupt">Dichiaro bancarotta</button></div>`;
      return html + logHTML(3);
    }

    if (S.phase === 'auction' && S.auction) {
      const a = S.auction;
      const active = a.active.includes(S.you);
      const sq = BOARD[a.idx];
      const bidder = a.bidder ? P(a.bidder) : null;
      html += `<div class="card"><h3>🔨 Asta: ${esc(sq.name)}</h3>${deedMini(a.idx)}
        <div class="bigtxt">${eur(a.high)}</div>
        <p class="muted" style="text-align:center">${bidder ? `${bidder.emoji} ${esc(bidder.name)} è in testa` : 'Nessuna offerta ancora'}</p>`;
      if (active) {
        const can = (inc) => a.bidder !== S.you && a.high + inc <= m.cash;
        html += `<div class="row">${[10, 50, 100].map((inc) => `<button class="btn ${can(inc) ? '' : 'off'}" data-act="bid" data-amt="${a.high + inc}">+${inc}</button>`).join('')}</div>
          <button class="btn ghost" data-act="pass">Mi ritiro</button>`;
      } else html += '<p class="muted" style="text-align:center">Ti sei ritirato dall\'asta.</p>';
      return html + '</div>' + logHTML(3);
    }

    if (S.phase === 'debt') {
      const d = S.debts[0];
      return `<div class="card"><h3>⏳ Aspetta…</h3><p>${P(d.pid).emoji} ${esc(P(d.pid).name)} deve raccogliere ${eur(d.amount)}.</p></div>` + logHTML(3);
    }

    if (!myTurn) {
      html += `<div class="card"><h3>Tocca a ${cur.emoji} ${esc(cur.name)}</h3>`;
      if (S.phase === 'buy') html += `<p class="muted">Sta decidendo se comprare <b>${esc(sqCur.name)}</b> (${eur(sqCur.price)}).</p>`;
      else if (S.phase === 'roll') html += '<p class="muted">Sta per tirare i dadi.</p>';
      else html += '<p class="muted">Sta decidendo cosa fare.</p>';
      html += '<p class="muted">Nel frattempo puoi sistemare le tue proprietà o proporre scambi.</p></div>';
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
      html += `<button class="btn green huge" data-act="roll">🎲 ${m.inJail ? 'Tira (doppio = libera)' : 'Tira i dadi'}</button></div>`;
      return html + logHTML(3);
    }
    if (S.phase === 'buy') {
      const idx = S.buy.idx;
      const can = m.cash >= S.buy.price;
      html += `<div class="card"><h3>Sei su ${esc(BOARD[idx].name)}</h3>${deedMini(idx)}
        <button class="btn green ${can ? '' : 'off'}" data-act="buy">Compra per ${eur(S.buy.price)}</button>
        <button class="btn ghost" data-act="decline">${S.settings.auctions ? 'Non comprare (asta)' : 'Non comprare'}</button>
        ${can ? '' : '<p class="muted">Non hai abbastanza soldi: puoi ipotecare qualcosa nel tab Proprietà.</p>'}</div>`;
      return html + logHTML(3);
    }
    if (S.phase === 'action') {
      const again = S.canRollAgain && !m.inJail;
      html += `<div class="card"><h3>${again ? 'Doppio! 🎉' : 'Il tuo turno'}</h3>
        ${S.dice.d1 ? `<div class="dice">${dieHTML(S.dice.d1)}${dieHTML(S.dice.d2)}</div>` : ''}
        <p class="muted">Prima di finire puoi costruire, ipotecare o fare scambi.</p>
        <button class="btn ${again ? 'green' : 'gold'}" data-act="endTurn">${again ? '🎲 Tira ancora' : 'Fine turno'}</button></div>`;
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
      const hs = sq.type === 'street' && pr.houses ? `<span class="hs">${pr.houses === 5 ? '<i class="hotel"></i>' : '<i></i>'.repeat(pr.houses)}</span>` : '';
      let btns = '';
      if (sq.type === 'street' && full) {
        btns += `<button class="btn sm green ${pm.build ? '' : 'off'}" data-act="build" data-i="${i}">${pr.houses === 4 ? '🏨 Albergo' : '🏠 Casa'} −${sq.houseCost}</button>`;
        if (pr.houses > 0) btns += `<button class="btn sm ghost ${pm.sell ? '' : 'off'}" data-act="sell" data-i="${i}">Vendi +${sq.houseCost / 2}</button>`;
      }
      if (!pr.mortgaged) btns += `<button class="btn sm ghost ${pm.mortgage ? '' : 'off'}" data-act="mortgage" data-i="${i}">Ipoteca +${sq.price / 2}</button>`;
      else btns += `<button class="btn sm gold ${pm.unmortgage ? '' : 'off'}" data-act="unmortgage" data-i="${i}">Riscatta −${Math.ceil(sq.price * 0.55)}</button>`;
      out.push(`<div class="prop${pr.mortgaged ? ' mort' : ''}"><div class="bar" style="background:${colorOf(i)}"></div><div class="pc">
        <div class="pn"><span>${esc(sq.name)}</span>${hs}</div>
        <div class="ps">${pr.mortgaged ? '<span class="tag red">IPOTECATA</span>' : `Affitto ora: <b>${rentNow(i)}</b>`} ${full ? '<span class="tag gold">★ colore completo</span>' : ''}</div>
        <div class="pb">${btns}</div></div></div>`);
    }
    return out.join('');
  }

  function propChips(list, side, selected, theirs) {
    if (!list.length) return '<span class="muted">nessuna proprietà</span>';
    return `<div class="chips">${list.map((i) => `<button class="chip ${selected.includes(i) ? 'on' : ''} ${tradable(i) ? '' : 'dis'}" data-act="tprop" data-side="${side}" data-i="${i}">${esc(BOARD[i].name)}${S.props[i].mortgaged ? ' 🔒' : ''}</button>`).join('')}</div>`;
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
        <div class="hsub" style="color:var(--muted);opacity:1">${p.bankrupt ? '💀 fuori' : p.inJail ? '🚔 in prigione' : BOARD[p.pos].name}${p.connected ? '' : ' · offline'}</div></div>
        <div class="hcash" style="font-size:20px;color:var(--ink)">${p.cash !== null ? eur(p.cash) : ''}</div></div>
        <div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap">${pr.map((i) => `<span style="width:14px;height:14px;border-radius:3px;background:${colorOf(i)};opacity:${S.props[i].mortgaged ? .35 : 1};border:1px solid rgba(0,0,0,.3)"></span>`).join('')}</div></div>`;
    }).join('');
    if (S.status === 'playing' && !m.bankrupt) html += '<button class="btn ghost" data-act="resign" style="margin-top:6px">🏳️ Mi arrendo</button>';
    return html;
  }

  function renderLobby(m) {
    const host = S.hostId === S.you;
    const st = S.settings;
    return `<div class="wrap"><div class="logo">${esc(D.TITLE)}</div><div class="sub">In attesa di iniziare…</div>
      <div class="card"><h3>Giocatrici (${S.players.length})</h3>
      ${S.players.map((p) => `<p style="display:flex;align-items:center;gap:10px"><span class="av" style="--c:${p.color};width:38px;height:38px;font-size:20px">${p.emoji}</span><b>${esc(p.name)}</b>${p.id === S.hostId ? ' ⭐' : ''}${p.id === S.you ? ' <span class="muted">(tu)</span>' : ''}</p>`).join('')}</div>
      ${host ? `<div class="card"><h3>Regole</h3><div class="chips">
        <button class="chip" data-act="set" data-k="startCash">💰 Si parte con ${eur(st.startCash)}</button>
        <button class="chip ${st.freeParking ? 'on' : ''}" data-act="set" data-k="freeParking">🍹 Piatto aperitivo</button>
        <button class="chip ${st.showCash ? 'on' : ''}" data-act="set" data-k="showCash">👀 Soldi visibili</button>
        <button class="chip ${st.auctions ? 'on' : ''}" data-act="set" data-k="auctions">🔨 Aste</button></div>
        <button class="btn green ${S.players.length < 2 ? 'off' : ''}" data-act="start">Inizia la partita</button></div>`
        : `<div class="card"><p class="muted">Aspetta che ${esc(P(S.hostId).name)} avvii la partita (o dal tabellone).</p></div>`}
      <button class="btn ghost" data-act="leave">Esci</button></div>`;
  }

  function renderEnded(m) {
    const w = P(S.winner);
    return `<div class="wrap"><div class="logo">🏆</div><div class="sub" style="font-size:24px;color:var(--gold);font-weight:800">${w ? w.emoji + ' ' + esc(w.name) : ''} ha vinto!</div>
      <div class="card"><h3>Classifica finale</h3>${(S.ranking || []).map((r, i) => { const p = P(r.id); return `<p>${i + 1}. ${p.emoji} <b>${esc(p.name)}</b> — ${eur(r.worth)}</p>`; }).join('')}</div>
      <p class="sub">Per rigiocare: "Menu → Nuova partita" sul tabellone.</p></div>`;
  }

  function render() {
    if (!S) return;
    const app = $('#app');
    const m = me();
    if (!m) { renderJoin(); return; }
    joinBuilt = false;
    if (S.status === 'lobby') { app.innerHTML = renderLobby(m); return; }
    if (S.status === 'ended') { app.innerHTML = renderEnded(m); return; }
    const incoming = S.trades.filter((t) => t.to === S.you).length;
    const body = tab === 'turno' ? panelTurn(m) : tab === 'props' ? panelProps(m) : tab === 'scambi' ? panelTrade(m) : panelPlayers(m);
    app.innerHTML = headerHTML(m) + `<div class="wrap">${body}</div>
      <nav>${[['turno', '🎲', 'Turno'], ['props', '🏠', 'Proprietà'], ['scambi', '🤝', 'Scambi'], ['gioc', '👥', 'Giocatori']]
        .map(([k, ic, lb]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}"><span>${ic}</span>${lb}${k === 'scambi' && incoming ? `<i class="bd">${incoming}</i>` : ''}</button>`).join('')}</nav>`;
  }

  // ---------- eventi ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  document.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
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
      case 'build': case 'sell': case 'mortgage': case 'unmortgage': await act({ type: a, idx: Number(d.i) }); return;
      case 'bankrupt': if (confirm('Confermi? Perdi tutto e esci dal gioco.')) await act({ type: 'bankrupt' }); return;
      case 'resign': if (confirm('Vuoi davvero arrenderti? Esci dal gioco e lasci tutto alla banca.')) await act({ type: 'bankrupt' }); return;
      case 'set': {
        const st = S.settings;
        if (d.k === 'startCash') { const o = [1000, 1500, 2000, 3000]; await act({ type: 'settings', startCash: o[(o.indexOf(st.startCash) + 1) % o.length] }); }
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
