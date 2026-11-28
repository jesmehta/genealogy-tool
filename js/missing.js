/* Genealogy Tool — "Missing data" tab: a spreadsheet of every person (and partnership) with the
   gaps highlighted, inline editing, filters, and bulk "set field for selected" with undo. */
(function (GT) {
  'use strict';
  const U = GT.util, M = GT.model;
  const esc = U.esc;
  const MS = (GT.missing = {});

  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

  /* ---------- columns ---------- */
  // missing(p) decides whether a cell counts as a gap; optional columns are shown but never counted.
  const BASE = [
    { k: 'given', label: 'Given name' },
    { k: 'surname', label: 'Surname' },
    { k: 'otherNames', label: 'Other names', optional: true },
    { k: 'sex', label: 'Sex', type: 'sex', missing: (p) => !p.sex || p.sex === 'U' },
    { k: 'birth.date', label: 'Birth date', type: 'date' },
    { k: 'birth.place', label: 'Birth place' },
    { k: 'deceased', label: 'Deceased', type: 'bool', optional: true },
    { k: 'death.date', label: 'Death date', type: 'date', missing: (p) => p.deceased && !p.death.date },
    { k: 'death.place', label: 'Death place', missing: (p) => p.deceased && !p.death.place },
  ];
  const customKeys = (prj) => [...new Set(prj.data.people.flatMap((p) => p.fields.map((f) => f.k)).filter(Boolean))];
  MS.columns = (prj) => BASE.map((c) => Object.assign({
    get: (p) => get(p, c.k),
    missing: c.optional ? () => false : (p) => !String(get(p, c.k) || '').trim(),
  }, c)).concat(customKeys(prj).map((key) => ({
    k: 'f:' + key, label: key, optional: true, custom: key,
    get: (p) => ((p.fields.find((f) => f.k === key) || {}).v || ''),
    missing: () => false,
  })));

  /* write one value into a person object (mutates) */
  function setValue(p, col, v) {
    if (col.custom) {
      const i = p.fields.findIndex((f) => f.k === col.custom);
      if (!String(v).trim()) { if (i >= 0) p.fields.splice(i, 1); }
      else if (i >= 0) p.fields[i].v = v;
      else p.fields.push({ k: col.custom, v });
      return;
    }
    if (col.type === 'bool') { p.deceased = v === true || v === 'yes'; return; }
    const parts = col.k.split('.');
    if (parts.length === 2) p[parts[0]] = Object.assign({}, p[parts[0]], { [parts[1]]: v });
    else p[col.k] = v;
  }

  /* ---------- state ---------- */
  MS.state = () => ({
    show: 'all', branch: '', q: '', sort: 'family', sel: new Set(),
    bulkCol: 'surname', bulkVal: '', onlyEmpty: true, undo: [], focusSearch: false,
  });

  function rowsFor(app, cols) {
    const prj = app.prj, st = app.miss, br = app.br();
    const q = st.q.trim().toLowerCase();
    const showCol = cols.find((c) => c.k === st.show);
    let rows = prj.data.people.filter((p) => {
      if (q && !(prj.displayName(p) + ' ' + p.otherNames).toLowerCase().includes(q)) return false;
      if (st.branch !== '' && !br.of(p.id).includes(+st.branch)) return false;
      if (st.show === 'any') return cols.some((c) => c.missing(p));
      if (showCol) return showCol.missing(p);
      return true;
    });
    const order = new Map(prj.data.people.map((p, i) => [p.id, i]));
    if (st.sort === 'name') rows.sort((a, b) => prj.displayName(a).localeCompare(prj.displayName(b)));
    else {
      // family: grouped by first branch, then birth (if known), then entry order
      const bk = (p) => { const b = br.of(p.id); return b.length ? b[0] : 1e6; };
      rows.sort((a, b) => bk(a) - bk(b) || (U.dateSort(a.birth.date) || 1e12) - (U.dateSort(b.birth.date) || 1e12) || order.get(a.id) - order.get(b.id));
    }
    return rows;
  }

  function cellHTML(p, c) {
    const v = c.get(p);
    const miss = c.missing(p);
    const attrs = `data-pid="${p.id}" data-col="${esc(c.k)}"`;
    let inner;
    if (c.type === 'sex') {
      inner = `<select ${attrs} aria-label="${esc(c.label)}">` + M.SEX.map(([k, l]) => `<option value="${k}"${(v || 'U') === k ? ' selected' : ''}>${k === 'U' ? '?' : esc(l)}</option>`).join('') + `</select>`;
    } else if (c.type === 'bool') {
      inner = `<input type="checkbox" ${attrs} ${v ? 'checked' : ''} aria-label="${esc(c.label)}">`;
    } else {
      const bad = c.type === 'date' && v && !U.parseDate(v).ok;
      inner = `<input type="text" ${attrs} value="${esc(v || '')}" placeholder="${miss ? 'missing' : ''}" aria-label="${esc(c.label)}"${bad ? ' class="bad" title="Not a recognised date: ' + esc(U.dateHint) + '"' : ''}>`;
    }
    return `<td class="${miss ? 'miss' : ''}${c.type === 'bool' ? ' c' : ''}">${inner}</td>`;
  }

  MS.html = function (app) {
    const prj = app.prj, st = app.miss;
    const cols = MS.columns(prj);
    const counted = cols.filter((c) => !c.optional);
    const rows = rowsFor(app, cols);
    const allPeople = prj.data.people;
    const counts = new Map(counted.map((c) => [c.k, allPeople.filter((p) => c.missing(p)).length]));
    const totalMiss = [...counts.values()].reduce((s, n) => s + n, 0);
    const br = app.br();
    st.sel.forEach((id) => { if (!prj.person(id)) st.sel.delete(id); });
    const shownSel = rows.filter((p) => st.sel.has(p.id)).length;
    const bulkCol = cols.find((c) => c.k === st.bulkCol) || cols[1];

    const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
    const bar = `<div class="listbar missbar">` +
      `<input type="search" data-m="q" placeholder="Search names…" value="${esc(st.q)}" aria-label="Search people">` +
      `<label>Show <select data-m="show">${opt('all', 'Everyone', st.show)}${opt('any', 'Missing anything', st.show)}` +
      counted.map((c) => opt(c.k, 'Missing ' + c.label.toLowerCase() + ' (' + counts.get(c.k) + ')', st.show)).join('') + `</select></label>` +
      `<label>Family <select data-m="branch">${opt('', 'All', st.branch)}${br.list.map((b) => opt(b.idx, b.label, st.branch)).join('')}</select></label>` +
      `<label>Sort <select data-m="sort">${opt('family', 'By family', st.sort)}${opt('name', 'By name', st.sort)}</select></label></div>`;

    let valInput;
    if (bulkCol.type === 'sex') valInput = `<select data-m="bulkVal">${M.SEX.map(([k, l]) => opt(k, l, st.bulkVal || 'F')).join('')}</select>`;
    else if (bulkCol.type === 'bool') valInput = `<select data-m="bulkVal">${opt('yes', 'Yes', st.bulkVal || 'yes')}${opt('no', 'No', st.bulkVal)}</select>`;
    else valInput = `<input type="text" data-m="bulkVal" value="${esc(st.bulkVal)}" placeholder="${bulkCol.type === 'date' ? 'e.g. c. 1920' : 'value'}" aria-label="Value">`;
    const bulk = `<div class="bulkbar${st.sel.size ? ' on' : ''}"><b>${st.sel.size} selected</b>` +
      (st.sel.size ? `<button class="btn ghost small" data-m-act="sel-none">Clear</button>` : '') +
      `<span class="sep"></span><label>Set <select data-m="bulkCol">${cols.filter((c) => c.k !== 'given').map((c) => opt(c.k, c.label, bulkCol.k)).join('')}</select></label>` +
      `<label>to ${valInput}</label>` +
      `<label class="check"><input type="checkbox" data-m="onlyEmpty" ${st.onlyEmpty ? 'checked' : ''}> only where empty</label>` +
      `<button class="btn primary small" data-m-act="apply" ${st.sel.size ? '' : 'disabled'}>Apply to ${st.sel.size || 'selected'}</button>` +
      (st.undo.length ? `<button class="btn small" data-m-act="undo" title="${esc(st.undo[st.undo.length - 1].label)}">Undo (${st.undo.length})</button>` : '') +
      `</div>`;

    const head = `<tr><th class="c"><input type="checkbox" data-m-act="sel-all" ${rows.length && shownSel === rows.length ? 'checked' : ''} aria-label="Select all shown"></th>` +
      cols.map((c) => `<th>${esc(c.label)}${counts.has(c.k) ? `<span class="mc${counts.get(c.k) ? '' : ' zero'}" data-m-act="show" data-col="${esc(c.k)}" title="Show only these">${counts.get(c.k) || '✓'}</span>` : ''}</th>`).join('') + `</tr>`;
    const body = rows.map((p) => `<tr class="${st.sel.has(p.id) ? 'sel' : ''}"><td class="c"><input type="checkbox" data-m-act="sel" data-pid="${p.id}" ${st.sel.has(p.id) ? 'checked' : ''} aria-label="Select"></td>` +
      cols.map((c, i) => i === 0
        ? `<td class="nm${c.missing(p) ? ' miss' : ''}"><span class="namecell">${app.branchDot(p.id)}<button class="linkish" data-m-act="open" data-pid="${p.id}" title="Open in panel">↗</button>` +
          `<input type="text" data-pid="${p.id}" data-col="given" value="${esc(p.given)}" placeholder="missing" aria-label="Given name"></span></td>`
        : cellHTML(p, c)).join('') + `</tr>`).join('');

    // partnerships: start dates drive the timeline view
    const UC = [['start.date', 'Start date', 'date'], ['start.place', 'Start place'], ['end.date', 'End date', 'date']];
    const unions = prj.data.unions.slice().sort((a, b) => (U.dateSort(a.start.date) || 1e12) - (U.dateSort(b.start.date) || 1e12));
    const uMiss = unions.filter((u) => !u.start.date).length;
    const uRows = unions.filter((u) => st.show !== 'any' || !u.start.date).map((u) => {
      const ended = u.end && u.end.reason;
      return `<tr><td>${esc(prj.displayName(u.a))} &amp; ${esc(prj.displayName(u.b))}</td><td>${esc(M.label(M.UNION_TYPES, u.type))}${ended ? ' · ended (' + esc(u.end.reason) + ')' : ''}</td>` +
        UC.map(([k, l]) => {
          const v = get(u, k) || '';
          const miss = k === 'start.date' ? !v : k === 'end.date' ? ended && !v : false;
          return `<td class="${miss ? 'miss' : ''}"><input type="text" data-uid="${u.id}" data-ucol="${k}" value="${esc(v)}" placeholder="${miss ? 'missing' : ''}" aria-label="${l}"></td>`;
        }).join('') + `</tr>`;
    }).join('');

    return `<div class="listview missview">` +
      `<div class="misshead"><h2>Missing data</h2><p class="hint">${allPeople.length} people · <b>${totalMiss}</b> gaps across ${counted.length} fields · ` +
      `${uMiss} of ${unions.length} partnerships without a start date. Death date/place count only for people marked deceased. ` +
      `Type straight into a cell, or tick rows and use <b>Set … to …</b>.</p></div>` +
      bar + bulk +
      `<div class="tablewrap"><table class="people misstable"><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
      `<p class="hint">${rows.length} of ${allPeople.length} people shown.</p>` +
      `<h3 class="msub">Partnerships <span class="hint">(${uMiss} missing a start date)</span></h3>` +
      `<div class="tablewrap"><table class="people misstable"><thead><tr><th>Partners</th><th>Type</th>${UC.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${uRows}</tbody></table></div></div>`;
  };

  /* ---------- events (delegated from #view; return true if handled) ---------- */
  MS.onChange = function (app, t, rerender) {
    const prj = app.prj, st = app.miss;
    if (!t.closest || !t.closest('.missview')) return false;
    if (t.dataset.m) {
      const k = t.dataset.m;
      if (k === 'q') return true;   // handled on input
      st[k] = t.type === 'checkbox' ? t.checked : t.value;
      if (k === 'bulkCol') st.bulkVal = '';
      if (k !== 'bulkVal') rerender();
      return true;
    }
    if (t.dataset.pid && t.dataset.col) {
      const p = prj.person(t.dataset.pid);
      const col = MS.columns(prj).find((c) => c.k === t.dataset.col);
      if (!p || !col) return true;
      setValue(p, col, col.type === 'bool' ? t.checked : t.value.trim());
      const td = t.closest('td');
      if (td) td.classList.toggle('miss', col.missing(p));
      if (col.type === 'date') t.classList.toggle('bad', !!t.value.trim() && !U.parseDate(t.value).ok);
      prj.touch('fields');
      return true;
    }
    if (t.dataset.uid) {
      const u = prj.union(t.dataset.uid);
      if (!u) return true;
      const [a, b] = t.dataset.ucol.split('.');
      u[a] = Object.assign({}, u[a], { [b]: t.value.trim() });
      prj.touch('fields');
      return true;
    }
    return false;
  };

  MS.onInput = function (app, t, rerender) {
    if (t.dataset && t.dataset.m === 'q') { app.miss.q = t.value; app.miss.focusSearch = true; rerender(); return true; }
    if (t.dataset && t.dataset.m === 'bulkVal') { app.miss.bulkVal = t.value; return true; }
    return false;
  };

  MS.onClick = async function (app, el, rerender) {
    const prj = app.prj, st = app.miss;
    const act = el.dataset.mAct;
    if (!act) return false;
    const cols = MS.columns(prj);
    if (act === 'sel') { el.checked ? st.sel.add(el.dataset.pid) : st.sel.delete(el.dataset.pid); rerender(); }
    else if (act === 'sel-all') {
      const rows = rowsFor(app, cols);
      if (el.checked) rows.forEach((p) => st.sel.add(p.id)); else rows.forEach((p) => st.sel.delete(p.id));
      rerender();
    } else if (act === 'sel-none') { st.sel.clear(); rerender(); }
    else if (act === 'show') { st.show = st.show === el.dataset.col ? 'all' : el.dataset.col; rerender(); }
    else if (act === 'open') app.select(el.dataset.pid);
    else if (act === 'apply') {
      const col = cols.find((c) => c.k === st.bulkCol);
      if (!col) return true;
      let val = st.bulkVal;
      if (col.type === 'sex') val = val || 'F';
      if (col.type === 'bool') val = (val || 'yes') === 'yes';
      if (typeof val === 'string') val = val.trim();
      const targets = [...st.sel].map((id) => prj.person(id)).filter(Boolean)
        .filter((p) => !st.onlyEmpty || col.type === 'bool' || (col.type === 'sex' ? !p.sex || p.sex === 'U' : !String(col.get(p) || '').trim()));
      if (!targets.length) { GT.ui.toast('Nothing to change: every selected person already has a ' + col.label.toLowerCase() + '.'); return true; }
      const shown = col.type === 'sex' ? M.label(M.SEX, val) : col.type === 'bool' ? (val ? 'yes' : 'no') : (val || '(empty)');
      st.undo.push({
        label: `Undo: ${col.label} → ${shown} for ${targets.length}`,
        before: targets.map((p) => ({ id: p.id, snap: JSON.parse(JSON.stringify(p)) })),
      });
      if (st.undo.length > 20) st.undo.shift();
      targets.forEach((p) => setValue(p, col, val));
      prj.touch('structure');
      GT.ui.toast(`${col.label} set to “${shown}” for ${targets.length} ${targets.length === 1 ? 'person' : 'people'}.`);
    } else if (act === 'undo') {
      const u = st.undo.pop();
      if (!u) return true;
      u.before.forEach(({ id, snap }) => { const p = prj.person(id); if (p) { Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, snap); } });
      prj.touch('structure');
      GT.ui.toast(u.label.replace('Undo: ', 'Undone: '));
    }
    return true;
  };
})(window.GT = window.GT || {});
