/* Genealogy Tool — minimal ZIP writer/reader, no dependencies.
   Writer: "store" method (no compression — photos are already compressed), UTF-8 names.
   Reader: store + deflate (via the browser's DecompressionStream('deflate-raw')), so zips
   re-packed by Windows Explorer / macOS Finder also import. No ZIP64 (files > 4 GB). */
(function (GT) {
  'use strict';
  const Z = (GT.zip = {});

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  Z.crc32 = (u8) => {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

  /* files: [{ name: 'photos/x.jpg', data: Uint8Array }] → Blob */
  Z.write = function (files, when = new Date()) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const t = dosTime(when), d = dosDate(when);
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = Z.crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 names
      lh.setUint16(8, 0, true);      // store
      lh.setUint16(10, t, true);
      lh.setUint16(12, d, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, t, true);
      ch.setUint16(14, d, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  };

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed zips — re-export the zip from this tool.');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* ArrayBuffer → Map(name → Uint8Array). Directories are skipped. */
  Z.read = async function (buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip file (no end-of-directory record).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    if (p === 0xffffffff) throw new Error('ZIP64 archives are not supported.');
    const dec = new TextDecoder();
    const out = new Map();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip central directory.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const lnlen = dv.getUint16(lo + 26, true), lxlen = dv.getUint16(lo + 28, true);
      const start = lo + 30 + lnlen + lxlen;
      const raw = u8.subarray(start, start + csize);
      if (method === 0) out.set(name, raw.slice());
      else if (method === 8) out.set(name, await inflateRaw(raw));
      else throw new Error('Unsupported zip compression method ' + method + ' for ' + name + '.');
    }
    return out;
  };
})(window.GT = window.GT || {});
