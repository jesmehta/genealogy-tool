/* Genealogy Tool — data model.
   Only two structural relationships are stored; everything else is inferred (infer.js):
     parentLinks  parent → child, typed (biological, adoptive, step, …). One record per parent,
                  so a child can have 1, 2 or more parents with or without any union.
     unions       partner ↔ partner, typed (marriage, partnership, parallel, …) with dates,
                  end reason and an offspring flag. "2nd/3rd marriage" is computed by date.
   Plus free-form "other" person↔person relations (godparent, close family friend, …). */
(function (GT) {
  'use strict';
  const U = GT.util;
  const M = (GT.model = {});

  M.FORMAT = 'genealogy-tool';
  M.VERSION = 1;

  M.SEX = [['F', 'Female'], ['M', 'Male'], ['X', 'Other / non-binary'], ['U', 'Unknown']];

  M.PARENT_TYPES = [
    ['biological', 'Biological'],
    ['adoptive', 'Adoptive (formal)'],
    ['step', 'Step-parent'],
    ['foster', 'Foster'],
    ['guardian', 'Legal guardian'],
    ['raised', 'Raised by (informal)'],
    ['unknown', 'Unknown / unconfirmed'],
  ];
  /* Types that create kinship (used for cousins, aunts, etc.). Step/foster/guardian/raised
     are shown as direct relations but do not propagate blood/legal kinship. */
  M.KIN_TYPES = new Set(['biological', 'adoptive', 'unknown']);

  M.UNION_TYPES = [
    ['marriage', 'Marriage'],
    ['civil', 'Civil union / registered partnership'],
    ['partnership', 'Partners (not married)'],
    ['engagement', 'Engagement'],
    ['parallel', 'Parallel / extramarital'],
    ['other', 'Other'],
  ];
  M.MARRIAGE_LIKE = new Set(['marriage', 'civil']);
  M.END_REASONS = [
    ['', '—'],
    ['divorce', 'Divorce'],
    ['separation', 'Separation'],
    ['annulment', 'Annulment'],
    ['death', 'Death of a partner'],
    ['other', 'Other'],
  ];
  M.OFFSPRING = [['unknown', 'Unknown'], ['yes', 'Yes'], ['no', 'No offspring']];

  M.label = (list, key) => (list.find((x) => x[0] === key) || [key, key])[1];

  M.empty = (name) => ({
    format: M.FORMAT,
    version: M.VERSION,
    project: { id: U.uid('fam'), name: name || 'New family', created: U.nowISO(), updated: U.nowISO(), notes: '' },
    people: [],
    parentLinks: [],
    unions: [],
    others: [],
    photos: {},
  });

  M.newPerson = (fields = {}) => Object.assign({
    id: U.uid('p'),
    given: '', surname: '', otherNames: '', sex: 'U',
    birth: { date: '', place: '' },
    death: { date: '', place: '' },
    deceased: false,
    photo: null,
    notes: '',
    fields: [],
  }, fields);

  /* Accepts anything that looks like an export, fills gaps, drops dangling references. */
  M.normalize = function (raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Not a project file.');
    if (raw.format && raw.format !== M.FORMAT) throw new Error('Unknown file format "' + raw.format + '".');
    if (!Array.isArray(raw.people)) throw new Error('Project file has no "people" list.');
    if (raw.version > M.VERSION) throw new Error('This file was made by a newer version of the tool (v' + raw.version + ').');
    const d = M.empty();
    d.project = Object.assign(d.project, raw.project || {});
    d.people = raw.people.map((p) => {
      const n = M.newPerson(p);
      n.birth = Object.assign({ date: '', place: '' }, p.birth || {});
      n.death = Object.assign({ date: '', place: '' }, p.death || {});
      n.fields = Array.isArray(p.fields) ? p.fields.filter((f) => f && (f.k || f.v)) : [];
      return n;
    });
    const ids = new Set(d.people.map((p) => p.id));
    d.unions = (raw.unions || []).filter((u) => ids.has(u.a) && ids.has(u.b) && u.a !== u.b).map((u) => Object.assign({
      id: U.uid('u'), type: 'marriage', start: { date: '', place: '' }, end: { date: '', reason: '' },
      offspring: 'unknown', notes: '',
    }, u));
    const unionIds = new Set(d.unions.map((u) => u.id));
    d.parentLinks = (raw.parentLinks || []).filter((l) => ids.has(l.parent) && ids.has(l.child) && l.parent !== l.child)
      .map((l) => Object.assign({ id: U.uid('pl'), type: 'biological', unionId: null, notes: '' }, l))
      .map((l) => (l.unionId && !unionIds.has(l.unionId) ? Object.assign(l, { unionId: null }) : l));
    d.others = (raw.others || []).filter((o) => ids.has(o.a) && ids.has(o.b))
      .map((o) => Object.assign({ id: U.uid('o'), label: '', notes: '' }, o));
    d.photos = raw.photos && typeof raw.photos === 'object' ? raw.photos : {};
    d.people.forEach((p) => { if (p.photo && !d.photos[p.photo]) d.photos[p.photo] = { name: p.photo, type: '' }; });
    return d;
  };

  /* ---------- Project: wraps the data with indexes + mutations ---------- */
  class Project {
    constructor(data) {
      this.data = data;
      this.listeners = [];
      this._idx = null;
    }
    get id() { return this.data.project.id; }
    get name() { return this.data.project.name; }

    onChange(fn) { this.listeners.push(fn); }
    touch(kind = 'structure') {
      this._idx = null;
      this.data.project.updated = U.nowISO();
      this.listeners.forEach((fn) => fn(kind));
    }

    get idx() {
      if (this._idx) return this._idx;
      const d = this.data;
      const byId = new Map(d.people.map((p) => [p.id, p]));
      const parentsOf = new Map(), childrenOf = new Map(), unionsOf = new Map(), othersOf = new Map();
      const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
      d.parentLinks.forEach((l) => { push(parentsOf, l.child, l); push(childrenOf, l.parent, l); });
      d.unions.forEach((u) => { push(unionsOf, u.a, u); push(unionsOf, u.b, u); });
      d.others.forEach((o) => { push(othersOf, o.a, o); push(othersOf, o.b, o); });
      const unionById = new Map(d.unions.map((u) => [u.id, u]));
      this._idx = { byId, parentsOf, childrenOf, unionsOf, othersOf, unionById };
      return this._idx;
    }

    person(id) { return this.idx.byId.get(id); }
    union(id) { return this.idx.unionById.get(id); }
    parentsOf(id) { return this.idx.parentsOf.get(id) || []; }
    childrenOf(id) { return this.idx.childrenOf.get(id) || []; }
    othersOf(id) { return this.idx.othersOf.get(id) || []; }
    partnerIn(u, id) { return u.a === id ? u.b : u.a; }

    /* Unions of a person, ordered by start date (undated last, creation order kept). */
    unionsOf(id) {
      const list = (this.idx.unionsOf.get(id) || []).slice();
      const all = this.data.unions;
      return list.sort((x, y) => {
        const a = U.dateSort(x.start.date), b = U.dateSort(y.start.date);
        if (a != null && b != null && a !== b) return a - b;
        if (a == null && b != null) return 1;
        if (b == null && a != null) return -1;
        return all.indexOf(x) - all.indexOf(y);
      });
    }
    /* 1-based position among this person's unions of the same class, so a parallel
       relationship doesn't turn the next marriage into a "3rd marriage".
       Classes: marriage-like (marriage, civil) vs everything else. */
    unionClassmates(u, personId) {
      const cls = M.MARRIAGE_LIKE.has(u.type);
      return this.unionsOf(personId).filter((x) => M.MARRIAGE_LIKE.has(x.type) === cls);
    }
    unionOrder(u, personId) { return this.unionClassmates(u, personId).indexOf(u) + 1; }
    unionOrderLabel(u, personId) {
      const mates = this.unionClassmates(u, personId);
      return mates.length > 1 ? U.nth(mates.indexOf(u) + 1) + ' ' : '';
    }
    unionsBetween(a, b) { return this.unionsOf(a).filter((u) => this.partnerIn(u, a) === b); }

    /* Children of a union: links explicitly tagged with it, plus untagged children of both partners. */
    childrenOfUnion(u) {
      const out = new Map();
      this.data.parentLinks.forEach((l) => { if (l.unionId === u.id) out.set(l.child, true); });
      const ofA = new Set(this.childrenOf(u.a).filter((l) => !l.unionId).map((l) => l.child));
      this.childrenOf(u.b).forEach((l) => { if (!l.unionId && ofA.has(l.child)) out.set(l.child, true); });
      // if the couple has several unions, untagged kids go to the first one only
      const between = this.unionsBetween(u.a, u.b);
      if (between.length > 1 && between[0] !== u) {
        for (const id of [...out.keys()]) {
          const tagged = this.parentsOf(id).some((l) => l.unionId === u.id);
          if (!tagged) out.delete(id);
        }
      }
      return [...out.keys()];
    }

    displayName(p) {
      if (typeof p === 'string') p = this.person(p);
      if (!p) return '(missing)';
      const n = [p.given, p.surname].filter(Boolean).join(' ').trim();
      return n || '(unnamed)';
    }
    isDeceased(p) { return !!(p.deceased || (p.death && p.death.date)); }
    lifespan(p) {
      const b = U.yearLabel(p.birth.date), d = U.yearLabel(p.death.date);
      if (b && d) return b + ' – ' + d;
      if (b) return this.isDeceased(p) ? b + ' – ?' : 'b. ' + b;
      if (d) return 'd. ' + d;
      return this.isDeceased(p) ? '† date unknown' : '';
    }

    isAncestor(anc, desc) {
      const seen = new Set(), stack = [desc];
      while (stack.length) {
        const c = stack.pop();
        for (const l of this.parentsOf(c)) {
          if (l.parent === anc) return true;
          if (!seen.has(l.parent)) { seen.add(l.parent); stack.push(l.parent); }
        }
      }
      return false;
    }

    /* ---- mutations ---- */
    addPerson(fields) {
      const p = M.newPerson(fields);
      this.data.people.push(p);
      this.touch();
      return p;
    }
    updatePerson(id, patch, kind = 'fields') {
      const p = this.person(id);
      if (!p) return;
      Object.assign(p, patch);
      this.touch(kind);
    }
    removePerson(id) {
      const d = this.data;
      const p = this.person(id);
      d.people = d.people.filter((x) => x.id !== id);
      const goneUnions = new Set(d.unions.filter((u) => u.a === id || u.b === id).map((u) => u.id));
      d.unions = d.unions.filter((u) => !goneUnions.has(u.id));
      d.parentLinks = d.parentLinks.filter((l) => l.parent !== id && l.child !== id);
      d.parentLinks.forEach((l) => { if (goneUnions.has(l.unionId)) l.unionId = null; });
      d.others = d.others.filter((o) => o.a !== id && o.b !== id);
      const photo = p && p.photo;
      if (photo) delete d.photos[photo];
      this.touch();
      return photo;
    }

    addParentLink(parent, child, type = 'biological', unionId = null) {
      if (parent === child) throw new Error('A person cannot be their own parent.');
      if (this.parentsOf(child).some((l) => l.parent === parent))
        throw new Error(this.displayName(parent) + ' is already a parent of ' + this.displayName(child) + '.');
      if (this.isAncestor(child, parent))
        throw new Error(this.displayName(child) + ' is an ancestor of ' + this.displayName(parent) + ' — that would create a loop.');
      const l = { id: U.uid('pl'), parent, child, type, unionId, notes: '' };
      this.data.parentLinks.push(l);
      this.touch();
      return l;
    }
    updateParentLink(id, patch) {
      const l = this.data.parentLinks.find((x) => x.id === id);
      if (l) { Object.assign(l, patch); this.touch(); }
    }
    removeParentLink(id) {
      this.data.parentLinks = this.data.parentLinks.filter((x) => x.id !== id);
      this.touch();
    }

    addUnion(a, b, fields = {}) {
      if (a === b) throw new Error('A relationship needs two different people.');
      const u = Object.assign({
        id: U.uid('u'), a, b, type: 'marriage',
        start: { date: '', place: '' }, end: { date: '', reason: '' },
        offspring: 'unknown', notes: '',
      }, fields);
      this.data.unions.push(u);
      this.touch();
      return u;
    }
    updateUnion(id, patch) {
      const u = this.union(id);
      if (u) { Object.assign(u, patch); this.touch(); }
    }
    removeUnion(id) {
      this.data.unions = this.data.unions.filter((u) => u.id !== id);
      this.data.parentLinks.forEach((l) => { if (l.unionId === id) l.unionId = null; });
      this.touch();
    }
    /* Seeds a child into a union: links to both partners (skipping links that already exist). */
    linkChildToUnion(u, childId, type = 'biological') {
      for (const parent of [u.a, u.b]) {
        const existing = this.parentsOf(childId).find((l) => l.parent === parent);
        if (existing) { existing.unionId = u.id; continue; }
        if (this.isAncestor(childId, parent))
          throw new Error(this.displayName(childId) + ' is an ancestor of ' + this.displayName(parent) + '.');
        this.data.parentLinks.push({ id: U.uid('pl'), parent, child: childId, type, unionId: u.id, notes: '' });
      }
      if (u.offspring !== 'yes') u.offspring = 'yes';
      this.touch();
    }
    unlinkChildFromUnion(u, childId) {
      this.data.parentLinks = this.data.parentLinks.filter(
        (l) => !(l.child === childId && (l.parent === u.a || l.parent === u.b)));
      this.touch();
    }

    addOther(a, b, label, notes = '') {
      if (a === b) throw new Error('A relationship needs two different people.');
      const o = { id: U.uid('o'), a, b, label: label || 'related', notes };
      this.data.others.push(o);
      this.touch();
      return o;
    }
    updateOther(id, patch) {
      const o = this.data.others.find((x) => x.id === id);
      if (o) { Object.assign(o, patch); this.touch(); }
    }
    removeOther(id) {
      this.data.others = this.data.others.filter((x) => x.id !== id);
      this.touch();
    }
  }
  M.Project = Project;

  /* ---------- sample family (exercises the tricky cases) ---------- */
  M.sample = function () {
    const d = M.empty('Sample family (demo)');
    const prj = new Project(d);
    const P = (given, surname, sex, birth, death, extra = {}) =>
      prj.addPerson(Object.assign({ given, surname, sex, birth: { date: birth || '', place: '' }, death: { date: death || '', place: '' } }, extra));
    const ramesh = P('Ramesh', 'Shah', 'M', 'c. 1925', '1990');
    const kamala = P('Kamala', 'Shah', 'F', '1928', '1958');
    const sushila = P('Sushila', 'Shah', 'F', '1935', '2015');
    const meera = P('Meera', 'Desai', 'F', '1930', '');
    const anil = P('Anil', 'Shah', 'M', '1950-03-12', '');
    const vijay = P('Vijay', 'Shah', 'M', '1954', '');
    const nita = P('Nita', 'Shah', 'F', '1962', '');
    const ravi = P('Ravi', 'Desai', 'M', '1956', '', { notes: 'Son of Ramesh and Meera; raised by Meera.' });
    const priya = P('Priya', 'Shah', 'F', '1953', '');
    const asha = P('Asha', 'Shah', 'F', '1970', '');
    const sunil = P('Sunil', 'Kapoor', 'M', '1960', '');
    const karan = P('Karan', 'Shah', 'M', '1978', '');
    const dev = P('Dev', 'Shah', 'M', '1980', '', { notes: 'Adopted in 1982.' });
    const tara = P('Tara', 'Kapoor', 'F', '1985', '');
    const rohan = P('Rohan', 'Kapoor', 'M', '1988', '');
    const leela = P('Leela', 'Iyer', 'F', '1945', '', { notes: 'Neighbour who helped raise the children after Kamala died.' });
    const zoya = P('Zoya', 'Shah', 'F', '2008', '');

    const u1 = prj.addUnion(ramesh.id, kamala.id, { start: { date: '1948', place: '' }, end: { date: '1958', reason: 'death' }, offspring: 'yes' });
    const u2 = prj.addUnion(ramesh.id, sushila.id, { start: { date: '1960', place: '' }, offspring: 'yes' });
    const u3 = prj.addUnion(ramesh.id, meera.id, { type: 'parallel', start: { date: 'c. 1955', place: '' }, end: { date: '1957', reason: 'separation' }, offspring: 'yes' });
    prj.linkChildToUnion(u1, anil.id);
    prj.linkChildToUnion(u1, vijay.id);
    prj.linkChildToUnion(u2, nita.id);
    prj.linkChildToUnion(u3, ravi.id);
    prj.addParentLink(sushila.id, anil.id, 'step');
    const u4 = prj.addUnion(anil.id, priya.id, { start: { date: '1975-11-20', place: 'Mumbai' }, offspring: 'yes' });
    prj.linkChildToUnion(u4, karan.id);
    prj.linkChildToUnion(u4, dev.id, 'adoptive');
    const u5 = prj.addUnion(nita.id, sunil.id, { type: 'partnership', start: { date: '1983', place: '' }, end: { date: '1995', reason: 'separation' }, offspring: 'yes' });
    prj.linkChildToUnion(u5, tara.id);
    prj.linkChildToUnion(u5, rohan.id);
    prj.addParentLink(vijay.id, asha.id, 'biological');
    prj.addParentLink(karan.id, zoya.id, 'biological');
    prj.addParentLink(leela.id, vijay.id, 'raised');
    prj.addOther(leela.id, anil.id, 'like an aunt — family friend', 'Lived next door 1958–1975.');
    prj.updatePerson(anil.id, { fields: [{ k: 'Occupation', v: 'Engineer' }, { k: 'Native place', v: 'Bhavnagar' }] });
    return prj.data;
  };
})(window.GT = window.GT || {});
