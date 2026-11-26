/* Genealogy Tool — export / import.
   JSON  = data only (photo entries kept as references; images not included).
   ZIP   = data.json + photos/<photoId>.<ext> (originals). Name: <family>_<YYYY-MM-DD_HHMM>. */
(function (GT) {
  'use strict';
  const U = GT.util, S = GT.store, Z = GT.zip, M = GT.model;
  const IO = (GT.io = {});

  const baseName = (prj) => U.slug(prj.name) + '_' + U.stamp();
  const json = (data) => JSON.stringify(Object.assign({ exported: U.nowISO() }, data), null, 2);

  IO.exportJSON = function (prj) {
    U.download(new Blob([json(prj.data)], { type: 'application/json' }), baseName(prj) + '.json');
  };

  IO.exportZIP = async function (prj) {
    const files = [{ name: 'data.json', data: new TextEncoder().encode(json(prj.data)) }];
    const recs = await S.listPhotos(prj.id);
    const used = new Set(Object.keys(prj.data.photos));
    let missing = 0;
    for (const id of used) {
      const r = recs.find((x) => x.photoId === id);
      if (!r) { missing++; continue; }
      const type = r.blob.type || prj.data.photos[id].type;
      files.push({ name: 'photos/' + id + '.' + U.extForType(type), data: new Uint8Array(await r.blob.arrayBuffer()) });
    }
    files.push({ name: 'README.txt', data: new TextEncoder().encode(
      'Genealogy Tool project export\n' +
      'Family: ' + prj.name + '\nExported: ' + new Date().toString() + '\n\n' +
      'data.json  - people, parent links, unions, other relationships\n' +
      'photos/    - original photos, named by the photo id referenced in data.json\n\n' +
      'Import this .zip (or just data.json) back into the Genealogy Tool to resume.\n') });
    U.download(Z.write(files), baseName(prj) + '.zip');
    return { photos: files.length - 2, missing };
  };

  /* Returns { data, photos: Map(photoId → Blob) } — caller decides replace vs copy. */
  IO.readFile = async function (file) {
    const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    if (!isZip) {
      let raw;
      try { raw = JSON.parse(await file.text()); } catch (e) { throw new Error('This file is not valid JSON.'); }
      return { data: M.normalize(raw), photos: new Map() };
    }
    const entries = await Z.read(await file.arrayBuffer());
    // data.json may sit in a sub-folder if the user re-zipped an extracted folder
    const dataName = [...entries.keys()].find((n) => /(^|\/)data\.json$/i.test(n));
    if (!dataName) throw new Error('No data.json found inside the zip.');
    const prefix = dataName.slice(0, dataName.length - 'data.json'.length);
    const data = M.normalize(JSON.parse(new TextDecoder().decode(entries.get(dataName))));
    const photos = new Map();
    for (const [name, bytes] of entries) {
      if (!name.startsWith(prefix + 'photos/')) continue;
      const file = name.slice((prefix + 'photos/').length);
      const id = file.replace(/\.[^.]+$/, '');
      if (!data.photos[id]) continue;
      photos.set(id, new Blob([bytes], { type: data.photos[id].type || U.typeForExt(file) }));
    }
    return { data, photos };
  };

  /* Persist an imported project. mode: 'replace' (same id) | 'copy' (new id). */
  IO.saveImported = async function ({ data, photos }, mode) {
    if (mode === 'copy') {
      data.project.id = U.uid('fam');
      data.project.name = data.project.name + ' (imported ' + U.stamp().replace('_', ' ') + ')';
    }
    if (mode === 'replace') {
      // keep existing photo blobs that the incoming data still references (JSON imports carry none)
      const existing = await S.listPhotos(data.project.id);
      for (const r of existing) if (!data.photos[r.photoId]) await S.deletePhoto(data.project.id, r.photoId);
    }
    for (const [id, blob] of photos) await S.putPhoto(data.project.id, id, blob, await U.makeThumb(blob));
    data.project.updated = U.nowISO();
    await S.putProject(data);
    return data;
  };
})(window.GT = window.GT || {});
