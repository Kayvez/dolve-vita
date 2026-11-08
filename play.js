'use strict';
(function () {
  const D = window.CDATA, { h, avatar, card, die, post, toast, fmtTime } = window.UI;
  const $ = (s) => document.querySelector(s);
  let S = null, token = localStorage.getItem('collegio-token') || '', es = null, tab = 'play', mv = null, skew = 0;
  let lastTurnPid = null, seenCardKey = '', notes = {}, selSugg = { s: null, w: null }, selAcc = { s: null, w: null, r: null }, unread = 0;

  const myNotesKey = () => 'collegio-notes-' + (S && S.me ? S.me.id : '') + '-' + (S ? S.created || '' : '');
  function loadNotes() { try { notes = JSON.parse(localStorage.getItem(myNotesKey()) || '{}'); } catch (e) { notes = {}; } }
  function saveNotes() { try { localStorage.setItem(myNotesKey(), JSON.stringify(notes)); } catch (e) { /* */ } }

  function connect() {
    if (es) es.close();
    es = new EventSource('/events?' + (token ? 'token=' + token : 'role=spec'));
    es.onmessage = (e) => { const first = !S; S = JSON.parse(e.data); skew = S.now - Date.now(); if (first || (S.me && !Object.keys(notes).length)) loadNotes(); onState(); render(); };
    es.onerror = () => { if (es.readyState === 2 && token) { localStorage.removeItem('collegio-token'); token = ''; S = null; connect(); } };
  }
  const act = async (type, extra) => { const r = await post('/api/act', Object.assign({ token, type }, extra || {})); if (!r.ok) toast(r.error || 'Errore'); return r; };
  const pname = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : '?'; };
  const psusp = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.suspect : null; };
  const myPos = () => (S.me && S.pawns && S.pawns[S.me.suspect]) || null;

  function onState() {
    if (!S.me || S.status !== 'playing') return;
    const pid = S.turn ? S.turn.pid : null;
    if (pid && pid !== lastTurnPid) {
      if (pid === S.me.id) { try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* */ } tab = 'play'; selSugg = { s: null, w: null }; }
      lastTurnPid = pid;
    }
    const sg = S.suggestion;
    if (sg && sg.card) {
      const k = sg.by + sg.card + S.turnCount;
      if (k !== seenCardKey) { seenCardKey = k; showSeen(sg); }
    }
    if (S.phase === 'disprove' && sg && sg.canShow && tab !== 'play') tab = 'play';
  }

  // ---------- schermate ----------
  function render() {
    renderTop(); renderTabs();
    const m = $('#main');
    if (!S) { m.replaceChildren(h('div', { class: 'box' }, 'Mi collego…')); return; }
    if (!S.me) return renderJoin(m);
    if (S.status === 'lobby') return renderLobby(m);
    if (tab === 'play') renderPlay(m);
    else if (tab === 'cards') renderCards(m);
    else if (tab === 'notes') renderNotes(m);
    else renderMap(m);
  }

  function renderTop() {
    const t = $('#top');
    if (!S || !S.me || !S.me.suspect) { t.replaceChildren(h('div', { class: 'who serif' }, 'Misteri al Collegio')); return; }
    const myTurn = S.turn && S.turn.pid === S.me.id;
    const cur = S.turn ? S.players.find((p) => p.id === S.turn.pid) : null;
    t.replaceChildren(avatar(S.me.suspect, 44), h('div', { class: 'who' }, S.me.name, h('small', {}, D.suspect(S.me.suspect).name + (S.me.out ? ' · fuori dalla caccia' : ''))),
      h('div', { class: 'rt' }, S.status === 'playing' ? (myTurn ? h('span', { class: 'status-pill' }, '⭐ Tocca a te') : cur ? h('span', { class: 'mini' }, 'Tocca a ' + cur.name) : '') : null, S.curfewAt && S.status === 'playing' ? h('div', { class: 'mini', id: 'cd' }, '') : null));
  }
  function renderTabs() {
    const n = $('#tabs');
    if (!S || !S.me || S.status === 'lobby') { n.style.display = 'none'; return; }
    n.style.display = '';
    const T = [['play', '🎭', 'Gioco'], ['cards', '🃏', 'Carte'], ['notes', '📝', 'Taccuino'], ['map', '🗺️', 'Mappa']];
    n.replaceChildren(...T.map(([k, ic, nm]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; render(); } }, h('span', {}, ic), nm, k === 'cards' && S.me.gossips.length ? h('i', { class: 'badge' }, S.me.gossips.length) : null)));
  }

  function renderJoin(m) {
    const input = h('input', { type: 'text', placeholder: 'Il tuo nome', maxlength: 14, autocomplete: 'off' });
    const go = async () => { const r = await post('/api/join', { name: input.value }); if (!r.ok) return toast(r.error); token = r.token; localStorage.setItem('collegio-token', token); S = null; connect(); };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    const kids = [h('div', { style: 'text-align:center;margin:20px 0' }, h('div', { style: 'font-size:64px' }, '🕵️'), h('h2', { class: 't', style: 'font-size:34px' }, 'Misteri al Collegio'), h('p', { class: 'mini', style: 'font-size:15px' }, 'Un delitto è stato commesso. Chi è stato, con cosa e dove?'))];
    if (S.status === 'lobby') kids.push(h('div', { class: 'box stack' }, h('div', { style: 'font-weight:800' }, 'Come ti chiami?'), input, h('button', { class: 'btn big', onclick: go }, 'Entra nel collegio')));
    else kids.push(h('div', { class: 'box stack' }, h('div', { style: 'font-weight:800' }, 'La partita è già cominciata. Sei tu una di loro?'),
      S.players.map((p) => h('button', { class: 'roomb', disabled: p.connected, onclick: async () => { const r = await post('/api/claim', { id: p.id }); if (!r.ok) return toast(r.error); token = r.token; localStorage.setItem('collegio-token', token); S = null; connect(); } }, avatar(p.suspect, 40), h('div', {}, p.name, h('small', {}, p.connected ? 'già collegata' : D.suspect(p.suspect).name))))));
    m.replaceChildren(...kids);
  }

  function renderLobby(m) {
    const me = S.me;
    const chars = D.SUSPECTS.map((sp) => {
      const owner = S.players.find((p) => p.suspect === sp.id);
      return h('button', { class: 'ch' + (me.suspect === sp.id ? ' sel' : '') + (owner && owner.id !== me.id ? ' taken' : ''), onclick: () => act('pick', { suspect: sp.id }) }, avatar(sp.id, 62), sp.name, owner && owner.id !== me.id ? h('div', { class: 'mini' }, owner.name) : null);
    });
    const kids = [h('h2', { class: 't' }, me.suspect ? 'Sei ' + D.suspect(me.suspect).name : 'Scegli il tuo personaggio'), h('div', { class: 'chars', style: 'margin-bottom:14px' }, chars)];
    kids.push(h('div', { class: 'box' }, h('b', {}, 'In sala: '), S.players.map((p) => p.name + (p.suspect ? '' : ' (sta scegliendo)')).join(', ')));
    if (me.host) {
      const st = S.settings;
      kids.push(h('div', { class: 'box stack' }, h('b', {}, '⚙️ Opzioni'),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: st.curfew, onchange: (e) => act('settings', { curfew: e.target.checked }), style: 'width:24px;height:24px' }), 'Coprifuoco: a una certa ora si fanno le accuse segrete'),
        st.curfew ? h('div', { class: 'row wrap' }, 'Ora:', [20, 21, 22, 23].map((hr) => h('button', { class: 'btn small' + (st.curfewHour === hr ? '' : ' ghost'), onclick: () => act('settings', { curfewHour: hr }) }, hr + ':00'))) : null,
        h('button', { class: 'btn big', disabled: S.players.length < 2 || S.players.some((p) => !p.suspect), onclick: () => act('start') }, S.players.length < 2 ? 'Aspetta le altre…' : 'Inizia la partita!')));
    } else kids.push(h('div', { class: 'box mini' }, 'Quando siete tutte, chi ha creato la partita (⭐) la fa partire.'));
    m.replaceChildren(...kids);
  }

  // ---------- Gioco ----------
  function logBox() { return h('div', { class: 'box logl' }, S.log.slice(-5).reverse().map((l) => h('div', {}, l.text))); }
  function sugCards(sg) { return h('div', { class: 'cards' }, card('s:' + sg.s, { size: 'sm' }), card('w:' + sg.w, { size: 'sm' }), card('r:' + sg.r, { size: 'sm' })); }

  function renderPlay(m) {
    const kids = [];
    if (S.status === 'ended') {
      const sol = S.result.solution, won = S.result.winners.includes(S.me.id);
      kids.push(h('div', { class: 'box paper', style: 'text-align:center' }, h('h2', {}, won ? '🏆 Hai vinto!' : S.result.winners.length ? 'Partita finita' : 'Mistero irrisolto'), h('p', { style: 'font-weight:800' }, S.result.text), h('p', { class: 'serif', style: 'font-weight:800' }, 'Era stato…'), h('div', { class: 'cards' }, card('s:' + sol.s), card('w:' + sol.w), card('r:' + sol.r))));
      kids.push(logBox());
      return m.replaceChildren(...kids);
    }
    if (S.phase === 'curfew') return renderCurfew(m);
    const myTurn = S.turn && S.turn.pid === S.me.id && !S.me.out;
    const sg = S.suggestion;

    // devo smentire
    if (S.phase === 'disprove' && sg && sg.canShow) {
      kids.push(h('div', { class: 'box paper stack' }, h('h2', {}, '🕵️ Tocca a te smentire'), h('p', { style: 'margin:0;font-weight:800' }, pname(sg.by) + ' ha fatto questa ipotesi:'), sugCards(sg), h('p', { style: 'margin:0;font-weight:800' }, 'Scegli quale delle tue carte mostrare (la vede solo lei):'),
        h('div', { class: 'cards' }, sg.canShow.map((k) => h('button', { style: 'border:0;background:none;padding:0', onclick: () => act('show', { card: k }) }, card(k))))));
    } else if (S.phase === 'disprove' && sg) {
      kids.push(h('div', { class: 'box' }, h('b', {}, sg.cur ? pname(sg.cur) + ' sta scegliendo cosa mostrare…' : ''), sugCards(sg)));
    }

    if (myTurn && S.phase === 'turn') kids.push(...myTurnUI());
    else if (!(S.phase === 'disprove')) {
      const cur = S.players.find((p) => p.id === (S.turn && S.turn.pid));
      kids.push(h('div', { class: 'box row' }, cur ? avatar(cur.suspect, 58) : null, h('div', {}, h('div', { class: 'serif', style: 'font:800 22px var(--serif)' }, 'Tocca a ' + (cur ? cur.name : '…')), h('div', { class: 'mini' }, S.me.out ? 'Sei fuori dalla caccia, ma continui a smentire.' : 'Intanto studia il taccuino 📝'))));
      if (sg && !sg.none && !sg.shownBy && !sg.cur) { /* in attesa */ }
      if (sg) kids.push(h('div', { class: 'box' }, h('b', {}, pname(sg.by) + ' ipotizza:'), sugCards(sg), h('div', { class: 'mini', style: 'text-align:center;margin-top:6px' }, sg.none ? 'Nessuno ha potuto smentire!' : sg.shownBy ? pname(sg.shownBy) + ' ha smentito.' : '')));
    } 
    if (sg && sg.card && S.me.id === sg.by) kids.push(h('div', { class: 'box paper', style: 'text-align:center' }, h('b', {}, pname(sg.shownBy) + ' ti ha mostrato:'), h('div', { class: 'cards', style: 'margin-top:8px' }, card(sg.card))));
    kids.push(logBox());
    m.replaceChildren(...kids);
  }

  function myTurnUI() {
    const t = S.turn, my = S.my || {}, kids = [];
    const pos = myPos();
    const inRoom = pos && pos.t === 'r';
    const head = h('div', { class: 'box turn stack' });
    head.append(h('div', { class: 'row' }, avatar(S.me.suspect, 56), h('div', {}, h('div', { style: 'font:800 24px var(--serif);color:var(--gold2)' }, 'È il tuo turno!'), h('div', { class: 'mini' }, inRoom ? '📍 ' + D.room(pos.r).name : '📍 In corridoio'))));
    if (t.dice) head.append(h('div', { class: 'row', style: 'justify-content:center' }, die(t.dice[0]), die(t.dice[1]), h('span', { class: 'big-n' }, '= ' + t.steps)));
    if (my.canRoll) {
      head.append(h('button', { class: 'btn big', onclick: () => act('roll') }, '🎲 Tira i dadi'));
      if (my.canPassage) head.append(h('button', { class: 'btn big wine', onclick: () => act('passage') }, '🕳️ Passaggio segreto → ' + D.room(my.passageTo).name));
    }
    kids.push(head);
    if (t.rolled && !t.moved) {
      const rooms = (my.rooms || []);
      const mv2 = h('div', { class: 'box stack' }, h('b', {}, `Dove vuoi andare? (${t.steps} passi)`));
      if (!rooms.length && !(my.tiles || []).length) mv2.append(h('div', { class: 'mini' }, 'Sei bloccata: non puoi muoverti.'));
      for (const r of rooms) { const R = D.room(r); mv2.append(h('button', { class: 'roomb', onclick: () => act('move', { room: r }) }, h('span', { class: 'ic' }, R.icon), h('div', {}, R.name, h('small', {}, 'entra in questa stanza')))); }
      mv2.append(h('button', { class: 'btn ghost', onclick: () => { tab = 'map'; render(); } }, '🗺️ Oppure scegli un corridoio sulla mappa'));
      kids.push(mv2);
    }
    // ipotesi, pettegolezzo, accusa, fine turno
    if (inRoom) {
      if (my.suoraBlock) kids.push(h('div', { class: 'box' }, '🔔 La Suora di ronda è in questa stanza: qui non puoi fare ipotesi!'));
      else if (my.canSuggest) kids.push(h('button', { class: 'btn big', onclick: openSuggest }, '🔍 Fai un\'ipotesi in ' + D.room(pos.r).name));
      else if (t.suggested) kids.push(h('div', { class: 'box mini' }, 'Hai già fatto la tua ipotesi.'));
    }
    if (my.canGossip) kids.push(h('button', { class: 'btn big wine', onclick: () => act('gossip') }, '👂 Ascolta i pettegolezzi'));
    const sg = S.suggestion;
    if (t.suggested && sg && !sg.card && !sg.none && sg.cur) kids.push(h('div', { class: 'box mini' }, pname(sg.cur) + ' sta scegliendo…'));
    kids.push(h('div', { class: 'row' }, h('button', { class: 'btn ghost', style: 'flex:1', onclick: openAccuse }, '⚖️ Accusa'), h('button', { class: 'btn ghost', style: 'flex:1', onclick: () => act('end') }, 'Fine turno ➜')));
    return kids;
  }

  function renderCurfew(m) {
    const c = S.curfew, done = c && c.done.includes(S.me.id);
    const kids = [h('div', { class: 'box', style: 'text-align:center' }, h('div', { style: 'font-size:64px' }, '🌙'), h('h2', { class: 't' }, 'Coprifuoco!'), h('div', { class: 'big-n', id: 'cd2' }, ''), h('p', { class: 'mini' }, 'Scrivi in segreto la tua accusa finale. Chi indovina tutto e tre vince.'))];
    if (S.me.out) kids.push(h('div', { class: 'box' }, 'Sei già fuori dalla caccia.'));
    else if (done) kids.push(h('div', { class: 'box' }, '✅ Hai consegnato la tua accusa. Aspetta le altre…'));
    else { kids.push(accuseForm(async () => { const r = await act('final', selAcc); if (r.ok) selAcc = { s: null, w: null, r: null }; }, 'Consegna l\'accusa'), h('button', { class: 'btn ghost', onclick: () => act('final', { pass: true }) }, 'Passo: non ho idea')); }
    m.replaceChildren(...kids);
  }

  // ---------- accuse e ipotesi ----------
  function picker(items, key, sel, onSel, roomLike) {
    return h('div', { class: 'pick' }, items.map((it) => h('button', { class: 'pk' + (sel[key] === it.id ? ' sel' : ''), onclick: () => { sel[key] = it.id; onSel(); } },
      it.portrait ? avatar(it.id, 40) : h('span', { class: 'ic' }, it.icon), it.name)));
  }
  function accuseForm(onGo, label) {
    const box = h('div', { class: 'box paper stack' });
    const draw = () => {
      box.replaceChildren(h('div', { class: 'grp', style: 'color:#7a3b8f;margin-top:0' }, 'Chi è stato?'), picker(D.SUSPECTS.map((x) => ({ id: x.id, name: x.name, portrait: 1 })), 's', selAcc, draw),
        h('div', { class: 'grp', style: 'color:#a8431f' }, 'Con cosa?'), picker(D.WEAPONS, 'w', selAcc, draw),
        h('div', { class: 'grp', style: 'color:#1f6b5b' }, 'Dove?'), picker(D.ROOMS, 'r', selAcc, draw),
        h('button', { class: 'btn big wine', disabled: !(selAcc.s && selAcc.w && selAcc.r), onclick: onGo }, label));
    };
    draw(); return box;
  }
  function modal(content) {
    const m = $('#modal');
    const close = () => m.replaceChildren();
    m.replaceChildren(h('div', { class: 'modal', onclick: (e) => e.target.classList.contains('modal') && close() }, h('div', { class: 'sheet' }, content(close))));
    return close;
  }
  function openAccuse() {
    selAcc = { s: null, w: null, r: null };
    modal((close) => h('div', {}, h('h2', {}, '⚖️ Accusa finale'), h('p', { style: 'margin:0 0 10px;font-weight:700' }, 'Attenzione: se sbagli esci dalla caccia (ma continui a smentire).'),
      accuseForm(async () => { if (!confirm('Sicura? Se sbagli sei fuori!')) return; const r = await act('accuse', selAcc); if (r.ok) close(); }, 'Lancio l\'accusa!'), h('button', { class: 'btn ghost small', style: 'margin-top:10px;color:#4a1626', onclick: close }, 'Annulla')));
  }
  function openSuggest() {
    selSugg = { s: null, w: null };
    const pos = myPos();
    modal((close) => {
      const box = h('div', {});
      const draw = () => box.replaceChildren(h('h2', {}, '🔍 Ipotesi in ' + D.room(pos.r).name),
        h('div', { class: 'grp', style: 'color:#7a3b8f;margin-top:0' }, 'Chi è stato?'), picker(D.SUSPECTS.map((x) => ({ id: x.id, name: x.name, portrait: 1 })), 's', selSugg, draw),
        h('div', { class: 'grp', style: 'color:#a8431f' }, 'Con cosa?'), picker(D.WEAPONS, 'w', selSugg, draw),
        h('p', { class: 'mini', style: 'color:#6a5a4a' }, 'Il sospettato e l\'arma verranno portati in questa stanza.'),
        h('button', { class: 'btn big wine', disabled: !(selSugg.s && selSugg.w), onclick: async () => { const r = await act('suggest', selSugg); if (r.ok) close(); } }, 'Faccio l\'ipotesi'),
        h('button', { class: 'btn ghost small', style: 'margin-top:10px;color:#4a1626', onclick: close }, 'Annulla'));
      draw(); return box;
    });
  }
  function showSeen(sg) {
    modal((close) => h('div', { style: 'text-align:center' }, h('h2', {}, pname(sg.shownBy) + ' ti mostra…'), h('div', { class: 'cards', style: 'margin:14px 0' }, card(sg.card, { size: 'lg' })), h('p', { style: 'font-weight:800' }, 'Questa carta NON è nella soluzione. Segnala sul taccuino!'), h('button', { class: 'btn big', onclick: close }, 'Ok, ho visto')));
  }

  // ---------- Carte ----------
  function renderCards(m) {
    const kids = [h('h2', { class: 't' }, 'Le tue carte'), h('p', { class: 'mini' }, 'Queste NON sono nella soluzione. Non mostrarle a nessuno!'), h('div', { class: 'cards' }, S.me.cards.map((k) => card(k)))];
    if (S.me.seen.length) kids.push(h('div', { class: 'grp' }, 'Carte che ti hanno mostrato'), h('div', { class: 'cards' }, S.me.seen.map((x) => h('div', { style: 'text-align:center' }, card(x.k, { size: 'sm' }), h('div', { class: 'mini' }, pname(x.by))))));
    kids.push(h('div', { class: 'grp' }, '👂 Pettegolezzi (non sempre veri!)'));
    if (!S.me.gossips.length) kids.push(h('div', { class: 'mini' }, 'Nessuno per ora. Vai in Portineria, nel Salotto delle Sorelle o in Cappella e ascolta.'));
    for (const g of S.me.gossips) { const [t, id] = g.k.split(':'); const name = D.cardInfo(g.k).name; kids.push(h('div', { class: 'bubble' }, `«Si mormora che ${t === 's' ? 'il colpevole sia' : t === 'w' ? 'l\'arma sia' : 'il delitto sia avvenuto in'}: ${name}…»`, h('small', {}, 'Sentito in ' + D.room(g.room).name + ' · potrebbe essere una bugia'))); }
    m.replaceChildren(...kids);
  }

  // ---------- Taccuino ----------
  const MARKS = ['', 'x', 'q', 'st'], MLAB = { '': '·', x: '✗', q: '?', st: '★' };
  function renderNotes(m) {
    const inHand = new Set(S.me.cards), seen = {}; S.me.seen.forEach((x) => (seen[x.k] = x.by));
    const goss = {}; S.me.gossips.forEach((g) => (goss[g.k] = 1));
    const sec = (title, t, items) => [h('div', { class: 'grp' }, title), ...items.map((it) => {
      const k = t + ':' + it.id, locked = inHand.has(k) || seen[k];
      const mk = notes[k] || '';
      return h('div', { class: 'note' + (locked || mk === 'x' ? ' done' : '') }, h('span', { class: 'ic' }, it.portrait ? avatar(it.id, 30) : it.icon),
        h('div', { class: 'nm' }, it.name, inHand.has(k) ? h('span', { class: 'tag' }, 'ce l\'hai in mano') : seen[k] ? h('span', { class: 'tag' }, 'te l\'ha mostrata ' + pname(seen[k])) : goss[k] ? h('span', { class: 'tag' }, '👂 se ne parla…') : null),
        locked ? h('button', { class: 'lock', disabled: true }, inHand.has(k) ? 'MIA' : 'VISTA') : h('button', { class: mk, onclick: () => { notes[k] = MARKS[(MARKS.indexOf(mk) + 1) % MARKS.length]; saveNotes(); render(); } }, MLAB[mk]));
    })];
    m.replaceChildren(h('h2', { class: 't' }, 'Taccuino'), h('p', { class: 'mini' }, 'Tocca per cambiare: · niente ✗ escluso ? forse ★ sospetto forte. La soluzione è l\'unica carta di ogni gruppo che nessuno ha.'),
      ...sec('Sospettate', 's', D.SUSPECTS.map((x) => Object.assign({ portrait: 1 }, x))), ...sec('Armi', 'w', D.WEAPONS), ...sec('Luoghi', 'r', D.ROOMS),
      h('button', { class: 'btn ghost small', style: 'margin-top:14px', onclick: () => { if (confirm('Cancellare tutti gli appunti?')) { notes = {}; saveNotes(); render(); } } }, 'Azzera appunti'));
  }

  // ---------- Mappa ----------
  let zoom = 1.6;
  function renderMap(m) {
    if (!mv) mv = new MapView({ onTile: (x, y) => confirmMove({ x, y }, 'in questo corridoio'), onRoom: (r) => confirmMove({ room: r }, 'in ' + D.room(r).name), touchAction: 'pan-x pan-y' });
    const box = h('div', { class: 'mapbox' }, h('div', { class: 'mapin', style: `width:${zoom * 100}%` }, mv.svg));
    mv.update(S);
    const my = S.my;
    mv.setHighlights(my && my.tiles ? { tiles: my.tiles, rooms: my.rooms } : null);
    const zoomEl = h('div', { class: 'zoom' }, h('button', { onclick: () => { zoom = Math.min(3.2, zoom + 0.5); render(); } }, '+'), h('button', { onclick: () => { zoom = Math.max(1, zoom - 0.5); render(); } }, '−'));
    m.replaceChildren(h('div', { style: 'position:relative' }, box, zoomEl), h('div', { class: 'mini', style: 'margin-top:8px' }, my && my.tiles ? 'Tocca un quadratino verde (o una stanza) per muoverti.' : 'La pianta del collegio. Trascina per spostarti, usa + e − per ingrandire.'));
    setTimeout(() => { const pos = S.pawns[S.me.suspect]; if (!pos) return; const sv = mv.svg; const W = sv.clientWidth, Hh = sv.clientHeight; let cx, cy; if (pos.t === 't') { cx = pos.x + .5; cy = pos.y + .5; } else { const r = D.room(pos.r); cx = r.x + r.w / 2; cy = r.y + r.h / 2; } box.scrollLeft = (cx + .8) / 32.6 * W - box.clientWidth / 2; box.scrollTop = (cy + .8) / 35.6 * Hh - box.clientHeight / 2; }, 0);
  }
  function confirmMove(dest, label) {
    modal((close) => h('div', { style: 'text-align:center' }, h('h2', {}, 'Ti muovi ' + label + '?'), h('div', { class: 'row', style: 'justify-content:center' },
      h('button', { class: 'btn', onclick: async () => { const r = await act('move', dest); if (r.ok) { close(); tab = 'play'; render(); } } }, 'Sì, vado'), h('button', { class: 'btn ghost', style: 'color:#4a1626;box-shadow:inset 0 0 0 1.5px #4a1626', onclick: close }, 'No'))));
  }

  setInterval(() => {
    if (!S) return; const now = Date.now() + skew;
    const cd = $('#cd'); if (cd && S.curfewAt) { const l = S.curfewAt - now; cd.textContent = l > 0 ? '🌙 ' + (l > 3600000 ? Math.floor(l / 3600000) + 'h ' + String(Math.floor(l / 60000) % 60).padStart(2, '0') + 'm' : fmtTime(l)) : '🌙 ora'; }
    const c2 = $('#cd2'); if (c2 && S.curfew) c2.textContent = fmtTime(S.curfew.deadline - now);
  }, 1000);
  connect();
})();
