(() => {
  'use strict';
  const D = window.GAME_DATA;
  const DEP = 1.8; // profondità delle caselle (in unità di larghezza)
  let BOARD = D.BOARDS[60].squares, GC = 17, GR = 15, curSize = 0;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const eur = (n) => '€' + n;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let S = null;            // ultimo stato ricevuto
  let info = null;         // indirizzi del server
  let lastDiceSeq = null, lastCardSeq = null, lastLogId = null, lastFxId = 0, lastEventSeq = 0;
  let moveAfter = 0;       // le pedine aspettano la fine dell'animazione dei dadi
  let pendingCard = null;
  const shown = {};        // posizione "mostrata" di ogni pedina
  const tokenEls = {};
  const lastOwner = {};
  const cashShown = {};

  const nm = (i) => D.nameOf(S ? S.settings.theme : 'italia', BOARD[i]);

  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server non raggiungibile' }; }
  }

  // ---------- suoni ----------
  let actx = null;
  let soundOn = localStorage.getItem('dv_sound') !== '0';
  // iPad/iPhone: l'audio parte solo dopo un tocco e, con il tasto muto, solo se si "aggancia" un elemento <audio>.
  let silentEl = null;
  function silentWavUrl() {
    const n = 8000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function ensureCtx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); actx.onstatechange = updateBanner; } catch (e) { return false; }
    }
    if (actx.state === 'suspended' || actx.state === 'interrupted') actx.resume();
    if (!silentEl) {
      try { silentEl = new Audio(silentWavUrl()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); } catch (e) { silentEl = null; }
    }
    if (silentEl && silentEl.paused) silentEl.play().catch(() => {});
    return true;
  }
  function unlockAudio() {
    if (!soundOn) return;
    ensureCtx();
    setTimeout(updateBanner, 300);
  }
  function updateBanner() {
    const b = $('#soundBanner');
    if (!b) return;
    b.style.display = soundOn && (!actx || actx.state !== 'running') ? 'block' : 'none';
  }
  function tone(freq, t0, dur, type, vol) {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    const t = actx.currentTime + t0;
    g.gain.setValueAtTime(Math.min(0.5, (vol || 0.14) * 1.8), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const SFX = {
    dice: () => { for (let i = 0; i < 9; i++) tone(160 + Math.random() * 300, i * 0.1, 0.05, 'square', 0.06); tone(300, 0.95, 0.12, 'triangle', 0.14); },
    hop: () => { tone(420 + Math.random() * 60, 0, 0.06, 'triangle', 0.07); },
    buy: () => { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.28); },
    rent: () => { tone(320, 0, 0.14, 'sawtooth', 0.09); tone(230, 0.12, 0.28, 'sawtooth', 0.09); },
    tax: () => { SFX.rent(); },
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
    event: () => { [392, 523, 659, 523, 784].forEach((f, i) => tone(f, i * 0.11, 0.2, 'square', 0.07)); },
    ace: () => { [1200, 1500, 1800, 2200].forEach((f, i) => tone(f, i * 0.06, 0.12, 'sine', 0.09)); },
    cheat: () => { tone(220, 0, 0.18, 'sawtooth', 0.07); tone(165, 0.16, 0.3, 'sawtooth', 0.07); },
    move: () => { tone(300, 0, 0.12, 'sine', 0.1); tone(600, 0.1, 0.2, 'sine', 0.1); },
    gain: () => { tone(880, 0, 0.08, 'sine', 0.08); tone(1175, 0.07, 0.12, 'sine', 0.08); },
    lose: () => { tone(330, 0, 0.1, 'triangle', 0.08); tone(247, 0.08, 0.14, 'triangle', 0.08); },
  };
  function sfx(kind) { if (soundOn && ensureCtx() && actx.state === 'running' && SFX[kind]) SFX[kind](); }

  // ---------- coriandoli ----------
  const cv = $('#confetti');
  const cx = cv.getContext('2d');
  let parts = [];
  let confettiRun = false;
  function sizeCanvas() { cv.width = innerWidth; cv.height = innerHeight; }
  function burst(x, y, n, spread) {
    const cols = ['#f2b84b', '#e66fb0', '#3fae6a', '#2f87d0', '#e04646', '#fff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (spread || 7) * (0.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, g: 0.22, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 70 + Math.random() * 50 });
    }
    if (!confettiRun) { confettiRun = true; requestAnimationFrame(tick); }
  }
  function rain(ms) {
    const end = Date.now() + ms;
    const iv = setInterval(() => {
      if (Date.now() > end) return clearInterval(iv);
      burst(Math.random() * innerWidth, -10, 6, 3);
    }, 120);
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 20);
    for (const p of parts) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.min(1, p.life / 25);
      cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); cx.restore();
    }
    if (parts.length) requestAnimationFrame(tick); else confettiRun = false;
  }

  // ---------- struttura del tabellone ----------
  function gridPos(i) {
    const N = BOARD.length, bot = GC - 1, left = bot + GR - 1, top = left + GC - 1;
    if (i <= bot) return [GR, GC - i];
    if (i <= left) return [GR - (i - bot), 1];
    if (i <= top) return [1, 1 + (i - left)];
    return [1 + (i - top), GC];
  }
  const sideOf = (i) => {
    const bot = GC - 1, left = bot + GR - 1, top = left + GC - 1;
    if (i === 0 || i === bot || i === left || i === top) return 'corner';
    return i < bot ? 'bottom' : i < left ? 'left' : i < top ? 'top' : 'right';
  };
  function iconOf(sq) {
    return { go: '➡️', jail: '🚔', parking: '🍹', gotojail: '👮', fortuna: '🍀', sorpresa: '🎁', imprevisto: '⚡', tax: '💸', station: '🚆', casino: '🎰', wheel: '🎡', market: '🃏', teleport: '🌀', relax: '🧖', bonus: '🏆' }[sq.type] || sq.icon || '';
  }

  function buildBoard() {
    const sd = $('#side');
    if (sd && sd.parentNode !== $('#app')) $('#app').appendChild(sd); // salva l'elenco giocatrici prima di ricostruire
    const el = $('#board');
    el.innerHTML = '';
    el.style.gridTemplateColumns = `${DEP}fr repeat(${GC - 2}, 1fr) ${DEP}fr`;
    el.style.gridTemplateRows = `${DEP}fr repeat(${GR - 2}, 1fr) ${DEP}fr`;
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
      const BL = { casino: 'tira il dado: vinci o perdi', wheel: 'gira la ruota!', market: 'un asso gratis', teleport: 'sparata altrove', relax: '+€100 ma salti un turno', bonus: '+€100', imprevisto: 'attenta ai guai', fortuna: 'pesca una carta', sorpresa: 'pesca una carta', parking: 'prendi il piatto', jail: 'solo in visita', gotojail: 'dritta in cella' }[sq.type];
      if (BL && !price) price = `<div class="price sub">${BL}</div>`;
      d.innerHTML = `${band}<div class="body"><div class="icon">${iconOf(sq)}</div><div class="name"></div>${price}</div><div class="owner"></div>`;
      el.appendChild(d);
    });
    const c = document.createElement('div');
    c.id = 'center';
    c.style.gridArea = `2 / 2 / ${GR} / ${GC}`;
    c.innerHTML = `
      <div id="cLeft">
        <div id="title">${D.TITLE}</div>
        <div id="subtitle">il gioco delle serate</div>
        <div id="eventBar"></div>
        <div id="turn"></div>
        <div id="hint"></div>
        <div id="diceArea"><div id="dice"></div><div id="diceSum"></div></div>
        <div id="cMain"></div>
        <div id="log"></div>
      </div>
      <div id="cardPop"></div>
      <div id="announce"></div>
      <div id="intro"></div>`;
    el.appendChild(c);
    const layer = document.createElement('div');
    layer.id = 'tokLayer';
    el.appendChild(layer);
  }

  function layout() {
    const w = innerWidth, h = innerHeight;
    const portrait = w < h * 1.25;
    $('#app').classList.toggle('portrait', portrait);
    // tabellone largo: l'elenco delle giocatrici sta dentro al riquadro centrale, così le caselle sono più grandi
    const inside = !portrait && GC >= 18;
    const side = $('#side'), center = $('#center');
    if (side && center) {
      if (inside && side.parentNode !== center) center.insertBefore(side, $('#announce'));
      else if (!inside && side.parentNode !== $('#app')) $('#app').appendChild(side);
    }
    $('#app').classList.toggle('inside', inside);
    const availW = portrait ? w - 8 : inside ? w - 8 : w - 8 - 14 - 230;
    const availH = portrait ? h - (GC > 11 ? 230 : 190) : h - 8;
    const u = Math.max(18, Math.min(availW / (GC - 2 + 2 * DEP + 0.1), availH / (GR - 2 + 2 * DEP + 0.1)));
    const root = document.documentElement.style;
    root.setProperty('--u', u + 'px');
    root.setProperty('--bw', (u * (GC - 2 + 2 * DEP + 0.1)) + 'px');
    root.setProperty('--bh', (u * (GR - 2 + 2 * DEP + 0.1)) + 'px');
    sizeCanvas();
    requestAnimationFrame(() => { if (S) relayoutTokens(true); });
  }

  // ---------- dadi ----------
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(n, cls) {
    let s = `<div class="die ${cls || ''}">`;
    for (let i = 0; i < 9; i++) s += `<i class="${n && PIPS[n].includes(i) ? 'on' : ''}"></i>`;
    return s + '</div>';
  }
  function speedHTML(f, cls) {
    const g = f === 'J' ? '🃏' : f === 'B' ? '🚌' : f;
    return `<div class="die speed ${cls || ''}"><b>${g}</b></div>`;
  }
  const SPEED = [1, 2, 3, 'J', 'B'];
  let diceTimer = null;
  function diceMarkup(d, cls, rnd) {
    const a = rnd ? 1 + Math.floor(Math.random() * 6) : d.d1;
    const b = rnd ? 1 + Math.floor(Math.random() * 6) : d.d2;
    let h = dieHTML(a, cls) + dieHTML(b, cls);
    if (d.d3) h += speedHTML(rnd ? SPEED[Math.floor(Math.random() * 5)] : d.d3, cls);
    return h;
  }
  function sumText(d) {
    const n3 = typeof d.d3 === 'number' ? d.d3 : 0;
    let t = `= ${d.d1 + d.d2 + n3}`;
    if (d.d3 === 'J') t = `= ${d.d1 + d.d2} + Jolly!`;
    if (d.d3 === 'B') t = 'Navetta! 🚌';
    if (d.d1 === d.d2 && d.d1 === n3) t = '✨ TRIS! ✨';
    else if (d.d1 === d.d2) t += '  · doppio!';
    return t;
  }
  function showDice(d, animate) {
    const el = $('#dice'), sum = $('#diceSum');
    clearInterval(diceTimer);
    sum.textContent = '';
    sum.classList.remove('pop');
    if (!d || !d.d1) { el.innerHTML = ''; return; }
    if (!animate) { el.innerHTML = diceMarkup(d); sum.textContent = sumText(d); return; }
    sfx('dice');
    moveAfter = Date.now() + 2300;
    let n = 0;
    el.innerHTML = diceMarkup(d, 'roll', true);
    diceTimer = setInterval(() => {
      n++;
      if (n >= 11) {
        clearInterval(diceTimer);
        el.innerHTML = diceMarkup(d, 'land');
        sum.textContent = sumText(d);
        void sum.offsetWidth; sum.classList.add('pop');
        return;
      }
      el.innerHTML = diceMarkup(d, 'roll', true);
    }, 150);
  }

  // ---------- pedine: livello assoluto, salto casella per casella ----------
  function tokenFor(p) {
    let t = tokenEls[p.id];
    if (!t) {
      t = document.createElement('div');
      t.className = 'tok';
      t.dataset.n = p.name;
      t.style.setProperty('--c', p.color);
      t.innerHTML = `<div class="ti">${p.emoji}</div>`;
      $('#tokLayer').appendChild(t);
      tokenEls[p.id] = t;
    }
    return t;
  }
  function sqCenter(i) {
    const el = $(`.sq[data-i="${i}"]`);
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight };
  }
  function relayoutTokens(instant) {
    if (!S) return;
    const groups = {};
    for (const p of S.players) {
      if (p.bankrupt || shown[p.id] === undefined) continue;
      (groups[shown[p.id]] = groups[shown[p.id]] || []).push(p);
    }
    for (const idx in groups) {
      const list = groups[idx];
      const c = sqCenter(idx);
      const n = list.length;
      const r = Math.min(c.w, c.h) * (n === 1 ? 0 : n === 2 ? 0.24 : 0.3);
      list.forEach((p, k) => {
        const t = tokenFor(p);
        const ang = n === 2 ? (k ? 0 : Math.PI) : (Math.PI * 2 * k) / n - Math.PI / 2;
        const x = c.x + Math.cos(ang) * r, y = c.y + Math.sin(ang) * r - c.h * 0.04;
        t.classList.toggle('small', n > 3);
        if (instant) t.style.transition = 'none';
        t.style.transform = `translate(${x}px, ${y}px)`;
        if (instant) { void t.offsetWidth; t.style.transition = ''; }
      });
    }
  }
  function hop(p) {
    const t = tokenFor(p);
    const ti = $('.ti', t);
    ti.classList.remove('hop'); void ti.offsetWidth; ti.classList.add('hop');
  }
  function flashSquare(i, cls) {
    const el = $(`.sq[data-i="${i}"]`);
    if (!el) return;
    el.classList.remove('pass', 'arrive'); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 900);
  }
  function setShown(p, idx, how) {
    const prev = shown[p.id];
    shown[p.id] = idx;
    relayoutTokens(false);
    if (how === 'step') {
      hop(p); sfx('hop');
      if (idx === 0 && prev !== undefined && prev !== 0) {
        const c = sqCenter(0), r = $('#board').getBoundingClientRect();
        burst(r.left + c.x, r.top + c.y, 26, 6);
      }
    }
    if (how === 'jump') { const t = tokenFor(p); t.classList.remove('tele'); void t.offsetWidth; t.classList.add('tele'); }
  }
  function settled() { return !S || S.players.every((p) => p.bankrupt || shown[p.id] === p.pos); }
  setInterval(() => {
    if (!S || Date.now() < moveAfter) return;
    for (const p of S.players) {
      const t = tokenFor(p);
      t.classList.toggle('out', !!p.bankrupt);
      if (p.bankrupt) continue;
      if (shown[p.id] === undefined) { setShown(p, p.pos, 'init'); continue; }
      const cur = shown[p.id];
      if (cur === p.pos) continue;
      const NN = BOARD.length;
      const f = (p.pos - cur + NN) % NN, b = NN - f;
      if (!p.inJail && f <= 12) { const nx = (cur + 1) % NN; setShown(p, nx, 'step'); flashSquare(nx, nx === p.pos ? 'arrive' : 'pass'); }
      else if (!p.inJail && b <= 3) { const nx = (cur + NN - 1) % NN; setShown(p, nx, 'step'); flashSquare(nx, nx === p.pos ? 'arrive' : 'pass'); }
      else { setShown(p, p.pos, 'jump'); flashSquare(p.pos, 'arrive'); sfx('move'); }
    }
    if (pendingCard && settled()) { const c = pendingCard; pendingCard = null; setTimeout(() => { if (S && S.status === 'playing') showCard(c); }, 350); }
    if (S.status === 'playing') renderSquaresCur();
  }, 420);

  // ---------- annunci a tutto schermo ----------
  const annQ = [];
  let annBusy = false;
  function announce(icon, title, text, cls, amount) { annQ.push({ icon, title, text, cls, amount }); if (!annBusy) runAnn(); }
  async function runAnn() {
    annBusy = true;
    while (annQ.length) {
      const a = annQ.shift();
      const el = $('#announce');
      if (!el) break;
      // aspetta che le pedine siano ferme: l'annuncio arriva quando la pedina è arrivata
      for (let k = 0; k < 40 && !settled(); k++) await wait(200);
      el.className = 'show ' + (a.cls || '');
      el.innerHTML = `<div class="ai">${a.icon}</div><div class="at">${a.title}</div>${a.amount ? `<div class="aamt">${a.amount}</div>` : ''}<div class="ax">${a.text || ''}</div>`;
      sfx(a.cls === 'bad' ? 'lose' : a.cls === 'good' ? 'gain' : 'event');
      await wait(a.cls === 'big' ? 4500 : a.amount ? 4000 : 3200);
      el.className = '';
      await wait(500);
    }
    annBusy = false;
  }

  // ---------- rendering ----------
  const P = (id) => S.players.find((p) => p.id === id);
  const nameOf = (id) => { const p = P(id); return p ? `${p.emoji} ${p.name}` : 'la banca'; };

  function renderSquaresCur() {
    const cur = S.status === 'playing' ? P(S.turn) : null;
    $$('.sq.cur').forEach((el) => { if (!cur || Number(el.dataset.i) !== cur.pos || shown[cur.id] !== cur.pos) el.classList.remove('cur'); });
    if (cur && !cur.bankrupt && shown[cur.id] === cur.pos) $(`.sq[data-i="${cur.pos}"]`).classList.add('cur');
    $$('.tok').forEach((t) => t.classList.remove('mine'));
    if (cur && tokenEls[cur.id]) tokenEls[cur.id].classList.add('mine');
  }

  function renderSquares() {
    const ev = S.event;
    $$('.sq').forEach((el) => {
      const i = Number(el.dataset.i);
      const sq = BOARD[i];
      const nmEl = $('.name', el);
      const label = nm(i);
      if (nmEl.textContent !== label) nmEl.textContent = label;
      el.classList.toggle('festa', !!ev && ev.key === 'festa' && sq.group === ev.group);
      el.classList.toggle('strike', !!ev && ev.key === 'strike' && sq.type === 'station');
      const pr = S.props[i];
      if (!pr) return;
      const own = pr.owner ? P(pr.owner) : null;
      const ob = $('.owner', el);
      ob.classList.toggle('on', !!own);
      el.classList.toggle('owned', !!own);
      el.style.setProperty('--oc', own ? own.color : 'transparent');
      ob.style.background = own ? own.color : '';
      ob.textContent = own ? own.emoji : '';
      const key = own ? own.id : '';
      if (lastOwner[i] !== undefined && lastOwner[i] !== key && own) {
        ob.classList.remove('stamp'); void ob.offsetWidth; ob.classList.add('stamp');
      }
      lastOwner[i] = key;
      el.classList.toggle('mort', !!pr.mortgaged);
      const h = $('.houses', el);
      if (h) {
        const html = pr.houses === 6 ? '<span class="h mon">🗽</span>' : pr.houses === 5 ? '<span class="h hotel"></span>' : '<span class="h"></span>'.repeat(pr.houses);
        if (h.innerHTML !== html) { h.innerHTML = html; h.classList.remove('built'); void h.offsetWidth; h.classList.add('built'); }
      }
    });
    renderSquaresCur();
  }

  function animateCash(el, id, target) {
    const from = cashShown[id] === undefined ? target : cashShown[id];
    cashShown[id] = target;
    if (from === target) { el.textContent = eur(target); return; }
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = eur(v);
      if (k < 1 && cashShown[id] === target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderPlayers() {
    const el = $('#players');
    const ids = S.players.map((p) => p.id);
    $$('.pl', el).forEach((c) => { if (!ids.includes(c.dataset.id)) c.remove(); });
    S.players.forEach((p, k) => {
      let c = $(`.pl[data-id="${p.id}"]`, el);
      if (!c) {
        c = document.createElement('div');
        c.dataset.id = p.id;
        c.innerHTML = `<div class="tk"></div><div class="info"><div class="nm"></div><div class="cash"></div><div class="pips"></div></div><div class="badge"></div>`;
        el.appendChild(c);
      }
      if (el.children[k] !== c) el.insertBefore(c, el.children[k]);
      c.className = `pl${S.turn === p.id && S.status === 'playing' ? ' turn' : ''}${p.bankrupt ? ' out' : ''}${p.connected ? '' : ' off'}`;
      c.style.setProperty('--c', p.color);
      $('.tk', c).textContent = p.emoji;
      $('.nm', c).textContent = p.name;
      const cashEl = $('.cash', c);
      const cards = p.jailCards ? ' 🎫'.repeat(p.jailCards) : '';
      let cashBox = $('.amt', cashEl);
      if (!cashBox) { cashEl.innerHTML = '<span class="amt"></span><span class="xtra"></span>'; cashBox = $('.amt', cashEl); }
      if (p.cash !== null) animateCash(cashBox, p.id, p.cash); else cashBox.textContent = '€ ···';
      $('.xtra', cashEl).textContent = cards;
      const mine = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === p.id);
      $('.pips', c).innerHTML = mine.map((i) => {
        const sq = BOARD[i];
        const col = sq.type === 'street' ? D.GROUP_COLORS[sq.group] : sq.type === 'station' ? '#445066' : '#9aa7b8';
        return `<span class="pip${S.props[i].mortgaged ? ' m' : ''}" style="background:${col}"></span>`;
      }).join('');
      const bits = [];
      if (p.bankrupt) bits.push('💀'); else if (p.inJail) bits.push('🚔');
      if (S.bankerId === p.id) bits.push('🏦');
      if (S.bountyId === p.id) bits.push('💰');
      if (S.teamsOn && p.team != null) bits.push(['🟥', '🟦', '🟩', '🟨'][p.team] || '');
      if (p.missionsDone) bits.push('🎯' + p.missionsDone);
      if (p.shield) bits.push('🛡️');
      if (p.x2) bits.push('✖️2');
      if (p.skip) bits.push('⏭️');
      if (p.aceCount) bits.push('🃏' + p.aceCount);
      $('.badge', c).textContent = bits.join(' ');
    });
  }

  function floatMoney(f) {
    const c = $(`.pl[data-id="${f.pid}"]`);
    if (!c) return;
    const s = document.createElement('div');
    s.className = 'float ' + (f.d > 0 ? 'up' : 'down');
    s.textContent = (f.d > 0 ? '+' : '−') + eur(Math.abs(f.d));
    c.appendChild(s);
    setTimeout(() => s.remove(), 2200);
    // anche sopra la pedina
    const t = tokenEls[f.pid];
    if (t) {
      const s2 = document.createElement('div');
      s2.className = 'float2 ' + (f.d > 0 ? 'up' : 'down');
      s2.textContent = s.textContent;
      t.appendChild(s2);
      setTimeout(() => s2.remove(), 2000);
    }
    sfx(f.d > 0 ? 'gain' : 'lose');
  }

  function textOn(color) { return ['#f4d93b', '#8fd3f4'].includes(color) ? '#222' : '#fff'; }
  function deedHTML(idx, extra) {
    const sq = BOARD[idx];
    let head = '', rows = '';
    if (sq.type === 'street') {
      const col = D.GROUP_COLORS[sq.group];
      head = `<div class="dh" style="background:${col};color:${textOn(col)}">${nm(idx)}</div>`;
      rows = `<tr><td>Affitto</td><td>${eur(sq.rent[0])}</td></tr><tr><td>Colore completo</td><td>${eur(sq.rent[0] * 2)}</td></tr>`
        + [1, 2, 3, 4].map((n) => `<tr><td>Con ${n} cas${n === 1 ? 'a' : 'e'}</td><td>${eur(sq.rent[n])}</td></tr>`).join('')
        + `<tr><td>Albergo</td><td>${eur(sq.rent[5])}</td></tr><tr><td>🗽 Monumento</td><td>${eur(Math.round(sq.rent[5] * 1.6 / 10) * 10)}</td></tr><tr><td>Costruzione</td><td>${eur(sq.houseCost)}</td></tr>`;
    } else if (sq.type === 'station') {
      head = `<div class="dh" style="background:#445066;color:#fff">🚆 ${nm(idx)}</div>`;
      rows = [1, 2, 3, 4, 5, 6].filter((n) => n <= BOARD.filter((q) => q.type === 'station').length).map((n) => `<tr><td>${n} stazion${n === 1 ? 'e' : 'i'}</td><td>${eur(25 * Math.pow(2, n - 1))}</td></tr>`).join('');
    } else {
      head = `<div class="dh" style="background:#9aa7b8;color:#fff">${sq.icon || ''} ${nm(idx)}</div>`;
      rows = '<tr><td>1 società</td><td>4× dadi</td></tr><tr><td>2 società</td><td>10× dadi</td></tr>';
    }
    const price = S.buy && S.buy.idx === idx ? S.buy.price : sq.price;
    const sale = price !== sq.price ? ` <s style="opacity:.5;font-size:.7em">${eur(sq.price)}</s>` : '';
    return `<div class="deed">${head}<div class="dp">${eur(price)}${sale}</div><table>${rows}</table>${extra || ''}</div>`;
  }

  // tocca una casella sul tabellone: la scheda compare al centro per qualche secondo
  let inspect = null, inspectTimer = null;
  const SQINFO = {
    go: 'Ogni volta che passi dalla Partenza ricevi €200.',
    jail: 'Se ci arrivi dal percorso sei solo in visita. Se ci vai davvero: tira doppio, paga €50 o usa la carta per uscire.',
    gotojail: 'Chi ci finisce va dritta in prigione, senza passare dalla Partenza.',
    parking: 'Con il Piatto dell\'aperitivo attivo: chi si ferma qui prende tutti i soldi di tasse e multe.',
    fortuna: 'Pesca una carta Fortuna: di solito va bene… di solito.',
    sorpresa: 'Pesca una carta Sorpresa: può dare soldi, spostarti o altro.',
    imprevisto: 'Pesca un Imprevisto: quasi sempre un guaio (danni, multe, turni persi).',
    tax: 'Paghi la cifra indicata alla banca (o al piatto dell\'aperitivo).',
    casino: 'Tira un dado: 1 perdi €150, 2 perdi €50, 3 niente, 4 vinci €50, 5 vinci €150, 6 vinci €300.',
    wheel: 'La ruota decide: soldi, un asso, uno scudo… oppure guai (-€100, turno saltato, teletrasporto).',
    market: 'Prendi un asso nella manica gratis (se gli assi sono spenti: €50).',
    teleport: 'Vieni teletrasportata in una casella a caso. Che faccia tosta!',
    relax: 'Incassi €100 ma salti il prossimo turno.',
    bonus: 'Premio di città: incassi €100.',
  };
  function squareInfoHTML(i) {
    const sq = BOARD[i], pr = S.props[i];
    const close = '<div class="ihint">(tocca un\'altra casella o aspetta)</div>';
    if (pr) {
      const own = pr.owner ? P(pr.owner) : null;
      const line = own ? `<div class="iown">${own.emoji} Di ${own.name}${pr.mortgaged ? ' · ipotecata' : pr.houses ? ` · ${pr.houses >= 6 ? '🗽 Monumento' : pr.houses === 5 ? '🏨 albergo' : pr.houses + ' cas' + (pr.houses === 1 ? 'a' : 'e')}` : ''}</div>` : '<div class="iown">Libera: chi ci arriva può comprarla</div>';
      return `<div class="mainRow">${deedHTML(i)}<div class="auctionBox">${line}${close}</div></div>`;
    }
    return `<div class="auctionBox"><div class="big">${iconOf(sq)}</div><div style="font-size:1.5em;font-weight:800">${nm(i)}</div><div style="max-width:24em;margin-top:.3em">${SQINFO[sq.type] || ''}</div>${close}</div>`;
  }
  function hintFor() {
    const cur = P(S.turn);
    if (!cur) return '';
    switch (S.phase) {
      case 'roll': return cur.inJail ? 'è in prigione: tira per fare doppio, paga €50 o usa la carta' : (S.doubles ? 'Doppio! Tira ancora' : 'tocca a te: tira i dadi');
      case 'choose': return S.choice && S.choice.kind === 'tris' ? 'TRIS! sceglie dove andare' : 'sceglie con quale dado muoversi';
      case 'buy': return `è su ${nm(cur.pos)}: compra o va all'asta`;
      case 'auction': return 'Asta in corso';
      case 'action': return S.canRollAgain && !cur.inJail ? 'può costruire e scambiare, poi tira ancora (doppio!)' : 'può costruire, scambiare e finire il turno';
      case 'debt': return 'deve raccogliere dei soldi';
      case 'claim': return 'la proprietà è libera: chi la vuole? (a prezzo di listino)';
      case 'dare': return 'deve fare la sfida davanti a tutte!';
      default: return '';
    }
  }

  const THEME_KEYS = Object.keys(D.THEMES);
  function chip(label, attrs, on) {
    return `<button class="chip btn${on === true ? ' on' : ''}" ${attrs}>${label}</button>`;
  }
  function fmtLeft(ms) { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  setInterval(() => { document.querySelectorAll('.cd').forEach((el) => { el.textContent = fmtLeft(Number(el.dataset.end) - Date.now()); }); }, 1000);
  function renderCenter() {
    const turn = $('#turn'), hint = $('#hint'), main = $('#cMain');
    $('#title').textContent = S.title || D.TITLE;
    if (S.status === 'playing' && S.late) { $('#subtitle').textContent = '🔥 FASE FINALE: tasse doppie, niente dado matto'; $('#subtitle').style.color = '#ff8a8a'; } else $('#subtitle').style.color = '';
    if (!(S.status === 'playing' && S.late) && S.status === 'playing' && S.endsAt) $('#subtitle').innerHTML = `⏰ <b class="cd" data-end="${S.endsAt}">${fmtLeft(S.endsAt - Date.now())}</b> alla fine${S.settings.maxRounds ? ` · giro ${Math.min(S.round + 1, S.settings.maxRounds)} di ${S.settings.maxRounds}` : ''}`;
    else if (!(S.status === 'playing' && S.late)) $('#subtitle').textContent = S.status === 'playing' && S.settings.maxRounds ? `giro ${Math.min(S.round + 1, S.settings.maxRounds)} di ${S.settings.maxRounds}` : 'il gioco delle serate';
    const heatT = S.status === 'playing' && D.HEAT[S.heat || 2] ? ` · ${D.HEAT[S.heat || 2].icon} ${D.HEAT[S.heat || 2].name}` : '';
    if (S.status === 'playing' && !S.late) $('#subtitle').innerHTML += heatT;
    const eb = $('#eventBar');
    if (S.status === 'playing' && S.event) {
      eb.innerHTML = `<span class="ev">${S.event.icon} <b>${S.event.title}</b> · ${S.event.text}</span>`;
      eb.style.display = '';
    } else { eb.innerHTML = ''; eb.style.display = 'none'; }
    if (S.status === 'lobby') {
      turn.textContent = 'Si entra in partita!';
      hint.textContent = 'Ogni giocatrice scansiona il QR con il telefono';
      const url = joinUrl();
      let qrSvg = '';
      try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qrSvg = q.createSvgTag(4, 0); } catch (e) { qrSvg = ''; }
      const players = S.players.map((p) => `<div class="lp" style="--c:${p.color}"><span class="tk">${p.emoji}</span>${p.name}${p.id === S.hostId ? ' ⭐' : ''}</div>`).join('');
      const st = S.settings;
      const T = D.THEMES[st.theme] || D.THEMES.italia;
      const FEAT = ['speedDie', 'aces', 'events', 'missions', 'bounty', 'dares', 'cheat', 'freeParking', 'auctions', 'freeBuy'];
      const tally = (k) => { const R = D.RULES[k], t = (S.votes || {})[k] || { yes: 0, no: 0 }; const on = !!st[k]; return `<div class="vcell ${on ? 'on' : ''}"><span class="vi">${R.icon}</span><b>${R.title}</b><span class="vn">👍 ${t.yes} · 👎 ${t.no}</span><span class="vs">${on ? '✅ attiva' : '⬜ spenta'}</span></div>`; };
      const ARLAB = (v) => (v ? 'dal giro ' + v : 'subito');
      const TLAB = { 0: 'senza timer', 30: '30 minuti', 45: '45 minuti', 60: '1 ora', 90: '1 ora e mezza' };
      const TEAMICON = ['🟥', '🟦', '🟩', '🟨'];
      const DUR = { 0: 'senza limite', 20: '20 giri', 30: '30 giri', 50: '50 giri' };
      main.innerHTML = `
        <div class="lobbyBox"><div id="qr">${qrSvg}</div>
          <div class="joinTxt">Oppure apri sul telefono:<br><b>${url.replace(/^https?:\/\//, '')}</b><div class="votehint">🗳️ Ognuna vota le regole dal telefono: vince la maggioranza</div></div></div>
        <div class="vgrid">${FEAT.map(tally).join('')}</div>
        <div class="chips grid2">
          ${chip(`💰 Via con ${eur(st.startCash)}`, 'data-set="startCash"')}${chip(T.label, 'data-set="theme"')}${chip(`⏱️ ${DUR[st.maxRounds]}`, 'data-set="maxRounds"')}${chip(`🔨 Aste ${ARLAB(st.auctionRound)}`, 'data-set="auctionRound"')}${chip(`⏰ ${TLAB[st.timeLimit || 0]}`, 'data-set="timeLimit"')}${chip(`🗺️ ${st.boardSize === 40 ? 'Classico 40' : 'Lungo 60'}`, 'data-set="boardSize"')}${chip(`${D.HEAT[st.mean || 2].icon} Cattiveria: ${D.HEAT[st.mean || 2].name}`, 'data-set="mean"')}${chip('📈 Sale col tempo' + (st.meanRise ? ' ✓' : ''), 'data-set="meanRise"')}${chip(`🏁 ${st.winWorth ? 'Vince chi arriva a ' + eur(st.winWorth) : 'Nessun traguardo'}`, 'data-set="winWorth"')}
        </div>
        ${persistWarn()}
        <div class="lobbyPlayers">${players || '<span style="opacity:.6;font-size:1.2em">Nessuna giocatrice ancora…</span>'}</div>
        <button class="startBtn" id="btnStart" ${S.players.length < 2 ? 'disabled' : ''}>Inizia la partita</button>`;
      return;
    }
    if (S.status === 'ended') {
      $('#cardPop').classList.remove('show');
      $('#dice').innerHTML = ''; $('#diceSum').textContent = '';
      turn.textContent = '';
      hint.textContent = '';
      const ws = (S.winners && S.winners.length ? S.winners : [S.winner]).map(P).filter(Boolean);
      const w = ws.length ? { emoji: ws.map((x) => x.emoji).join(' '), name: ws.map((x) => x.name).join(' + ') } : null;
      const rk = (S.ranking || []).map((r, i) => { const p = P(r.id); return `<li>${i + 1}. ${p.emoji} ${p.name} — ${eur(r.worth)}</li>`; }).join('');
      main.innerHTML = `<div class="podium"><div class="trophy">🏆</div><div class="w">${w ? w.emoji + ' ' + w.name : ''}</div><div>${ws.length > 1 ? 'hanno vinto!' : 'ha vinto!'}</div><ol>${rk}</ol></div>`;
      return;
    }
    const cur = P(S.turn);
    turn.innerHTML = `<span style="color:var(--gold)">${cur.emoji} ${cur.name}</span>`;
    hint.textContent = hintFor() + (S.payoutCount ? '  ·  🏦 il banchiere sta contando i soldi…' : '');
    let html = '';
    if (S.phase === 'buy') {
      html = deedHTML(S.buy.idx);
    } else if (S.phase === 'auction' && S.auction) {
      const a = S.auction;
      const chips = S.players.filter((p) => !p.bankrupt).map((p) => `<span class="chip${a.active.includes(p.id) ? '' : ' off'}">${p.emoji} ${p.name}</span>`).join('');
      html = `<div class="mainRow">${deedHTML(a.idx)}<div class="auctionBox"><div>🔨 Offerta più alta</div><div class="big">${eur(a.high)}</div><div>${a.bidder ? nameOf(a.bidder) : 'nessuna offerta'}</div><div class="chips">${chips}</div></div></div>`;
    } else if (S.phase === 'sale' && S.sale) {
      const sl = S.sale;
      html = `<div class="mainRow">${deedHTML(sl.idx)}<div class="auctionBox"><div>🤝 ${nameOf(sl.from)} offre a</div><div style="font-size:1.6em;font-weight:800">${nameOf(sl.to)}</div><div class="big">${eur(sl.price)}</div><div>aspetta la risposta…</div></div></div>`;
    } else if (S.phase === 'debt' && S.debts.length) {
      const d = S.debts[0];
      html = `<div class="auctionBox"><div style="font-size:1.4em">💸 ${nameOf(d.pid)} deve</div><div class="big">${eur(d.amount)}</div><div>a ${nameOf(d.creditor)} · ${d.reason}</div></div>`;
    } else if (S.phase === 'claim' && S.claim) {
      const c = S.claim;
      html = `<div class="mainRow">${deedHTML(c.idx)}<div class="auctionBox"><div style="font-size:1.3em">🙋 Chi la vuole?</div><div class="big">${eur(c.price)}</div><div>${nameOf(c.from)} non la compra: prezzo di listino, a lei il 10%</div>${(c.claimed || []).length ? `<div style="margin-top:6px">🙋 La vogliono: <b>${c.claimed.map(nameOf).join(', ')}</b>${c.claimed.length > 1 ? ' → asta!' : ''}</div>` : '<div style="margin-top:6px">Se la vogliono in due, si fa l\'asta</div>'}</div></div>`;
    } else if (S.phase === 'dare' && S.dare) {
      html = `<div class="auctionBox"><div style="font-size:1.4em">${S.dare.lampo ? '⚡ SFIDA LAMPO!' : '🎭 SFIDA!'}</div><div style="font-size:1.5em;font-weight:800;margin:6px 0">${nameOf(S.dare.pid)} ${S.dare.text}</div><div>Fatta: <b>+€${S.dare.win || 100}</b> · Rifiutata: <b>−€${S.dare.lose || 50}</b></div></div>`;
    } else if (S.phase === 'choose' && S.choice) {
      html = S.choice.kind === 'tris'
        ? '<div class="auctionBox"><div class="big">✨ TRIS ✨</div><div>può volare in qualsiasi casella</div></div>'
        : `<div class="auctionBox"><div class="big">🚌</div><div>Navetta: ${S.choice.d1}, ${S.choice.d2} o ${S.choice.d1 + S.choice.d2}?</div></div>`;
    } else if (S.pot) {
      html = `<div class="chip">🍹 Piatto della Pausa Aperitivo: ${eur(S.pot)}</div>`;
    }
    if (inspect && Date.now() < inspect.until && !['buy', 'auction', 'sale', 'debt', 'choose', 'dare', 'claim'].includes(S.phase)) html = squareInfoHTML(inspect.i);
    main.innerHTML = html;
  }

  function persistWarn() {
    const remoteHost = location.hostname && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (info && remoteHost && info.persist === 'file') return '<div class="pwarn">⚠️ Salvataggio temporaneo: se il server si riavvia la partita si perde. Collega il salvataggio sicuro (vedi LEGGIMI).</div>';
    if (info && info.persist === 'cloud-error') return '<div class="pwarn">⚠️ Il salvataggio sicuro non risponde.</div>';
    return info && info.persist === 'cloud' ? '<div class="pok">💾 Salvataggio sicuro attivo</div>' : '';
  }
  function renderLog() {
    $('#log').innerHTML = S.log.slice(-4).map((l) => `<div>${l.text}</div>`).join('');
  }

  let cardTimer = null;
  function showCard(c) {
    const el = $('#cardPop');
    const p = P(c.pid);
    el.style.setProperty('--cc', c.deck === 'fortuna' ? '#f59a3b' : c.deck === 'imprevisto' ? '#d8334a' : '#2f87d0');
    el.innerHTML = `<small>${c.deck === 'fortuna' ? 'Fortuna' : c.deck === 'imprevisto' ? 'Imprevisto' : 'Sorpresa'} · ${p ? p.name : ''}</small>${c.text}`;
    el.classList.add('show');
    sfx('card');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => el.classList.remove('show'), 7500);
  }

  function joinUrl() {
    const h = location.hostname;
    if (h && h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]') return `${location.protocol}//${location.host}/play`;
    if (info && info.addresses && info.addresses.length) return `http://${info.addresses[0]}:${info.port}/play`;
    return `${location.origin}/play`;
  }

  function render() {
    $('#app').classList.toggle('lobby', S.status === 'lobby');
    renderSquares();
    renderPlayers();
    renderCenter();
    renderLog();
  }

  // quali righe di registro meritano un annuncio grande
  const euroIn = (t) => { const m = /€\s?(\d+)/.exec(t || ''); return m ? '€' + m[1] : ''; };
  const plain = (t) => String(t || '').replace(/^[^\p{L}\p{N}€]+/u, '');
  function announceFrom(s, fresh) {
    for (const l of fresh) {
      if (l.kind === 'event' && s.event && s.event.seq !== lastEventSeq) {
        lastEventSeq = s.event.seq;
        announce(s.event.icon, s.event.title, s.event.text, 'big');
      } else if (l.kind === 'rent') announce('💸', 'Affitto da pagare', plain(l.text), 'bad', euroIn(l.text));
      else if (l.kind === 'tax') announce('🧾', 'Tassa / multa', plain(l.text), 'bad', euroIn(l.text));
      else if (l.kind === 'go') announce(/d'oro/.test(l.text) ? '🎰' : '➡️', /d'oro/.test(l.text) ? 'PARTENZA D\'ORO: DOPPIO!' : /piatto/.test(l.text) ? 'Piatto dell\'aperitivo!' : 'Partenza!', plain(l.text), /d'oro/.test(l.text) ? 'big' : 'good', euroIn(l.text));
      else if (l.kind === 'pay' && /€/.test(l.text)) announce('💶', 'Pagamento', plain(l.text), 'bad', euroIn(l.text));
      else if (l.kind === 'land' && /oggi niente affitto/.test(l.text)) announce('🚧', 'Niente affitto oggi!', plain(l.text), 'big');
      else if (l.kind === 'mission') announce('🎯', 'Missione compiuta!', plain(l.text), 'big', euroIn(l.text));
      else if (l.kind === 'dare') announce('🎭', /rifiuta/.test(l.text) ? 'Sfida rifiutata' : 'Sfida superata!', plain(l.text), /rifiuta/.test(l.text) ? 'bad' : 'good', euroIn(l.text));
      else if (l.kind === 'sale') announce('🤝', 'Offerta diretta', plain(l.text), '', euroIn(l.text));
      else if (l.kind === 'dice' && /TRIS/.test(l.text)) announce('✨', 'TRIS!', 'vai dove vuoi', 'big');
      else if (l.kind === 'dice' && /navetta/.test(l.text)) announce('🚌', 'Navetta!', 'scegli il dado');
      else if (l.kind === 'move' && /Jolly/.test(l.text)) announce('🃏', 'Jolly!', plain(l.text));
      else if (l.kind === 'move' && /scambiano/.test(l.text)) announce('🔀', 'Si cambia posto!', plain(l.text));
      else if (l.kind === 'ace') announce('🃏', 'Asso nella manica', plain(l.text), /scudo/i.test(l.text) ? 'good' : '');
      else if (l.kind === 'cheat') announce('🕵️', 'Furbetti!', plain(l.text), 'big', euroIn(l.text));
      else if (l.kind === 'jail' && /va in prigione|tre doppi/.test(l.text)) announce('🚔', 'In prigione!', plain(l.text), 'bad');
      else if (l.kind === 'bankrupt') announce('💀', 'Fuori dal gioco', plain(l.text), 'bad');
    }
  }
  // avvisi delle caselle speciali (casinò, ruota, relax, monumento…)
  let lastNoticeSeq = 0;
  function showNotice(n) {
    if (!n || n.seq === lastNoticeSeq) return;
    lastNoticeSeq = n.seq;
    announce(n.icon, n.title, n.text, n.tone === 'bad' ? 'bad' : n.tone === 'good' ? 'good' : 'big');
  }

  // ripasso delle regole a inizio partita
  let introFor = null, introTimer = null;
  function showIntro() {
    const st = S.settings;
    const on = ['speedDie', 'aces', 'events', 'cheat', 'freeParking', 'auctions', 'freeBuy'].filter((k) => st[k]);
    const el = $('#intro');
    if (!el) return;
    el.innerHTML = `<div class="ibox"><h2>🎲 Come si gioca</h2><ol class="ibasic">${D.BASICS.slice(0, 5).map((x) => `<li>${x.replace(/^\S+\s/, '')}</li>`).join('')}</ol><h2>🎉 Le regole di stasera</h2>
      <div class="igrid">${on.length ? on.map((k) => `<div class="icell"><b>${D.RULES[k].icon} ${D.RULES[k].title}</b><span>${D.RULES[k].long.join(' ')}</span></div>`).join('') : '<div class="icell"><b>📜 Regole classiche</b><span>Niente novità: Monopoly come sempre.</span></div>'}</div>
      <div class="ifoot">${st.maxRounds ? `⏱️ Si gioca ${st.maxRounds} giri: vince chi ha più patrimonio. ` : ''}Dal telefono, il tasto ❓ spiega tutto. <i>(tocca per iniziare)</i></div></div>`;
    el.classList.add('show');
    clearTimeout(introTimer);
    introTimer = setTimeout(() => el.classList.remove('show'), 25000);
  }
  function onState(s) {
    const firstTime = S === null;
    const prevStatus = S ? S.status : null;
    S = s;
    if (firstTime || s.size !== curSize) {
      curSize = s.size || 40;
      const bd = D.BOARDS[curSize] || D.BOARDS[40];
      BOARD = bd.squares; GC = bd.cols; GR = bd.rows;
      for (const k in tokenEls) { tokenEls[k].remove(); delete tokenEls[k]; }
      for (const k in shown) delete shown[k];
      for (const k in lastOwner) delete lastOwner[k];
      buildBoard();
      layout();
    }
    if (firstTime) {
      lastDiceSeq = s.dice.seq;
      lastCardSeq = s.card ? s.card.seq : 0;
      lastLogId = s.log.length ? s.log[s.log.length - 1].id : 0;
      lastFxId = s.fx && s.fx.length ? s.fx[s.fx.length - 1].id : 0;
      lastEventSeq = s.event ? s.event.seq : 0;
      showDice(s.dice, false);
    }
    // nuovi lanci di dadi
    const justRolled = s.dice.seq !== lastDiceSeq;
    const lag = justRolled ? 2200 : 250;
    if (s.dice.seq !== lastDiceSeq) { lastDiceSeq = s.dice.seq; showDice(s.dice, true); const it = $('#intro'); if (it) it.classList.remove('show'); }
    // nuova carta: compare quando le pedine sono arrivate
    if (s.card && s.card.seq !== lastCardSeq) { lastCardSeq = s.card.seq; pendingCard = s.card; }
    if (firstTime) lastNoticeSeq = s.notice ? s.notice.seq : 0;
    else if (s.notice && s.notice.seq !== lastNoticeSeq) setTimeout(() => { if (S) showNotice(S.notice); }, justRolled ? 1200 : 150);
    // novità del registro: suoni e annunci
    const fresh = s.log.filter((l) => l.id > lastLogId);
    if (fresh.length) {
      lastLogId = fresh[fresh.length - 1].id;
      const kinds = [...new Set(fresh.map((l) => l.kind))].filter((k) => !['dice', 'event', 'card', 'move', 'ace', 'cheat', 'rent', 'tax', 'go', 'pay', 'jail', 'bankrupt', 'notice', 'land'].includes(k)).slice(0, 3);
      kinds.forEach((k, i) => setTimeout(() => sfx(k), lag + 200 + i * 600));
      if (!firstTime) setTimeout(() => announceFrom(S, fresh), lag);
    }
    // soldi che volano
    const fx = (s.fx || []).filter((f) => f.id > lastFxId);
    if (fx.length) {
      lastFxId = fx[fx.length - 1].id;
      if (!firstTime) fx.forEach((f, i) => setTimeout(() => floatMoney(f), lag + 200 + i * 350));
    }
    if (s.status === 'playing' && s.gameId && introFor !== s.gameId) { introFor = s.gameId; if (!firstTime || s.turnCount === 0) showIntro(); }
    if (prevStatus && prevStatus !== 'playing' && s.status === 'playing') { sfx('start'); burst(innerWidth / 2, innerHeight / 3, 60, 8); }
    if (prevStatus === 'playing' && s.status === 'ended') { sfx('win'); rain(5000); }
    render();
  }

  // ---------- eventi dell'interfaccia ----------
  document.addEventListener('click', (e) => {
    const sqEl = e.target.closest && e.target.closest('.sq');
    if (!sqEl || !S || S.status !== 'playing') return;
    inspect = { i: Number(sqEl.dataset.i), until: Date.now() + 9000 };
    clearTimeout(inspectTimer);
    inspectTimer = setTimeout(() => { inspect = null; if (S) renderCenter(); }, 9100);
    renderCenter();
  });
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#intro')) { $('#intro').classList.remove('show'); return; }
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'btnStart') { const r = await post('/api/board', { type: 'start' }); if (!r.ok) alert(r.error); }
    if (t.dataset.preset) post('/api/board', { type: 'settings', preset: t.dataset.preset });
    if (t.dataset.set && S) {
      const k = t.dataset.set;
      if (k === 'winWorth') { const o = [0, 3000, 5000, 8000]; post('/api/board', { type: 'settings', winWorth: o[(o.indexOf(S.settings.winWorth) + 1) % o.length] }); }
      else if (k === 'boardSize') post('/api/board', { type: 'settings', boardSize: S.settings.boardSize === 40 ? 60 : 40 });
      else if (k === 'startCash') { const opts = [1000, 1500, 2000, 3000]; post('/api/board', { type: 'settings', startCash: opts[(opts.indexOf(S.settings.startCash) + 1) % opts.length] }); }
      else if (k === 'maxRounds') { const o = [0, 20, 30, 50]; post('/api/board', { type: 'settings', maxRounds: o[(o.indexOf(S.settings.maxRounds) + 1) % o.length] }); }
      else if (k === 'auctionRound') { const o = [0, 4, 6, 10, 15]; post('/api/board', { type: 'settings', auctionRound: o[(o.indexOf(S.settings.auctionRound) + 1) % o.length] }); }
      else if (k === 'timeLimit') { const o = [0, 30, 45, 60, 90]; post('/api/board', { type: 'settings', timeLimit: o[(o.indexOf(S.settings.timeLimit || 0) + 1) % o.length] }); }
      else if (k === 'mean') post('/api/board', { type: 'settings', mean: (S.settings.mean || 2) % 3 + 1 });
      else if (k === 'theme') post('/api/board', { type: 'settings', theme: THEME_KEYS[(THEME_KEYS.indexOf(S.settings.theme) + 1) % THEME_KEYS.length] });
      else post('/api/board', { type: 'settings', [k]: !S.settings[k] });
    }
  });
  $('#btnSound').addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('dv_sound', soundOn ? '1' : '0');
    if (soundOn) { ensureCtx(); setTimeout(() => { if (actx && actx.state === 'running') SFX.go(); updateBanner(); }, 200); } else updateBanner();
    updateSoundBtn();
  });
  function updateSoundBtn() { $('#btnSound').textContent = soundOn ? '🔊 Suoni attivi' : '🔇 Attiva suoni'; updateBanner(); }
  updateSoundBtn();
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) unlockAudio(); });
  setInterval(updateBanner, 1500);
  $('#soundBanner').addEventListener('click', () => { ensureCtx(); setTimeout(() => { updateBanner(); if (actx && actx.state === 'running') SFX.go(); }, 250); });
  const fsEl = document.documentElement;
  if (!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen)) $('#btnFull').style.display = 'none';
  $('#btnFull').addEventListener('click', () => { (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl); });
  $('#btnMenu').addEventListener('click', () => {
    const box = $('#mDrop'); box.textContent = '';
    if (S && S.status === 'playing') {
      for (const p of S.players.filter((q) => !q.bankrupt)) {
        const bt = document.createElement('button');
        bt.className = 'big ghost'; bt.textContent = `🚪 Fai uscire ${p.emoji} ${p.name}${p.connected ? '' : ' (scollegata)'}`;
        bt.addEventListener('click', async () => {
          if (!confirm(`${p.name} esce dal gioco e perde tutto. Confermi?`)) return;
          const r = await post('/api/board', { type: 'dropPlayer', id: p.id }); if (!r.ok) alert(r.error);
          $('#menu').classList.add('hidden');
        });
        box.append(bt);
      }
    }
    $('#menu').classList.remove('hidden');
  });
  $('#mSkip').addEventListener('click', async () => {
    const r = await post('/api/board', { type: 'forceNext' }); if (!r.ok) alert(r.error);
    $('#menu').classList.add('hidden');
  });
  $('#mHeat').addEventListener('click', async () => {
    const r = await post('/api/board', { type: 'heatUp' }); if (!r.ok) alert(r.error);
    $('#menu').classList.add('hidden');
  });
  $('#mClose').addEventListener('click', () => $('#menu').classList.add('hidden'));
  $('#mEnd').addEventListener('click', async () => {
    if (!confirm('Terminare la partita adesso? Vince chi ha il patrimonio più alto.')) return;
    const r = await post('/api/board', { type: 'endgame' }); if (!r.ok) alert(r.error);
    $('#menu').classList.add('hidden');
  });
  $('#mAuction').addEventListener('click', async () => { await post('/api/board', { type: 'endAuction' }); $('#menu').classList.add('hidden'); });
  $('#mReset').addEventListener('click', async () => {
    if (!confirm('Cancellare la partita e ricominciare da zero? Si perdono tutti i progressi!')) return;
    if (!confirm('Sei SICURA? Non si può annullare.')) return;
    await post('/api/board', { type: 'reset' });
    $('#menu').classList.add('hidden');
    S = null;
    [shown, lastOwner, cashShown].forEach((o) => Object.keys(o).forEach((k) => delete o[k]));
    Object.keys(tokenEls).forEach((k) => { tokenEls[k].remove(); delete tokenEls[k]; });
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
