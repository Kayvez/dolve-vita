'use strict';
// Piccoli strumenti grafici condivisi da tabellone e telefoni.
(function () {
  const D = window.CDATA;
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };

  // --- ritratti disegnati (SVG, viewBox 64), stile illustrato "adulto" ---
  const faceShape = 'M32 15C41 15 45.5 22 45.5 30.5C45.5 39 39 46.5 32 46.5C25 46.5 18.5 39 18.5 30.5C18.5 22 23 15 32 15Z';
  const face = (o) => {
    o = o || {};
    const sk = o.skin || '#f2cba7', sh = o.shade || '#c98f66', br = o.brow || '#4a3428', lv = o.level || 0, eye = o.eye || '#4a3322';
    let s = `<path d="${faceShape}" fill="${sk}"/>`;
    s += `<path d="M32 15C41 15 45.5 22 45.5 30.5C45.5 39 39 46.5 32 46.5C37.5 42 40.5 36 39.5 29C38.5 22 36.5 17 32 15Z" fill="${sh}" opacity=".26"/>`;
    s += `<ellipse cx="23.5" cy="35.5" rx="3" ry="2.2" fill="#e8847a" opacity="${o.cheek == null ? 0.22 : o.cheek}"/><ellipse cx="40.5" cy="35.5" rx="3" ry="2.2" fill="#e8847a" opacity="${o.cheek == null ? 0.22 : o.cheek}"/>`;
    // occhi
    for (const cx of [26.8, 37.2]) {
      s += `<path d="M${cx - 3} 30.6q3-2.7 6 0q-3 2.3-6 0z" fill="#fff"/><circle cx="${cx}" cy="30.6" r="1.35" fill="${eye}"/><circle cx="${cx + .4}" cy="30.1" r=".4" fill="#fff"/>`;
      s += `<path d="M${cx - 3.2} 30.5q3.2-3.2 6.4 0" stroke="#2a1a14" stroke-width="${o.lash ? 1.2 : .8}" fill="none" stroke-linecap="round"/>`;
      if (lv >= 3) s += `<path d="M${cx - 2.6} 32.8q2.6 1.2 5.2 0" stroke="${sh}" stroke-width=".6" fill="none" opacity=".7"/>`;
    }
    const bw = o.bw || 1.1;
    s += `<path d="M23.4 27q3.4-2.2 6.8-.4" stroke="${br}" stroke-width="${bw}" fill="none" stroke-linecap="round"/><path d="M33.8 26.6q3.4-1.8 6.8.4" stroke="${br}" stroke-width="${bw}" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M32 30.5q-1.6 5-.3 6.4q1.2.9 2.6 0" stroke="${sh}" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>`;
    const lip = o.lip || '#b4574f';
    const smile = o.smile == null ? 1.8 : o.smile;
    s += `<path d="M28 40.4q4 ${smile} 8 0" stroke="${lip}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M29.3 41.3q2.7 1.8 5.4 0" stroke="${lip}" stroke-width=".9" fill="none" opacity=".55" stroke-linecap="round"/>`;
    // rughe in base all'età
    const wk = (d, op) => `<path d="${d}" stroke="${sh}" stroke-width=".55" fill="none" stroke-linecap="round" opacity="${op}"/>`;
    if (lv >= 1) s += wk('M26 20.6q6-1.2 12 0', 0.4);
    if (lv >= 2) s += wk('M25.4 22.8q6.6-1.2 13.2 0', 0.45) + wk('M22 29.4l-2 -.8M22 31l-2.2.6', 0.5) + wk('M42 29.4l2-.8M42 31l2.2.6', 0.5);
    if (lv >= 3) s += wk('M25.5 34.5q-1.2 4 .6 7M38.5 34.5q1.2 4-.6 7', 0.6) + wk('M26.5 18.4q5.5-1 11 0', 0.4);
    if (lv >= 4) s += wk('M23.5 31.5q1.4 3 .2 5.6M40.5 31.5q-1.4 3-.2 5.6', 0.6) + wk('M29 44q3 1 6 0', 0.5) + wk('M30 24.8q2-.6 4 0', 0.4);
    if (o.freckles) s += `<g fill="#b9794f" opacity=".6"><circle cx="24.5" cy="34" r=".5"/><circle cx="26.5" cy="35.2" r=".5"/><circle cx="28" cy="33.8" r=".45"/><circle cx="36" cy="33.8" r=".45"/><circle cx="37.6" cy="35.2" r=".5"/><circle cx="39.6" cy="34" r=".5"/></g>`;
    if (o.mole) s += `<circle cx="39" cy="38" r=".55" fill="#6a3a28"/>`;
    if (o.stubble) s += `<g fill="#2a1d18" opacity=".28">${Array.from({ length: 26 }, (_, i) => `<circle cx="${24 + (i % 9) * 2 + (i % 2)}" cy="${39 + Math.floor(i / 9) * 2.1 + (i % 3) * .4}" r=".35"/>`).join('')}</g>`;
    if (o.glasses) {
      const gc = o.glasses === 'gold' ? '#c9a24a' : o.glasses === 'white' ? '#ffffff' : '#3a2e2e';
      if (o.glasses === 'white') s += '<g fill="none" stroke="#7d8890" stroke-width="1.5"><circle cx="26.8" cy="30.6" r="4.3"/><circle cx="37.2" cy="30.6" r="4.3"/></g>';
      s += `<g fill="rgba(200,230,255,.18)" stroke="${gc}" stroke-width=".9">${o.glasses === 'sq' ? '<rect x="22.6" y="27.4" width="8.4" height="6.2" rx="1.6"/><rect x="33" y="27.4" width="8.4" height="6.2" rx="1.6"/>' : '<circle cx="26.8" cy="30.6" r="4.2"/><circle cx="37.2" cy="30.6" r="4.2"/>'}<path d="M31 30.2q1 -.9 2 0M22.6 30.4l-2.4-.8M41.4 30.4l2.4-.8" fill="none"/></g>`;
    }
    return s;
  };
  const neck = (sk, sh) => `<path d="M26.5 40h11v8q-5.5 4.5-11 0z" fill="${sk}"/><path d="M26.5 44q5.5 3.4 11 0v3q-5.5 4-11 0z" fill="${sh}" opacity=".35"/>`;
  const nun = (c, dk, o) => { const vc = o.vc || c, vd = o.vd || dk; return `
    <path d="M2 64C2 52 12 47 23 45.5h18C52 47 62 52 62 64z" fill="${c}"/>
    <path d="M10 64q4-10 14-14M54 64q-4-10-14-14M32 52v12" stroke="${dk}" stroke-width="1" fill="none" opacity=".55"/>
    <path d="M22.5 45.2L32 56l9.5-10.8z" fill="#fbf8ef" stroke="#d5ccb8" stroke-width=".6"/>
    ${neck(o.skin || '#f2cba7', o.shade || '#c98f66')}
    <path d="M32 2C18.5 2 12 12.5 12 27c0 9 1 18 4.5 24.5h31C51 45 52 36 52 27 52 12.5 45.5 2 32 2z" fill="${vc}" ${o.vc ? 'stroke="#c9c1ae" stroke-width=".7"' : ''}/>
    <path d="M32 2C24 4 19 12 18.5 24c-.5 10 .5 19 3 27h-5C13 45 12 36 12 27 12 12.5 18.5 2 32 2z" fill="#fff" opacity=".13"/>
    <path d="M47.5 51.5C51 45 52 36 52 27c0-10-3-18-10-22 5 6 7 14 7 22 0 8-1 16-3.5 24.5z" fill="${vd}" opacity=".5"/>
    ${o.trim ? `<path d="M12.2 40Q12 34 12 27C12 12.5 18.5 2 32 2s20 10.5 20 25q0 7-.2 13" fill="none" stroke="${o.trim}" stroke-width="2.2" opacity=".9"/><path d="M16.5 51.5h31" stroke="${o.trim}" stroke-width="2.2"/>` : ''}
    <path d="M32 12.4C22.5 12.4 17.4 20 17.4 29.5c0 8 3 15 7 18.3h15.2c4-3.3 7-10.3 7-18.3 0-9.5-5.1-17.1-14.6-17.1z" fill="#fdfaf1" ${o.vc ? 'stroke="#d9d0bb" stroke-width=".6"' : ''}/>
    <path d="M32 12.4C22.5 12.4 17.4 20 17.4 29.5" stroke="#d9d0bb" stroke-width=".6" fill="none"/>
    ${face(o)}
    <path d="M18.8 25.5C20 18 25 13.8 32 13.8s12 4.2 13.2 11.7C42 18.6 37 16.4 32 16.4S22 18.6 18.8 25.5z" fill="${c}" opacity=".0"/>
    ${o.cross === false ? '' : '<path d="M32 51.5v0" /><path d="M27 48q5 6 10 0" stroke="#c9a24a" stroke-width=".6" fill="none"/><path d="M32 54.2v6.4M29.6 56.4h4.8" stroke="#e2b559" stroke-width="1.6" stroke-linecap="round"/>'}`; };
  // suora senza velo: capelli corti
  const nunHair = (c, dk, hair, hl, o) => `
    <path d="M2 64C2 52 12 47 23 45.5h18C52 47 62 52 62 64z" fill="${c}"/>
    <path d="M10 64q4-10 14-14M54 64q-4-10-14-14" stroke="${dk}" stroke-width="1" fill="none" opacity=".55"/>
    <path d="M21 45.5Q32 52 43 45.5L40 49Q32 53.5 24 49z" fill="#fbf8ef" stroke="#d5ccb8" stroke-width=".6"/>
    ${neck('#f2cba7', '#c98f66')}
    <ellipse cx="18.4" cy="33" rx="2" ry="3.2" fill="#f2cba7"/><ellipse cx="45.6" cy="33" rx="2" ry="3.2" fill="#f2cba7"/>
    ${face(o)}
    <path d="M17.2 33C14.5 17 22 9.5 32 9.5S49.5 17 46.8 33c-1.2-6-3.5-10.5-7.5-13-2.5 1.8-12.6 1.8-15 0-4 2.5-6.4 7-7.1 13z" fill="${hair}"/>
    <path d="M22 14q4-3 9-2.4M34 11.6q6 .4 9 3.6M19.5 22q1-4 3.5-6.2M40 18.5q4 1.5 5.6 5" stroke="${hl}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M27 48q5 6 10 0" stroke="#c9a24a" stroke-width=".6" fill="none"/><path d="M32 54.2v6.4M29.6 56.4h4.8" stroke="#e2b559" stroke-width="1.6" stroke-linecap="round"/>`;
  const PORTRAIT = {
    zita: nunHair('#b0342f', '#7a1d1a', '#1f1a22', '#5a5462', { level: 1, brow: '#2a2228', bw: 1.2, lip: '#a63f3b', smile: 0.6, mole: 1 }),
    domenica: nunHair('#2f8052', '#1c5232', '#f2f2f6', '#c4c8d6', { level: 2, brow: '#9a9a9e', bw: 1.1, glasses: 'round', smile: 1.4 }),
    antonietta: nun('#2d66b5', '#1c447f', { vc: '#f7f5ef', vd: '#cfc9bb', trim: '#2d66b5', level: 3, brow: '#b9b5b0', bw: 1, glasses: 'white', cheek: 0.34, smile: 2.4, eye: '#5a7a96', skin: '#f4d6bb' }),
    graziella: nun('#dcab22', '#a07410', { vc: '#f7f5ef', vd: '#cfc9bb', trim: '#5fb4e6', level: 4, brow: '#c4bfb8', bw: .9, glasses: 'sq', smile: .2, skin: '#f0d3b4', shade: '#b98760', lip: '#a05a4f', eye: '#5a6a72' }),
    anna: nun('#7d4c2b', '#4f2e18', { level: 0, brow: '#3b271c', bw: 1.2, lash: 1, freckles: 1, smile: 2.4, skin: '#f5d2b0', cheek: 0.3 }),
    sonia: `
      <path d="M40 17C54 18 56 38 52 56c-2-8-4-14-8-20z" fill="#4a2a1a"/>
      <path d="M2 64C2 52 12 47 23 45.5h18C52 47 62 52 62 64z" fill="#d97a2a"/>
      <path d="M24 45.5Q32 57 40 45.5" fill="#f2cba7"/>
      <path d="M24 45.5Q32 57 40 45.5" fill="none" stroke="#a85a1c" stroke-width="1"/>
      ${neck('#f2cba7', '#c98f66')}
      <path d="M14 30C13 12 22 3 32 3s19 9 18 27c-1-6-3-9-5-11-8 1-18-1-24-6-4 4-5 9-5 17z" fill="#4a2a1a"/>
      ${face({ level: 0, brow: '#3a2216', lash: 1, smile: 2.2, lip: '#c0554e' })}
      <path d="M17.5 31C17 17 24 12 32 12.5c-3 3-9 6-12 11-1.5 2.5-2 5.5-2.5 7.5z" fill="#4a2a1a"/>
      <path d="M46.5 31C47 18 42 13 32 12.5c5 3 9 7 11 12 1.5 3 3 5 3.5 6.5z" fill="#5a3320"/>
      <circle cx="19" cy="38.5" r="1.1" fill="#e2b559"/><circle cx="45" cy="38.5" r="1.1" fill="#e2b559"/>`,
    romina: `
      <path d="M13 32C11 14 20 3 32 3s21 11 19 29c-.5 9 0 18 3 28H10c3-10 3-19 3-28z" fill="#4a2a1a"/>
      <path d="M2 64C2 52 12 47 23 45.5h18C52 47 62 52 62 64z" fill="#b8355f"/>
      <path d="M23 45.5Q32 54 41 45.5" fill="#f2cba7"/>
      ${neck('#f2cba7', '#c98f66')}
      ${face({ level: 0, brow: '#3a2216', bw: 1.3, lash: 1, smile: 2, lip: '#c4263f' })}
      <path d="M17.5 32C16 16 24 11.5 32 12c-4 3-9 7-11 13-1 2.5-2.5 5-3.5 7z" fill="#4a2a1a"/>
      <path d="M46.5 32C48 17 41 11.5 32 12c6 2 11 7 12 13 .5 2.5 1.5 4.5 2.5 7z" fill="#5e3a24"/>
      <path d="M32 12c-3 2-4 5-3 9 3-1 6-3 7-6-1-2-2.5-3-4-3z" fill="#4a2a1a"/>
      <circle cx="18.2" cy="40.5" r="2" fill="none" stroke="#e2b559" stroke-width=".8"/><circle cx="45.8" cy="40.5" r="2" fill="none" stroke="#e2b559" stroke-width=".8"/>`,
    elettricista: `
      <path d="M2 64C2 52 12 47 23 45.5h18C52 47 62 52 62 64z" fill="#6a7430"/>
      <path d="M22 45.5l10 9 10-9" fill="#8a9140" stroke="#4a5220" stroke-width=".7"/>
      <path d="M15 64l3-13M49 64l-3-13" stroke="#3a4018" stroke-width="3"/><rect x="43" y="53" width="8" height="7" rx="1" fill="#5a6428" stroke="#3a4018" stroke-width=".6"/>
      <path d="M46 53v-4" stroke="#d12f2f" stroke-width="1.6" stroke-linecap="round"/>
      ${neck('#e8b894', '#b3805a')}
      ${face({ level: 1, skin: '#e8b894', shade: '#b3805a', brow: '#2a1d18', bw: 1.5, stubble: 1, smile: 1.2, lip: '#9a4a3f' })}
      <path d="M27.5 38.2q2.2-1.8 4.5-.4q2.3-1.4 4.5.4q-2.2 1.6-4.5.6q-2.3 1-4.5-.6z" fill="#2a1d18" opacity=".85"/>
      <path d="M16.5 25c0-11 6-18 15.5-18s15.5 7 15.5 18z" fill="#f3c21b"/>
      <path d="M16.5 25c0-11 6-18 15.5-18-4 3-6 10-6 18z" fill="#fff" opacity=".18"/>
      <rect x="13" y="23" width="38" height="4.6" rx="2.3" fill="#d9a30c"/><rect x="29" y="3.5" width="6" height="6.5" rx="2" fill="#f3c21b"/>`,
    fantasma: `
      <path d="M8 64V30C8 13 18 3 32 3s24 10 24 27v34l-5-5-5 5-5-6-5 6-5-6-5 6-5-5z" fill="#eef3fb" opacity=".96"/>
      <path d="M8 64V30C8 13 18 3 32 3" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>
      <path d="M56 64V30C56 17 50 8 40 4c8 6 10 14 10 26v34z" fill="#9db0cc" opacity=".35"/>
      <path d="M13 30c0 5 1 9 3 13M20 12q-5 6-5 14" stroke="#c4d2e6" stroke-width="1" fill="none"/>
      <ellipse cx="24" cy="27" rx="4.6" ry="7" fill="#12182a"/><ellipse cx="40" cy="27" rx="4.6" ry="7" fill="#12182a"/>
      <ellipse cx="32" cy="43" rx="4" ry="6" fill="#12182a"/>
      <circle cx="25.4" cy="25" r="1.4" fill="#9fd0ff"/><circle cx="41.4" cy="25" r="1.4" fill="#9fd0ff"/>`,
  };
  const portrait = (id) => PORTRAIT[id] || '';
  const avatar = (id, size) => {
    const s = D.suspect(id);
    size = size || 44;
    const e = h('span', { class: 'avatar', style: `width:${size}px;height:${size}px;background:radial-gradient(circle at 50% 30%,#fff6df,${s ? s.color + '55' : '#ccc'})` });
    e.innerHTML = `<svg viewBox="0 0 64 64" width="${size}" height="${size}">${portrait(id)}</svg>`;
    return e;
  };

  const TYPE_LABEL = { s: 'Sospettata', w: 'Arma', r: 'Luogo' };
  const card = (k, opts) => {
    opts = opts || {};
    const [t, id] = k.split(':');
    const e = h('div', { class: 'card ' + t + (opts.size ? ' ' + opts.size : '') + (opts.back ? ' back' : '') });
    let pic;
    if (t === 's') { const p = h('div', { class: 'pic' }); p.innerHTML = `<svg viewBox="0 0 64 64">${portrait(id)}</svg>`; pic = p; }
    else pic = h('div', { class: 'pic' }, t === 'w' ? D.weapon(id).icon : D.room(id).icon);
    const name = t === 's' ? D.suspect(id).name : t === 'w' ? D.weapon(id).name : D.room(id).name;
    e.append(h('div', { class: 'band' }, TYPE_LABEL[t]), pic, h('div', { class: 'nm' }, name));
    return e;
  };

  const PIPS = { 1: [[5, 5]], 2: [[3, 3], [7, 7]], 3: [[3, 3], [5, 5], [7, 7]], 4: [[3, 3], [7, 3], [3, 7], [7, 7]], 5: [[3, 3], [7, 3], [5, 5], [3, 7], [7, 7]], 6: [[3, 3], [7, 3], [3, 5], [7, 5], [3, 7], [7, 7]] };
  const die = (n, roll) => {
    const e = h('span', { class: 'die' + (roll ? ' roll' : '') });
    e.innerHTML = `<svg viewBox="0 0 10 10" width="100%" height="100%"><rect x=".4" y=".4" width="9.2" height="9.2" rx="2" fill="#fffdf4" stroke="#c9b98f" stroke-width=".35"/>${(PIPS[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".85" fill="#6b1f33"/>`).join('')}</svg>`;
    return e;
  };
  const toast = (msg) => { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 3200); };
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Connessione assente. Riprovo…' }));
  const fmtTime = (ms) => { ms = Math.max(0, Math.round(ms / 1000)); return Math.floor(ms / 60) + ':' + String(ms % 60).padStart(2, '0'); };
  const confetti = () => {
    const cols = ['#e2b559', '#c2417b', '#2e7d4f', '#2b63b0', '#f6dc93', '#fff'];
    for (let i = 0; i < 90; i++) {
      const c = h('div', { class: 'confetti', style: `left:${Math.random() * 100}vw;background:${cols[i % cols.length]};animation-duration:${2.5 + Math.random() * 3}s;animation-delay:${Math.random() * 1.5}s;transform:rotate(${Math.random() * 360}deg)` });
      document.body.append(c); setTimeout(() => c.remove(), 8000);
    }
  };
  window.UI = { h, avatar, portrait, card, die, toast, post, fmtTime, confetti };
})();
