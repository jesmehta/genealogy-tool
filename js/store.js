/* Genealogy Tool — IndexedDB persistence.
   DB "genealogy-tool":
     projects  { id, name, updated, data }            data = the full project JSON
     photos    { key: projectId/photoId, projectId, photoId, blob, thumb }
   Everything stays in this browser profile; export is the only way data leaves. */
(function (GT) {
  'use strict';
  const S = (GT.store = {});
  const DB_NAME = 'genealogy-tool';
  const DB_VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not available in this browser.'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) {
          const ps = db.createObjectStore('photos', { keyPath: 'key' });
          ps.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database upgrade blocked — close other tabs of this tool.'));
    });
    return dbp;
  }

  function tx(storeNames, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      let result;
      Promise.resolve(fn(t, (r) => { result = r; })).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    }));
  }

  const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  S.listProjects = () =>
    tx(['projects'], 'readonly', async (t, set) => {
      const all = await reqP(t.objectStore('projects').getAll());
      set(all.map((r) => ({ id: r.id, name: r.name, updated: r.updated, people: (r.data.people || []).length }))
             .sort((a, b) => String(b.updated).localeCompare(String(a.updated))));
    });

  S.getProject = (id) =>
    tx(['projects'], 'readonly', async (t, set) => {
      const r = await reqP(t.objectStore('projects').get(id));
      set(r ? r.data : null);
    });

  S.putProject = (data) =>
    tx(['projects'], 'readwrite', (t) => {
      t.objectStore('projects').put({ id: data.project.id, name: data.project.name, updated: data.project.updated, data });
    });

  S.deleteProject = (id) =>
    tx(['projects', 'photos'], 'readwrite', async (t) => {
      t.objectStore('projects').delete(id);
      const keys = await reqP(t.objectStore('photos').index('projectId').getAllKeys(id));
      keys.forEach((k) => t.objectStore('photos').delete(k));
    });

  S.putPhoto = (projectId, photoId, blob, thumb) =>
    tx(['photos'], 'readwrite', (t) => {
      t.objectStore('photos').put({ key: projectId + '/' + photoId, projectId, photoId, blob, thumb: thumb || null });
    });

  S.getPhoto = (projectId, photoId) =>
    tx(['photos'], 'readonly', async (t, set) => {
      set(await reqP(t.objectStore('photos').get(projectId + '/' + photoId)));
    });

  S.listPhotos = (projectId) =>
    tx(['photos'], 'readonly', async (t, set) => {
      set(await reqP(t.objectStore('photos').index('projectId').getAll(projectId)));
    });

  S.deletePhoto = (projectId, photoId) =>
    tx(['photos'], 'readwrite', (t) => { t.objectStore('photos').delete(projectId + '/' + photoId); });
})(window.GT = window.GT || {});
