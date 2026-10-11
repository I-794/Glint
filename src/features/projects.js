// v12 — Projects & Version History.
//
// Turns the editor from a single ephemeral canvas into a project workspace:
//  • Local-first store so "never lose a design" works offline and without a
//    Supabase account; cloud sync layers on when signed in. v34: projects live
//    in IndexedDB (src/state/project-db.js) because a large photo plus its
//    versions overflows phone localStorage; the whole store is kept in memory
//    (`cache`) so call sites stay synchronous. On every healthy load, any
//    project store found in localStorage (pre-v34, or saved while IndexedDB
//    failed to load) is merged into IndexedDB and then removed. When IndexedDB
//    is unavailable, or does not load within OPEN_TIMEOUT, the old localStorage
//    path is used; `snapshotpro_projects_idb` records that IndexedDB was used
//    before, so a later failure retries once and tells the user.
//  • The status line says "Saved" only after the write has committed.
//  • Debounced autosave of the active project after every committed edit.
//  • Version snapshots — automatic (time-spaced) + named — with a timeline
//    modal to restore or fork a version into a new project.
//
// v13: a project's `payload` is now a *document* (multiple pages). Serialization
// is delegated to pages.js (serializeDocument / applyDocument); this module owns
// persistence, the dashboard, version history, and cloud sync.

import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { escapeHTML } from '../utils/dom.js';
import { onHistoryChange } from '../state/history.js';
import { makeThumb, uid } from './document.js';
import { serializeDocument, applyDocument, onDocumentChange, pageCount } from './pages.js';
import { getClient, getUser, onAuthChange } from './auth.js';
import { idbAvailable, idbGet, idbUpdate, idbReset } from '../state/project-db.js';

const STORE_KEY = 'snapshotpro_projects_v12';
const ACTIVE_KEY = 'snapshotpro_active_project';
const AUTOSAVE_DELAY = 1500;            // ms after the last edit before we save
const AUTO_VERSION_INTERVAL = 3 * 60_000; // min spacing between auto-snapshots
const MAX_AUTO_VERSIONS = 15;           // named versions are never pruned
const PRUNE_KEEP_AUTO = 3;              // auto versions kept per project when storage is full
const OPEN_TIMEOUT = 8000;              // ms before a hung IndexedDB load counts as failed
const RETRY_DELAY = 5000;               // ms before the single retry of a failed write
const STORAGE_FULL_MSG = 'Storage full. This change was not saved. Delete old projects or versions to free space.';

let activeId = null;
let saveTimer = null;
let creating = false;   // guard so the debounce can't double-create "Untitled"

// ── Local store ────────────────────────────────────────────────────────────
// v34: backend is 'idb' (in-memory `cache`, persisted to IndexedDB) or 'ls'
// (the pre-v34 localStorage path, used when IndexedDB is unavailable). Until
// initStore() settles, `ready` is false and every writer waits on `readyP`, so
// a save requested at startup can never write an empty cache over real data.
//
// Isolation rule: the cache and the live editor never share objects. Every
// payload goes into the cache as its own copy (cloneDoc) and every stored
// payload goes into the editor as a copy (applyDocument(cloneDoc(...))), so an
// edit can never reach back into a saved project or version.
// Stored payloads are immutable once written (they are only ever replaced), so
// a project's payload and its newest version may share one object; the editor
// only ever receives structuredClone copies.
let backend = 'idb';
let cache = {};
let ready = false;
let resolveReady;
const readyP = new Promise(r => { resolveReady = r; });
let writeChain = Promise.resolve();  // serialized IndexedDB writes
let writeQueued = false;             // a queued write will pick up the latest cache
let writesPending = 0;               // queued + in-flight IndexedDB writes
let reloadAfterWrite = false;        // another tab saved while we were writing
let queuedWrite = null;              // promise of the queued write (resolves true once committed)
let lastWrite = Promise.resolve(true); // the write covering the latest writeStore call
let writeSeq = 0;                    // bumped whenever a new write is queued
let lastFailure = null;              // 'quota' | 'retrying' | 'error' for the last failed write
const deletedIds = new Set();        // deleted here, not yet written (see persistIdb)
// Projects this tab changed and has not yet committed, id -> change counter. Only
// these may overwrite IndexedDB in the merge; everything else defers to it.
const dirtyIds = new Map();
let dirtySeq = 0;
function markDirty(id) { if (id) dirtyIds.set(id, ++dirtySeq); }
// A change to an existing project: bump updatedAt, never backwards (a clock step
// back must not make this tab's newest save look older than its previous one).
function touch(p) { p.updatedAt = Math.max(Date.now(), (p.updatedAt || 0) + 1); markDirty(p.id); }
const IDB_USED_KEY = 'snapshotpro_projects_idb';
// IndexedDB was used before but failed to load: ACTIVE_KEY keeps pointing at the
// IndexedDB project so a later healthy load reopens it.
let keepActiveKey = false;
const channel = (typeof BroadcastChannel === 'function')
  ? (() => { try { return new BroadcastChannel('snapshotpro-projects'); } catch (e) { return null; } })()
  : null;

function cloneDoc(x) {
  if (x == null) return x;
  try { return structuredClone(x); }
  catch (e) { return JSON.parse(JSON.stringify(x)); }
}

function whenReady(fn) {
  if (ready) return fn();
  return readyP.then(fn);
}

function loadStore() {
  if (backend === 'idb') return cache;
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
// IndexedDB backend: returns a promise that resolves true once the write has
// committed, false if it failed (also kept in `lastWrite`). localStorage
// backend: returns true/false synchronously, as before v34.
function writeStore(store) {
  if (backend === 'idb') {
    cache = store;
    lastWrite = persistIdb();
    return lastWrite;
  }
  // localStorage fallback: the write is synchronous; lastWrite/lastFailure are
  // still set so the status line and Save version report the real outcome.
  let ok = true;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    // Quota exceeded — prune the oldest auto-versions across all projects and retry once.
    pruneAutoVersions(store);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch (e2) { ok = false; showNotification(STORAGE_FULL_MSG, 'error', { duration: 8000 }); }
  }
  lastFailure = ok ? null : 'quota';
  lastWrite = Promise.resolve(ok);
  return ok;
}

function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.code === 22);
}

// Two tabs share one IndexedDB store and each tab's cache can be stale, so the
// cache is reconciled per project against what IndexedDB holds (`current`):
//  - deleted in this tab (LIVE deletedIds): never brought back;
//  - in both: this tab's copy wins only if this tab changed it (dirtyIds) and it
//    is not older than the stored one; otherwise the stored copy wins and
//    replaces this tab's stale copy;
//  - only in IndexedDB: another tab saved it, adopt it;
//  - only in this tab: keep it if this tab changed it (a new project); else
//    another tab deleted it, drop it.
// Mutates `store` in place; returns true if anything from IndexedDB came in.
function reconcile(store, current) {
  if (!current || typeof current !== 'object') return false;   // nothing stored (or cleared): keep ours
  let changed = false;
  for (const id of Object.keys(current)) {
    if (deletedIds.has(id)) continue;
    const mine = store[id], theirs = current[id];
    const keepMine = mine && dirtyIds.has(id) && !(theirs && theirs.updatedAt > mine.updatedAt);
    if (!keepMine && mine !== theirs) {
      // The stored copy is newer, but this tab may hold versions it has not
      // committed yet (e.g. a named one): carry them over (stored wins on id).
      // `theirs` is a fresh object from the IndexedDB read; the project stays
      // dirty, so the merged list is written by this or the next write.
      if (mine && theirs && dirtyIds.has(id)) mergeVersions(theirs, mine);
      store[id] = theirs; changed = true;
    }
    // Ours wins, but another tab may have saved versions of the same project.
    else if (keepMine && theirs && mine !== theirs && mergeVersions(mine, theirs)) changed = true;
  }
  for (const id of Object.keys(store)) {
    if (deletedIds.has(id) || (!(id in current) && !dirtyIds.has(id))) { delete store[id]; changed = true; }
  }
  return changed;
}

// Union of both version lists by id (ours wins on a collision): every named
// version kept, auto versions capped at MAX_AUTO_VERSIONS, newest first.
// Versions are never deleted one by one, so nothing has to stay removed.
// Payloads are shared, not cloned (stored payloads are immutable).
// Returns true if the other tab contributed a version.
function mergeVersions(mine, theirs) {
  const ours = Array.isArray(mine.versions) ? mine.versions : [];
  const seen = new Set(ours.map(v => v.id));
  const extra = (Array.isArray(theirs.versions) ? theirs.versions : []).filter(v => v && !seen.has(v.id));
  if (!extra.length) return false;
  const all = [...ours, ...extra].sort((a, b) => b.createdAt - a.createdAt);
  const autoV = all.filter(v => v.auto).slice(0, MAX_AUTO_VERSIONS);
  mine.versions = [...all.filter(v => !v.auto), ...autoV].sort((a, b) => b.createdAt - a.createdAt);
  return true;
}

// One committed write of the cache: reconcile with IndexedDB and put, inside
// one readwrite transaction (idbUpdate), so no other tab can write in between.
// `captured` receives the dirty/deleted marks this write covered; they are
// cleared only after it commits, and only if not changed again meanwhile.
let adopted = false;   // the last write pulled in another tab's projects
function writeCacheOnce(captured, prune = false) {
  return idbUpdate(STORE_KEY, current => {
    const store = cache;
    if (reconcile(store, current)) adopted = true;
    if (prune) pruneAutoVersions(store);   // after the merge, so the put really shrinks
    captured.dirty = new Map(dirtyIds);
    captured.deleted = new Set(deletedIds);
    return store;
  });
}

// Coalesce rapid writes (only the latest cache is written) and chain them on one
// promise so an older write can never land after a newer one. Resolves true once
// the write committed, false if it failed. The status line follows the outcome.
// A non-quota failure (after the immediate reopen-and-retry) gets one more try
// RETRY_DELAY later, unless a newer write was queued meanwhile.
function persistIdb(isRetry = false) {
  if (writeQueued) return queuedWrite;
  writeQueued = true;
  writesPending++;
  const mySeq = ++writeSeq;
  writeChain = writeChain.then(async () => {
    writeQueued = false;
    const captured = { dirty: new Map(), deleted: new Set() };
    let ok = false, failure = null;
    try { await writeCacheOnce(captured); ok = true; }
    catch (e) {
      if (isQuotaError(e)) {
        // Out of space: prune the oldest auto-versions and retry once.
        try { await writeCacheOnce(captured, true); ok = true; }
        catch (e2) { failure = 'quota'; }
      } else {
        // Transient (closed connection, aborted transaction): reopen and retry once.
        // Never prune versions for a non-quota error.
        idbReset();
        try { await writeCacheOnce(captured); ok = true; }
        catch (e2) {
          if (isQuotaError(e2)) {
            try { await writeCacheOnce(captured, true); ok = true; }
            catch (e3) { failure = 'quota'; }
          } else {
            failure = 'error';
          }
        }
      }
    }
    if (ok) {
      lastFailure = null;
      captured.deleted.forEach(id => deletedIds.delete(id));
      captured.dirty.forEach((seq, id) => { if (dirtyIds.get(id) === seq) dirtyIds.delete(id); });
      if (channel) { try { channel.postMessage({ type: 'saved', at: Date.now() }); } catch (e) { /* closed */ } }
      if (adopted) { adopted = false; renderPanel(); }
      // A newer write is queued: stay on "Saving" until it lands.
      if (!writeQueued) { const a = getActive(); if (a) setSavedStatus(a.updatedAt); }
      return true;
    }
    setStatusText('Not saved');
    if (failure === 'quota') {
      lastFailure = 'quota';
      showNotification(STORAGE_FULL_MSG, 'error', { duration: 8000 });
    } else if (!isRetry && !writeQueued) {
      lastFailure = 'retrying';
      setTimeout(() => { if (writeSeq === mySeq && !writeQueued) persistIdb(true); }, RETRY_DELAY);
      showNotification('Could not save the project right now. Retrying in a few seconds.', 'error');
    } else {
      lastFailure = 'error';
      showNotification('Could not save the project right now. Your work is still open; try again.', 'error');
    }
    return false;
  }).catch(() => false /* never break the chain */).finally(() => {
    writesPending--;
    if (writesPending === 0 && reloadAfterWrite) { reloadAfterWrite = false; reloadFromIdb(); }
  });
  queuedWrite = writeChain;
  return writeChain;
}

// Another tab committed a write: re-read the store so this tab's cache (and its
// next write) is current. Deferred while a local write is queued or in flight.
function reloadFromIdb() {
  if (backend !== 'idb' || !ready) return;
  if (writesPending > 0) { reloadAfterWrite = true; return; }
  idbGet(STORE_KEY).then(stored => {
    if (writesPending > 0) { reloadAfterWrite = true; return; }   // a write started meanwhile
    // Same rules as a write: keeps this tab's uncommitted changes (e.g. after a
    // failed write) and its deletes; everything else comes from IndexedDB.
    reconcile(cache, stored);   // nothing stored at all (cleared): keep what we have
    renderPanel();
  }, () => { /* keep the cache we have; the next write merges anyway */ });
}

// Projects in localStorage (a pre-v34 store, or work saved while IndexedDB
// failed to load) are merged into IndexedDB: ids IndexedDB lacks are added; for
// an id in both the newer updatedAt wins and the version lists are unioned
// (mergeVersions), so no named version is lost. An empty IndexedDB just takes
// the localStorage store (the first-time migration). One readwrite transaction.
function mergeLocalStore(current, local) {
  if (!current || typeof current !== 'object') return local;
  for (const id of Object.keys(local)) {
    const theirs = local[id];
    if (!theirs || typeof theirs !== 'object') continue;
    const mine = current[id];
    if (!mine) { current[id] = theirs; continue; }
    const winner = (theirs.updatedAt || 0) > (mine.updatedAt || 0) ? theirs : mine;
    mergeVersions(winner, winner === mine ? theirs : mine);
    current[id] = winner;
  }
  return current;
}

// `abandoned()` turns true once initStore gave up (timeout): from then on this
// load must not write IndexedDB or touch localStorage, since the session already
// runs on the localStorage backend.
async function loadIdbStore(abandoned) {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { local = null; }
  if (!local || typeof local !== 'object' || Array.isArray(local)) return idbGet(STORE_KEY);
  let stored;
  try {
    stored = await idbUpdate(STORE_KEY, current => {
      if (abandoned()) throw new Error('IndexedDB load timed out');   // aborts the transaction
      return mergeLocalStore(current, local);
    });
  } catch (e) {
    if (abandoned()) throw e;
    // The merge write failed (e.g. quota) but IndexedDB may still be readable:
    // use what it holds and leave the localStorage store for the next load to
    // merge. If the read fails too, this is a load failure as before.
    return idbGet(STORE_KEY);
  }
  if (abandoned()) throw new Error('IndexedDB load timed out');   // merged again next load
  // Only after the IndexedDB write resolved: free the localStorage space.
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* merged again next load */ }
  return stored;
}

// Open IndexedDB, merge any localStorage project store into it, then mark
// ready. Falls back to the localStorage backend on any IndexedDB failure, or if
// the load has not settled within OPEN_TIMEOUT (a late result is ignored). If
// this browser has used IndexedDB for projects before (IDB_USED_KEY), a failure
// is retried once (within the same time budget), and if it still fails the
// user is told, since their saved projects are in IndexedDB and edits now go to
// localStorage only.
async function initStore() {
  let usedBefore = false;
  try { usedBefore = localStorage.getItem(IDB_USED_KEY) === '1'; } catch (e) { /* ignore */ }
  let timedOut = false;
  const abandoned = () => timedOut;
  const attempt = async () => {
    try { return { ok: true, stored: await loadIdbStore(abandoned) }; }
    catch (e) {
      if (!usedBefore || timedOut) return { ok: false };
      idbReset();
      try { return { ok: true, stored: await loadIdbStore(abandoned) }; }
      catch (e2) { return { ok: false }; }
    }
  };
  let timer;
  const deadline = new Promise(res => {
    timer = setTimeout(() => { timedOut = true; res({ ok: false, timeout: true }); }, OPEN_TIMEOUT);
  });
  const result = await Promise.race([attempt(), deadline]);
  clearTimeout(timer);
  // Timed out: drop the hung open; a late connection is closed when it arrives.
  if (result.timeout) idbReset();
  const ok = result.ok, stored = result.stored;
  if (ok) {
    cache = (stored && typeof stored === 'object') ? stored : {};
    backend = 'idb';
    try { localStorage.setItem(IDB_USED_KEY, '1'); } catch (e) { /* ignore */ }
  } else {
    backend = 'ls';
    if (usedBefore) {
      // The active project is in IndexedDB, not removed: forget it for this
      // session only (ACTIVE_KEY stays, so a later healthy load reopens it), and
      // new work is saved as its own localStorage project by the normal path.
      activeId = null;
      keepActiveKey = true;
      showNotification('Saved projects could not be loaded right now. New work is saved as a separate project; reload later to see your other projects.', 'error', { duration: 8000 });
    }
  }
  ready = true;
  resolveReady();
}

// Storage full: keep every named version, trim auto versions to the newest few.
function pruneAutoVersions(store) {
  Object.values(store).forEach(p => {
    if (!p.versions) return;
    const autoKeep = new Set(p.versions.filter(v => v.auto).slice(0, PRUNE_KEEP_AUTO));
    p.versions = p.versions.filter(v => !v.auto || autoKeep.has(v));
  });
}

// localStorage can throw (quota, private mode); the active id is a convenience.
function setActiveKey(id) {
  if (keepActiveKey) return;
  try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); }
  catch (e) { /* the in-memory activeId still works for this session */ }
}

// Create a project from the current document unless one is being created.
function createFromDocument() {
  if (creating) return null;
  creating = true;
  try { return newProject(); }
  finally { creating = false; }
}

function getActive() {
  if (!activeId) return null;
  return loadStore()[activeId] || null;
}

// ── Saving ───────────────────────────────────────────────────────────────────
function newProject(name) {
  const store = loadStore();
  const id = uid();
  const now = Date.now();
  store[id] = {
    id,
    name: name || untitledName(store),
    payload: cloneDoc(serializeDocument()),   // own copy, never shared with the editor
    thumbnail: makeThumb(),
    createdAt: now,
    updatedAt: now,
    versions: []
  };
  markDirty(id);
  activeId = id;
  setActiveKey(id);
  writeStore(store);
  pushProjectToCloud(store[id]);
  // v30 — Brand Brain enforcement: a new project starts on-brand.
  if (state.brand && state.brand.enforce && state.brand.enabled) {
    import('./brand-brain.js').then(m => m.applyBrand());
  }
  return store[id];
}

function untitledName(store) {
  const n = Object.values(store).filter(p => /^Untitled/.test(p.name)).length;
  return n ? `Untitled ${n + 1}` : 'Untitled';
}

// Persist the current editor state into the active project. Auto-snapshots a
// version if enough time has passed since the last one.
function saveActive({ versionLabel } = {}) {
  let store = loadStore();
  let p = store[activeId];
  if (!p) {
    // Deleted in another tab (or its creation never landed): never stop saving silently.
    if (!activeId) return null;
    const created = createFromDocument();
    if (!created) return null;
    showNotification('This project was removed elsewhere, so your work was saved as a new project.', 'info');
    if (versionLabel == null) { reportWrite(lastWrite, created.updatedAt); return created; }
    store = loadStore();   // newProject wrote it (the ls backend parses a fresh object)
    p = store[activeId];
    if (!p) return created;
  }

  p.payload = cloneDoc(serializeDocument());   // own copy, never shared with the editor
  p.thumbnail = makeThumb();
  touch(p);

  const named = versionLabel != null;
  const last = p.versions[0];
  const due = !last || (Date.now() - last.createdAt) > AUTO_VERSION_INTERVAL;
  if (named || due) {
    p.versions.unshift({
      id: uid(),
      label: named ? versionLabel : null,
      payload: p.payload,   // shared with the project: stored payloads are never mutated
      thumbnail: p.thumbnail,
      createdAt: Date.now(),
      auto: !named
    });
    const justAdded = p.versions[0];
    // Keep all named versions; cap auto versions.
    const namedV = p.versions.filter(v => !v.auto);
    const autoV = p.versions.filter(v => v.auto).slice(0, MAX_AUTO_VERSIONS);
    p.versions = [...namedV, ...autoV].sort((a, b) => b.createdAt - a.createdAt);
    pushVersionToCloud(p.id, justAdded);
  }

  const res = writeStore(store);
  pushProjectToCloud(p);
  reportWrite(res, p.updatedAt);
  return p;
}

function runAutosave() {
  saveTimer = null;
  whenReady(() => {
    if (!activeId) createFromDocument();
    else saveActive();
    renderPanel();
  });
}

function scheduleAutosave() {
  if (!state.image) return;        // nothing meaningful to save yet
  clearTimeout(saveTimer);
  saveTimer = setTimeout(runAutosave, AUTOSAVE_DELAY);
}

// v34: the page is being hidden (tab switch, app switch on a phone, close):
// run a pending debounced autosave now instead of losing it.
function flushPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  runAutosave();
}

// Immediate save triggered by document-level changes (page add / switch /
// delete / reorder) which don't go through the history stack. Creates a project
// on demand so multi-page work is never lost.
// v34: deferred until the project store has loaded (see initStore).
export function saveDocumentNow() {
  whenReady(() => {
    if (!state.image && pageCount() <= 1) return;
    if (!activeId) createFromDocument();
    else saveActive();
    renderPanel();
  });
}

// ── Applying a project / version to the editor ───────────────────────────────
function openProject(id) {
  const p = loadStore()[id];
  if (!p) return;
  activeId = id;
  setActiveKey(id);
  applyDocument(cloneDoc(p.payload));   // the editor gets a copy; edits never touch the store
  if (backend === 'idb' && dirtyIds.has(id)) setStatusText(writesPending ? 'Saving…' : 'Not saved');
  else setSavedStatus(p.updatedAt);
  renderPanel();
  showNotification(`Opened "${p.name}".`, 'success');
}

function restoreVersion(versionId) {
  const store = loadStore();
  const p = store[activeId];
  if (!p) return;
  const v = p.versions.find(x => x.id === versionId);
  if (!v) return;
  // Snapshot the pre-restore state first so the restore itself is recoverable.
  p.versions.unshift({
    id: uid(), label: 'Before restore', payload: cloneDoc(serializeDocument()),
    thumbnail: makeThumb(), createdAt: Date.now(), auto: false
  });
  p.payload = v.payload;   // shared: stored payloads are never mutated
  touch(p);
  writeStore(store);
  pushProjectToCloud(p);
  applyDocument(cloneDoc(v.payload));
  closeVersionsModal();
  renderPanel();
  showNotification('Version restored.', 'success');
}

function forkVersion(versionId) {
  const p = loadStore()[activeId];
  if (!p) return;
  const v = p.versions.find(x => x.id === versionId);
  if (!v) return;
  const store = loadStore();
  const id = uid();
  const now = Date.now();
  store[id] = {
    id, name: `${p.name} (copy)`, payload: cloneDoc(v.payload), thumbnail: v.thumbnail,
    createdAt: now, updatedAt: now, versions: []
  };
  markDirty(id);
  activeId = id;
  setActiveKey(id);
  writeStore(store);
  pushProjectToCloud(store[id]);
  applyDocument(cloneDoc(v.payload));
  closeVersionsModal();
  renderPanel();
  showNotification(`Forked into "${store[id].name}".`, 'success');
}

// ── Project actions ──────────────────────────────────────────────────────────
function renameProject(id) {
  const store = loadStore();
  const p = store[id];
  if (!p) return;
  const name = prompt('Rename project:', p.name);
  if (name == null) return;
  p.name = name.trim() || p.name;
  touch(p);
  writeStore(store);
  pushProjectToCloud(p);
  renderPanel();
}

function duplicateProject(id) {
  const store = loadStore();
  const p = store[id];
  if (!p) return;
  const nid = uid();
  const now = Date.now();
  store[nid] = {
    id: nid, name: `${p.name} (copy)`, payload: cloneDoc(p.payload), thumbnail: p.thumbnail,
    createdAt: now, updatedAt: now, versions: []
  };
  markDirty(nid);
  writeStore(store);
  pushProjectToCloud(store[nid]);
  renderPanel();
  showNotification(`Duplicated "${p.name}".`, 'success');
}

function deleteProject(id) {
  const store = loadStore();
  const p = store[id];
  if (!p) return;
  if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
  delete store[id];
  deletedIds.add(id);   // so the merge in persistIdb does not bring it back from IndexedDB
  dirtyIds.delete(id);
  writeStore(store);
  if (activeId === id) { activeId = null; setActiveKey(null); }
  deleteProjectFromCloud(id);
  renderPanel();
  showNotification('Project deleted.', 'success');
}

// ── Cloud sync (best-effort; local stays the source of truth) ────────────────
async function pushProjectToCloud(p) {
  try {
    const user = getUser(); const c = await getClient();
    if (!user || !c || !p) return;
    await c.from('projects').upsert({
      id: p.id, user_id: user.id, name: p.name,
      payload: p.payload, thumbnail: p.thumbnail,
      updated_at: new Date(p.updatedAt).toISOString()
    }, { onConflict: 'id' });
  } catch (e) { /* offline / not configured — local copy is safe */ }
}
async function pushVersionToCloud(projectId, v) {
  try {
    const user = getUser(); const c = await getClient();
    if (!user || !c || !v) return;
    await c.from('project_versions').upsert({
      id: v.id, project_id: projectId, user_id: user.id,
      label: v.label, payload: v.payload, thumbnail: v.thumbnail,
      created_at: new Date(v.createdAt).toISOString()
    }, { onConflict: 'id' });
  } catch (e) { /* best-effort */ }
}
async function deleteProjectFromCloud(id) {
  try {
    const user = getUser(); const c = await getClient();
    if (!user || !c) return;
    await c.from('projects').delete().eq('id', id).eq('user_id', user.id);
  } catch (e) { /* best-effort */ }
}
async function pullCloud() {
  try {
    await readyP;
    const user = getUser(); const c = await getClient();
    if (!user || !c) return;
    const { data: projs } = await c.from('projects')
      .select('id, name, payload, thumbnail, updated_at').eq('user_id', user.id);
    if (!projs) return;
    const { data: vers } = await c.from('project_versions')
      .select('id, project_id, label, payload, thumbnail, created_at').eq('user_id', user.id);
    const store = loadStore();
    let added = 0;
    projs.forEach(row => {
      const cloudUpdated = new Date(row.updated_at).getTime();
      const local = store[row.id];
      if (!local || cloudUpdated > local.updatedAt) {
        store[row.id] = {
          id: row.id, name: row.name, payload: row.payload, thumbnail: row.thumbnail,
          createdAt: local ? local.createdAt : cloudUpdated, updatedAt: cloudUpdated,
          versions: (vers || []).filter(v => v.project_id === row.id).map(v => ({
            id: v.id, label: v.label, payload: v.payload, thumbnail: v.thumbnail,
            createdAt: new Date(v.created_at).getTime(), auto: !v.label
          })).sort((a, b) => b.createdAt - a.createdAt)
        };
        markDirty(row.id);
        if (!local) added++;
      }
    });
    writeStore(store);
    if (added > 0) showNotification(`Synced ${added} project${added === 1 ? '' : 's'} from cloud.`, 'success');
    renderPanel();
  } catch (e) { /* best-effort */ }
}

// ── UI: sidebar panel ────────────────────────────────────────────────────────
// IndexedDB: the write is async, so show "Saving…" now; persistIdb sets "Saved"
// or "Not saved" once it settles. localStorage: synchronous, as before v34.
function reportWrite(res, ts) {
  if (backend === 'idb' && res && typeof res.then === 'function') setStatusText('Saving…');
  else if (res === false || (backend !== 'idb' && lastFailure)) setStatusText('Not saved');
  else setSavedStatus(ts);
}
function setStatusText(t) {
  const s = document.getElementById('projects-status');
  if (s) s.textContent = t;
}
function setSavedStatus(ts) {
  const s = document.getElementById('projects-status');
  if (s) s.textContent = ts ? `Saved · ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
}

function renderPanel() {
  const nameEl = document.getElementById('projects-current-name');
  const active = getActive();
  if (nameEl) nameEl.textContent = active ? active.name : 'No project — edits autosave to a new one';

  const list = document.getElementById('projects-list');
  if (list) {
    const store = loadStore();
    const items = Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);
    if (items.length === 0) {
      list.innerHTML = '<p class="info-text">No projects yet. Your edits autosave here.</p>';
    } else {
      list.innerHTML = items.map(p => `
        <div class="project-card${p.id === activeId ? ' active' : ''}">
          <div class="project-thumb">${p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : '🖼'}</div>
          <div class="project-meta">
            <div class="project-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</div>
            <div class="project-sub">${p.versions ? p.versions.length : 0} version${(p.versions && p.versions.length === 1) ? '' : 's'} · ${new Date(p.updatedAt).toLocaleDateString()}</div>
          </div>
          <div class="project-actions">
            <button class="btn btn-secondary" data-open="${p.id}" title="Open" style="padding:2px 7px;font-size:11px;">Open</button>
            <button class="btn btn-secondary" data-rename="${p.id}" title="Rename" style="padding:2px 6px;font-size:11px;">✎</button>
            <button class="btn btn-secondary" data-dup="${p.id}" title="Duplicate" style="padding:2px 6px;font-size:11px;">⧉</button>
            <button class="btn btn-secondary" data-del="${p.id}" title="Delete" style="padding:2px 6px;font-size:11px;">🗑</button>
          </div>
        </div>`).join('');
      list.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openProject(b.dataset.open)));
      list.querySelectorAll('[data-rename]').forEach(b => b.addEventListener('click', () => renameProject(b.dataset.rename)));
      list.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => duplicateProject(b.dataset.dup)));
      list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteProject(b.dataset.del)));
    }
  }
}

// ── UI: versions modal ───────────────────────────────────────────────────────
function openVersionsModal() {
  const p = getActive();
  if (!p) { showNotification('No active project yet — make an edit first.', 'error'); return; }
  const body = document.getElementById('versions-modal-body');
  if (body) {
    if (!p.versions || p.versions.length === 0) {
      body.innerHTML = '<p class="info-text">No versions yet. Versions are captured automatically as you work, and whenever you click "Save version".</p>';
    } else {
      body.innerHTML = p.versions.map(v => `
        <div class="version-row">
          <div class="version-thumb">${v.thumbnail ? `<img src="${v.thumbnail}" alt="">` : ''}</div>
          <div class="version-meta">
            <div class="version-label">${v.label ? escapeHTML(v.label) : 'Autosave'}</div>
            <div class="version-time">${new Date(v.createdAt).toLocaleString()}</div>
          </div>
          <div class="version-actions">
            <button class="btn btn-primary" data-restore="${v.id}" style="padding:3px 10px;font-size:12px;">Restore</button>
            <button class="btn btn-secondary" data-fork="${v.id}" style="padding:3px 10px;font-size:12px;">Fork</button>
          </div>
        </div>`).join('');
      body.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => restoreVersion(b.dataset.restore)));
      body.querySelectorAll('[data-fork]').forEach(b => b.addEventListener('click', () => forkVersion(b.dataset.fork)));
    }
  }
  const title = document.getElementById('versions-modal-title');
  if (title) title.textContent = `Version history — ${p.name}`;
  const m = document.getElementById('versions-modal');
  if (m) m.classList.add('visible');
}
function closeVersionsModal() {
  const m = document.getElementById('versions-modal');
  if (m) m.classList.remove('visible');
}

// ── Bind ─────────────────────────────────────────────────────────────────────
export function bindProjects() {
  try { activeId = localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { activeId = null; }

  // Autosave after every committed edit, and after page-level document changes.
  onHistoryChange(scheduleAutosave);
  onDocumentChange(saveDocumentNow);

  const newBtn = document.getElementById('projects-new-btn');
  const saveVerBtn = document.getElementById('projects-save-version-btn');
  const historyBtn = document.getElementById('projects-history-btn');
  if (newBtn) newBtn.addEventListener('click', () => whenReady(() => {
    const name = prompt('New project name:', 'Untitled');
    if (name == null) return;
    newProject(name.trim() || undefined);
    renderPanel();
    showNotification('New project created.', 'success');
  }));
  if (saveVerBtn) saveVerBtn.addEventListener('click', () => whenReady(() => {
    if (!state.image) { showNotification('Load an image first.', 'error'); return; }
    if (!activeId) newProject();
    const label = prompt('Name this version (optional):', '');
    if (label == null) return;
    const saved = saveActive({ versionLabel: label.trim() || 'Manual save' });
    renderPanel();
    if (!saved) { showNotification('Could not save this version. Try again.', 'error'); return; }
    // Confirm only once the write has landed (localStorage resolves at once).
    return lastWrite.then(ok => {
      if (ok) showNotification('Version saved.', 'success');
      else if (lastFailure === 'quota') showNotification(STORAGE_FULL_MSG, 'error', { duration: 8000 });
      else if (lastFailure === 'retrying') showNotification('Version not saved yet. Retrying in a few seconds.', 'error');
      else showNotification('Could not save this version. Try again.', 'error');
    });
  }));
  if (historyBtn) historyBtn.addEventListener('click', () => whenReady(openVersionsModal));

  const closeBtn = document.getElementById('versions-modal-close');
  const overlay = document.getElementById('versions-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeVersionsModal);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeVersionsModal(); });

  // Pull cloud projects whenever a user signs in.
  onAuthChange(u => { if (u) pullCloud(); });

  // v34: flush a pending autosave when the page is hidden or unloaded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSave();
  });
  window.addEventListener('pagehide', flushPendingSave);

  // v34: another tab saved projects; re-read so this tab's list and writes are current.
  if (channel) channel.onmessage = (e) => { if (e.data && e.data.type === 'saved') reloadFromIdb(); };

  const finish = () => {
    const active = getActive();
    if (active) setSavedStatus(active.updatedAt);
    renderPanel();
  };
  if (!idbAvailable()) {
    // No IndexedDB at all: the pre-v34 localStorage path, synchronously as before.
    backend = 'ls';
    ready = true;
    resolveReady();
    finish();
    return;
  }
  // Non-blocking: the rest of the app starts while the store loads. Saves
  // requested meanwhile wait on readyP and run once the real store is in memory.
  initStore().then(finish, finish);
}
