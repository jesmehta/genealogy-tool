/* Genealogy Tool — inferred relationships. Nothing here is stored; it is all derived
   from parentLinks + unions (+ "other" relations for the connection path). */
(function (GT) {
  'use strict';
  const U = GT.util, M = GT.model;
  const I = (GT.infer = {});

  const kinTypes = (bioOnly) => (bioOnly ? new Set(['biological']) : M.KIN_TYPES);

  /* ---------- siblings ---------- */
  I.SIB_LABEL = {
    full: 'Full sibling',
    half: 'Half-sibling',
    sibling: 'Sibling (only one shared parent recorded)',
    adoptive: 'Adoptive sibling',
    raised: 'Raised together (step / foster / informal)',
    step: 'Step-sibling',
  };

  I.siblings = function (prj, id) {
    const mine = prj.parentsOf(id);
    const myKin = mine.filter((l) => M.KIN_TYPES.has(l.type));
    const myBio = mine.filter((l) => l.type === 'biological').length;
    const cand = new Map();
    for (const L of mine) {
      for (const C of prj.childrenOf(L.parent)) {
        if (C.child === id) continue;
        if (!cand.has(C.child)) cand.set(C.child, []);
        cand.get(C.child).push({ parent: L.parent, mine: L.type, theirs: C.type });
      }
    }
    const out = [];
    for (const [q, shared] of cand) {
      const theirBio = prj.parentsOf(q).filter((l) => l.type === 'biological').length;
      const bioShared = shared.filter((s) => s.mine === 'biological' && s.theirs === 'biological').length;
      const kinShared = shared.filter((s) => M.KIN_TYPES.has(s.mine) && M.KIN_TYPES.has(s.theirs)).length;
      let kind;
      if (bioShared >= 2) kind = 'full';
      else if (bioShared === 1) kind = myBio >= 2 && theirBio >= 2 ? 'half' : 'sibling';
      else if (kinShared >= 1) kind = 'adoptive';
      else kind = 'raised';
      out.push({ id: q, kind, via: shared.map((s) => s.parent) });
    }
    // step-siblings: child of my (kin) parent's partner, sharing no parent with me
    for (const L of myKin) {
      for (const u of prj.unionsOf(L.parent)) {
        const s = prj.partnerIn(u, L.parent);
        if (mine.some((l) => l.parent === s)) continue;
        for (const C of prj.childrenOf(s)) {
          if (C.child === id || cand.has(C.child) || out.some((o) => o.id === C.child)) continue;
          if (!M.KIN_TYPES.has(C.type)) continue;
          out.push({ id: C.child, kind: 'step', via: [L.parent, s] });
        }
      }
    }
    const order = ['full', 'half', 'sibling', 'adoptive', 'step', 'raised'];
    return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) ||
      (U.dateSort(prj.person(a.id).birth.date) || 0) - (U.dateSort(prj.person(b.id).birth.date) || 0));
  };

  /* ---------- ancestry ---------- */
  /* Map ancestorId → shortest distance (self at 0). */
  I.ancestors = function (prj, id, bioOnly) {
    const types = kinTypes(bioOnly);
    const dist = new Map([[id, 0]]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const c of frontier) {
        for (const l of prj.parentsOf(c)) {
          if (!types.has(l.type) || dist.has(l.parent)) continue;
          dist.set(l.parent, dist.get(c) + 1);
          next.push(l.parent);
        }
      }
      frontier = next;
    }
    return dist;
  };
  I.descendants = function (prj, id, bioOnly) {
    const types = kinTypes(bioOnly);
    const dist = new Map([[id, 0]]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const p of frontier) {
        for (const l of prj.childrenOf(p)) {
          if (!types.has(l.type) || dist.has(l.child)) continue;
          dist.set(l.child, dist.get(p) + 1);
          next.push(l.child);
        }
      }
      frontier = next;
    }
    return dist;
  };

  /* ---------- naming ---------- */
  const greats = (n) => (n <= 0 ? '' : n === 1 ? 'great-' : n === 2 ? 'great-great-' : n + '× great-');
  const ancestorName = (d, sex) =>
    d === 1 ? U.gw(sex, 'mother', 'father', 'parent')
      : greats(d - 2) + U.gw(sex, 'grandmother', 'grandfather', 'grandparent');
  const descendantName = (d, sex) =>
    d === 1 ? U.gw(sex, 'daughter', 'son', 'child')
      : greats(d - 2) + U.gw(sex, 'granddaughter', 'grandson', 'grandchild');

  /* dA = generations from A up to the common ancestor, dB = from B up. Describes B relative to A. */
  I.kinName = function (dA, dB, sexB, half) {
    const h = half ? 'half-' : '';
    if (dA === 0 && dB === 0) return 'self';
    if (dA === 0) return descendantName(dB, sexB);
    if (dB === 0) return ancestorName(dA, sexB);
    if (dA === 1 && dB === 1) return h + U.gw(sexB, 'sister', 'brother', 'sibling');
    if (dA === 1) {
      const n = dB - 2; // 0 niece, 1 grand-niece, 2 great-grand-niece
      return (n === 0 ? '' : n === 1 ? 'grand-' : greats(n - 1) + 'grand-') + h + U.gw(sexB, 'niece', 'nephew', 'nibling');
    }
    if (dB === 1) {
      const n = dA - 2; // 0 aunt, 1 great-aunt
      return greats(n) + h + U.gw(sexB, 'aunt', 'uncle', 'parent’s sibling');
    }
    const deg = Math.min(dA, dB) - 1, rem = Math.abs(dA - dB);
    let s = h + U.ordinal(deg) + ' cousin';
    if (rem) s += ' ' + (rem === 1 ? 'once' : rem === 2 ? 'twice' : rem + ' times') + ' removed';
    return s;
  };

  /* Blood/legal kinship only. Returns {name, dA, dB, via:[common ancestor ids]} or null. */
  I.kinship = function (prj, a, b, bioOnly) {
    if (a === b) return { name: 'self', dA: 0, dB: 0, via: [] };
    const A = I.ancestors(prj, a, bioOnly), B = I.ancestors(prj, b, bioOnly);
    let best = null;
    for (const [c, da] of A) {
      if (!B.has(c)) continue;
      const db = B.get(c), sum = da + db;
      if (!best || sum < best.sum || (sum === best.sum && Math.abs(da - db) < Math.abs(best.dA - best.dB))) best = { sum, dA: da, dB: db };
    }
    if (!best) return null;
    // all common ancestors at that exact level, minus ones that are ancestors of another (keep the lowest)
    const via = [];
    for (const [c, da] of A) if (B.has(c) && da === best.dA && B.get(c) === best.dB) via.push(c);
    const sexB = prj.person(b).sex;
    let half = false;
    if (best.dA > 0 && best.dB > 0 && via.length === 1) {
      if (best.dA === 1 && best.dB === 1) {
        const s = I.siblings(prj, a).find((x) => x.id === b);
        half = !!s && s.kind === 'half';
      } else {
        // half only if that common ancestor has a recorded partner who is NOT also a common ancestor
        half = prj.unionsOf(via[0]).length > 0 || prj.childrenOf(via[0]).some((l) =>
          prj.parentsOf(l.child).some((pl) => pl.parent !== via[0]));
      }
    }
    return { name: I.kinName(best.dA, best.dB, sexB, half), dA: best.dA, dB: best.dB, via };
  };

  const DIRECT_PARENT = {
    step: ['step-mother', 'step-father', 'step-parent'],
    foster: ['foster mother', 'foster father', 'foster parent'],
    guardian: ['guardian', 'guardian', 'guardian'],
    raised: ['raised them (informal mother figure)', 'raised them (informal father figure)', 'raised them (informal parent)'],
    adoptive: ['adoptive mother', 'adoptive father', 'adoptive parent'],
    unknown: ['mother (unconfirmed)', 'father (unconfirmed)', 'parent (unconfirmed)'],
  };
  const DIRECT_CHILD = {
    step: ['step-daughter', 'step-son', 'step-child'],
    foster: ['foster daughter', 'foster son', 'foster child'],
    guardian: ['ward', 'ward', 'ward'],
    raised: ['raised by them (informal daughter)', 'raised by them (informal son)', 'raised by them (informal child)'],
    adoptive: ['adopted daughter', 'adopted son', 'adopted child'],
    unknown: ['daughter (unconfirmed)', 'son (unconfirmed)', 'child (unconfirmed)'],
  };
  const pickSex = (arr, sex) => U.gw(sex, arr[0], arr[1], arr[2]);

  const UNION_WORD = {
    marriage: ['wife', 'husband', 'spouse'],
    civil: ['civil partner', 'civil partner', 'civil partner'],
    partnership: ['partner', 'partner', 'partner'],
    engagement: ['fiancée', 'fiancé', 'fiancé(e)'],
    parallel: ['partner (parallel relationship)', 'partner (parallel relationship)', 'partner (parallel relationship)'],
    other: ['partner', 'partner', 'partner'],
  };
  I.unionWord = (u, sex) => pickSex(UNION_WORD[u.type] || UNION_WORD.other, sex);

  const inLaw = (kin, sexB) => {
    if (kin.dA === 1 && kin.dB === 0) return U.gw(sexB, 'mother-in-law', 'father-in-law', 'parent-in-law');
    if (kin.dA === 1 && kin.dB === 1) return U.gw(sexB, 'sister-in-law', 'brother-in-law', 'sibling-in-law');
    return null;
  };

  /* Full relationship of B to A (B is A's …). */
  I.relate = function (prj, a, b, bioOnly) {
    const pa = prj.person(a), pb = prj.person(b);
    if (!pa || !pb) return null;
    const sexB = pb.sex;
    const results = [];
    if (a === b) return { primary: 'the same person', all: ['the same person'], path: [] };

    // direct parent/child links of non-kin types (kin types are named via kinship below)
    for (const l of prj.parentsOf(a)) if (l.parent === b && l.type !== 'biological') results.push(pickSex(DIRECT_PARENT[l.type], sexB));
    for (const l of prj.childrenOf(a)) if (l.child === b && l.type !== 'biological') results.push(pickSex(DIRECT_CHILD[l.type], sexB));

    // unions
    for (const u of prj.unionsBetween(a, b)) {
      let s = I.unionWord(u, sexB);
      if (u.end && (u.end.reason === 'divorce' || u.end.reason === 'separation' || u.end.reason === 'annulment')) s = 'former ' + s;
      results.push(s);
    }

    // kinship
    const kin = I.kinship(prj, a, b, bioOnly);
    if (kin) {
      const viaDirect = prj.parentsOf(a).some((l) => l.parent === b && l.type !== 'biological' && kin.dA === 1 && kin.dB === 0) ||
        prj.childrenOf(a).some((l) => l.child === b && l.type !== 'biological' && kin.dA === 0 && kin.dB === 1);
      if (!viaDirect) results.push(kin.name);
    } else {
      // step-sibling
      const sib = I.siblings(prj, a).find((s) => s.id === b);
      if (sib) results.push(I.SIB_LABEL[sib.kind].toLowerCase());
      // B is a blood relative of A's partner
      for (const u of prj.unionsOf(a)) {
        const s = prj.partnerIn(u, a);
        if (s === b) continue;
        const k = I.kinship(prj, s, b, bioOnly);
        if (!k) continue;
        const sName = prj.displayName(s);
        if (k.dA === 0 && k.dB === 1 && !prj.parentsOf(b).some((l) => l.parent === a)) results.push(U.gw(sexB, 'step-daughter', 'step-son', 'step-child') + ' (child of ' + sName + ')');
        else results.push((inLaw(k, sexB) || k.name + ' of ' + sName) + ' (via ' + sName + ')');
      }
      // B is the partner of A's blood relative
      for (const u of prj.unionsOf(b)) {
        const x = prj.partnerIn(u, b);
        if (x === a) continue;
        const k = I.kinship(prj, a, x, bioOnly);
        if (!k) continue;
        const xName = prj.displayName(x);
        let s;
        if (k.dA === 1 && k.dB === 0) s = U.gw(sexB, 'step-mother', 'step-father', 'step-parent') + ' (partner of ' + xName + ')';
        else if (k.dA === 1 && k.dB === 1) s = U.gw(sexB, 'sister-in-law', 'brother-in-law', 'sibling-in-law') + ' (partner of ' + xName + ')';
        else if (k.dA === 0 && k.dB === 1) s = U.gw(sexB, 'daughter-in-law', 'son-in-law', 'child-in-law') + ' (partner of ' + xName + ')';
        else if (k.dB === 1 && k.dA >= 2) s = I.kinName(k.dA, k.dB, sexB, false) + ' by marriage (partner of ' + xName + ')';
        else s = 'partner of ' + xName + ' (' + k.name + ')';
        results.push(s);
      }
    }
    // other relations
    for (const o of prj.othersOf(a)) if (o.a === b || o.b === b) results.push(o.label + ' (recorded relationship)');

    const path = I.path(prj, a, b);
    const uniq = [...new Set(results)];
    return {
      primary: uniq[0] || (path.length ? 'connected, but no named relationship' : 'not connected in this tree'),
      all: uniq,
      kin,
      path,
    };
  };

  /* Shortest connection over every stored edge — used as the "how" explanation. */
  I.path = function (prj, a, b) {
    const prev = new Map([[a, null]]);
    let frontier = [a];
    const edges = (id) => {
      const out = [];
      prj.parentsOf(id).forEach((l) => out.push([l.parent, 'child of', l]));
      prj.childrenOf(id).forEach((l) => out.push([l.child, 'parent of', l]));
      prj.unionsOf(id).forEach((u) => out.push([prj.partnerIn(u, id), 'partner of', u]));
      prj.othersOf(id).forEach((o) => out.push([o.a === id ? o.b : o.a, '“' + o.label + '” of', o]));
      return out;
    };
    while (frontier.length && !prev.has(b)) {
      const next = [];
      for (const c of frontier) {
        for (const [n, rel, rec] of edges(c)) {
          if (prev.has(n)) continue;
          prev.set(n, { from: c, rel, rec });
          next.push(n);
        }
      }
      frontier = next;
    }
    if (!prev.has(b)) return [];
    const steps = [];
    for (let c = b; prev.get(c); c = prev.get(c).from) {
      const p = prev.get(c);
      steps.unshift({ from: p.from, to: c, rel: p.rel, rec: p.rec });
    }
    return steps; // each step: "<from> is <rel> <to>"
  };

  /* ---------- family branches (for colour) ----------
     A branch starts at a "founding family": kin children whose recorded kin parents all have no
     kin parents themselves. Members = the founders + all kin descendants of those children.
     People descended from several branches belong to all of them (first = earliest founded).
     If one branch covers ≥ 75% of branched people, it is split into its children's lines
     (otherwise a single-patriarch tree would be one colour); its founders then stay neutral. */
  I.BRANCH_COLOURS = 8;
  I.branches = function (prj) {
    const kinParents = (id) => prj.parentsOf(id).filter((l) => M.KIN_TYPES.has(l.type)).map((l) => l.parent);
    const isRoot = (id) => kinParents(id).length === 0;
    const order = new Map(prj.data.people.map((p, i) => [p.id, i]));
    const fams = new Map();
    for (const p of prj.data.people) {
      const ps = kinParents(p.id);
      if (!ps.length || !ps.every(isRoot)) continue;
      const key = ps.slice().sort().join('+');
      if (!fams.has(key)) fams.set(key, { founders: ps.slice().sort((a, b) => order.get(a) - order.get(b)), kids: [] });
      fams.get(key).kids.push(p.id);
    }
    const famSort = (f) => {
      const u = f.founders.length === 2 && prj.unionsBetween(f.founders[0], f.founders[1])[0];
      const d = (u && U.dateSort(u.start.date)) ||
        Math.min(...f.kids.map((k) => U.dateSort(prj.person(k).birth.date) || Infinity));
      return isFinite(d) ? d : 1e12 + Math.min(...f.kids.map((k) => order.get(k)));
    };
    let seeds = [...fams.values()].sort((a, b) => famSort(a) - famSort(b))
      .map((f) => ({ founders: f.founders, kids: f.kids, foundersIn: true }));

    const kinDesc = (starts) => {
      const seen = new Set(starts), st = starts.slice();
      while (st.length) {
        const c = st.pop();
        for (const l of prj.childrenOf(c)) if (M.KIN_TYPES.has(l.type) && !seen.has(l.child)) { seen.add(l.child); st.push(l.child); }
      }
      return seen;
    };
    const assign = () => {
      const of = new Map();
      seeds.forEach((s, i) => {
        const members = kinDesc(s.kids);
        if (s.foundersIn) s.founders.forEach((f) => members.add(f));
        members.forEach((m) => { if (!of.has(m)) of.set(m, []); if (!of.get(m).includes(i)) of.get(m).push(i); });
        s.size = members.size;
      });
      return of;
    };
    let of = assign();
    const total = of.size;
    const big = seeds.findIndex((s) => s.size >= 0.75 * total && s.kids.length >= 2);
    if (big >= 0 && total >= 6) {
      const s = seeds[big];
      const kids = s.kids.slice().sort((a, b) => (U.dateSort(prj.person(a).birth.date) || 1e12) - (U.dateSort(prj.person(b).birth.date) || 1e12));
      seeds.splice(big, 1, ...kids.map((k) => ({ founders: [k], kids: [k], foundersIn: false, line: true })));
      of = assign();
    }
    const list = seeds.map((s, i) => ({
      idx: i,
      colour: i % I.BRANCH_COLOURS,
      label: s.line ? prj.displayName(s.kids[0]) + '’s line'
        : s.founders.map((f) => prj.person(f).given || prj.displayName(f)).join(' & ') + (prj.person(s.founders[0]).surname ? ' ' + prj.person(s.founders[0]).surname : ''),
      size: s.size,
      founders: s.founders,
    }));
    return { list, of: (id) => of.get(id) || [] };
  };

  /* ---------- grouped relatives for the person panel ---------- */
  I.relatives = function (prj, id) {
    const groups = [];
    const add = (title, items) => { if (items.length) groups.push({ title, items }); };
    const anc = I.ancestors(prj, id), desc = I.descendants(prj, id);
    const byDist = (map, d) => [...map].filter(([, x]) => x === d).map(([k]) => k);

    add('Grandparents', byDist(anc, 2).map((x) => ({ id: x })));
    add('Great-grandparents', byDist(anc, 3).map((x) => ({ id: x })));
    add('Grandchildren', byDist(desc, 2).map((x) => ({ id: x })));
    add('Great-grandchildren', byDist(desc, 3).map((x) => ({ id: x })));

    // step-parents: partners of my parents who are not my parents
    const myParents = new Set(prj.parentsOf(id).map((l) => l.parent));
    const stepParents = [];
    for (const p of myParents) for (const u of prj.unionsOf(p)) {
      const s = prj.partnerIn(u, p);
      if (!myParents.has(s) && !stepParents.some((x) => x.id === s)) stepParents.push({ id: s, note: 'partner of ' + prj.displayName(p) });
    }
    add('Step-parents (by union)', stepParents);

    // step-children: partners' children who aren't mine
    const myKids = new Set(prj.childrenOf(id).map((l) => l.child));
    const stepKids = [];
    for (const u of prj.unionsOf(id)) {
      const s = prj.partnerIn(u, id);
      for (const l of prj.childrenOf(s)) if (!myKids.has(l.child) && !stepKids.some((x) => x.id === l.child))
        stepKids.push({ id: l.child, note: 'child of ' + prj.displayName(s) });
    }
    add('Step-children (by union)', stepKids);

    // aunts & uncles: siblings of kin parents (+ their partners)
    const aunts = [];
    for (const l of prj.parentsOf(id)) {
      if (!M.KIN_TYPES.has(l.type)) continue;
      for (const s of I.siblings(prj, l.parent)) {
        if (s.kind === 'step' || s.kind === 'raised' || aunts.some((x) => x.id === s.id)) continue;
        aunts.push({ id: s.id, note: (s.kind === 'half' ? 'half-sibling' : 'sibling') + ' of ' + prj.displayName(l.parent) });
        for (const u of prj.unionsOf(s.id)) {
          const sp = prj.partnerIn(u, s.id);
          if (!myParents.has(sp) && !aunts.some((x) => x.id === sp)) aunts.push({ id: sp, note: 'by marriage (partner of ' + prj.displayName(s.id) + ')' });
        }
      }
    }
    add('Aunts & uncles', aunts);

    // first cousins: kin children of blood aunts/uncles
    const cousins = [];
    for (const a of aunts) {
      if (a.note.startsWith('by marriage')) continue;
      for (const l of prj.childrenOf(a.id)) if (M.KIN_TYPES.has(l.type) && l.child !== id && !cousins.some((x) => x.id === l.child))
        cousins.push({ id: l.child, note: 'child of ' + prj.displayName(a.id) });
    }
    add('First cousins', cousins);

    // nieces & nephews
    const nn = [];
    for (const s of I.siblings(prj, id)) {
      if (s.kind === 'raised') continue;
      for (const l of prj.childrenOf(s.id)) if (M.KIN_TYPES.has(l.type) && !nn.some((x) => x.id === l.child))
        nn.push({ id: l.child, note: 'child of ' + prj.displayName(s.id) });
    }
    add('Nieces & nephews', nn);

    // in-laws
    const inl = [];
    const pushIn = (x, note) => { if (x !== id && !inl.some((y) => y.id === x)) inl.push({ id: x, note }); };
    for (const u of prj.unionsOf(id)) {
      const s = prj.partnerIn(u, id), sName = prj.displayName(s);
      prj.parentsOf(s).forEach((l) => pushIn(l.parent, 'parent of ' + sName));
      I.siblings(prj, s).filter((x) => x.kind !== 'raised').forEach((x) => pushIn(x.id, 'sibling of ' + sName));
    }
    for (const s of I.siblings(prj, id)) {
      if (s.kind === 'raised') continue;
      prj.unionsOf(s.id).forEach((u) => pushIn(prj.partnerIn(u, s.id), 'partner of ' + prj.displayName(s.id)));
    }
    for (const l of prj.childrenOf(id)) prj.unionsOf(l.child).forEach((u) => pushIn(prj.partnerIn(u, l.child), 'partner of ' + prj.displayName(l.child)));
    add('In-laws', inl);
    return groups;
  };
})(window.GT = window.GT || {});
