/* Genealogy Tool — quick editing on the tree: the "+" menu on a card, drag-to-connect between
   cards, the "not connected" tray, siblings (with placeholder parents) and cousin links. */
(function (GT) {
  'use strict';
  const U = GT.util, M = GT.model, UI = GT.ui;
  const esc = U.esc;
  const C = (GT.connect = {});

  const options = (list, sel) => list.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const kinParents = (prj, id) => prj.parentsOf(id).filter((l) => M.KIN_TYPES.has(l.type)).map((l) => l.parent);
  const first = (prj, id) => { const p = prj.person(id); return (p && (p.given || prj.displayName(p))) || '?'; };

  /* ---------- siblings ---------- */
  /* Give `id` two placeholder parents joined by a marriage, unless they already have kin parents. */
  C.ensureParents = function (prj, id) {
    const have = kinParents(prj, id);
    if (have.length) return have;
    const p = prj.person(id), name = first(prj, id);
    const mk = (word) => prj.addPerson({
      given: word + ' of ' + name, surname: p.surname || '',
      notes: 'Placeholder created when a sibling of ' + name + ' was added.',
      fields: [{ k: 'To confirm', v: 'real name, sex, birth date, birth place' }],
    });
    const a = mk('Parent'), b = mk('Other parent');
    const u = prj.addUnion(a.id, b.id, { type: 'marriage', offspring: 'yes', notes: 'Placeholder parents.' });
    prj.linkChildToUnion(u, id, 'biological');
    return kinParents(prj, id);
  };

  /* Make `b` a sibling of `a`. via = 'full' (all of a's kin parents) or a parent id (half sibling). */
  C.makeSiblings = function (prj, a, b, via = 'full') {
    if (!kinParents(prj, a).length && kinParents(prj, b).length) [a, b] = [b, a];   // reuse b's parents
    const parents = via === 'full' ? C.ensureParents(prj, a) : [via];
    const u = parents.length === 2 && prj.unionsBetween(parents[0], parents[1])[0];
    if (u) { prj.linkChildToUnion(u, b, 'biological'); return; }
    for (const par of parents) if (!prj.parentsOf(b).some((l) => l.parent === par)) prj.addParentLink(par, b, 'biological');
  };

  const siblingChoiceHTML = (prj, id) => {
    const ps = kinParents(prj, id);
    if (!ps.length) return `<p class="hint">${esc(first(prj, id))} has no parents recorded yet, so two placeholder parents (“Parent of ${esc(first(prj, id))}”) and a marriage between them will be created. Rename them later.</p>`;
    return `<label class="field">Kind of sibling<select name="via">` +
      `<option value="full">Full sibling (child of ${esc(ps.map((x) => first(prj, x)).join(' & '))})</option>` +
      (ps.length > 1 ? ps.map((x) => `<option value="${x}">Half sibling through ${esc(first(prj, x))}</option>`).join('') : '') +
      `</select></label>`;
  };

  C.addSibling = (app, id) => {
    const prj = app.prj;
    return UI.pickPerson(app, {
      title: 'Add a sibling of ' + prj.displayName(id),
      exclude: new Set([id, ...kinParents(prj, id)]),
      defaultSurname: prj.person(id).surname || '',
      extraHtml: siblingChoiceHTML(prj, id),
      apply: (other, root) => {
        const v = root.querySelector('[name=via]');
        C.makeSiblings(prj, id, other, v ? v.value : 'full');
      },
    });
  };

  /* ---------- cousins: an "other" bond with kind 'cousin' (common ancestor not recorded) ---------- */
  C.addCousinLink = (prj, a, b, label, notes) => {
    const o = prj.addOther(a, b, label || 'cousin', notes || 'Common ancestor not recorded.');
    o.kind = 'cousin';
    prj.touch();
    return o;
  };
  const cousinHTML = `<label class="field">Label<input name="clabel" value="cousin" list="gt-cousin-sugg"></label>` +
    `<datalist id="gt-cousin-sugg"><option value="cousin"><option value="first cousin"><option value="second cousin"><option value="distant cousin"></datalist>` +
    `<p class="hint">Drawn as a dotted line. The shared grandparents aren’t created; when you find them, add the real parent links and delete this.</p>`;
  C.addCousin = (app, id) => {
    const prj = app.prj;
    return UI.pickPerson(app, {
      title: 'Add a cousin of ' + prj.displayName(id),
      exclude: new Set([id]),
      extraHtml: cousinHTML,
      apply: (other, root) => C.addCousinLink(prj, id, other, root.querySelector('[name=clabel]').value.trim()),
    });
  };

  /* ---------- connect two existing people (drag-and-drop or tray) ---------- */
  C.connectDialog = (app, a, b) => {
    const prj = app.prj;
    if (!prj.person(a) || !prj.person(b) || a === b) return null;
    const A = esc(prj.displayName(a)), B = esc(prj.displayName(b));
    const REL = [['partner', 'partner of'], ['parent', 'parent of'], ['child', 'child of'], ['sibling', 'sibling of'], ['cousin', 'cousin of'], ['other', 'related in another way to']];
    const body =
      `<p style="margin:0 0 10px"><b>${A}</b> is the …</p>` +
      `<div class="relpick">${REL.map(([k, l], i) => `<label><input type="radio" name="rel" value="${k}"${i === 0 ? ' checked' : ''}> ${l}</label>`).join('')}</div>` +
      `<p style="margin:10px 0"><b>${B}</b></p>` +
      `<div data-for="partner"><label class="field">Kind of relationship<select name="utype">${options(M.UNION_TYPES, 'marriage')}</select></label></div>` +
      `<div data-for="parent child"><label class="field">Kind of parent–child link<select name="ptype">${options(M.PARENT_TYPES, 'biological')}</select></label></div>` +
      `<div data-for="sibling">${siblingChoiceHTML(prj, b)}</div>` +
      `<div data-for="cousin">${cousinHTML}</div>` +
      `<div data-for="other"><label class="field">How are they related?<input name="olabel" placeholder="e.g. godparent, family friend, rakhi sibling"></label></div>`;
    return UI.dialog({
      title: 'Connect ' + prj.displayName(a) + ' and ' + prj.displayName(b),
      body,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Connect', value: 'ok', cls: 'primary' }],
      onOpen: (root) => {
        const sync = () => {
          const v = root.querySelector('[name=rel]:checked').value;
          root.querySelectorAll('[data-for]').forEach((d) => { d.hidden = !d.dataset.for.split(' ').includes(v); });
        };
        root.querySelectorAll('[name=rel]').forEach((r) => r.addEventListener('change', sync));
        sync();
      },
      validate: (value, root) => {
        const rel = root.querySelector('[name=rel]:checked').value;
        const q = (n) => root.querySelector(`[name=${n}]`);
        if (rel === 'partner') {
          if (prj.unionsBetween(a, b).length) throw new Error('They already have a relationship recorded. Add another from the person panel if this is a second one.');
          prj.addUnion(a, b, { type: q('utype').value });
        } else if (rel === 'parent') prj.addParentLink(a, b, q('ptype').value);
        else if (rel === 'child') prj.addParentLink(b, a, q('ptype').value);
        else if (rel === 'sibling') C.makeSiblings(prj, b, a, q('via') ? q('via').value : 'full');
        else if (rel === 'cousin') C.addCousinLink(prj, a, b, q('clabel').value.trim());
        else {
          const l = q('olabel').value.trim();
          if (!l) throw new Error('Describe the relationship (e.g. “godparent”).');
          prj.addOther(a, b, l, '');
        }
        return rel;
      },
    });
  };

  /* ---------- the "+" menu on a card ---------- */
  C.quickMenu = (app, id, x, y) => {
    C.closeMenu();
    const prj = app.prj;
    const name = esc(first(prj, id));
    const items = [
      ['parent', 'Parent'], ['child', 'Child'], ['partner', 'Partner'], ['sibling', 'Sibling'],
      ['cousin', 'Cousin'], ['other', 'Other bond…'], ['open', 'Open details'],
    ];
    const m = document.createElement('div');
    m.className = 'qmenu';
    m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="qh">Add to ${name}</div>` + items.map(([k, l]) => `<button type="button" role="menuitem" data-q="${k}">${l}</button>`).join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    m.querySelector('button').focus();
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      C.closeMenu();
      try {
        const k = b.dataset.q;
        let res;
        if (k === 'parent') res = await UI.addParent(app, id);
        else if (k === 'child') { const us = prj.unionsOf(id); res = await UI.addChild(app, id, us.length === 1 ? us[0] : null); }
        else if (k === 'partner') res = await UI.addPartner(app, id);
        else if (k === 'sibling') res = await C.addSibling(app, id);
        else if (k === 'cousin') res = await C.addCousin(app, id);
        else if (k === 'other') res = await UI.addOther(app, id);
        else app.select(id);
        if (res && res.isNew) UI.toast('Added ' + prj.displayName(res.id) + '.');
      } catch (ex) { UI.toast(ex.message, 5000); }
    });
    m.addEventListener('keydown', (e) => {
      const bs = [...m.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') C.closeMenu();
      else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    });
    setTimeout(() => document.addEventListener('pointerdown', C._outside = (e) => { if (!m.contains(e.target)) C.closeMenu(); }), 0);
  };
  C.closeMenu = () => {
    document.querySelectorAll('.qmenu').forEach((m) => m.remove());
    if (C._outside) { document.removeEventListener('pointerdown', C._outside); C._outside = null; }
  };

  /* ---------- groups not connected to the main family ---------- */
  /* Connected components over every kind of link. The main one is the component holding `mainId`
     (or the largest); everything else is returned as groups, largest first. */
  C.groups = (prj, mainId) => {
    const adj = new Map(prj.data.people.map((p) => [p.id, []]));
    const link = (a, b) => { if (adj.has(a) && adj.has(b)) { adj.get(a).push(b); adj.get(b).push(a); } };
    prj.data.parentLinks.forEach((l) => link(l.parent, l.child));
    prj.data.unions.forEach((u) => link(u.a, u.b));
    prj.data.others.forEach((o) => link(o.a, o.b));
    const seen = new Set(), comps = [];
    for (const p of prj.data.people) {
      if (seen.has(p.id)) continue;
      const comp = [], st = [p.id];
      seen.add(p.id);
      while (st.length) { const x = st.pop(); comp.push(x); adj.get(x).forEach((y) => { if (!seen.has(y)) { seen.add(y); st.push(y); } }); }
      comps.push(comp);
    }
    comps.sort((a, b) => b.length - a.length);
    const mi = Math.max(0, comps.findIndex((c) => c.includes(mainId)));
    return comps.filter((_, i) => i !== mi);
  };

  C.trayHTML = (app, mainId) => {
    const prj = app.prj;
    const gs = C.groups(prj, mainId);
    if (!gs.length) return '';
    const order = new Map(prj.data.people.map((p, i) => [p.id, i]));
    const n = gs.reduce((s, g) => s + g.length, 0);
    return `<details class="tray"${app.trayOpen ? ' open' : ''}><summary>Not connected <span class="cnt">${n}</span></summary>` +
      `<p class="hint">Drag a person onto a card to connect them. Click to open.</p>` +
      gs.map((g) => {
        const ids = g.slice().sort((a, b) => order.get(a) - order.get(b));
        return `<div class="tgroup">${g.length > 1 ? `<div class="tgh">${esc(ids.slice(0, 2).map((x) => first(prj, x)).join(' & '))}${g.length > 2 ? ' + ' + (g.length - 2) : ''}</div>` : ''}` +
          ids.map((x) => `<button type="button" class="tperson" data-tray="${x}" title="Drag onto a card to connect">${app.branchDot(x)}${esc(prj.displayName(x))}</button>`).join('') + `</div>`;
      }).join('') + `</details>`;
  };

  /* drag a tray person onto a card (pointer events, so it works with touch too) */
  C.bindTray = (app, view) => {
    view.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-tray]');
      if (!t || (e.button !== 0 && e.pointerType === 'mouse')) return;
      const id = t.dataset.tray, sx = e.clientX, sy = e.clientY;
      let ghost = null, over = null;
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (!ghost) {
          ghost = document.createElement('div');
          ghost.className = 'dragghost';
          ghost.textContent = app.prj.displayName(id);
          document.body.appendChild(ghost);
        }
        ghost.style.left = ev.clientX + 12 + 'px';
        ghost.style.top = ev.clientY + 12 + 'px';
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const node = el && el.closest && el.closest('svg.tree .node');
        if (over && over !== node) over.classList.remove('droptarget');
        over = node && node.dataset.id !== id ? node : null;
        if (over) over.classList.add('droptarget');
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        if (ghost) ghost.remove();
        if (over) { over.classList.remove('droptarget'); C.connectDialog(app, id, over.dataset.id); }
        else if (!ghost) app.select(id);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
      e.preventDefault();
    });
    view.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('details.tray')) app.trayOpen = e.target.open; }, true);
  };
})(window.GT = window.GT || {});
