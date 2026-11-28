/* Genealogy Tool — app controller: projects, views, persistence, photos. */
(function (GT) {
  'use strict';
  const U = GT.util, S = GT.store, M = GT.model, I = GT.infer, IO = GT.io, L = GT.layout, R = GT.render, UI = GT.ui;
  const esc = U.esc;
  const $ = (s) => document.querySelector(s);

  const app = (GT.app = {
    prj: null,
    view: U.storageGet('view', 'tree'),
    focusId: null,
    selectedId: null,
    thumbs: new Map(),      // photoId → object URL (thumbnail)
    treeOpts: Object.assign({ mode: 'focus', up: 3, down: 3, siblings: true, partners: true, others: false }, U.storageGet('treeOpts', {})),
    extras: [],             // families added to the tree view from a ▲ badge: [{ id, roots }]
    graphOpts: Object.assign({ others: false }, U.storageGet('graphOpts', {})),
    pz: null,
    relate: { a: null, b: null, bioOnly: false },
  });

  /* Branch colouring, recomputed only when the project index is rebuilt (i.e. after a change). */
  app.br = () => {
    const idx = app.prj.idx;
    if (app._brIdx !== idx) { app._brIdx = idx; app._br = I.branches(app.prj); }
    return app._br;
  };
  app.branchDot = (id) => {
    const b = app.br().of(id);
    return `<span class="dot"${b.length ? ` style="background:var(--br${app.br().list[b[0]].colour})"` : ''}></span>`;
  };

  /* ---------- persistence ---------- */
  const saveState = (s) => { $('#saveState').textContent = s; };
  const save = U.debounce(async () => {
    if (!app.prj) return;
    try { await S.putProject(app.prj.data); saveState('Saved ✓'); }
    catch (e) { saveState('Save failed!'); UI.toast('Could not save: ' + e.message + ' — export to keep your work.', 6000); }
  }, 350);
  window.addEventListener('beforeunload', () => { if (app.prj) save.flush(); });

  /* ---------- projects ---------- */
  async function refreshProjectList() {
    const list = await S.listProjects();
    const sel = $('#projectSelect');
    sel.innerHTML = list.map((p) => `<option value="${p.id}"${app.prj && p.id === app.prj.id ? ' selected' : ''}>${esc(p.name)} (${p.people})</option>`).join('');
    return list;
  }

  async function openProject(data) {
    app.thumbs.forEach((u) => URL.revokeObjectURL(u));
    app.thumbs.clear();
    if (app.fullURL) { URL.revokeObjectURL(app.fullURL); app.fullURL = null; }
    app.prj = new M.Project(data);
    app.prj.onChange((kind) => {
      saveState('Saving…');
      save();
      renderView(kind);
      if (kind !== 'fields') renderPanel();
    });
    U.storageSet('lastProject', data.project.id);
    try {
      for (const r of await S.listPhotos(data.project.id)) app.thumbs.set(r.photoId, URL.createObjectURL(r.thumb || r.blob));
    } catch (e) { /* photos unavailable; tree still renders */ }
    const focus = U.storageGet('focus:' + data.project.id, null);
    app.focusId = focus && app.prj.person(focus) ? focus : (data.people[0] && data.people[0].id) || null;
    app.selectedId = null;
    app.resetView = true;
    await refreshProjectList();
    renderView();
    renderPanel();
    saveState('Saved ✓');
  }

  async function newProject(name, data) {
    const d = data || M.empty(name);
    if (name) d.project.name = name;
    await S.putProject(d);
    await openProject(d);
  }

  /* ---------- selection / focus ---------- */
  app.select = (id) => {
    app.selectedId = id && app.prj.person(id) ? id : null;
    renderPanel();
    if (app.view === 'tree' || app.view === 'graph') {
      document.querySelectorAll('svg.tree .node').forEach((n) => n.classList.toggle('selected', n.dataset.id === app.selectedId));
    } else if (app.view === 'list') renderView();
  };
  app.setFocus = (id, switchToTree) => {
    if (!app.prj.person(id)) return;
    app.focusId = id;
    app.extras = [];
    U.storageSet('focus:' + app.prj.id, id);
    app.resetView = true;
    if (switchToTree && app.view !== 'tree') setView('tree');
    else renderView();
  };
  /* tree mode: 'focus' (hourglass) or 'desc' (an ancestor's whole line) */
  app.setTreeMode = (mode, id) => {
    app.treeOpts.mode = mode;
    U.storageSet('treeOpts', app.treeOpts);
    app.builtView = null;
    if (id) app.setFocus(id, true);
    else { app.extras = []; app.resetView = true; if (app.view !== 'tree') setView('tree'); else renderView(); }
  };

  /* folded branches are stored with the project (so they survive export) */
  app.collapsed = () => app.prj.data.project.collapsed || [];
  app.toggleFold = (id) => {
    const c = app.collapsed();
    app.prj.data.project.collapsed = c.includes(id) ? c.filter((x) => x !== id) : c.concat(id);
    app.keepOn = id;
    app.prj.touch('view');
  };
  app.unfoldAll = () => { app.prj.data.project.collapsed = []; app.resetView = true; app.prj.touch('view'); };
  app.stub = (id) => {
    const s = app.scope && app.scope.stubs.get(id);
    if (!s) return;
    if (s.kind === 'up') {
      const ps = app.prj.parentsOf(id);
      const kin = ps.find((l) => M.KIN_TYPES.has(l.type)) || ps[0];
      if (kin) app.setFocus(kin.parent);
      return;
    }
    app.extras.push({ id, roots: L.topAncestors(app.prj, id) });
    app.keepOn = id;
    renderView();
  };

  app.openRelate = (id) => {
    app.relate.a = id;
    if (app.relate.b === id) app.relate.b = null;
    setView('relate');
  };

  /* ---------- photos ---------- */
  app.setPhoto = async (personId, file) => {
    if (!/^image\//.test(file.type)) return UI.toast('That file is not an image.');
    const prj = app.prj, p = prj.person(personId);
    const photoId = U.uid('ph');
    const thumb = await U.makeThumb(file);
    try { await S.putPhoto(prj.id, photoId, file, thumb); }
    catch (e) { return UI.toast('Could not store the photo: ' + e.message, 5000); }
    if (p.photo) { S.deletePhoto(prj.id, p.photo).catch(() => {}); app.dropPhoto(p.photo); delete prj.data.photos[p.photo]; }
    prj.data.photos[photoId] = { name: file.name, type: file.type };
    app.thumbs.set(photoId, URL.createObjectURL(thumb || file));
    prj.updatePerson(personId, { photo: photoId }, 'structure');
  };
  app.removePhoto = async (personId) => {
    const prj = app.prj, p = prj.person(personId);
    if (!p.photo) return;
    S.deletePhoto(prj.id, p.photo).catch(() => {});
    app.dropPhoto(p.photo);
    delete prj.data.photos[p.photo];
    prj.updatePerson(personId, { photo: null }, 'structure');
  };
  app.dropPhoto = (photoId) => {
    const u = app.thumbs.get(photoId);
    if (u) URL.revokeObjectURL(u);
    app.thumbs.delete(photoId);
  };
  app.viewPhoto = async (photoId) => {
    const rec = photoId && await S.getPhoto(app.prj.id, photoId);
    if (!rec) return UI.toast('Photo file is missing in this browser.');
    if (app.fullURL) URL.revokeObjectURL(app.fullURL);
    app.fullURL = URL.createObjectURL(rec.blob);
    const meta = app.prj.data.photos[photoId] || {};
    UI.dialog({
      title: meta.name || 'Photo',
      body: `<img src="${app.fullURL}" alt="" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:8px">`,
      buttons: [{ label: 'Close', value: 'cancel', cls: 'primary' }],
    });
  };

  /* ---------- views ---------- */
  function setView(v) {
    app.view = v;
    U.storageSet('view', v);
    document.querySelectorAll('.tabs [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    app.resetView = true;
    app.builtView = null;
    renderView();
  }

  function emptyState() {
    const sprig = `<svg class="sprig" viewBox="0 0 200 120" aria-hidden="true">` +
      `<path class="stem" d="M100 116C100 80 98 52 100 14M100 70C82 58 66 54 46 56M100 52C118 40 136 36 156 40M100 92C116 84 130 82 146 86M100 34C90 26 80 22 68 22"/>` +
      `<ellipse cx="46" cy="56" rx="14" ry="8" transform="rotate(-10 46 56)" style="fill:var(--br0)"/>` +
      `<ellipse cx="156" cy="40" rx="14" ry="8" transform="rotate(12 156 40)" style="fill:var(--br2)"/>` +
      `<ellipse cx="146" cy="86" rx="12" ry="7" transform="rotate(8 146 86)" style="fill:var(--br1)"/>` +
      `<ellipse cx="68" cy="22" rx="12" ry="7" transform="rotate(-18 68 22)" style="fill:var(--br4)"/>` +
      `<circle cx="100" cy="12" r="9" style="fill:var(--br3)"/></svg>`;
    return `<div class="empty">${sprig}<h2>${esc(app.prj.name)}</h2>` +
      `<p>This family has nobody in it yet. Start with yourself or the oldest ancestor you know — every person gets two parent slots ready to fill, and partners, children and other bonds can be added from their card.</p>` +
      `<div class="actions"><button class="btn primary" data-act="add-person">Add the first person</button>` +
      `<button class="btn" data-act="sample">Load the sample family</button><button class="btn" data-act="import">Import a file</button></div>` +
      `<p class="hint">Everything is stored in this browser only. Use <b>Export ZIP</b> to back up or move a family (data + photos).</p></div>`;
  }

  function renderView(kind) {
    const view = $('#view');
    if (!app.prj) { view.innerHTML = ''; return; }
    if (!app.prj.data.people.length) { app.builtView = 'empty'; view.innerHTML = emptyState(); return; }
    if (app.view === 'tree' || app.view === 'graph') return renderTree(view, kind);
    if (kind === 'fields' && app.view === 'relate') return;
    app.builtView = app.view;
    if (app.view === 'list') view.innerHTML = listHTML();
    else if (app.view === 'relate') view.innerHTML = relateHTML();
    if (app.view === 'list') { const q = view.querySelector('.listbar input'); if (q && app.listFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }

  /* --- tree / graph --- */
  function renderTree(view, kind) {
    const isTree = app.view === 'tree';
    const prj = app.prj;
    if (isTree && !prj.person(app.focusId)) app.focusId = prj.data.people[0].id;
    if (app.builtView !== app.view) {
      const o = app.treeOpts, g = app.graphOpts;
      view.innerHTML = `<div class="treewrap"><div class="treebar">` +
        (isTree
          ? `<select class="modesel" data-act="mode" aria-label="Tree mode"><option value="focus"${o.mode === 'focus' ? ' selected' : ''}>Centred on</option>` +
            `<option value="desc"${o.mode === 'desc' ? ' selected' : ''}>Descendants of</option></select> <span class="focusname"></span>` +
            (o.mode === 'desc' ? '' :
            `<label>Generations up <input type="number" min="0" max="12" data-opt="up" value="${o.up}"></label>` +
            `<label>down <input type="number" min="0" max="12" data-opt="down" value="${o.down}"></label>` +
            `<label><input type="checkbox" data-opt="siblings" ${o.siblings ? 'checked' : ''}> siblings</label>` +
            `<label><input type="checkbox" data-opt="partners" ${o.partners ? 'checked' : ''}> ancestors’ other partners</label>`) +
            `<label><input type="checkbox" data-opt="others" ${o.others ? 'checked' : ''}> other relationships</label>`
          : `<span>Everyone in <b>${esc(prj.name)}</b></span>` +
            `<label><input type="checkbox" data-gopt="others" ${g.others ? 'checked' : ''}> other relationships</label>` +
            `<label>Find <select data-act="jump"><option value="">—</option></select></label>`) +
        `<span class="extras"></span><span class="spacer"></span><button class="btn small" data-act="add-person">+ Person</button></div>` +
        `<svg class="tree" role="img" aria-label="Family tree"></svg>` +
        `<div class="zoomctl"><button class="btn" data-zoom="in" aria-label="Zoom in">+</button><button class="btn" data-zoom="out" aria-label="Zoom out">−</button><button class="btn" data-zoom="fit" aria-label="Fit to screen" title="Fit">⤢</button></div>` +
        legendHTML() + `</div>`;
      app.builtView = app.view;
      const svg = view.querySelector('svg.tree');
      app.pz = new R.PanZoom(svg, {
        click: (id) => app.select(id),
        dblclick: (id) => app.setFocus(id, true),
        union: (uid) => UI.editUnion(app, uid),
        background: () => {},
        fold: (id) => app.toggleFold(id),
        stub: (id) => app.stub(id),
      });
      app.resetView = true;
    }
    if (isTree) view.querySelector('.focusname').textContent = prj.displayName(app.focusId);
    else {
      const jump = view.querySelector('[data-act=jump]');
      jump.innerHTML = '<option value="">—</option>' + prj.data.people.slice()
        .sort((a, b) => prj.displayName(a).localeCompare(prj.displayName(b)))
        .map((p) => `<option value="${p.id}">${esc(prj.displayName(p))}</option>`).join('');
    }
    const sc = L.scope(prj, {
      mode: isTree ? app.treeOpts.mode : 'all', focus: app.focusId, opts: app.treeOpts,
      extraRoots: isTree ? app.extras.flatMap((e) => e.roots) : [], collapsed: app.collapsed(),
    });
    app.scope = sc;
    const ex = view.querySelector('.treebar .extras');
    const nFold = sc.folds.size;
    ex.innerHTML = (isTree ? app.extras.map((e, i) => `<span class="chip extra">+ ${esc(prj.person(e.id) ? (prj.person(e.id).given || prj.displayName(e.id)) : '?')}’s family` +
      `<button class="btn ghost" data-act="drop-extra" data-i="${i}" title="Remove from view" aria-label="Remove">✕</button></span>`).join('') : '') +
      (nFold ? `<button class="btn small" data-act="unfold-all" title="Unfold every folded branch">Unfold all (${nFold})</button>` : '');
    const lay = L.compute(prj, sc.include);
    app.lay = lay;
    const svg = view.querySelector('svg.tree');
    const br = app.br();
    const fg = isTree && lay.pos.get(app.focusId) ? lay.pos.get(app.focusId).gen : null;
    const focusGiven = isTree ? (prj.person(app.focusId).given || prj.displayName(app.focusId)) : '';
    const UP = ['', 'Parents', 'Grandparents', 'Great-grandparents', 'Great-great-grandparents'];
    const DOWN = ['', 'Children', 'Grandchildren', 'Great-grandchildren', 'Great-great-grandchildren'];
    const bandName = (g) => {
      if (fg == null) return 'Generation ' + (g + 1);
      if (app.treeOpts.mode === 'desc') return g === fg ? focusGiven : 'Generation ' + (g - fg + 1) + ' from ' + focusGiven;
      const d = g - fg;
      if (d === 0) return focusGiven + '’s generation';
      return d < 0 ? (UP[-d] || -d + ' generations up') : (DOWN[d] || d + ' generations down');
    };
    const vp = R.draw(svg, prj, lay, {
      focusId: isTree ? app.focusId : null,
      selectedId: app.selectedId,
      thumbs: app.thumbs,
      branches: br,
      showOthers: isTree ? app.treeOpts.others : app.graphOpts.others,
      folds: sc.folds, stubs: sc.stubs, canFold: sc.canFold,
      bandLabel: (g) => {
        // birth-year range of the people in this row: shows where generations overlap
        const ys = lay.nodes.filter((n) => n.gen === g).map((n) => U.year(prj.person(n.id).birth.date)).filter((y) => y != null).map(Math.floor);
        const range = ys.length ? ' · born ' + Math.min(...ys) + (Math.max(...ys) > Math.min(...ys) ? '–' + Math.max(...ys) : '') : '';
        return bandName(g) + range;
      },
    });
    const bl = view.querySelector('.legend .branches');
    if (bl) {
      bl.innerHTML = br.list.length
        ? br.list.map((b) => `<button class="row brow" data-act="branch" data-i="${b.idx}" title="Show this family’s descendants"><span class="dot" style="background:var(--br${b.colour})"></span>${esc(b.label)} <span class="hint">(${b.size})</span></button>`).join('') +
          `<div class="row"><span class="dot"></span>No branch (married in, parents not recorded)</div>`
        : '<p class="hint">Branches appear once children are linked to parents.</p>';
    }
    app.pz.setViewport(vp);
    if (app.keepOn && !app.resetView) { centerOnNode(app.keepOn); app.keepOn = null; }
    if (app.resetView) {
      app.keepOn = null;
      app.resetView = false;
      if (isTree && lay.pos.get(app.focusId) && (lay.width > svg.clientWidth * 1.2 || lay.height > svg.clientHeight * 1.2)) {
        centerOnNode(app.focusId, true);
      } else app.pz.fit(lay.width, lay.height);
    }
  }
  function centerOnNode(id, resetZoom) {
    const n = app.lay && app.lay.pos.get(id);
    if (n) app.pz.centerOn(n.x + L.W / 2, n.y + L.H / 2, resetZoom ? 0.9 : null);
  }

  function legendHTML() {
    const line = (cls, extra = '') => `<svg viewBox="0 0 34 10"><path class="${cls}" d="M2 5H32" ${extra}/></svg>`;
    return `<details class="legend"><summary>Legend</summary>` +
      `<b class="lh">Family branches</b><div class="branches"></div><b class="lh">Lines</b>` +
      `<div class="row">${line('uline u-marriage')} Marriage / civil union</div>` +
      `<div class="row">${line('uline u-partnership')} Partners, not married</div>` +
      `<div class="row">${line('uline u-parallel')} Parallel / extramarital</div>` +
      `<div class="row">${line('uline u-engagement')} Engagement</div>` +
      `<div class="row"><svg viewBox="0 0 34 10"><path class="uline u-marriage ended" d="M2 5H32"/><path class="umark" d="M12 9l4 -8M18 9l4 -8"/></svg> Ended (divorce / separation)</div>` +
      `<div class="row">${line('drop pl-biological')} Biological child</div>` +
      `<div class="row">${line('drop pl-adoptive')} Adopted</div>` +
      `<div class="row">${line('drop pl-step')} Step / foster / raised by</div>` +
      `<div class="row">${line('oline')} Other relationship</div>` +
      `<div class="row"><svg viewBox="0 0 34 10"><rect x="2" y="1" width="30" height="8" rx="2" fill="none" stroke="currentColor" stroke-dasharray="4 2"/></svg> Deceased</div>` +
      `<div class="row"><span style="width:34px;text-align:center">♀ ♂ ⚧</span> Sex (blank if unknown)</div>` +
      `<b class="lh">Folding</b>` +
      `<div class="row"><span class="lg-pill">▸ +12</span> Folded branch, 12 people hidden: click to unfold</div>` +
      `<div class="row"><span class="lg-pill stubpill">▲ 23</span> Their own family is not in this view: click to add it</div>` +
      `<p class="hint">Click a person to edit · double-click to centre · hover or select a card and click ▾ to fold its branch · click a family above to see its descendants · click a partner line to edit the relationship · drag to pan · scroll / pinch to zoom.</p></details>`;
  }

  /* --- list --- */
  app.listQuery = '';
  app.listSort = U.storageGet('listSort', { key: 'name', dir: 1 });
  function listHTML() {
    const prj = app.prj;
    const q = app.listQuery.toLowerCase();
    const rows = prj.data.people.filter((p) => !q || (prj.displayName(p) + ' ' + p.otherNames + ' ' + p.birth.place + ' ' + p.notes).toLowerCase().includes(q))
      .map((p) => ({
        p, name: prj.displayName(p), sur: p.surname, birth: U.dateSort(p.birth.date), death: U.dateSort(p.death.date),
        parents: prj.parentsOf(p.id).length, partners: prj.unionsOf(p.id).length, kids: prj.childrenOf(p.id).length,
      }));
    const k = app.listSort.key, dir = app.listSort.dir;
    rows.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return a.name.localeCompare(b.name);
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.name.localeCompare(b.name);
    });
    const th = (key, label, cls = '') => `<th class="${cls}" data-sort="${key}" aria-sort="${k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    return `<div class="listview"><div class="listbar"><input type="search" placeholder="Search names, places, notes…" value="${esc(app.listQuery)}" aria-label="Search people">` +
      `<button class="btn primary" data-act="add-person">+ Add person</button></div>` +
      `<div class="tablewrap"><table class="people"><thead><tr>${th('name', 'Name')}${th('sur', 'Surname', 'hide-sm')}${th('birth', 'Born')}${th('death', 'Died', 'hide-sm')}` +
      `${th('parents', 'Parents', 'num hide-sm')}${th('partners', 'Partners', 'num hide-sm')}${th('kids', 'Children', 'num hide-sm')}</tr></thead><tbody>` +
      rows.map((r) => `<tr data-id="${r.p.id}" class="${r.p.id === app.selectedId ? 'sel' : ''}"><td>${app.branchDot(r.p.id)}${esc(r.name)}${{ F: ' <span class="sx">♀</span>', M: ' <span class="sx">♂</span>', X: ' <span class="sx">⚧</span>' }[r.p.sex] || ''}${r.p.otherNames ? ` <span class="hint">(${esc(r.p.otherNames)})</span>` : ''}</td>` +
        `<td class="hide-sm">${esc(r.sur)}</td><td>${esc(r.p.birth.date)}</td><td class="hide-sm">${esc(r.p.death.date || (r.p.deceased ? '†' : ''))}</td>` +
        `<td class="num hide-sm">${r.parents}</td><td class="num hide-sm">${r.partners}</td><td class="num hide-sm">${r.kids}</td></tr>`).join('') +
      `</tbody></table></div><p class="hint">${rows.length} of ${prj.data.people.length} people · click a row to edit · double-click to centre the tree on them.</p></div>`;
  }

  /* --- relationship finder --- */
  function relateHTML() {
    const prj = app.prj, r = app.relate;
    const ppl = prj.data.people.slice().sort((a, b) => prj.displayName(a).localeCompare(prj.displayName(b)));
    if (r.a && !prj.person(r.a)) r.a = null;
    if (r.b && !prj.person(r.b)) r.b = null;
    const opts = (sel) => '<option value="">— choose —</option>' + ppl.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(prj.displayName(p))}${prj.lifespan(p) ? ' (' + esc(prj.lifespan(p)) + ')' : ''}</option>`).join('');
    let out = '';
    if (r.a && r.b) {
      const ab = I.relate(prj, r.a, r.b, r.bioOnly), ba = I.relate(prj, r.b, r.a, r.bioOnly);
      const nA = esc(prj.displayName(r.a)), nB = esc(prj.displayName(r.b));
      const stepTxt = (s) => `${esc(prj.displayName(s.from))} is <b>${esc(s.rel)}</b> ${esc(prj.displayName(s.to))}`;
      out = `<div class="card"><div class="big">${nB} is ${nA}’s ${esc(ab.primary)}</div>` +
        (ab.all.length > 1 ? `<p class="hint">Also: ${ab.all.slice(1).map(esc).join(' · ')}</p>` : '') +
        `<p style="margin:10px 0 0">${nA} is ${nB}’s <b>${esc(ba.primary)}</b></p>` +
        (ab.kin && ab.kin.via.length ? `<p class="hint">Closest common ancestor${ab.kin.via.length > 1 ? 's' : ''}: ${ab.kin.via.map((v) => esc(prj.displayName(v))).join(' & ')} ` +
          `(${ab.kin.dA} generation${ab.kin.dA === 1 ? '' : 's'} up from ${nA}, ${ab.kin.dB} from ${nB}).</p>` : '') +
        (ab.path.length ? `<h3 style="margin-top:14px;font-size:13px">Shortest connection</h3><ol class="path">${ab.path.map((s) => `<li>${stepTxt(s)}</li>`).join('')}</ol>` : '') +
        `</div>`;
    }
    return `<div class="relateview"><h2 style="margin:0 0 4px">Relationship finder</h2>` +
      `<p class="hint" style="margin:0 0 12px">Works out how two people are related from parent links and partnerships — siblings, cousins (nth, removed), in-laws, step-relations.</p>` +
      `<div class="pickers"><label>Person A<select data-rel="a">${opts(r.a)}</select></label>` +
      `<button class="btn" data-act="swap" title="Swap" aria-label="Swap people">⇄</button>` +
      `<label>Person B<select data-rel="b">${opts(r.b)}</select></label></div>` +
      `<label class="check" style="margin-top:10px"><input type="checkbox" data-rel="bio" ${r.bioOnly ? 'checked' : ''}> Biological links only (ignore adoption)</label>` +
      out + `</div>`;
  }

  /* ---------- panel ---------- */
  function renderPanel() {
    const panel = $('#panel');
    if (!app.prj || !app.selectedId || !app.prj.person(app.selectedId)) {
      app.selectedId = null;
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    const scroll = panel.scrollTop;
    const keepScroll = panel.dataset.for === app.selectedId;
    panel.innerHTML = UI.panelHTML(app, app.selectedId);
    panel.dataset.for = app.selectedId;
    panel.hidden = false;
    if (keepScroll) panel.scrollTop = scroll; else panel.scrollTop = 0;
  }

  /* ---------- add person (top-level) ---------- */
  async function addPersonDialog() {
    const r = await UI.dialog({
      title: 'Add a person',
      body: `<div class="grid2"><label class="field">Given name(s)<input name="given" autofocus></label>` +
        `<label class="field">Surname<input name="surname"></label>` +
        `<label class="field">Sex<select name="sex">${M.SEX.map(([v, l]) => `<option value="${v}"${v === 'U' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
        `<label class="field">Birth date<input name="birth" placeholder="${esc(U.dateHint)}"></label></div>` +
        `<p class="hint">You can link parents, partners and children from their card afterwards.</p>`,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Add', value: 'ok', cls: 'primary' }],
      validate: (v, root) => {
        const given = root.querySelector('[name=given]').value.trim(), surname = root.querySelector('[name=surname]').value.trim();
        if (!given && !surname) throw new Error('Enter at least a given name or a surname.');
        return { given, surname, sex: root.querySelector('[name=sex]').value, birth: { date: root.querySelector('[name=birth]').value.trim(), place: '' } };
      },
    });
    if (!r) return;
    const first = !app.prj.data.people.length;
    const p = app.prj.addPerson(r);
    if (first || !app.prj.person(app.focusId)) app.setFocus(p.id);
    app.select(p.id);
  }

  /* ---------- import ---------- */
  async function importFile(file) {
    let parsed;
    try { parsed = await IO.readFile(file); }
    catch (e) { return UI.toast('Import failed: ' + e.message, 6000); }
    const existing = await S.getProject(parsed.data.project.id);
    let mode = 'new';
    if (existing) {
      const v = await UI.dialog({
        title: 'This family is already here',
        body: `<p>“${esc(existing.project.name)}” (last saved ${esc(new Date(existing.project.updated).toLocaleString())}) has the same project id as the file ` +
          `(exported ${esc(parsed.data.exported ? new Date(parsed.data.exported).toLocaleString() : 'at an unknown time')}).</p>` +
          `<p><b>Replace</b> overwrites the copy in this browser with the file. <b>Import as copy</b> keeps both.</p>` +
          (/\.json$/i.test(file.name) ? '<p class="hint">JSON files carry no photos; photos already in this browser are kept where still referenced.</p>' : ''),
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Import as copy', value: 'copy' }, { label: 'Replace', value: 'replace', cls: 'primary danger' }],
      });
      if (!v) return;
      mode = v;
    }
    try {
      const data = await IO.saveImported(parsed, mode === 'new' ? 'replace' : mode);
      await openProject(data);
      const missing = Object.keys(data.photos).filter((id) => !app.thumbs.has(id)).length;
      UI.toast(`Imported “${data.project.name}” — ${data.people.length} people` + (missing ? `, ${missing} photo(s) not included` : '') + '.', 5000);
    } catch (e) { UI.toast('Import failed: ' + e.message, 6000); }
  }

  /* ---------- wiring ---------- */
  function bind() {
    document.querySelectorAll('.tabs [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#projectSelect').addEventListener('change', async (e) => {
      save.flush();
      const d = await S.getProject(e.target.value);
      if (d) openProject(M.normalize(d));
    });
    const menu = $('#projectMenu');
    $('#projectMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      menu.hidden = true;
      projectAction(b.dataset.act);
    });

    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
    $('#exportJsonBtn').addEventListener('click', () => { save.flush(); IO.exportJSON(app.prj); });
    $('#exportZipBtn').addEventListener('click', async () => {
      save.flush();
      try {
        const r = await IO.exportZIP(app.prj);
        UI.toast(`ZIP exported with ${r.photos} photo(s)` + (r.missing ? ` — ${r.missing} referenced photo(s) were missing in this browser` : '') + '.');
      } catch (e) { UI.toast('Export failed: ' + e.message, 6000); }
    });

    const view = $('#view');
    view.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-zoom],[data-sort],tr[data-id]');
      if (!b) return;
      if (b.dataset.zoom) {
        if (b.dataset.zoom === 'in') app.pz.zoomBy(1.25);
        else if (b.dataset.zoom === 'out') app.pz.zoomBy(0.8);
        else app.pz.fit(app.lay.width, app.lay.height);
      } else if (b.dataset.sort) {
        app.listSort = { key: b.dataset.sort, dir: app.listSort.key === b.dataset.sort ? -app.listSort.dir : 1 };
        U.storageSet('listSort', app.listSort);
        renderView();
      } else if (b.matches('tr[data-id]')) {
        app.select(b.dataset.id);
      } else switch (b.dataset.act) {
        case 'add-person': addPersonDialog(); break;
        case 'sample': projectAction('sample'); break;
        case 'import': $('#importFile').click(); break;
        case 'swap': { const r = app.relate; [r.a, r.b] = [r.b, r.a]; renderView(); break; }
        case 'branch': { const br = app.br().list[+b.dataset.i]; if (br) app.setTreeMode('desc', br.founders[0]); break; }
        case 'drop-extra': app.extras.splice(+b.dataset.i, 1); app.resetView = true; renderView(); break;
        case 'unfold-all': app.unfoldAll(); break;
      }
    });
    view.addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) app.setFocus(tr.dataset.id, true);
    });
    view.addEventListener('input', (e) => {
      if (e.target.matches('.listbar input')) {
        app.listQuery = e.target.value;
        app.listFocus = true;
        renderView();
      }
    });
    view.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.opt) {
        const o = app.treeOpts;
        o[t.dataset.opt] = t.type === 'checkbox' ? t.checked : Math.max(0, Math.min(12, +t.value || 0));
        U.storageSet('treeOpts', o);
        app.resetView = true;
        renderView();
      } else if (t.dataset.gopt) {
        app.graphOpts[t.dataset.gopt] = t.checked;
        U.storageSet('graphOpts', app.graphOpts);
        renderView();
      } else if (t.dataset.act === 'mode') {
        app.setTreeMode(t.value);
      } else if (t.dataset.act === 'jump' && t.value) {
        app.select(t.value);
        centerOnNode(t.value, true);
      } else if (t.dataset.rel) {
        if (t.dataset.rel === 'bio') app.relate.bioOnly = t.checked;
        else app.relate[t.dataset.rel] = t.value || null;
        renderView();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#dialog').open && app.selectedId) app.select(null);
    });
    UI.bindPanel(app, $('#panel'));
  }

  async function projectAction(act) {
    const prj = app.prj;
    if (act === 'new') {
      const name = await UI.prompt('New family project', 'Family / project name', '');
      if (name) { save.flush(); await newProject(name); }
    } else if (act === 'rename') {
      const name = await UI.prompt('Rename project', 'Family / project name', prj.name);
      if (name) { prj.data.project.name = name; prj.touch('meta'); await save.flush(); refreshProjectList(); }
    } else if (act === 'notes') {
      const r = await UI.dialog({
        title: 'Project notes — ' + prj.name,
        body: `<label class="field">Sources, research notes, who to ask…<textarea name="n" style="min-height:180px">${esc(prj.data.project.notes || '')}</textarea></label>`,
        validate: (v, root) => root.querySelector('[name=n]').value,
      });
      if (r != null) { prj.data.project.notes = r; prj.touch('meta'); }
    } else if (act === 'sample') {
      save.flush();
      await newProject(null, M.sample());
      UI.toast('Sample family loaded as its own project — your other projects are untouched.', 4000);
    } else if (act === 'delete') {
      const ok = await UI.confirm('Delete “' + prj.name + '”?', 'This deletes the project and its photos from this browser. Export a ZIP first if you might want it back.', 'Delete project', true);
      if (!ok) return;
      await S.deleteProject(prj.id);
      const list = await S.listProjects();
      if (list.length) await openProject(M.normalize(await S.getProject(list[0].id)));
      else await newProject('My family');
    }
  }

  async function init() {
    bind();
    document.querySelectorAll('.tabs [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === app.view)));
    try {
      const list = await S.listProjects();
      const last = U.storageGet('lastProject', null);
      const pick = list.find((p) => p.id === last) || list[0];
      if (pick) await openProject(M.normalize(await S.getProject(pick.id)));
      else await newProject('My family');
    } catch (e) {
      $('#view').innerHTML = `<div class="empty"><h2>Storage unavailable</h2><p>${esc(e.message)}</p>` +
        `<p>This browser is blocking local storage (private window or blocked site data). The tool needs IndexedDB to keep your work.</p></div>`;
    }
    window.addEventListener('resize', U.debounce(() => { if (app.lay && app.pz && (app.view === 'tree' || app.view === 'graph')) app.pz.apply(); }, 200));
  }

  init();
})(window.GT = window.GT || {});
