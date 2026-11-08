'use strict';
// Disegna la pianta del collegio (SVG) e muove le pedine. Usata dal tabellone e dai telefoni.
(function () {
  const D = window.CDATA, UI = window.UI;
  const NS = 'http://www.w3.org/2000/svg';
  const MAP = D.buildMap();
  const s = (tag, attrs, ...kids) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const PASS = {};
  D.PASSAGES.forEach(([a, b], i) => { PASS[a] = { l: 'AB'[i], to: b }; PASS[b] = { l: 'AB'[i], to: a }; });

  const DEFS = `
  <pattern id="f-checker" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#f8f8f2"/><rect width="1" height="1" fill="#d6dedb"/><rect x="1" y="1" width="1" height="1" fill="#d6dedb"/></pattern>
  <pattern id="f-checkerWarm" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#f4e3bf"/><rect width="1" height="1" fill="#d9b982"/><rect x="1" y="1" width="1" height="1" fill="#d9b982"/></pattern>
  <pattern id="f-tiles" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#dff0f1"/><path d="M0 0H1V1" fill="none" stroke="#a9ced2" stroke-width=".07"/></pattern>
  <pattern id="f-woodDark" width="4" height=".7" patternUnits="userSpaceOnUse"><rect width="4" height=".7" fill="#8d5c3c"/><rect y=".62" width="4" height=".08" fill="#5f3a22"/><rect x="1.4" width=".06" height=".7" fill="#5f3a22"/></pattern>
  <pattern id="f-wood" width="4" height=".7" patternUnits="userSpaceOnUse"><rect width="4" height=".7" fill="#cb965f"/><rect y=".62" width="4" height=".08" fill="#a5733f"/><rect x="2.6" width=".06" height=".7" fill="#a5733f"/></pattern>
  <pattern id="f-parquet" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#c08a55"/><g stroke="#9a6a3c" stroke-width=".07"><path d="M0 .5H1M0 1H1M0 1.5H1M1 0V1M1.5 1V2M1 1.5H2M1 2H2"/></g><rect x="1" y="1" width="1" height="1" fill="#b27d49"/><rect width="1" height="1" fill="#b27d49" opacity=".6"/></pattern>
  <pattern id="f-carpet" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#8a2d45"/><path d="M.5 .1L.9 .5L.5 .9L.1 .5Z" fill="none" stroke="#b5566d" stroke-width=".06"/></pattern>
  <pattern id="f-stone" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#cdc9c0"/><path d="M0 1.5H3M1.5 0V1.5M.75 1.5V3M2.25 1.5V3" stroke="#a29d92" stroke-width=".08" fill="none"/></pattern>
  <pattern id="f-ice" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#dff1fb"/><path d="M0 2L2 0" stroke="#fff" stroke-width=".12" opacity=".8"/><path d="M0 1L1 0M1 2L2 1" stroke="#b8dcee" stroke-width=".06"/></pattern>
  <pattern id="f-desks" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#efe6cf"/><rect width="1" height="1" fill="none" stroke="#d9cba6" stroke-width=".05"/></pattern>
  <pattern id="dots" width="1.4" height="1.4" patternUnits="userSpaceOnUse"><rect width="1.4" height="1.4" fill="#0d0a16"/><circle cx=".7" cy=".7" r=".04" fill="#2a2440"/></pattern>
  
  <radialGradient id="cand"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset=".45" stop-color="#ff8a2a" stop-opacity=".18"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>
  <radialGradient id="fog"><stop offset="0" stop-color="#c8c0e0" stop-opacity=".22"/><stop offset="1" stop-color="#c8c0e0" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b6fd8"/><stop offset=".5" stop-color="#c2417b"/><stop offset="1" stop-color="#e2b559"/></linearGradient>
  <pattern id="tape" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".5" height="1" fill="#e2b559"/><rect x=".5" width=".5" height="1" fill="#1a1a1a"/></pattern>
  <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy=".12" stdDeviation=".12" flood-color="#000" flood-opacity=".45"/></filter>
  <filter id="big" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy=".35" stdDeviation=".45" flood-color="#000" flood-opacity=".55"/></filter>`;
  const STYLE = `
  .pawn,.item{transition:transform .17s linear}
  .pawn.slow,.item.slow{transition:transform .5s ease-in-out}
  .pulse{animation:pls 1.1s ease-in-out infinite}
  @keyframes pls{0%,100%{opacity:.35}50%{opacity:.85}}
  .halo{animation:halo 1.3s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes halo{0%,100%{transform:scale(.9);opacity:.9}50%{transform:scale(1.18);opacity:.35}}
  .hit{cursor:pointer}.hit:hover{fill:rgba(255,255,255,.16)}
  .ghosty{animation:fl 2.4s ease-in-out infinite}
  @keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-.1px)}}
  text{font-family:'Nunito',system-ui,sans-serif;font-weight:800}
  .serif{font-family:'Playfair Display',Georgia,serif}
  .gothic{font-family:'Cinzel','Playfair Display',Georgia,serif;font-weight:700;letter-spacing:.02em}
  .flick{animation:flk 2.6s ease-in-out infinite}
  @keyframes flk{0%,100%{opacity:.8}18%{opacity:1}35%{opacity:.62}52%{opacity:.95}70%{opacity:.7}}
  .flame{animation:flm .5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
  @keyframes flm{from{transform:scale(1,1)}to{transform:scale(.8,1.25)}}
  .drift{animation:dr 28s ease-in-out infinite alternate}.drift.b{animation-duration:36s}.drift.c{animation-duration:22s}
  @keyframes dr{from{transform:translateX(-3px)}to{transform:translateX(5px)}}`;

  class MapView {
    constructor(opts) {
      opts = opts || {};
      this.opts = opts;
      this.svg = s('svg', { viewBox: '-0.8 -0.8 32.6 35.6', class: 'mapsvg', preserveAspectRatio: 'xMidYMid meet' });
      this.svg.style.width = '100%'; this.svg.style.height = '100%'; this.svg.style.display = 'block'; this.svg.style.touchAction = opts.touchAction || 'manipulation';
      this.svg.append(s('defs', {}), s('style', {}, STYLE));
      this.svg.querySelector('defs').innerHTML = DEFS;
      this.gStatic = s('g'); this.gHi = s('g'); this.gItems = s('g'); this.gHit = s('g');
      this.svg.append(this.gStatic, this.gHi, this.gItems, this.gHit);
      this.pawns = {}; this.weapons = {}; this.suoraEl = null;
      this.anim = new Set();
      this.drawStatic();
    }

    drawStatic() {
      const g = this.gStatic;
      g.append(s('rect', { x: -0.8, y: -0.8, width: 32.6, height: 35.6, rx: 0.6, fill: 'url(#dots)' }));
      // muri esterni in pietra
      const cg = s('g', { filter: 'url(#big)' });
      for (const [x, y, w, h] of D.CORRIDORS) cg.append(s('rect', { x: x - 0.22, y: y - 0.22, width: w + 0.44, height: h + 0.44, fill: '#0b0710', stroke: '#5a4a3a', 'stroke-width': 0.06, rx: 0.14 }));
      g.append(cg);
      // pavimento dei corridoi: lastre di pietra scura
      for (const t of MAP.tiles.values()) {
        const dark = (t.x * 3 + t.y * 5) % 3;
        g.append(s('rect', { x: t.x, y: t.y, width: 1, height: 1, fill: ['#4a4352', '#433c4b', '#504858'][dark], stroke: '#2b2532', 'stroke-width': 0.05 }));
      }
      // tappeto rosso lungo i corridoi principali
      for (const [x, y, w, h] of D.CORRIDORS) {
        const horiz = w >= h;
        const rx = horiz ? x + 0.3 : x + w / 2 - 0.5, ry = horiz ? y + h / 2 - 0.5 : y + 0.3;
        const rw = horiz ? w - 0.6 : 1, rh = horiz ? 1 : h - 0.6;
        if (w < 3 && h < 3) continue;
        g.append(s('rect', { x: rx, y: ry, width: rw, height: rh, fill: '#5d1424', opacity: 0.5, rx: 0.2, 'pointer-events': 'none' }));
        g.append(s('rect', { x: rx + 0.05, y: ry + 0.05, width: rw - 0.1, height: rh - 0.1, fill: 'none', stroke: '#c9a24a', 'stroke-width': 0.04, opacity: 0.5, rx: 0.17, 'pointer-events': 'none' }));
      }
      for (const r of D.ROOMS) this.drawRoom(r);
      // scale
      const sx = 21, sy = 11;
      const st = s('g');
      st.append(s('rect', { x: sx, y: sy, width: 2, height: 2, fill: '#6b5638', stroke: '#14090f', 'stroke-width': 0.1, rx: 0.1 }));
      for (let i = 0; i < 6; i++) st.append(s('rect', { x: sx + 0.1, y: sy + 0.1 + i * 0.32, width: 1.8, height: 0.2, fill: i % 2 ? '#9c8250' : '#b89c62' }));
      st.append(s('text', { x: sx + 1, y: sy + 1.35, 'text-anchor': 'middle', 'font-size': 1.15, fill: '#2a1008' }, '⬆'));
      g.append(st);
      g.append(s('path', { d: 'M23 12 C25 14 26 18 26 21.8', fill: 'none', stroke: '#e2b559', 'stroke-width': 0.14, 'stroke-dasharray': '0.4 0.35', 'stroke-linecap': 'round', opacity: 0.9 }));
      g.append(s('text', { x: 22, y: 10.6, 'text-anchor': 'middle', 'font-size': 0.6, fill: '#f6dc93', class: 'serif' }, 'Scale'));
      // torce lungo i corridoi
      for (const [x, y, w, h] of D.CORRIDORS) {
        const horiz = w >= h, len = horiz ? w : h;
        for (let k = 3; k < len; k += 7) this.glow(horiz ? x + k : x + w / 2, horiz ? y + h / 2 : y + k, 3.2, k * 0.37);
      }
      // nebbia che scivola
      const fog = s('g', { 'pointer-events': 'none' });
      fog.append(s('ellipse', { cx: 6, cy: 10, rx: 9, ry: 3.2, fill: 'url(#fog)', class: 'drift a' }), s('ellipse', { cx: 22, cy: 24, rx: 10, ry: 3.6, fill: 'url(#fog)', class: 'drift b' }), s('ellipse', { cx: 14, cy: 32, rx: 9, ry: 2.8, fill: 'url(#fog)', class: 'drift c' }));
      g.append(fog);
      // vignettatura
      g.append(s('rect', { x: -0.8, y: -0.8, width: 32.6, height: 35.6, rx: 0.6, fill: 'url(#vig)', 'pointer-events': 'none' }));
    }

    glow(x, y, r, delay) {
      this.gStatic.append(s('circle', { cx: x, cy: y, r, fill: 'url(#cand)', class: 'flick', style: `animation-delay:${(delay || 0).toFixed(2)}s`, 'pointer-events': 'none' }));
    }
    candle(x, y, sc) {
      sc = sc || 1;
      const g = s('g', { transform: `translate(${x} ${y}) scale(${sc})`, 'pointer-events': 'none' });
      g.append(s('circle', { cy: -0.4, r: 1.5, fill: 'url(#cand)', class: 'flick', style: `animation-delay:${((x * 7 + y * 3) % 5) / 3}s` }));
      g.append(s('rect', { x: -0.11, y: -0.15, width: 0.22, height: 0.55, rx: 0.04, fill: '#f4ead2', stroke: '#8a7a5a', 'stroke-width': 0.03 }));
      g.append(s('ellipse', { cy: -0.32, rx: 0.1, ry: 0.19, fill: '#ffcf4a', class: 'flame' }));
      this.gStatic.append(g);
    }

    drawRoom(r) {
      const g = this.gStatic;
      const grp = s('g', { filter: 'url(#soft)' });
      if (r.upstairs) grp.append(s('rect', { x: r.x - 0.35, y: r.y - 0.35, width: r.w + 0.7, height: r.h + 0.7, rx: 0.5, fill: 'none', stroke: '#e2b559', 'stroke-width': 0.14, 'stroke-dasharray': '0.5 0.35' }));
      grp.append(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: `url(#f-${r.floor})`, stroke: '#0e0812', 'stroke-width': 0.34 }));
      g.append(grp);
      // penombra + luce di candela
      g.append(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'rgba(14,6,26,.38)', 'pointer-events': 'none' }));
      // muro in pietra (bordo interno)
      g.append(s('rect', { x: r.x + 0.04, y: r.y + 0.04, width: r.w - 0.08, height: r.h - 0.08, fill: 'none', stroke: '#7b6a58', 'stroke-width': 0.1, 'pointer-events': 'none' }));
      this.decor(r);
      // luce calda nel mezzo e torce agli angoli
      g.append(s('ellipse', { cx: r.x + r.w / 2, cy: r.y + r.h / 2 + 0.4, rx: r.w * 0.62, ry: r.h * 0.62, fill: 'url(#cand)', opacity: 0.55, 'pointer-events': 'none', class: 'flick', style: `animation-delay:${(r.num * 0.43).toFixed(2)}s` }));
      if (!r.upstairs || true) { this.candle(r.x + 0.45, r.y + 0.75, 0.9); this.candle(r.x + r.w - 0.45, r.y + 0.75, 0.9); }
      // porte
      for (const [x, y] of r.doors) {
        if (r.upstairs) continue;
        let rect;
        if (y === r.y + r.h) rect = { x: x + 0.12, y: y - 0.2, w: 0.76, h: 0.4 };
        else if (y === r.y - 1) rect = { x: x + 0.12, y: y + 1 - 0.2, w: 0.76, h: 0.4 };
        else if (x === r.x - 1) rect = { x: x + 1 - 0.2, y: y + 0.12, w: 0.4, h: 0.76 };
        else rect = { x: x - 0.2, y: y + 0.12, w: 0.4, h: 0.76 };
        g.append(s('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: 0.12, fill: '#6a3a1c', stroke: '#e2b559', 'stroke-width': 0.07 }));
        g.append(s('circle', { cx: rect.x + rect.w * (rect.w > rect.h ? 0.8 : 0.5), cy: rect.y + rect.h * (rect.w > rect.h ? 0.5 : 0.8), r: 0.06, fill: '#f6dc93' }));
      }
      // targa dorata con il nome
      const small = r.h <= 3;
      const fs = small ? 0.56 : Math.min(0.72, (r.w - 0.9) / (r.name.length * 0.7));
      const label = (small ? r.icon + ' ' : '') + r.name;
      const tw = Math.min(r.w - 0.5, label.length * fs * 0.72 + 0.9);
      const ly = r.y + (small ? 0.2 : 0.22);
      const lg = s('g', { 'pointer-events': 'none' });
      lg.append(s('rect', { x: r.x + r.w / 2 - tw / 2, y: ly, width: tw, height: small ? 0.92 : (r.sub ? 1.5 : 1.1), rx: 0.4, fill: 'rgba(16,8,22,.9)', stroke: '#d9b25f', 'stroke-width': 0.07 }));
      lg.append(s('text', { x: r.x + r.w / 2, y: ly + (small ? 0.64 : 0.76), 'text-anchor': 'middle', 'font-size': fs, fill: '#f6dc93', class: 'gothic' }, label));
      if (r.sub && !small) lg.append(s('text', { x: r.x + r.w / 2, y: ly + 1.25, 'text-anchor': 'middle', 'font-size': Math.min(0.46, (r.w - 0.8) / (r.sub.length * 0.52)), fill: '#c9b8d8', 'font-style': 'italic' }, r.sub));
      g.append(lg);
      if (!small) g.append(s('text', { x: r.x + 0.7, y: r.y + r.h - 0.4, 'font-size': 1.3, opacity: 0.5, 'pointer-events': 'none' }, r.icon));
      if (PASS[r.id]) {
        const b = s('g', { transform: `translate(${r.x + r.w - 0.9} ${r.y + r.h - 0.9})`, 'pointer-events': 'none' });
        b.append(s('circle', { r: 0.62, fill: '#2a1038', stroke: '#e2b559', 'stroke-width': 0.1 }), s('text', { y: 0.22, 'text-anchor': 'middle', 'font-size': 0.7, fill: '#f6dc93' }, PASS[r.id].l));
        g.append(b);
      }
    }

    decor(r) {
      const g = this.gStatic, o = { 'pointer-events': 'none' };
      const rect = (x, y, w, h, fill, extra) => g.append(s('rect', Object.assign({ x, y, width: w, height: h, rx: 0.1, fill, opacity: 0.8 }, o, extra || {})));
      const circ = (x, y, rr, fill, extra) => g.append(s('circle', Object.assign({ cx: x, cy: y, r: rr, fill }, o, extra || {})));
      const text = (x, y, t, fs, extra) => g.append(s('text', Object.assign({ x, y, 'font-size': fs, 'text-anchor': 'middle' }, o, extra || {}), t));
      const X = r.x, Y = r.y, W = r.w, H = r.h;
      if (r.id === 'pranzo') {
        for (const yy of [Y + 3.4, Y + 6.2]) { rect(X + 1.4, yy - 0.45, W - 2.8, 0.3, '#2c1a10'); rect(X + 1.4, yy + 0.95, W - 2.8, 0.3, '#2c1a10'); rect(X + 1.2, yy, W - 2.4, 0.95, '#4b2a17', { stroke: '#2a160a', 'stroke-width': 0.06 }); for (let i = 0; i < 3; i++) this.candle(X + 2.4 + i * ((W - 4.8) / 2), yy + 0.4, 0.55); }
        text(X + W / 2, Y + H - 0.6, '✝', 1.1, { fill: '#e2b559', opacity: 0.55 });
      }
      if (r.id === 'pranzoSuore') { rect(X + 1.4, Y + 2.7, W - 2.8, 1.3, '#2c1a10', { stroke: '#e2b559', 'stroke-width': 0.05 }); this.candle(X + W / 2, Y + 3.2, 0.6); for (let i = 0; i < 4; i++) circ(X + 2 + i * 1.1, Y + 4.4, 0.18, '#d8d0c0', { opacity: 0.7 }); }
      if (r.id === 'cappella') {
        for (let i = 0; i < 3; i++) { rect(X + 1, Y + 2.7 + i * 1.05, 3.1, 0.48, '#3a2214', { stroke: '#1b0f08', 'stroke-width': 0.04 }); rect(X + W - 4.1, Y + 2.7 + i * 1.05, 3.1, 0.48, '#3a2214', { stroke: '#1b0f08', 'stroke-width': 0.04 }); }
        rect(X + W / 2 - 1.3, Y + H - 1.25, 2.6, 0.7, '#8a7a68', { stroke: '#e2b559', 'stroke-width': 0.05 });
        text(X + W / 2, Y + H - 1.45, '✝', 1.2, { fill: '#f6dc93' });
        this.candle(X + W / 2 - 1.8, Y + H - 0.9, 0.7); this.candle(X + W / 2 + 1.8, Y + H - 0.9, 0.7);
        for (const wx of [X + 1.2, X + W - 2.2]) { g.append(s('path', { d: `M${wx} ${Y + 2.3}v-1.1a.5 .5 0 0 1 1 0v1.1z`, fill: 'url(#glass)', stroke: '#e2b559', 'stroke-width': 0.05, opacity: 0.9 }));}
      }
      if (r.id === 'cucina' || r.id === 'cucinaSuore') {
        rect(X + 0.4, Y + 2.2, W - 0.8, 0.8, '#6b6f75', { stroke: '#2a2d30', 'stroke-width': 0.05 });
        for (let i = 0; i < Math.floor((W - 1) / 1.6); i++) { circ(X + 1.2 + i * 1.6, Y + 2.6, 0.3, '#23262a', { stroke: '#9aa0a6', 'stroke-width': 0.05 }); }
        if (r.id === 'cucinaSuore') circ(X + W - 2, Y + H - 1, 0.55, '#3b2a22', { stroke: '#c9a24a', 'stroke-width': 0.06 });
        text(X + 1.7, Y + 2.4, '♨', 0.6, { fill: '#fff', opacity: 0.5, class: 'drift c' });
      }
      if (r.id === 'lavaggio') { rect(X + 0.4, Y + 2.3, W - 0.8, 0.9, '#8fa6ad', { stroke: '#4b5f66', 'stroke-width': 0.05 }); rect(X + 0.7, Y + 2.45, 1.2, 0.6, '#cfe4ea'); rect(X + 2.1, Y + 2.45, 1.2, 0.6, '#cfe4ea'); }
      if (r.id === 'aula') {
        rect(X + 1.2, Y + H - 1.0, W - 2.4, 0.55, '#1f3d2e', { stroke: '#8a6a3a', 'stroke-width': 0.07 });
        for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) rect(X + 1.1 + j * 2.4, Y + 2.1 + i * 1.5, 1.4, 0.7, '#6b4a26', { stroke: '#2a160a', 'stroke-width': 0.04 });
      }
      if (r.id === 'tv') { rect(X + 1.4, Y + H - 1.15, 3.2, 0.5, '#101018', { stroke: '#6b8cff', 'stroke-width': 0.05, class: 'flick' }); rect(X + 1.2, Y + 2.2, 3.6, 0.8, '#6a2a3a', { stroke: '#2a0f18', 'stroke-width': 0.05 }); }
      if (r.id === 'ufficio') {
        rect(X + 0.25, Y + 2.2, 0.55, 4.0, '#2a160a');
        for (let i = 0; i < 9; i++) rect(X + 0.3, Y + 2.3 + i * 0.42, 0.45, 0.32, ['#8c2c46', '#2b63b0', '#2e7d4f', '#b8862b'][i % 4], { opacity: 0.9, rx: 0.03 });
        rect(X + 1.7, Y + 3.0, 3, 1.1, '#3a2214', { stroke: '#e2b559', 'stroke-width': 0.05 });
        text(X + W - 0.8, Y + 2.7, '✝', 0.9, { fill: '#e2b559', opacity: 0.8 });
      }
      if (r.id === 'reception') { rect(X + 0.4, Y + 1.35, W - 0.8, 0.5, '#4b2a17', { stroke: '#e2b559', 'stroke-width': 0.04 }); }
      if (r.id === 'ghiacciaia') { for (let i = 0; i < 4; i++) rect(X + 0.6 + i * 1.7, Y + H - 1.2, 1.2, 0.9, '#bfe3f3', { stroke: '#7fb6d1', 'stroke-width': 0.05, opacity: 0.85 }); }
      if (r.id === 'salaGrande') {
        rect(X + 2, Y + H - 1.5, W - 4, 1.2, '#4a1a28', { stroke: '#e2b559', 'stroke-width': 0.07 });
        for (const cx of [X + 2.2, X + W - 2.2]) rect(cx - 0.3, Y + H - 1.8, 0.6, 1.6, '#8c2c46', { opacity: 0.95 });
        for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) circ(X + 3 + j * 2, Y + 2.5 + i * 0.9, 0.18, '#2a160a', { opacity: 0.5 });
      }
      if (r.id === 'bagniProib') { g.append(s('rect', Object.assign({ x: X + 0.2, y: Y + H - 0.6, width: W - 0.4, height: 0.3, fill: 'url(#tape)' }, o))); }
      if (r.id === 'bagni') { for (let i = 0; i < 3; i++) rect(X + 0.6 + i * 2, Y + H - 0.85, 1, 0.5, '#e8f1f2', { stroke: '#8fb2b8', 'stroke-width': 0.04 }); }
    }

    // ---- posizioni ----
    centerOfTile(x, y) { return { x: x + 0.5, y: y + 0.5, s: 1 }; }
    layoutRoom(r, n) {
      const small = r.h <= 3;
      const top = small ? 1.25 : (r.sub ? 1.95 : 1.65);
      const x0 = r.x + 0.3, y0 = r.y + top, aw = r.w - 0.6, ah = r.h - top - 0.2;
      let sc = 1.2, cols = 1, rows = 1;
      for (; sc >= 0.45; sc -= 0.05) { cols = Math.max(1, Math.floor(aw / sc)); rows = Math.max(1, Math.floor(ah / sc)); if (cols * rows >= n) break; }
      cols = Math.min(cols, n); rows = Math.ceil(n / cols);
      const pos = [];
      for (let j = 0; j < n; j++) {
        const row = Math.floor(j / cols), col = j % cols, count = row === rows - 1 ? n - row * cols : cols;
        pos.push({ x: x0 + (aw - count * sc) / 2 + (col + 0.5) * sc, y: y0 + (ah - rows * sc) / 2 + (row + 0.5) * sc, s: Math.min(1.15, sc) / 1.1 });
      }
      return pos;
    }

    makePawn(id) {
      const sp = D.suspect(id);
      const g = s('g', { class: 'pawn' });
      const inner = s('g');
      inner.append(s('circle', { class: 'halo', r: 0.9, fill: 'none', stroke: '#ffe27a', 'stroke-width': 0.18, 'data-halo': 1, style: 'display:none' }));
      inner.append(s('ellipse', { cx: 0, cy: 0.5, rx: 0.55, ry: 0.17, fill: 'rgba(0,0,0,.35)' }));
      inner.append(s('circle', { r: 0.7, fill: sp.color, stroke: '#fff', 'stroke-width': 0.12, filter: 'url(#soft)' }));
      const cp = s('clipPath', { id: 'pc-' + id }, s('circle', { r: 0.64 }));
      const art = s('g', { 'clip-path': `url(#pc-${id})` });
      const pg = s('g', { transform: `translate(-0.7 -0.74) scale(${1.4 / 64})` });
      pg.innerHTML = UI.portrait(id);
      art.append(pg);
      inner.append(cp, art);
      g.append(inner);
      this.gItems.append(g);
      return g;
    }
    makeWeapon(id) {
      const w = D.weapon(id);
      const g = s('g', { class: 'item' });
      g.append(s('rect', { x: -0.5, y: -0.5, width: 1, height: 1, rx: 0.22, fill: '#fff7e0', stroke: '#7a4a2a', 'stroke-width': 0.08, filter: 'url(#soft)' }));
      g.append(s('text', { y: 0.27, 'text-anchor': 'middle', 'font-size': 0.78 }, w.icon));
      this.gItems.append(g);
      return g;
    }
    makeSuora() {
      const g = s('g', { class: 'item' });
      g.append(s('circle', { r: 0.8, fill: 'none', stroke: '#ff5d5d', 'stroke-width': 0.14, class: 'pulse' }));
      g.append(s('circle', { r: 0.6, fill: '#1c1c24', stroke: '#fff', 'stroke-width': 0.1, filter: 'url(#soft)' }));
      g.append(s('path', { d: 'M-0.38 0.2a.38 .5 0 0 1 .76 0v.2h-.76z', fill: '#fff' }));
      g.append(s('circle', { cy: -0.05, r: 0.24, fill: '#f3cba5' }));
      g.append(s('path', { d: 'M-0.36 -0.05a.36 .5 0 0 1 .72 0q-.36-.5-.72 0z', fill: '#111' }));
      g.append(s('text', { y: -0.72, 'text-anchor': 'middle', 'font-size': 0.52, fill: '#ff8a8a', stroke: '#1c1c24', 'stroke-width': 0.08, 'paint-order': 'stroke' }, 'RONDA'));
      this.gItems.append(g);
      return g;
    }
    put(el, p, slow) {
      el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.s || 1})`;
      el.classList.toggle('slow', !!slow);
    }

    pawnPos(id, v) {
      const pw = v.pawns[id];
      return pw.t === 't' ? this.centerOfTile(pw.x, pw.y) : null;
    }

    update(v) {
      this.v = v;
      const byRoom = {};
      const add = (room, it) => (byRoom[room] = byRoom[room] || []).push(it);
      for (const sp of D.SUSPECTS) {
        const pw = v.pawns[sp.id];
        if (!pw) continue;
        if (!this.pawns[sp.id]) this.pawns[sp.id] = this.makePawn(sp.id);
        if (pw.t === 'r') add(pw.r, { kind: 'p', id: sp.id });
      }
      for (const w of D.WEAPONS) {
        if (!this.weapons[w.id]) this.weapons[w.id] = this.makeWeapon(w.id);
        if (v.weapons[w.id]) add(v.weapons[w.id], { kind: 'w', id: w.id });
      }
      if (v.status === 'playing' || v.status === 'ended') {
        if (!this.suoraEl) this.suoraEl = this.makeSuora();
        add(v.suora, { kind: 'n' });
      }
      const turnSuspect = v.turn ? (v.players.find((p) => p.id === v.turn.pid) || {}).suspect : null;
      const owner = {}; const outS = new Set();
      for (const p of v.players) { owner[p.suspect] = p; if (p.out) outS.add(p.suspect); }
      for (const id in this.pawns) {
        const el = this.pawns[id], pw = v.pawns[id];
        el.classList.toggle('npcp', !owner[id]);
        el.style.opacity = !owner[id] ? 0.62 : outS.has(id) ? 0.5 : 1;
        el.querySelector('[data-halo]').style.display = turnSuspect === id ? '' : 'none';
        if (pw.t === 't' && !this.anim.has(id)) this.put(el, this.centerOfTile(pw.x, pw.y));
      }
      for (const rid in byRoom) {
        const r = D.room(rid), items = byRoom[rid];
        const pos = this.layoutRoom(r, items.length);
        items.forEach((it, j) => {
          const el = it.kind === 'p' ? this.pawns[it.id] : it.kind === 'w' ? this.weapons[it.id] : this.suoraEl;
          if (it.kind === 'p' && this.anim.has(it.id)) return;
          this.put(el, pos[j], true);
        });
      }
      // armi non ancora piazzate (lobby): nascoste
      for (const w of D.WEAPONS) this.weapons[w.id].style.display = v.weapons[w.id] ? '' : 'none';
      if (this.suoraEl) this.suoraEl.style.display = (v.status === 'lobby') ? 'none' : '';
      // i pedoni mostrati solo a partita iniziata
      for (const id in this.pawns) this.pawns[id].style.display = v.pawns[id] ? '' : 'none';
    }

    // anima il percorso di una pedina (path = elenco di {x,y} o {r})
    walk(id, path, to, done) {
      const el = this.pawns[id];
      if (!el || !path || !path.length) { done && done(); return; }
      this.anim.add(id);
      const finish = () => { this.anim.delete(id); this.update(this.v); done && done(); };
      let i = 0;
      const step = () => {
        if (i >= path.length) { setTimeout(finish, 120); return; }
        const n = path[i++];
        if (n.r) { // ingresso in stanza: va al centro della porta e poi dentro
          const r = D.room(n.r); this.put(el, { x: r.x + r.w / 2, y: r.y + r.h / 2, s: 1 }, true); setTimeout(finish, 520);
        } else { this.put(el, this.centerOfTile(n.x, n.y)); setTimeout(step, 170); }
      };
      step();
    }
    teleport(id, to, done) {
      const el = this.pawns[id]; if (!el) { done && done(); return; }
      this.anim.add(id);
      el.style.transition = 'opacity .35s'; el.style.opacity = 0;
      setTimeout(() => { this.anim.delete(id); el.style.transition = ''; this.update(this.v); el.style.opacity = 1; done && done(); }, 420);
    }

    // ---- evidenziazioni cliccabili ----
    setHighlights(h) {
      this.gHi.replaceChildren(); this.gHit.replaceChildren();
      if (!h) return;
      for (const k of h.tiles || []) {
        const [x, y] = k.split(',').map(Number);
        this.gHi.append(s('rect', { x: x + 0.08, y: y + 0.08, width: 0.84, height: 0.84, rx: 0.2, fill: '#3fe08a', opacity: 0.55, class: 'pulse', stroke: '#fff', 'stroke-width': 0.06 }));
        const hit = s('rect', { x, y, width: 1, height: 1, fill: 'rgba(0,0,0,0)', class: 'hit' });
        hit.addEventListener('click', () => this.opts.onTile && this.opts.onTile(x, y));
        this.gHit.append(hit);
      }
      for (const id of h.rooms || []) {
        const r = D.room(id);
        this.gHi.append(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'rgba(63,224,138,.18)', stroke: '#3fe08a', 'stroke-width': 0.28, class: 'pulse', 'pointer-events': 'none' }));
        const hit = s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'rgba(0,0,0,0)', class: 'hit' });
        hit.addEventListener('click', () => this.opts.onRoom && this.opts.onRoom(id));
        this.gHit.append(hit);
      }
    }
  }
  window.MapView = MapView;
})();
