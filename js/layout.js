/* Genealogy Tool — layered family-graph layout (hand-written, no library).
   1. Families: each child is attached to a "family" = union (if tagged / if its two parents
      share a union) or a bare parent pair / single parent.
   2. Generations: children sit below parents, partners share a row, childless roots are
      pulled down next to their children.
   3. Rows are split into rigid partner "blocks"; blocks are ordered by barycentre sweeps
      and positioned by isotonic regression (PAV) so they sit as close as possible to the
      parents/children they connect to without overlapping.
   The same engine draws the focus (hourglass) view on a subset and the full family. */
(function (GT) {
  'use strict';
  const M = GT.model;
  const L = (GT.layout = {});

  L.W = 176;      // node box
  L.H = 64;
  L.PGAP = 40;    // gap between partners inside a block (room for the union line)
  L.BGAP = 34;    // gap between blocks
  L.VGAP = 90;    // gap between generations

  const TYPE_RANK = { biological: 0, unknown: 1, adoptive: 2, step: 3, foster: 3, guardian: 3, raised: 3 };

  /* ---------- which people the focus view shows ---------- */
  L.hourglassSet = function (prj, focus, o) {
    const inc = new Set([focus]);
    if (!prj.person(focus)) return inc;
    let fr = [focus];
    for (let d = 0; d < o.up; d++) {
      const nx = [];
      fr.forEach((c) => prj.parentsOf(c).forEach((l) => { if (!inc.has(l.parent)) { inc.add(l.parent); nx.push(l.parent); } }));
      if (o.partners) nx.slice().forEach((a) => prj.unionsOf(a).forEach((u) => inc.add(prj.partnerIn(u, a))));
      fr = nx;
    }
    const down = [focus];
    fr = [focus];
    for (let d = 0; d < o.down; d++) {
      const nx = [];
      fr.forEach((p) => prj.childrenOf(p).forEach((l) => { if (!inc.has(l.child)) { inc.add(l.child); nx.push(l.child); } }));
      down.push(...nx);
      fr = nx;
    }
    // partners of the focus person and descendants are always shown — they are the other parent
    down.forEach((p) => prj.unionsOf(p).forEach((u) => inc.add(prj.partnerIn(u, p))));
    if (o.siblings) prj.parentsOf(focus).forEach((l) => prj.childrenOf(l.parent).forEach((c) => inc.add(c.child)));
    return inc;
  };

  /* ---------- main ---------- */
  L.compute = function (prj, include) {
    const data = prj.data;
    const people = data.people.filter((p) => !include || include.has(p.id)).map((p) => p.id);
    const inc = new Set(people);
    const order0 = new Map(data.people.map((p, i) => [p.id, i]));

    /* 1. families */
    const fams = new Map();
    const fam = (key, union, parents) => {
      if (!fams.has(key)) fams.set(key, { key, union, parents, children: [] });
      return fams.get(key);
    };
    const addChild = (f, id, type) => {
      const ex = f.children.find((c) => c.id === id);
      if (!ex) f.children.push({ id, type });
      else if ((TYPE_RANK[type] || 0) > (TYPE_RANK[ex.type] || 0)) ex.type = type;
    };
    const unionOK = (u) => u && inc.has(u.a) && inc.has(u.b);
    data.unions.forEach((u) => { if (unionOK(u)) fam('u:' + u.id, u, [u.a, u.b]); });

    for (const c of people) {
      const links = prj.parentsOf(c).filter((l) => inc.has(l.parent));
      const rest = [];
      for (const l of links) {
        const u = l.unionId && prj.union(l.unionId);
        if (unionOK(u)) addChild(fam('u:' + u.id, u, [u.a, u.b]), c, l.type);
        else rest.push(l);
      }
      const byType = new Map();
      rest.forEach((l) => { if (!byType.has(l.type)) byType.set(l.type, []); byType.get(l.type).push(l); });
      for (const [type, group] of byType) {
        while (group.length) {
          const l = group.shift();
          let k = group.findIndex((m) => prj.unionsBetween(l.parent, m.parent).some(unionOK));
          if (k >= 0) {
            const m = group.splice(k, 1)[0];
            const u = prj.unionsBetween(l.parent, m.parent).find(unionOK);
            addChild(fam('u:' + u.id, u, [u.a, u.b]), c, type);
          } else if (group.length) {
            const m = group.shift();
            const pr = [l.parent, m.parent].sort();
            addChild(fam('p:' + pr.join('+'), null, pr), c, type);
          } else {
            addChild(fam('p:' + l.parent, null, [l.parent]), c, type);
          }
        }
      }
    }
    const famList = [...fams.values()];
    const famsAsChild = new Map(), famsAsParent = new Map();
    const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    famList.forEach((f) => {
      f.children.forEach((c) => push(famsAsChild, c.id, f));
      f.parents.forEach((p) => push(famsAsParent, p, f));
    });

    /* 2. generations */
    const gen = new Map(people.map((id) => [id, 0]));
    for (let outer = 0; outer < 60; outer++) {
      for (let it = 0; it < 300; it++) {
        let ch = false;
        for (const f of famList) {
          const pg = Math.max(...f.parents.map((p) => gen.get(p)));
          for (const p of f.parents) if (gen.get(p) < pg) { gen.set(p, pg); ch = true; }
          for (const c of f.children) if (gen.get(c.id) < pg + 1) { gen.set(c.id, pg + 1); ch = true; }
        }
        if (!ch) break;
      }
      let pulled = false;
      for (const p of people) {
        if (famsAsChild.has(p)) continue;
        const kids = (famsAsParent.get(p) || []).flatMap((f) => f.children.map((c) => gen.get(c.id)));
        if (!kids.length) continue;
        const target = Math.min(...kids) - 1;
        if (gen.get(p) < target) { gen.set(p, target); pulled = true; }
      }
      if (!pulled) break;
    }
    const minG = Math.min(0, ...gen.values());
    const maxG = Math.max(0, ...[...gen.values()].map((g) => g - minG));
    const layers = Array.from({ length: maxG + 1 }, () => []);
    people.forEach((id) => { gen.set(id, gen.get(id) - minG); layers[gen.get(id)].push(id); });

    /* 3. partner blocks per layer */
    const adj = new Map();
    famList.forEach((f) => {
      if (f.parents.length !== 2) return;
      const [a, b] = f.parents;
      if (gen.get(a) !== gen.get(b)) return;
      push(adj, a, b); push(adj, b, a);
    });
    const nb = (n) => [...new Set(adj.get(n) || [])];

    const blocksByLayer = layers.map((ids) => {
      const seen = new Set(), blocks = [];
      const sorted = ids.slice().sort((a, b) => order0.get(a) - order0.get(b));
      for (const s of sorted) {
        if (seen.has(s)) continue;
        const comp = [], q = [s];
        seen.add(s);
        while (q.length) { const n = q.shift(); comp.push(n); nb(n).forEach((m) => { if (!seen.has(m)) { seen.add(m); q.push(m); } }); }
        blocks.push({ members: orderComponent(comp, nb), x: 0 });
      }
      return blocks;
    });
    const blockW = (b) => b.members.length * L.W + (b.members.length - 1) * L.PGAP;
    const memberOff = (b, i) => i * (L.W + L.PGAP);

    /* position helpers */
    const cx = new Map(); // person → centre x
    const refresh = (layer) => {
      blocksByLayer[layer].forEach((b) => b.members.forEach((m, i) => cx.set(m, b.x + memberOff(b, i) + L.W / 2)));
    };
    const pack = (layer) => {
      let x = 0;
      blocksByLayer[layer].forEach((b) => { b.x = x; x += blockW(b) + L.BGAP; });
      refresh(layer);
    };
    blocksByLayer.forEach((_, i) => pack(i));

    const famX = (f) => f.parents.reduce((s, p) => s + cx.get(p), 0) / f.parents.length;

    const desiredFromParents = (b) => {
      const vals = [];
      b.members.forEach((m, i) => (famsAsChild.get(m) || []).forEach((f) => vals.push(famX(f) - memberOff(b, i) - L.W / 2)));
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    const desiredFromChildren = (b) => {
      let sum = 0, wsum = 0;
      const seen = new Set();
      b.members.forEach((m) => (famsAsParent.get(m) || []).forEach((f) => {
        if (seen.has(f) || !f.children.length) return;
        seen.add(f);
        const kidX = f.children.reduce((s, c) => s + cx.get(c.id), 0) / f.children.length;
        const offs = f.parents.map((p) => { const i = b.members.indexOf(p); return i < 0 ? null : memberOff(b, i) + L.W / 2; }).filter((v) => v != null);
        if (!offs.length) return;
        const jOff = offs.reduce((s, v) => s + v, 0) / offs.length;
        sum += (kidX - jOff) * f.children.length;
        wsum += f.children.length;
      }));
      return wsum ? sum / wsum : null;
    };

    /* flip a block's member order if its members' parents sit in the opposite order */
    const maybeFlip = (b) => {
      if (b.members.length < 2) return;
      const px = b.members.map((m) => {
        const fs = famsAsChild.get(m) || [];
        return fs.length ? fs.reduce((s, f) => s + famX(f), 0) / fs.length : null;
      });
      const known = px.map((v, i) => [v, i]).filter(([v]) => v != null);
      if (known.length < 2) {
        if (known.length === 1) {
          const [v, i] = known[0];
          const centre = b.x + blockW(b) / 2;
          const onLeft = i < (b.members.length - 1) / 2;
          if ((v < centre && !onLeft) || (v > centre && onLeft)) b.members.reverse();
        }
        return;
      }
      let inv = 0, ord = 0;
      for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) {
        if (known[i][0] > known[j][0]) inv++; else if (known[i][0] < known[j][0]) ord++;
      }
      if (inv > ord) b.members.reverse();
    };

    const placeLayer = (layer, desiredFn, reorder, flip) => {
      const blocks = blocksByLayer[layer];
      if (!blocks.length) return;
      if (flip) blocks.forEach(maybeFlip);
      const want = blocks.map((b) => { const d = desiredFn(b); return d == null ? b.x : d; });
      if (reorder) {
        const idx = blocks.map((b, i) => i).sort((i, j) => (want[i] + blockW(blocks[i]) / 2) - (want[j] + blockW(blocks[j]) / 2) || i - j);
        const nb2 = idx.map((i) => blocks[i]), nw = idx.map((i) => want[i]);
        blocks.splice(0, blocks.length, ...nb2);
        want.splice(0, want.length, ...nw);
      }
      // isotonic regression: left_i ≥ left_{i-1} + w_{i-1} + gap
      const off = [];
      let acc = 0;
      blocks.forEach((b, i) => { off.push(acc); acc += blockW(b) + L.BGAP; });
      const t = want.map((w, i) => w - off[i]);
      const wts = blocks.map((b) => b.members.length);
      const y = pav(t, wts);
      blocks.forEach((b, i) => { b.x = y[i] + off[i]; });
      refresh(layer);
    };

    for (let it = 0; it < 8; it++) {
      for (let g = 1; g <= maxG; g++) placeLayer(g, desiredFromParents, true, true);
      for (let g = maxG - 1; g >= 0; g--) placeLayer(g, desiredFromChildren, true, false);
    }
    for (let g = 1; g <= maxG; g++) placeLayer(g, desiredFromParents, false, false);
    for (let g = maxG - 1; g >= 0; g--) placeLayer(g, (b) => {
      // final gentle pass: only re-centre parents whose children are all in one family
      return desiredFromChildren(b);
    }, false, false);

    /* 4. output */
    let minX = Infinity, maxX = -Infinity;
    cx.forEach((v) => { minX = Math.min(minX, v - L.W / 2); maxX = Math.max(maxX, v + L.W / 2); });
    if (!isFinite(minX)) { minX = 0; maxX = 0; }
    const pad = 40;
    const X = (id) => cx.get(id) - L.W / 2 - minX + pad;
    const Y = (id) => gen.get(id) * (L.H + L.VGAP) + pad;
    const nodes = people.map((id) => ({ id, x: X(id), y: Y(id), gen: gen.get(id) }));
    const pos = new Map(nodes.map((n) => [n.id, n]));
    const slot = new Map(); // person → [layer, index within layer]
    blocksByLayer.forEach((blocks, g) => {
      let i = 0;
      blocks.forEach((b) => b.members.forEach((m) => slot.set(m, [g, i++])));
    });

    // family junctions + buses (stagger buses that share a gap)
    const outFams = famList.map((f) => {
      const ps = f.parents.map((p) => pos.get(p));
      const jx = ps.reduce((s, p) => s + p.x + L.W / 2, 0) / ps.length;
      const adjacent = ps.length === 2 && Math.abs(slot.get(f.parents[0])[1] - slot.get(f.parents[1])[1]) === 1 && ps[0].y === ps[1].y;
      const jy = ps.length === 2 && ps[0].y === ps[1].y ? ps[0].y + L.H / 2 : Math.max(...ps.map((p) => p.y)) + L.H;
      return { key: f.key, union: f.union, parents: f.parents, children: f.children, jx, jy, adjacent };
    });
    const byGap = new Map();
    outFams.forEach((f) => {
      if (!f.children.length) return;
      const top = Math.min(...f.children.map((c) => pos.get(c.id).y));
      f.childTop = top;
      push(byGap, top, f);
    });
    byGap.forEach((list, top) => {
      list.sort((a, b) => a.jx - b.jx);
      const n = list.length, step = n > 1 ? Math.min(14, (L.VGAP - 30) / (n - 1)) : 0;
      list.forEach((f, i) => { f.busY = top - L.VGAP / 2 - ((n - 1) * step) / 2 + i * step; });
    });

    return {
      nodes, pos, slot, families: outFams,
      rows: maxG + 1,
      rowY: (g) => g * (L.H + L.VGAP) + pad,
      width: maxX - minX + pad * 2,
      height: (maxG + 1) * (L.H + L.VGAP) - L.VGAP + pad * 2,
    };
  };

  /* order a connected set of partners into a row */
  function orderComponent(comp, nb) {
    if (comp.length <= 2) return comp;
    const set = new Set(comp);
    const deg = (n) => nb(n).filter((m) => set.has(m)).length;
    const maxDeg = Math.max(...comp.map(deg));
    const out = [];
    if (maxDeg <= 2) {
      const start = comp.find((n) => deg(n) === 1) || comp[0];
      const seen = new Set();
      let cur = start;
      while (cur && !seen.has(cur)) {
        seen.add(cur); out.push(cur);
        cur = nb(cur).find((m) => set.has(m) && !seen.has(m));
      }
      comp.forEach((n) => { if (!seen.has(n)) out.push(n); });
      return out;
    }
    const hub = comp.find((n) => deg(n) === maxDeg);
    const left = [], right = [], side = new Map();
    nb(hub).filter((m) => set.has(m)).forEach((m, i) => {
      if (i % 2 === 0) { right.push(m); side.set(m, 'R'); } else { left.unshift(m); side.set(m, 'L'); }
    });
    const placed = new Set([hub, ...side.keys()]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of comp) {
        if (placed.has(n)) continue;
        const anchor = nb(n).find((m) => placed.has(m) && m !== hub);
        if (!anchor) continue;
        const s = side.get(anchor) || 'R';
        if (s === 'L') left.unshift(n); else right.push(n);
        side.set(n, s); placed.add(n); changed = true;
      }
    }
    comp.forEach((n) => { if (!placed.has(n)) right.push(n); });
    return [...left, hub, ...right];
  }

  /* pool-adjacent-violators: weighted least squares under a non-decreasing constraint */
  function pav(t, w) {
    const st = [];
    for (let i = 0; i < t.length; i++) {
      st.push({ v: t[i], w: w[i], n: 1 });
      while (st.length > 1 && st[st.length - 2].v > st[st.length - 1].v) {
        const b = st.pop(), a = st.pop();
        const W = a.w + b.w;
        st.push({ v: (a.v * a.w + b.v * b.w) / W, w: W, n: a.n + b.n });
      }
    }
    const out = [];
    st.forEach((s) => { for (let k = 0; k < s.n; k++) out.push(s.v); });
    return out;
  }
  L._pav = pav;
})(window.GT = window.GT || {});
