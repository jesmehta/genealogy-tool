/* Genealogy Tool — small shared helpers (ids, escaping, fuzzy dates, files). */
(function (GT) {
  'use strict';
  const U = (GT.util = {});

  U.uid = (prefix) =>
    prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  U.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.debounce = (fn, ms) => {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    return d;
  };

  U.slug = (s) =>
    String(s || 'family').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'family';

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  U.stamp = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

  U.nowISO = () => new Date().toISOString();

  /* ---------- fuzzy dates ----------
     Accepted: 1920 · 1920s · 1920-05 · 1920-05-14 · 14/05/1920 (day first) ·
     14 May 1920 · May 1920 · May 14, 1920 — each optionally prefixed with
     c./circa/abt/about/~/est (approximate), bef/before, aft/after.
     The user's text is kept as typed; parsing only produces a sort key + year. */
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIdx = (w) => {
    const i = MONTHS.indexOf(String(w).slice(0, 3));
    return i < 0 ? 0 : i + 1;
  };
  const QUALS = [
    [/^(c\.?|ca\.?|circa|abt\.?|about|approx\.?|~|est\.?|estimated)\s*/, 'c.'],
    [/^(bef\.?|before)\s*/, 'bef.'],
    [/^(aft\.?|after)\s*/, 'aft.'],
  ];

  U.parseDate = function (raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    let rest = s.toLowerCase();
    let qual = '';
    for (const [re, q] of QUALS) {
      const m = rest.match(re);
      if (m) { qual = q; rest = rest.slice(m[0].length).trim(); break; }
    }
    let y = 0, mo = 0, d = 0, m;
    if ((m = rest.match(/^(\d{4})s$/))) { y = +m[1]; qual = qual || 'c.'; }
    else if ((m = rest.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/))) { y = +m[1]; mo = +(m[2] || 0); d = +(m[3] || 0); }
    else if ((m = rest.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = rest.match(/^(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([a-z]{3,})\.?,?\s+(\d{4})$/)) && monthIdx(m[2])) { d = +(m[1] || 0); mo = monthIdx(m[2]); y = +m[3]; }
    else if ((m = rest.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/)) && monthIdx(m[1])) { mo = monthIdx(m[1]); d = +m[2]; y = +m[3]; }
    else return { ok: false, raw: s };
    if (mo > 12 || d > 31) return { ok: false, raw: s };
    let sort = y * 10000 + mo * 100 + d;
    if (qual === 'bef.') sort -= 0.5;
    if (qual === 'aft.') sort += 0.5;
    return { ok: true, raw: s, year: y, month: mo, day: d, qual, sort };
  };

  U.dateSort = (raw) => {
    const p = U.parseDate(raw);
    return p && p.ok ? p.sort : null;
  };

  /* fractional year (1920.37…) for placing on a time axis; null if not parseable */
  U.year = (raw) => {
    const p = U.parseDate(raw);
    if (!p || !p.ok) return null;
    return p.year + (p.month ? (p.month - 1) / 12 + (p.day ? (p.day - 1) / 365 : 1 / 24) : 0.5);
  };

  U.yearLabel = (raw) => {
    const p = U.parseDate(raw);
    if (!p) return '';
    if (!p.ok) return p.raw;
    return (p.qual ? p.qual + ' ' : '') + p.year;
  };

  U.dateHint = 'e.g. 1920 · c. 1920 · 1920-05-14 · 14/05/1920 · 14 May 1920 · bef. 1931';

  /* ---------- download / files ---------- */
  U.download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  U.extForType = (type) =>
    ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
       'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp' }[type] || 'bin');

  U.typeForExt = (name) => {
    const ext = String(name).split('.').pop().toLowerCase();
    return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
              svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp' }[ext] || 'application/octet-stream');
  };

  /* Thumbnail for the tree view (keeps the SVG light even with big originals). */
  U.makeThumb = async (blob, size = 160) => {
    try {
      const bmp = await createImageBitmap(blob);
      const s = Math.min(bmp.width, bmp.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
      bmp.close && bmp.close();
      return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    } catch (e) {
      return null; // unsupported format (e.g. some SVGs) — fall back to the original
    }
  };

  U.storageGet = (k, def) => {
    try { const v = localStorage.getItem('gt:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  };
  U.storageSet = (k, v) => {
    try { localStorage.setItem('gt:' + k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ }
  };

  U.gw = (sex, f, m, n) => (sex === 'F' ? f : sex === 'M' ? m : n);

  U.ordinal = (n) => {
    const words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    if (n < words.length) return words[n];
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  U.nth = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
})(window.GT = window.GT || {});
