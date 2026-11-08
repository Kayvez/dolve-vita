'use strict';
(function () {
  const D = window.CDATA, { h, avatar, card, die, post, fmtTime, confetti } = window.UI;
  const $ = (s) => document.querySelector(s);
  let S = null, mv = null, lastSeq = null, skew = 0, rolled = null, info = null, shownEnd = false;

  function connect() {
    const es = new EventSource('/events?role=board');
    es.onmessage = (e) => { S = JSON.parse(e.data); skew = S.now - Date.now(); render(); };
    es.onerror = () => {};
  }
  const pname = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : '?'; };
  const psusp = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.suspect : null; };

  function banner(text, ms, kind) {
    const b = $('#banner'); b.textContent = ''; b.append(text.nodeType ? text : document.createTextNode(text)); b.classList.remove('hidden');
    b.style.background = kind === 'bad' ? 'linear-gradient(180deg,#b3362f,#5e1410)' : '';
    clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.add('hidden'), ms || 3500);
  }

  function handleEvents() {
    const evs = S.evs || [];
    const max = evs.length ? evs[evs.length - 1].seq : 0;
    if (lastSeq == null) { lastSeq = max; return; }
    for (const e of evs) {
      if (e.seq <= lastSeq) continue;
      if (e.kind === 'roll') rolled = { pid: e.pid, dice: e.dice, seq: e.seq, fresh: true };
      else if (e.kind === 'move') mv.walk(e.suspect, e.path, e.to);
      else if (e.kind === 'passage') mv.teleport(e.suspect);
      else if (e.kind === 'gossip') banner('👂 ' + pname(e.pid) + ' origlia un pettegolezzo…', 2800);
      else if (e.kind === 'suora') banner('🔔 La Suora di ronda va in ' + D.room(e.to).name, 3200);
      else if (e.kind === 'suggest') banner(pname(e.pid) + ' ha un sospetto…', 2400);
      else if (e.kind === 'wrong') {
        banner('❌ Accusa sbagliata! ' + pname(e.pid) + ' è fuori dalla caccia', 5000, 'bad');
      } else if (e.kind === 'curfew') banner('🌙 COPRIFUOCO!', 4000);
    }
    lastSeq = max;
  }

  function render() {
    if (!mv) { mv = new MapView({}); $('#map').append(mv.svg); }
    if (S.status === 'lobby') { $('#lobby').classList.remove('hidden'); $('#game').classList.add('hidden'); $('#over').classList.add('hidden'); shownEnd = false; renderLobby(); return; }
    $('#lobby').classList.add('hidden'); $('#game').classList.remove('hidden');
    mv.update(S);
    handleEvents();
    renderSide(); renderOver();
    tick();
  }

  function renderLobby() {
    const url = location.origin + '/play';
    let qr = '';
    try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag(6, 0); } catch (e) { /* */ }
    const slots = D.SUSPECTS.map((sp) => {
      const p = S.players.find((x) => x.suspect === sp.id);
      return h('div', { class: 'slot' + (p ? ' f' : '') }, avatar(sp.id, 62), p ? p.name + (p.id === S.hostId ? ' ⭐' : '') : sp.name, p ? h('small', {}, sp.name) : h('small', {}, 'libero'));
    });
    const waiting = S.players.filter((p) => !p.suspect).map((p) => p.name);
    const lob = $('#lobby');
    lob.replaceChildren(h('div', { class: 'lob' },
      h('div', {}, h('div', { class: 'qr', html: qr }), h('div', { class: 'qrurl' }, url.replace(/^https?:\/\//, ''))),
      h('div', {},
        h('div', { class: 'pill', style: 'margin-bottom:12px' }, '🕵️ Un delitto al collegio'),
        h('h1', {}, 'Misteri al Collegio'),
        h('p', {}, `${D.VICTIM[0].toUpperCase() + D.VICTIM.slice(1)} è stato trovato senza vita. Scansiona il QR con il telefono, scegli il tuo personaggio e scopri chi è stato, con cosa e dove.`),
        h('div', { class: 'slots' }, slots),
        waiting.length ? h('p', {}, '✍️ Stanno scegliendo il personaggio: ' + waiting.join(', ')) : null,
        h('div', { class: 'tools' }, h('button', { class: 'btn', disabled: S.players.length < 2 || S.players.some((p) => !p.suspect), onclick: async () => { const r = await post('/api/board', { type: 'start' }); if (!r.ok) UI.toast(r.error); } }, 'Iniziamo!'),
          h('span', { class: 'pill' }, S.players.length < 2 ? 'Servono almeno 2 giocatrici' : S.players.length + ' giocatrici · coprifuoco ' + (S.settings.curfew ? 'alle ' + S.settings.curfewHour : 'spento'))))));
  }

  function turnLines() {
    const t = S.turn; if (!t) return '';
    if (S.phase === 'disprove') return 'Qualcuna deve smentire l\'ipotesi…';
    if (S.phase === 'curfew') return 'Coprifuoco!';
    if (!t.rolled && !t.moved) return 'Deve tirare i dadi (o usare un passaggio segreto)';
    if (t.rolled && !t.moved) return 'Ha fatto ' + t.steps + ': sceglie dove andare';
    const pw = S.pawns[psusp(t.pid)];
    if (pw && pw.t === 'r' && !t.suggested) return 'È in ' + D.room(pw.r).name + ': può fare un\'ipotesi';
    return t.suggested ? 'Ha fatto la sua ipotesi' : 'Sta per finire il turno';
  }

  function renderSide() {
    const side = $('#side');
    const cur = S.turn ? S.players.find((p) => p.id === S.turn.pid) : null;
    const clock = h('div', { class: 'clock' }, S.curfewAt ? [`🌙 coprifuoco ore ${S.settings.curfewHour}`, h('b', { id: 'cd' }, '')] : ['Senza coprifuoco']);
    const brand = h('div', { class: 'panel brand' }, h('div', {}, h('h1', {}, 'Misteri al Collegio'), h('small', {}, 'giro ' + S.round)), clock);
    let dice = [];
    if (rolled && S.turn && rolled.pid === S.turn.pid && S.turn.dice) {
      dice = [die(S.turn.dice[0], rolled.fresh), die(S.turn.dice[1], rolled.fresh), h('span', { class: 'sum' }, '= ' + S.turn.steps)];
      rolled.fresh = false;
    } else if (S.turn && S.turn.dice) dice = [die(S.turn.dice[0]), die(S.turn.dice[1]), h('span', { class: 'sum' }, '= ' + S.turn.steps)];
    const turn = h('div', { class: 'panel' }, cur ? h('div', { class: 'turn' }, avatar(cur.suspect, 76), h('div', {}, h('div', { class: 'sub' }, S.status === 'ended' ? 'Partita finita' : 'Tocca a'), h('div', { class: 'who' }, cur.name), h('div', { class: 'sub' }, D.suspect(cur.suspect).name + ' · ' + turnLines()))) : h('div', { class: 'who serif' }, 'Fine partita'), h('div', { class: 'diceRow' }, dice));
    const plist = h('div', { class: 'panel plist' }, S.players.map((p) => h('div', { class: 'prow' + (cur && p.id === cur.id ? ' cur' : '') + (p.out ? ' out' : '') + (p.connected ? '' : ' off') },
      avatar(p.suspect, 42), h('div', {}, h('div', { class: 'nm' }, h('span', { class: 'dot' }), p.name), h('div', { class: 'ch' }, D.suspect(p.suspect).name)),
      h('div', { class: 'rt' }, p.out ? 'fuori dalla caccia' : '🃏 ' + p.nCards)))); 
    const log = h('div', { class: 'panel log' }, S.log.slice(-6).reverse().map((l) => h('div', {}, l.text)));
    const legend = h('div', { class: 'panel legend' }, h('span', {}, '🅐🅑 passaggi segreti (A: Cucina Infernale ↔ Cripta Gelata, B: Sancta Sanctorum ↔ Gran Salone)'), h('span', {}, '👂 pettegolezzi: Portineria, Salotto delle Sorelle, Cappella'), h('span', {}, '🔔 la Suora di ronda blocca le ipotesi nella sua stanza'));
    const tools = h('div', { class: 'tools' },
      h('button', { class: 'btn small ghost', onclick: () => post('/api/board', { type: 'skip' }).then((r) => !r.ok && UI.toast(r.error)) }, '⏭ Salta turno'),
      h('button', { class: 'btn small ghost', onclick: () => confirm('Far scattare subito il coprifuoco?') && post('/api/board', { type: 'curfewNow' }) }, '🌙 Coprifuoco ora'),
      h('button', { class: 'btn small ghost', onclick: () => confirm('Chiudere questa partita e cominciarne una nuova?') && post('/api/board', { type: 'reset' }) }, '🔄 Nuova partita'));
    const sg = suggPanel();
    side.replaceChildren(brand, turn, ...(sg ? [sg] : []), plist, log, legend, tools);
  }

  function suggPanel() {
    const sg = S.suggestion;
    if (!sg) return null;
    const el = h('div', { id: 'sugg' });
    let msg = '';
    if (sg.none) msg = 'Nessuno ha potuto smentire!';
    else if (sg.shownBy) msg = pname(sg.shownBy) + ' ha smentito, mostrando una carta a ' + pname(sg.by);
    else if (sg.cur) msg = pname(sg.cur) + ' sta scegliendo cosa mostrare…';
    const skipped = sg.skipped.length ? 'Senza carte utili: ' + sg.skipped.map(pname).join(', ') : '';
    el.append(card('s:' + sg.s, { size: 'sm' }), card('w:' + sg.w, { size: 'sm' }), card('r:' + sg.r, { size: 'sm' }),
      h('div', { class: 't' }, pname(sg.by) + ' ipotizza', h('small', {}, msg), skipped ? h('small', {}, skipped) : null));
    return el;
  }

  function renderOver() {
    const o = $('#over');
    if (S.status === 'playing' && S.phase === 'curfew' && S.curfew) {
      const done = new Set(S.curfew.done);
      o.className = '';
      o.replaceChildren(h('div', {}, h('div', { style: 'font-size:96px' }, '🌙'), h('h1', {}, 'Coprifuoco!'),
        h('p', { style: 'font-size:22px;font-weight:700' }, 'Tutte in camera. Ognuna scrive in segreto la sua accusa finale sul telefono.'),
        h('div', { class: 'serif', style: 'font-size:54px;font-weight:800;color:#fff' }, h('span', { id: 'cd2' }, '')),
        h('div', { class: 'row' }, S.players.filter((p) => !p.out).map((p) => h('div', { class: 'slot' + (done.has(p.id) ? ' f' : '') }, avatar(p.suspect, 56), p.name, h('small', {}, done.has(p.id) ? '✅ consegnata' : '✍️ sta scrivendo…'))))));
      return;
    }
    if (S.status === 'ended' && S.result) {
      if (!shownEnd) { shownEnd = true; if (S.result.winners.length) setTimeout(confetti, 300); }
      const sol = S.result.solution, rev = S.revealed;
      o.className = '';
      o.replaceChildren(h('div', {},
        h('h1', {}, S.result.winners.length ? '🏆 Mistero risolto!' : '🕯️ Mistero irrisolto'),
        h('p', { style: 'font-size:24px;font-weight:800' }, S.result.text),
        S.result.winners.length ? h('div', { class: 'row' }, S.result.winners.map((id) => h('div', { class: 'slot f' }, avatar(psusp(id), 80), pname(id)))) : null,
        h('p', { class: 'serif', style: 'font-size:20px;margin:6px 0' }, 'Era stato…'),
        h('div', { class: 'row' }, card('s:' + sol.s, { size: 'lg' }), card('w:' + sol.w, { size: 'lg' }), card('r:' + sol.r, { size: 'lg' })),
        rev ? h('div', { class: 'fin' }, S.players.filter((p) => rev[p.id] !== undefined).map((p) => h('div', { class: 'fp' }, p.name, rev[p.id] ? h('div', { class: 'row' }, card('s:' + rev[p.id].s, { size: 'sm' }), card('w:' + rev[p.id].w, { size: 'sm' }), card('r:' + rev[p.id].r, { size: 'sm' })) : h('div', {}, 'passa')))) : null,
        h('button', { class: 'btn', style: 'margin-top:14px', onclick: () => post('/api/board', { type: 'reset' }) }, 'Nuova partita')));
      return;
    }
    o.className = 'hidden';
  }

  function tick() {
    const now = Date.now() + skew;
    const cd = $('#cd');
    if (cd && S.curfewAt) { const left = S.curfewAt - now; cd.textContent = left > 0 ? (left > 3600000 ? Math.floor(left / 3600000) + 'h ' + String(Math.floor(left / 60000) % 60).padStart(2, '0') + 'm' : fmtTime(left)) : 'ORA'; }
    const c2 = $('#cd2'); if (c2 && S.curfew) c2.textContent = fmtTime(S.curfew.deadline - now);
  }
  setInterval(() => S && tick(), 1000);
  fetch('/api/info').then((r) => r.json()).then((i) => { info = i; }).catch(() => {});
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* */ }
  connect();
})();
