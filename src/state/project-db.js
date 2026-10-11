// v34 — tiny promise wrapper over IndexedDB for the project store.
//
// localStorage caps near 5MB on phones (some count UTF-16 bytes, so ~2.5M
// chars), which one large photo plus its first auto version overflows.
// IndexedDB has a far larger quota and stores values by structured clone, so
// projects.js keeps its whole store here (with a localStorage fallback).
//
// DB `snapshotpro` v1, object store `kv` with out-of-line keys. Opening is
// memoized; a failed open rejects so callers can fall back. The memo is
// cleared whenever the connection goes away (close, versionchange, a
// transaction that cannot start) and by idbReset(), so the next call reopens.

const DB_NAME = 'snapshotpro';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise = null;

export function idbAvailable() {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.open === 'function'; }
  catch (e) { return false; }
}

// Drop the memoized connection (closing it if it opened) so the next call
// opens a fresh one. Used after a non-quota write error.
export function idbReset() {
  const p = dbPromise;
  dbPromise = null;
  if (p) p.then(db => { try { db.close(); } catch (e) { /* already closed */ } }, () => {});
}

function openDb() {
  if (dbPromise) return dbPromise;
  const p = new Promise((resolve, reject) => {
    if (!idbAvailable()) { reject(new Error('IndexedDB unavailable')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      const forget = () => { if (dbPromise === p) dbPromise = null; };
      // Another tab upgrading the schema: let it, and reopen on next use.
      db.onversionchange = () => { db.close(); forget(); };
      // The browser closed the connection (storage cleared, crash): reopen next time.
      db.onclose = forget;
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    // Blocked by an older connection in another tab: keep waiting; that tab's
    // onversionchange closes it, and then success (or error) fires.
    req.onblocked = () => {};
  });
  dbPromise = p;
  // A failed open stays rejected (memoized) until idbReset(), so every caller
  // in this session falls back consistently.
  return p;
}

// One transaction on the store. `fn(store, tx)` issues the request(s) and
// returns the request whose result is the answer (or nothing). Resolves on
// tx.oncomplete, so a write has committed before the promise resolves.
function run(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(STORE, mode); }
    catch (e) { idbReset(); reject(e); return; }   // connection closing/closed: reopen next time
    let failed = null;
    const fail = (e) => { failed = e; try { tx.abort(); } catch (x) { /* already finished */ } };
    let req;
    try { req = fn(tx.objectStore(STORE), fail); }   // put() can throw (e.g. DataCloneError)
    catch (e) { fail(e); }
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    // A failed request (e.g. QuotaExceededError on put in WebKit/Firefox) fires
    // its error here first, while tx.error is still null: take the request's error.
    tx.onerror = (ev) => {
      let reqErr = null;
      try { reqErr = ev && ev.target && ev.target.error; } catch (x) { /* not readable */ }
      reject(failed || reqErr || tx.error || new Error('IndexedDB transaction failed'));
    };
    tx.onabort = () => reject(failed || tx.error || new Error('IndexedDB transaction aborted'));
  }));
}

export function idbGet(key) { return run('readonly', s => s.get(key)); }
export function idbSet(key, value) { return run('readwrite', s => s.put(value, key)).then(() => undefined); }
export function idbDel(key) { return run('readwrite', s => s.delete(key)).then(() => undefined); }

// Read-modify-write in ONE readwrite transaction: `fn(current)` gets the stored
// value (undefined if missing) and returns the value to put. No other tab can
// write between the read and the put. Resolves with the value written.
export function idbUpdate(key, fn) {
  let next;
  return run('readwrite', (s, fail) => {
    const g = s.get(key);
    g.onsuccess = () => {
      try { next = fn(g.result); s.put(next, key); }
      catch (e) { fail(e); }
    };
    return null;
  }).then(() => next);
}
