/* Genealogy Tool — SVG drawing of a layout + pan / zoom / pinch. */
(function (GT) {
  'use strict';
  const U = GT.util, L = GT.layout;
  const R = (GT.render = {});

  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const initials = (p) => ((p.given || '?')[0] + (p.surname ? p.surname[0] : '')).toUpperCase();

  R.draw = function (svg, prj, lay, opt) {
    const W = L.W, H = L.H;
    const edges = [], nodes = [], marks = [];
    const pos = lay.pos;

    // unions & parent pairs
    for (const f of lay.families) {
      if (f.parents.length !== 2) continue;
      const [a, b] = f.parents.map((id) => pos.get(id)).sort((p, q) => p.x - q.x);
      const u = f.union;
      const cls = 'uline ' + (u ? 'u-' + u.type + (u.end && u.end.reason ? ' ended' : '') : 'u-none');
      const tip = u ? U.esc(GT.model.label(GT.model.UNION_TYPES, u.type) + (u.start.date ? ', ' + u.start.date : '') +
        (u.end && u.end.reason ? ' — ended: ' + u.end.reason + (u.end.date ? ' ' + u.end.date : '') : '')) : 'Parents (no recorded relationship)';
      const dataAttr = u ? ` data-union="${u.id}"` : '';
      if (f.adjacent && a.y === b.y) {
        const y = a.y + H / 2;
        edges.push(`<path class="${cls}"${dataAttr} d="M${a.x + W} ${y}H${b.x}"><title>${tip}</title></path>`);
        if (u) edges.push(`<path class="uhit"${dataAttr} d="M${a.x + W} ${y}H${b.x}"><title>${tip}</title></path>`);
        if (u && /divorce|separation|annulment/.test(u.end && u.end.reason)) {
          const mx = (a.x + W + b.x) / 2;
          marks.push(`<path class="umark" d="M${mx - 7} ${y + 7}l6 -14M${mx + 1} ${y + 7}l6 -14"/>`);
        }
      } else {
        const x1 = a.x + W / 2, x2 = b.x + W / 2, y1 = a.y, y2 = b.y;
        const lift = 30 + Math.min(60, Math.abs(x2 - x1) / 8);
        const d = `M${x1} ${y1}C${x1} ${y1 - lift} ${x2} ${y2 - lift} ${x2} ${y2}`;
        edges.push(`<path class="${cls}"${dataAttr} d="${d}"><title>${tip}</title></path>`);
        if (u) edges.push(`<path class="uhit"${dataAttr} d="${d}"><title>${tip}</title></path>`);
      }
    }

    // parent → child connectors
    for (const f of lay.families) {
      if (!f.children.length) continue;
      const ps = f.parents.map((id) => pos.get(id));
      let jx = f.jx, jy = f.jy;
      const types = [...new Set(f.children.map((c) => c.type))];
      const trunkCls = 'trunk' + (types.length === 1 ? ' pl-' + types[0] : '');
      if (f.parents.length === 2 && !f.adjacent) {
        // partners not side by side (e.g. a 3rd partner): bracket under both boxes so the
        // children visibly come from the pair, not from whoever sits between them
        const by = Math.max(...ps.map((p) => p.y)) + H + 12 + (lay.families.indexOf(f) % 3) * 5;
        const [x1, x2] = ps.map((p) => p.x + W / 2 + (p.x < (ps[0].x + ps[1].x) / 2 ? W / 4 : -W / 4));
        edges.push(`<path class="${trunkCls}" d="M${x1} ${ps[0].y + H}V${by}H${x2}V${ps[1].y + H}"/>`);
        jx = (x1 + x2) / 2;
        jy = by;
      }
      const kids = f.children.map((c) => ({ c, p: pos.get(c.id) }));
      const xs = kids.map((k) => k.p.x + W / 2).concat(jx);
      const busY = f.busY;
      edges.push(`<path class="${trunkCls}" d="M${jx} ${jy}V${busY}H${Math.min(...xs)}M${jx} ${busY}H${Math.max(...xs)}"/>`);
      for (const k of kids) {
        const kx = k.p.x + W / 2;
        edges.push(`<path class="drop pl-${k.c.type}" d="M${kx} ${busY}V${k.p.y}"><title>${U.esc(GT.model.label(GT.model.PARENT_TYPES, k.c.type))}</title></path>`);
      }
    }

    // "other" relationships
    if (opt.showOthers) {
      for (const o of prj.data.others) {
        const a = pos.get(o.a), b = pos.get(o.b);
        if (!a || !b) continue;
        const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y + H;
        const drop = 40 + Math.abs(x2 - x1) / 10;
        edges.push(`<path class="oline" d="M${x1} ${y1}C${x1} ${y1 + drop} ${x2} ${y2 + drop} ${x2} ${y2}"><title>${U.esc(o.label)}</title></path>`);
      }
    }

    // people
    for (const n of lay.nodes) {
      const p = prj.person(n.id);
      const cls = ['node', 'sex-' + p.sex];
      if (prj.isDeceased(p)) cls.push('deceased');
      if (n.id === opt.focusId) cls.push('focus');
      if (n.id === opt.selectedId) cls.push('selected');
      const thumb = p.photo && opt.thumbs.get(p.photo);
      const avatar = thumb
        ? `<image href="${thumb}" x="10" y="10" width="44" height="44" clip-path="url(#gt-circle)" preserveAspectRatio="xMidYMid slice"/>`
        : `<circle class="avatar" cx="32" cy="32" r="22"/><text class="initials" x="32" y="37">${U.esc(initials(p))}</text>`;
      const given = p.given || (p.surname ? '' : '(unnamed)');
      nodes.push(
        `<g class="${cls.join(' ')}" data-id="${n.id}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${U.esc(prj.displayName(p))}">` +
        `<title>${U.esc(prj.displayName(p) + (prj.lifespan(p) ? ' (' + prj.lifespan(p) + ')' : ''))}</title>` +
        `<rect class="box" width="${W}" height="${H}" rx="10"/><rect class="stripe" width="5" height="${H - 16}" x="0" y="8" rx="2"/>` +
        avatar +
        `<text class="nm" x="62" y="23">${U.esc(trunc(given, 15))}</text>` +
        `<text class="sn" x="62" y="39">${U.esc(trunc(p.surname || '', 16))}</text>` +
        `<text class="yr" x="62" y="55">${U.esc(trunc(prj.lifespan(p), 20))}</text>` +
        `</g>`);
    }

    svg.innerHTML =
      `<defs><clipPath id="gt-circle" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>` +
      `<g class="viewport"><g class="edges">${edges.join('')}</g><g class="marks">${marks.join('')}</g><g class="nodes">${nodes.join('')}</g></g>`;
    return svg.querySelector('.viewport');
  };

  /* ---------- pan / zoom ---------- */
  R.PanZoom = class {
    constructor(svg, handlers) {
      this.svg = svg;
      this.h = handlers;
      this.t = { x: 0, y: 0, k: 1 };
      this.pointers = new Map();
      this.moved = 0;
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
      }, { passive: false });
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        svg.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 1) { this.moved = 0; this.downTarget = e.target; }
        this.lastPinch = null;
      });
      svg.addEventListener('pointermove', (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        const prev = this.pointers.get(e.pointerId);
        const cur = { x: e.clientX, y: e.clientY };
        this.pointers.set(e.pointerId, cur);
        if (this.pointers.size === 1) {
          const dx = cur.x - prev.x, dy = cur.y - prev.y;
          this.moved += Math.abs(dx) + Math.abs(dy);
          if (this.moved > 4) { svg.classList.add('panning'); this.t.x += dx; this.t.y += dy; this.apply(); }
        } else if (this.pointers.size === 2) {
          const [p1, p2] = [...this.pointers.values()];
          const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const r = svg.getBoundingClientRect();
          const mx = (p1.x + p2.x) / 2 - r.left, my = (p1.y + p2.y) / 2 - r.top;
          if (this.lastPinch) this.zoomAt(mx, my, d / this.lastPinch);
          this.lastPinch = d;
          this.moved = 99;
        }
      });
      const end = (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.delete(e.pointerId);
        svg.classList.remove('panning');
        if (this.pointers.size === 0 && this.moved <= 4) {
          const node = this.downTarget && this.downTarget.closest && this.downTarget.closest('.node');
          const uline = this.downTarget && this.downTarget.closest && this.downTarget.closest('[data-union]');
          if (node) {
            // pointer capture retargets native dblclick to the <svg>, so detect it here
            const now = performance.now(), id = node.dataset.id;
            if (this.lastClick && this.lastClick.id === id && now - this.lastClick.t < 400) {
              this.lastClick = null;
              this.h.dblclick && this.h.dblclick(id);
            } else {
              this.lastClick = { id, t: now };
              this.h.click && this.h.click(id);
            }
          } else if (uline) this.h.union && this.h.union(uline.dataset.union);
          else this.h.background && this.h.background();
        }
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('keydown', (e) => {
        const node = e.target.closest && e.target.closest('.node');
        if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.h.click && this.h.click(node.dataset.id); }
      });
    }
    setViewport(vp) { this.vp = vp; this.apply(); }
    apply() { if (this.vp) this.vp.setAttribute('transform', `translate(${this.t.x},${this.t.y}) scale(${this.t.k})`); }
    zoomAt(sx, sy, f) {
      const k = Math.min(3, Math.max(0.08, this.t.k * f));
      f = k / this.t.k;
      this.t.x = sx - (sx - this.t.x) * f;
      this.t.y = sy - (sy - this.t.y) * f;
      this.t.k = k;
      this.apply();
    }
    zoomBy(f) { const r = this.svg.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, f); }
    fit(w, h) {
      const r = this.svg.getBoundingClientRect();
      const k = Math.min(1.1, Math.max(0.08, Math.min(r.width / w, r.height / h) * 0.96));
      this.t = { k, x: (r.width - w * k) / 2, y: (r.height - h * k) / 2 };
      this.apply();
    }
    centerOn(x, y, k) {
      const r = this.svg.getBoundingClientRect();
      if (k) this.t.k = k;
      this.t.x = r.width / 2 - x * this.t.k;
      this.t.y = r.height / 2 - y * this.t.k;
      this.apply();
    }
  };
})(window.GT = window.GT || {});
