/* Genealogy Tool — dialogs, person picker, person panel. */
(function (GT) {
  'use strict';
  const U = GT.util, M = GT.model, I = GT.infer, S = GT.store;
  const UI = (GT.ui = {});
  const esc = U.esc;

  const options = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');

  /* ---------- toast ---------- */
  let toastT;
  UI.toast = (msg, ms = 2800) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, ms);
  };

  /* ---------- generic dialog ----------
     buttons: [{label, value, cls, left}] ; validate(value, root) may return a value or a Promise,
     throw to show an error. Resolves with validate's result (or the button value), null on cancel. */
  UI.dialog = function ({ title, body, buttons, onOpen, validate }) {
    const dlg = document.getElementById('dialog');
    if (dlg._finish) dlg._finish(null, true); // a dialog opened from inside another replaces it
    buttons =buttons || [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', cls: 'primary' }];
    dlg.innerHTML =
      `<form method="dialog" novalidate><div class="dhead"><h2>${esc(title)}</h2></div>` +
      `<div class="dbody">${body || ''}<div class="err" role="alert"></div></div>` +
      `<div class="dfoot">${buttons.map((b) => `<button class="btn ${b.cls || ''} ${b.left ? 'left' : ''}" value="${esc(b.value)}">${esc(b.label)}</button>`).join('')}</div></form>`;
    return new Promise((resolve) => {
      const form = dlg.querySelector('form');
      const err = dlg.querySelector('.err');
      let done = false;
      const finish = (v, replaced) => {
        if (done) return;
        done = true;
        dlg._finish = null;
        if (!replaced) dlg.close();
        resolve(v);
      };
      dlg._finish = finish;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = (e.submitter && e.submitter.value) || (buttons.find((b) => /primary/.test(b.cls || '')) || {}).value || 'ok';
        if (value === 'cancel') return finish(null);
        try {
          const r = validate ? await validate(value, dlg) : value;
          if (r === undefined) return; // stay open
          finish(r);
        } catch (ex) {
          err.textContent = ex.message || String(ex);
        }
      });
      dlg.oncancel = (e) => { e.preventDefault(); finish(null); };
      if (!dlg.open) dlg.showModal();
      if (onOpen) onOpen(dlg);
      const first = dlg.querySelector('[autofocus]') || dlg.querySelector('.dbody input, .dbody select');
      if (first) first.focus();
    });
  };

  UI.confirm = (title, text, okLabel = 'OK', danger = false) =>
    UI.dialog({
      title, body: `<p>${esc(text)}</p>`,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: okLabel, value: 'ok', cls: danger ? 'primary danger' : 'primary' }],
    }).then((v) => v === 'ok');

  UI.prompt = (title, label, value = '') =>
    UI.dialog({
      title,
      body: `<label class="field">${esc(label)}<input name="v" value="${esc(value)}" autofocus></label>`,
      validate: (v, root) => {
        const s = root.querySelector('[name=v]').value.trim();
        if (!s) throw new Error('Please enter a value.');
        return s;
      },
    });

  /* ---------- person picker (existing or new) ---------- */
  UI.pickPerson = function (app, o) {
    const prj = app.prj;
    const exclude = o.exclude || new Set();
    const pool = prj.data.people.filter((p) => !exclude.has(p.id));
    const startNew = !pool.length || o.startNew;
    const body =
      (o.intro ? `<p class="hint" style="margin:0">${o.intro}</p>` : '') +
      `<div class="seg" role="tablist"><button type="button" data-mode="existing">Existing person</button><button type="button" data-mode="new">New person</button></div>` +
      `<div class="m-existing"><input type="search" class="q" placeholder="Search ${pool.length} people by name…" aria-label="Search people"><div class="picklist" role="listbox"></div></div>` +
      `<div class="m-new grid2">` +
      `<label class="field">Given name(s)<input name="given"></label>` +
      `<label class="field">Surname<input name="surname" value="${esc(o.defaultSurname || '')}"></label>` +
      `<label class="field">Sex<select name="sex">${options(M.SEX, o.defaultSex || 'U')}</select></label>` +
      `<label class="field">Birth date<input name="birth" placeholder="${esc(U.dateHint)}"></label>` +
      `</div>` + (o.extraHtml || '');
    let mode = startNew ? 'new' : 'existing';
    let picked = null;
    return UI.dialog({
      title: o.title,
      body,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: o.submitLabel || 'Add', value: 'ok', cls: 'primary' }],
      onOpen: (root) => {
        const segBtns = root.querySelectorAll('.seg button');
        const ex = root.querySelector('.m-existing'), nw = root.querySelector('.m-new');
        const setMode = (m) => {
          mode = m;
          segBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
          ex.hidden = m !== 'existing';
          nw.hidden = m !== 'new';
          (m === 'existing' ? root.querySelector('.q') : root.querySelector('[name=given]')).focus();
        };
        segBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
        const list = root.querySelector('.picklist'), q = root.querySelector('.q');
        const draw = () => {
          const s = q.value.trim().toLowerCase();
          const hits = pool.filter((p) => !s || (prj.displayName(p) + ' ' + p.otherNames).toLowerCase().includes(s))
            .sort((a, b) => prj.displayName(a).localeCompare(prj.displayName(b))).slice(0, 60);
          list.innerHTML = hits.map((p) =>
            `<button type="button" data-id="${p.id}" class="${p.id === picked ? 'on' : ''}">${app.branchDot(p.id)}${esc(prj.displayName(p))}<span class="meta">${esc(prj.lifespan(p))}</span></button>`).join('') +
            (s ? `<button type="button" data-new="1"><span class="new">+ New person “${esc(q.value.trim())}”</span></button>` : '') +
            (!hits.length && !s ? '<p class="hint" style="padding:8px">Nobody else yet.</p>' : '');
        };
        list.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.new) {
            const parts = q.value.trim().split(/\s+/);
            root.querySelector('[name=given]').value = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
            if (parts.length > 1) root.querySelector('[name=surname]').value = parts[parts.length - 1];
            setMode('new');
            return;
          }
          picked = b.dataset.id;
          list.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        });
        list.addEventListener('dblclick', (e) => {
          const b = e.target.closest('button[data-id]');
          if (b) root.querySelector('.dfoot .primary').click();
        });
        q.addEventListener('input', draw);
        draw();
        setMode(mode);
        if (o.onOpen) o.onOpen(root);
      },
      validate: (value, root) => {
        let id, isNew = false;
        if (mode === 'existing') {
          if (!picked) throw new Error('Pick someone from the list, or switch to “New person”.');
          id = picked;
          o.apply(id, root, false);
        } else {
          const given = root.querySelector('[name=given]').value.trim();
          const surname = root.querySelector('[name=surname]').value.trim();
          if (!given && !surname) throw new Error('Enter at least a given name or a surname.');
          const p = prj.addPerson({
            given, surname, sex: root.querySelector('[name=sex]').value,
            birth: { date: root.querySelector('[name=birth]').value.trim(), place: '' },
          });
          id = p.id; isNew = true;
          try { o.apply(id, root, true); } catch (ex) { prj.removePerson(id); throw ex; }
        }
        return { id, isNew };
      },
    });
  };

  const SUGGESTED_OTHER = ['godparent', 'godchild', 'family friend', 'distant cousin, close to family', 'like a sibling',
    'like an aunt / uncle', 'mentor', 'caregiver', 'rakhi sibling', 'namesake', 'business partner', 'neighbour'];

  /* ---------- relationship actions ---------- */
  UI.addParent = (app, childId) => {
    const prj = app.prj;
    const existing = prj.parentsOf(childId);
    const sexes = existing.map((l) => prj.person(l.parent).sex);
    const defaultSex = sexes.includes('F') && !sexes.includes('M') ? 'M' : sexes.includes('M') && !sexes.includes('F') ? 'F' : 'U';
    const child = prj.person(childId);
    return UI.pickPerson(app, {
      title: 'Add a parent of ' + prj.displayName(child),
      exclude: new Set([childId, ...existing.map((l) => l.parent)]),
      defaultSex, defaultSurname: existing.length ? '' : child.surname,
      extraHtml: `<label class="field">Kind of parent<select name="ptype">${options(M.PARENT_TYPES, 'biological')}</select></label>` +
        `<p class="hint">Any number of parents can be recorded — birth parents, adoptive parents, step-parents and people who raised them informally.</p>`,
      apply: (id, root) => prj.addParentLink(id, childId, root.querySelector('[name=ptype]').value),
    });
  };

  UI.addChild = (app, parentId, union) => {
    const prj = app.prj;
    const parent = prj.person(parentId);
    const title = union
      ? 'Add a child of ' + prj.displayName(union.a) + ' & ' + prj.displayName(union.b)
      : 'Add a child of ' + prj.displayName(parent) + ' (no partner recorded)';
    const exclude = new Set([union ? union.a : parentId, union ? union.b : parentId]);
    return UI.pickPerson(app, {
      title, exclude,
      defaultSurname: (union ? prj.person(union.a).surname : parent.surname) || '',
      extraHtml: `<label class="field">Kind of parent–child link<select name="ptype">${options(M.PARENT_TYPES, 'biological')}</select></label>`,
      apply: (id, root) => {
        const t = root.querySelector('[name=ptype]').value;
        if (union) prj.linkChildToUnion(union, id, t);
        else prj.addParentLink(parentId, id, t);
      },
    });
  };

  UI.addPartner = (app, personId) => {
    const prj = app.prj;
    const p = prj.person(personId);
    return UI.pickPerson(app, {
      title: 'Add a partner / relationship for ' + prj.displayName(p),
      exclude: new Set([personId]),
      defaultSex: p.sex === 'F' ? 'M' : p.sex === 'M' ? 'F' : 'U',
      extraHtml:
        `<div class="grid2"><label class="field">Kind of relationship<select name="utype">${options(M.UNION_TYPES, 'marriage')}</select></label>` +
        `<label class="field">Offspring<select name="off">${options(M.OFFSPRING, 'unknown')}</select></label>` +
        `<label class="field full">Start / marriage date<input name="ustart" placeholder="${esc(U.dateHint)}"></label></div>` +
        `<p class="hint">Second and later relationships are numbered automatically by date. Parallel relationships can overlap in time.</p>`,
      apply: (id, root) => {
        app.lastUnion = prj.addUnion(personId, id, {
          type: root.querySelector('[name=utype]').value,
          offspring: root.querySelector('[name=off]').value,
          start: { date: root.querySelector('[name=ustart]').value.trim(), place: '' },
        });
      },
    });
  };

  UI.addOther = (app, personId) => {
    const prj = app.prj;
    return UI.pickPerson(app, {
      title: 'Add another kind of relationship',
      intro: 'For bonds that aren’t parent–child or partnership: godparents, “uncles” who are family friends, a distant cousin who is close to the family…',
      exclude: new Set([personId]),
      extraHtml:
        `<label class="field">How is this person related to ${esc(prj.displayName(personId))}?<input name="olabel" list="gt-other-sugg" placeholder="e.g. godparent, family friend"></label>` +
        `<datalist id="gt-other-sugg">${SUGGESTED_OTHER.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>` +
        `<label class="field">Notes<textarea name="onotes"></textarea></label>`,
      apply: (id, root) => {
        const label = root.querySelector('[name=olabel]').value.trim();
        if (!label) throw new Error('Describe the relationship (e.g. “godparent”).');
        prj.addOther(personId, id, label, root.querySelector('[name=onotes]').value.trim());
      },
    });
  };

  UI.editOther = async (app, oid) => {
    const prj = app.prj;
    const o = prj.data.others.find((x) => x.id === oid);
    if (!o) return;
    const r = await UI.dialog({
      title: prj.displayName(o.b) + ' — ' + o.label + ' — ' + prj.displayName(o.a),
      body: `<p class="hint" style="margin:0">Read as: <b>${esc(prj.displayName(o.b))}</b> is “label” to <b>${esc(prj.displayName(o.a))}</b>.</p>` +
        `<label class="field">Label<input name="olabel" list="gt-other-sugg" value="${esc(o.label)}"></label>` +
        `<datalist id="gt-other-sugg">${SUGGESTED_OTHER.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>` +
        `<label class="field">Notes<textarea name="onotes">${esc(o.notes)}</textarea></label>`,
      buttons: [{ label: 'Delete', value: 'delete', cls: 'danger', left: true }, { label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'ok', cls: 'primary' }],
      validate: (v, root) => {
        if (v === 'delete') return 'delete';
        const label = root.querySelector('[name=olabel]').value.trim();
        if (!label) throw new Error('Label cannot be empty.');
        return { label, notes: root.querySelector('[name=onotes]').value.trim() };
      },
    });
    if (r === 'delete') prj.removeOther(oid);
    else if (r) prj.updateOther(oid, r);
  };

  UI.editUnion = async (app, uid) => {
    const prj = app.prj;
    const u = prj.union(uid);
    if (!u) return;
    const kids = () => prj.childrenOfUnion(u);
    const kidsHtml = () => {
      const k = kids();
      return k.length
        ? k.map((c) => {
          const types = prj.parentsOf(c).filter((l) => l.parent === u.a || l.parent === u.b).map((l) => l.type);
          const t = [...new Set(types)].filter((x) => x !== 'biological');
          return `<div class="rel"><div class="who">${esc(prj.displayName(c))} <span class="meta">${esc(prj.lifespan(prj.person(c)))}</span>${t.length ? ` <span class="tag">${esc(t.join(', '))}</span>` : ''}</div>` +
            `<button type="button" class="btn small" data-unlink="${c}" title="Remove the parent links between this child and both partners">Unlink</button></div>`;
        }).join('')
        : '<p class="hint" style="margin:0">No children linked yet.</p>';
    };
    const r = await UI.dialog({
      title: prj.displayName(u.a) + ' & ' + prj.displayName(u.b),
      body:
        `<div class="grid2">` +
        `<label class="field">Kind of relationship<select name="type">${options(M.UNION_TYPES, u.type)}</select></label>` +
        `<label class="field">Offspring<select name="off">${options(M.OFFSPRING, u.offspring)}</select></label>` +
        `<label class="field">Start / marriage date<input name="sd" value="${esc(u.start.date)}" placeholder="${esc(U.dateHint)}"></label>` +
        `<label class="field">Place<input name="sp" value="${esc(u.start.place)}"></label>` +
        `<label class="field">Ended by<select name="er">${options(M.END_REASONS, u.end.reason || '')}</select></label>` +
        `<label class="field">End date<input name="ed" value="${esc(u.end.date)}"></label>` +
        `<label class="field full">Notes<textarea name="notes">${esc(u.notes)}</textarea></label></div>` +
        `<div><b style="font-size:13px">Children of this relationship</b><div class="ukids">${kidsHtml()}</div>` +
        `<button type="button" class="btn small" data-addkid style="margin-top:6px">+ Add / link a child</button></div>`,
      buttons: [{ label: 'Delete relationship', value: 'delete', cls: 'danger', left: true }, { label: 'Close', value: 'cancel' }, { label: 'Save', value: 'ok', cls: 'primary' }],
      onOpen: (root) => {
        root.querySelector('.ukids').addEventListener('click', (e) => {
          const b = e.target.closest('[data-unlink]');
          if (!b) return;
          prj.unlinkChildFromUnion(u, b.dataset.unlink);
          root.querySelector('.ukids').innerHTML = kidsHtml();
        });
        root.querySelector('[data-addkid]').addEventListener('click', async () => {
          save(root);
          await UI.addChild(app, u.a, u); // replaces this dialog…
          if (prj.union(uid)) UI.editUnion(app, uid); // …so reopen it afterwards
        });
      },
      validate: async (v, root) => {
        if (v === 'delete') {
          return 'delete';
        }
        save(root);
        return 'saved';
      },
    });
    function save(root) {
      prj.updateUnion(uid, {
        type: root.querySelector('[name=type]').value,
        offspring: root.querySelector('[name=off]').value,
        start: { date: root.querySelector('[name=sd]').value.trim(), place: root.querySelector('[name=sp]').value.trim() },
        end: { date: root.querySelector('[name=ed]').value.trim(), reason: root.querySelector('[name=er]').value },
        notes: root.querySelector('[name=notes]').value.trim(),
      });
    }
    if (r === 'delete') {
      const ok = await UI.confirm('Delete relationship?',
        'This removes the relationship record between ' + prj.displayName(u.a) + ' and ' + prj.displayName(u.b) +
        '. Their children stay linked to each parent individually.', 'Delete', true);
      if (ok) prj.removeUnion(uid);
    }
  };

  UI.deletePerson = async (app, id) => {
    const prj = app.prj;
    const ok = await UI.confirm('Delete ' + prj.displayName(id) + '?',
      'This removes the person and every parent link, relationship and “other” relationship they are part of. This cannot be undone (export first if unsure).', 'Delete', true);
    if (!ok) return false;
    const photo = prj.removePerson(id);
    if (photo) { S.deletePhoto(prj.id, photo).catch(() => {}); app.dropPhoto(photo); }
    return true;
  };

  /* ---------- person panel ---------- */
  const personLink = (prj, id) => `<button class="linkbtn" data-act="select" data-id="${id}">${esc(prj.displayName(id))}</button>`;
  const lifespanMeta = (prj, id) => { const s = prj.lifespan(prj.person(id)); return s ? ` <span class="meta">${esc(s)}</span>` : ''; };

  const dateField = (label, key, val) => {
    const p = U.parseDate(val);
    const warn = p && !p.ok ? 'Not recognised as a date — kept as text and not sortable.' : '';
    return `<label class="field">${label}<input data-field="${key}" value="${esc(val)}" placeholder="${esc(U.dateHint)}"><span class="warn" data-warn="${key}">${warn}</span></label>`;
  };

  UI.panelHTML = function (app, id) {
    const prj = app.prj;
    const p = prj.person(id);
    if (!p) return '';
    const thumb = p.photo && app.thumbs.get(p.photo);
    const detailsOpen = U.storageGet('detailsOpen', true);
    const h = [];
    const br = app.br();
    const myBr = br.of(id).map((i) => br.list[i]);
    const headStyle = myBr.length ? ` style="--b:var(--br${myBr[0].colour})"` : '';
    const chips = myBr.map((b) => `<span class="chip" style="--b:var(--br${b.colour})">${esc(b.label)}</span>`).join('');

    h.push(`<div class="phead${myBr.length ? ' branched' : ''}"${headStyle}>` +
      (thumb ? `<img class="photo" src="${thumb}" alt="" data-act="photo-view" style="cursor:zoom-in">` : `<div class="photo">${esc(((p.given || '?')[0] + (p.surname || ' ')[0]).trim().toUpperCase())}</div>`) +
      `<div class="ptitle"><h2 data-ph="name">${esc(prj.displayName(p))}</h2><div class="sub" data-ph="life">${esc(prj.lifespan(p))}</div>` +
      (chips ? `<div class="chips">${chips}</div>` : '') + `</div>` +
      `<button class="btn ghost x" data-act="close" title="Close" aria-label="Close panel">✕</button></div>`);

    h.push(`<div class="pactions">` +
      `<button class="btn small" data-act="focus">Centre tree on ${esc(p.given || 'this person')}</button>` +
      `<button class="btn small" data-act="relate">Relationship to…</button>` +
      `<button class="btn small danger" data-act="delete">Delete</button></div>`);

    // details
    h.push(`<details class="psec" ${detailsOpen ? 'open' : ''} data-act="details-toggle"><summary><h3 style="margin:0">Details</h3></summary><div class="grid2" style="margin-top:8px">` +
      `<label class="field">Given name(s)<input data-field="given" value="${esc(p.given)}"></label>` +
      `<label class="field">Surname<input data-field="surname" value="${esc(p.surname)}"></label>` +
      `<label class="field">Other names (maiden, alias)<input data-field="otherNames" value="${esc(p.otherNames)}"></label>` +
      `<label class="field">Sex<select data-field="sex">${options(M.SEX, p.sex)}</select></label>` +
      dateField('Birth date', 'birth.date', p.birth.date) +
      `<label class="field">Birth place<input data-field="birth.place" value="${esc(p.birth.place)}"></label>` +
      `<label class="field full"><span class="check"><input type="checkbox" data-field="deceased" ${p.deceased ? 'checked' : ''}> Deceased (tick if no death date is known)</span></label>` +
      dateField('Death date', 'death.date', p.death.date) +
      `<label class="field">Death place<input data-field="death.place" value="${esc(p.death.place)}"></label>` +
      `<div class="field full">Photo<div style="display:flex;gap:6px;flex-wrap:wrap">` +
      `<label class="btn small">${p.photo ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" data-act="photo" hidden></label>` +
      (p.photo ? `<button class="btn small" data-act="photo-view">View original</button><button class="btn small danger" data-act="photo-remove">Remove</button>` : '') +
      (p.photo && !thumb ? `<span class="warn">Photo file missing in this browser — import the ZIP export to restore it.</span>` : '') +
      `</div></div>` +
      `<label class="field full">Notes<textarea data-field="notes">${esc(p.notes)}</textarea></label>` +
      `<div class="field full">Other fields<div class="kvs">` +
      p.fields.map((f, i) => `<div class="kv"><input data-kv="${i}" data-kk="k" value="${esc(f.k)}" placeholder="Field" aria-label="Field name"><input data-kv="${i}" data-kk="v" value="${esc(f.v)}" placeholder="Value" aria-label="Field value"><button class="btn small ghost" data-act="kv-del" data-i="${i}" aria-label="Remove field">✕</button></div>`).join('') +
      `</div><button class="btn small" data-act="kv-add" style="align-self:flex-start">+ Add field</button></div>` +
      `</div></details>`);

    // parents
    const parents = prj.parentsOf(id);
    const ph = parents.map((l) =>
      `<div class="rel"><div class="who">${personLink(prj, l.parent)}${lifespanMeta(prj, l.parent)}</div>` +
      `<select class="small" data-act="ptype" data-link="${l.id}" aria-label="Kind of parent">${options(M.PARENT_TYPES, l.type)}</select>` +
      `<button class="btn small ghost" data-act="unlink-parent" data-link="${l.id}" title="Remove this parent link" aria-label="Remove parent link">✕</button></div>`).join('');
    let slots = '';
    for (let i = parents.length; i < 2; i++) slots += `<div class="slot">Parent not recorded<button class="btn small" data-act="add-parent">+ Add parent</button></div>`;
    let notice = '';
    const kin = parents.filter((l) => l.type === 'biological');
    if (kin.length === 2 && !prj.unionsBetween(kin[0].parent, kin[1].parent).length) {
      notice = `<div class="notice">${esc(prj.displayName(kin[0].parent))} and ${esc(prj.displayName(kin[1].parent))} have no recorded relationship.` +
        `<button class="btn small" data-act="add-parent-union" data-a="${kin[0].parent}" data-b="${kin[1].parent}">Add one</button></div>`;
    }
    h.push(`<section class="psec"><h3>Parents${parents.length >= 2 ? `<button class="btn small" data-act="add-parent">+ Another parent</button>` : ''}</h3>${ph}${slots}${notice}</section>`);

    // partners & children
    const unions = prj.unionsOf(id);
    const inUnion = new Set();
    const uh = unions.map((u) => {
      const other = prj.partnerIn(u, id);
      const kids = prj.childrenOfUnion(u);
      kids.forEach((k) => inUnion.add(k));
      const dates = [u.start.date && esc(u.start.date), (u.end.reason || u.end.date) && ('ended ' + esc([u.end.date, u.end.reason && M.label(M.END_REASONS, u.end.reason).toLowerCase()].filter(Boolean).join(', ')))].filter(Boolean).join(' · ');
      return `<div class="union u-${u.type}"><div class="uhead"><span class="tag u-${u.type}">${esc(prj.unionOrderLabel(u, id) + M.label(M.UNION_TYPES, u.type).toLowerCase())}</span>` +
        `${personLink(prj, other)}${lifespanMeta(prj, other)}</div>` +
        (dates ? `<div class="meta" style="font-size:12px;color:var(--muted)">${dates}</div>` : '') +
        `<div class="kids">` + (kids.length
          ? kids.map((k) => {
            const t = prj.parentsOf(k).filter((l) => l.parent === id).map((l) => l.type).filter((x) => x !== 'biological');
            return `<div>↳ ${personLink(prj, k)}${lifespanMeta(prj, k)}${t.length ? ` <span class="tag">${esc(t.join(', '))}</span>` : ''}</div>`;
          }).join('')
          : `<span class="meta" style="color:var(--muted)">${u.offspring === 'no' ? 'No offspring' : 'No children recorded'}</span>`) + `</div>` +
        `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn small" data-act="add-child" data-union="${u.id}">+ Child</button>` +
        `<button class="btn small" data-act="edit-union" data-union="${u.id}">Edit relationship</button></div></div>`;
    }).join('');
    const loose = prj.childrenOf(id).filter((l) => !inUnion.has(l.child));
    const lh = loose.length
      ? `<div class="union"><div class="uhead"><span class="tag">Children outside a recorded relationship</span></div><div class="kids">` +
        loose.map((l) => {
          const others = prj.parentsOf(l.child).filter((x) => x.parent !== id).map((x) => prj.displayName(x.parent));
          return `<div>↳ ${personLink(prj, l.child)}${lifespanMeta(prj, l.child)} <span class="tag">${esc(M.label(M.PARENT_TYPES, l.type))}</span>` +
            (others.length ? ` <span class="meta" style="color:var(--muted)">other parent(s): ${esc(others.join(', '))}</span>` : '') + `</div>`;
        }).join('') + `</div></div>`
      : '';
    h.push(`<section class="psec"><h3>Partners &amp; children</h3>${uh}${lh}` +
      `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn small" data-act="add-partner">+ Partner / relationship</button>` +
      `<button class="btn small" data-act="add-child">+ Child without partner</button></div></section>`);

    // siblings (inferred)
    const sibs = I.siblings(prj, id);
    h.push(`<section class="psec"><h3>Siblings <span style="text-transform:none;letter-spacing:0;font-weight:400">(inferred)</span></h3>` +
      (sibs.length
        ? sibs.map((s) => `<div class="rel"><div class="who">${personLink(prj, s.id)}${lifespanMeta(prj, s.id)}</div><span class="tag k-${s.kind}">${esc(I.SIB_LABEL[s.kind])}</span></div>`).join('')
        : '<p class="hint" style="margin:0">None — siblings appear automatically once parents are linked.</p>') + `</section>`);

    // other relationships
    const others = prj.othersOf(id);
    h.push(`<section class="psec"><h3>Other relationships<button class="btn small" data-act="add-other">+ Add</button></h3>` +
      (others.length
        ? others.map((o) => {
          const other = o.a === id ? o.b : o.a;
          const reading = o.a === id ? 'is “' + o.label + '” to them' : '“' + o.label + '”';
          return `<div class="rel"><div class="who">${personLink(prj, other)}<div class="meta">${esc(o.a === id ? prj.displayName(other) + ' is “' + o.label + '” to ' + (p.given || 'this person') : reading)}${o.notes ? ' — ' + esc(o.notes) : ''}</div></div>` +
            `<button class="btn small" data-act="edit-other" data-other="${o.id}">Edit</button></div>`;
        }).join('')
        : '<p class="hint" style="margin:0">Godparents, close family friends, distant-but-close cousins…</p>') + `</section>`);

    // inferred relatives
    const groups = I.relatives(prj, id);
    if (groups.length) {
      h.push(`<section class="psec inferred"><h3>More relatives <span style="text-transform:none;letter-spacing:0;font-weight:400">(inferred)</span></h3>` +
        groups.map((g) => `<div class="grp"><b>${esc(g.title)}</b><ul>` +
          g.items.map((it) => `<li>${personLink(prj, it.id)}${it.note ? ` <span class="meta">— ${esc(it.note)}</span>` : ''}</li>`).join('') + `</ul></div>`).join('') +
        `</section>`);
    }
    return h.join('');
  };

  /* Events from the panel (delegated; bound once by app). */
  UI.bindPanel = function (app, panel) {
    const setPath = (obj, path, val) => {
      const parts = path.split('.');
      if (parts.length === 1) return { [path]: val };
      return { [parts[0]]: Object.assign({}, obj[parts[0]], { [parts[1]]: val }) };
    };
    panel.addEventListener('change', async (e) => {
      const t = e.target;
      const prj = app.prj, id = app.selectedId;
      const p = prj.person(id);
      if (!p) return;
      if (t.dataset.field) {
        const val = t.type === 'checkbox' ? t.checked : t.value.trim();
        prj.updatePerson(id, setPath(p, t.dataset.field, val), 'fields');
        const w = panel.querySelector(`[data-warn="${t.dataset.field}"]`);
        if (w) { const d = U.parseDate(val); w.textContent = d && !d.ok ? 'Not recognised as a date — kept as text and not sortable.' : ''; }
        panel.querySelector('[data-ph=name]').textContent = prj.displayName(p);
        panel.querySelector('[data-ph=life]').textContent = prj.lifespan(p);
      } else if (t.dataset.kv) {
        const fields = p.fields.slice();
        fields[+t.dataset.kv] = Object.assign({}, fields[+t.dataset.kv], { [t.dataset.kk]: t.value.trim() });
        prj.updatePerson(id, { fields }, 'fields');
      } else if (t.dataset.act === 'ptype') {
        prj.updateParentLink(t.dataset.link, { type: t.value });
      } else if (t.dataset.act === 'photo' && t.files[0]) {
        await app.setPhoto(id, t.files[0]);
      }
    });
    panel.addEventListener('toggle', (e) => {
      if (e.target.matches('details[data-act=details-toggle]')) U.storageSet('detailsOpen', e.target.open);
    }, true);
    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'SELECT' || b.tagName === 'DETAILS' || (b.tagName === 'INPUT' && b.type === 'file')) return;
      const prj = app.prj, id = app.selectedId;
      const act = b.dataset.act;
      const run = async (fn) => { try { await fn(); } catch (ex) { UI.toast(ex.message); } };
      switch (act) {
        case 'close': app.select(null); break;
        case 'select': app.select(b.dataset.id); break;
        case 'focus': app.setFocus(id, true); break;
        case 'relate': app.openRelate(id); break;
        case 'delete': if (await UI.deletePerson(app, id)) app.select(null); break;
        case 'add-parent': await run(() => UI.addParent(app, id)); break;
        case 'unlink-parent': {
          const l = prj.data.parentLinks.find((x) => x.id === b.dataset.link);
          if (l && await UI.confirm('Remove parent link?', 'Remove ' + prj.displayName(l.parent) + ' as a parent of ' + prj.displayName(l.child) + '? Both people stay in the tree.', 'Remove', true)) prj.removeParentLink(l.id);
          break;
        }
        case 'add-parent-union': await run(async () => {
          const u = prj.addUnion(b.dataset.a, b.dataset.b, { offspring: 'yes' });
          await UI.editUnion(app, u.id);
        }); break;
        case 'add-child': await run(() => UI.addChild(app, id, b.dataset.union ? prj.union(b.dataset.union) : null)); break;
        case 'edit-union': await UI.editUnion(app, b.dataset.union); break;
        case 'add-partner': await run(async () => { const r = await UI.addPartner(app, id); if (r) UI.toast('Relationship added — use “+ Child” to seed offspring.'); }); break;
        case 'add-other': await run(() => UI.addOther(app, id)); break;
        case 'edit-other': await UI.editOther(app, b.dataset.other); break;
        case 'kv-add': prj.updatePerson(id, { fields: prj.person(id).fields.concat([{ k: '', v: '' }]) }, 'structure'); break;
        case 'kv-del': prj.updatePerson(id, { fields: prj.person(id).fields.filter((_, i) => i !== +b.dataset.i) }, 'structure'); break;
        case 'photo-view': app.viewPhoto(prj.person(id).photo); break;
        case 'photo-remove': await app.removePhoto(id); break;
      }
    });
  };
})(window.GT = window.GT || {});
