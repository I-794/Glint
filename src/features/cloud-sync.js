// v43 — Keepsake: cross-device cloud sync for Glint Pro.
// Syncs local projects (glint_projects_v12 in IndexedDB), libraries
// (glint_looks, glint_brandkits, glint_templates), and refreshes account-backed
// "Your links" when signed into a Glint Pro account.

import { showNotification } from '../ui/notification.js';
import { getAccount, onAccountChange, isPro, accountFetch } from './account.js';
import { openAccountPanel } from './account-panel.js';
import { onAuthChange } from './auth.js';
import {
  getProjectsForSync, applyRemoteProject, applyRemoteDelete,
  clearLocalTombstone, onProjectChange,
} from './projects.js';
import {
  SYNC_LIMITS, planProjectSync, projectSyncRecord, mergeLooks, mergeKeyedLibrary,
} from '../state/sync-core.js';

const LIB_TS_KEY = 'glint_library_ts';
const LIB_STORE = {
  looks: { key: 'glint_looks', empty: () => [], refresh: () => window.__refreshLooksList?.() },
  brandkits: { key: 'glint_brandkits', empty: () => ({}), refresh: () => window.__refreshBrandKitList?.() },
  templates: { key: 'glint_templates', empty: () => ({}), refresh: () => window.__refreshTemplateList?.() },
};

const syncState = {
  status: 'idle',    // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  lastSyncedAt: null,
  tooLargeCount: 0,
  message: '',
};

let inFlight = null;
let rerunQueued = false;
let debounceTimer = null;
let syncedForPro = false;
let hiddenAt = 0;

function readLibTs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIB_TS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) { return {}; }
}

function writeLibTs(map) {
  try { localStorage.setItem(LIB_TS_KEY, JSON.stringify(map)); } catch (_) { /* ignore */ }
}

function readLibrary(kind) {
  const spec = LIB_STORE[kind];
  try {
    const val = JSON.parse(localStorage.getItem(spec.key) || 'null');
    if (kind === 'looks') return Array.isArray(val) ? val : [];
    return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
  } catch (_) { return spec.empty(); }
}

function writeLibrary(kind, data) {
  const spec = LIB_STORE[kind];
  try { localStorage.setItem(spec.key, JSON.stringify(data)); return true; }
  catch (_) { return false; }
}

function hasLibraryItems(kind, data) {
  return Array.isArray(data) ? data.length > 0 : Object.keys(data || {}).length > 0;
}

export function getSyncState() {
  return { ...syncState, pro: isPro() };
}

function renderSyncBar() {
  const bar = document.getElementById('cloud-sync-bar');
  if (!bar) return;
  const { usage, offer } = getAccount();
  if (!offer || !usage) {
    bar.hidden = true;
    bar.replaceChildren();
    return;
  }
  bar.hidden = false;

  if (usage.plan !== 'pro') {
    const label = document.createElement('span');
    label.className = 'cloud-sync-text';
    label.textContent = 'Saved in this browser.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cloud-sync-btn';
    btn.textContent = 'Sync with Glint Pro';
    btn.addEventListener('click', openAccountPanel);
    bar.replaceChildren(label, btn);
    return;
  }

  const left = document.createElement('div');
  left.className = 'cloud-sync-status';
  const dot = document.createElement('span');
  dot.className = `cloud-sync-dot is-${syncState.status}`;
  dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'cloud-sync-text';

  if (syncState.status === 'syncing') {
    text.textContent = 'Syncing…';
  } else if (syncState.status === 'offline') {
    text.textContent = 'Offline · stays in browser';
  } else if (syncState.status === 'error') {
    text.textContent = syncState.message || 'Sync paused';
  } else if (syncState.status === 'synced' && syncState.lastSyncedAt) {
    const t = new Date(syncState.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    text.textContent = syncState.tooLargeCount > 0
      ? `Synced · ${t} (${syncState.tooLargeCount} over 3.6 MB, local only)`
      : `Synced · ${t}`;
  } else {
    text.textContent = 'Cloud sync ready';
  }

  left.append(dot, text);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cloud-sync-btn';
  btn.textContent = syncState.status === 'syncing' ? 'Syncing…' : 'Sync now';
  btn.disabled = syncState.status === 'syncing';
  btn.addEventListener('click', () => syncNow({ quiet: false }));
  bar.replaceChildren(left, btn);
}

function notifyPanels() {
  renderSyncBar();
  window.__refreshAccountPanel?.();
}

async function syncProjects(remote) {
  const local = await getProjectsForSync();
  const maxBytes = (remote.limits && remote.limits.maxProjectBytes) || SYNC_LIMITS.maxProjectBytes;
  const plan = planProjectSync(local.projects, remote.projects, local.deleted, maxBytes);

  for (const id of plan.toPull) {
    const r = await accountFetch('sync-project', { query: `id=${encodeURIComponent(id)}` });
    if (r.ok && r.data && r.data.project && !r.data.project.deleted) {
      await applyRemoteProject(r.data.project);
    }
  }

  for (const id of plan.toDeleteLocal) {
    const rMeta = remote.projects.find((p) => p.id === id);
    await applyRemoteDelete(id, (rMeta && rMeta.updatedAt) || Date.now());
  }

  for (const id of plan.toDeleteRemote) {
    const delAt = Number(local.deleted[id]) || Date.now();
    const r = await accountFetch('sync-project', {
      method: 'POST',
      body: { id, deleted: true, updatedAt: delAt },
    });
    if (r.ok) clearLocalTombstone(id);
  }

  for (const id of plan.toPush) {
    const proj = local.projects[id];
    if (!proj) continue;
    const rec = projectSyncRecord(proj);
    const r = await accountFetch('sync-project', { method: 'POST', body: rec });
    if (r.status === 409) {
      const got = await accountFetch('sync-project', { query: `id=${encodeURIComponent(id)}` });
      if (got.ok && got.data && got.data.project) {
        if (got.data.project.deleted) await applyRemoteDelete(id, got.data.project.updatedAt);
        else await applyRemoteProject(got.data.project);
      }
    } else if (!r.ok && r.status !== 413) {
      throw new Error((r.data && r.data.error) || 'Could not sync a project.');
    }
  }

  return plan.tooLarge.length;
}

async function syncLibraries(remoteLibs) {
  const libTs = readLibTs();
  for (const kind of SYNC_LIMITS.libraryKinds) {
    const localData = readLibrary(kind);
    const localHas = hasLibraryItems(kind, localData);
    const localAt = Number(libTs[kind]) || 0;
    const remAt = Number(remoteLibs && remoteLibs[kind] && remoteLibs[kind].updatedAt) || 0;

    if (remAt > localAt) {
      const r = await accountFetch('sync-library', { query: `kind=${encodeURIComponent(kind)}` });
      if (!r.ok || !r.data || r.data.data == null) continue;
      const merged = kind === 'looks'
        ? mergeLooks(localData, r.data.data)
        : mergeKeyedLibrary(localData, r.data.data, localAt > 0);
      writeLibrary(kind, merged);
      LIB_STORE[kind].refresh();
      if (localAt === 0 && localHas) {
        const pushAt = Math.max(Date.now(), remAt + 1);
        const pushed = await accountFetch('sync-library', {
          method: 'POST',
          body: { kind, data: merged, updatedAt: pushAt },
        });
        libTs[kind] = pushed.ok ? pushAt : remAt;
      } else {
        libTs[kind] = remAt;
      }
      writeLibTs(libTs);
    } else if (localHas && (localAt > remAt || remAt === 0)) {
      const pushAt = localAt || Date.now();
      const pushed = await accountFetch('sync-library', {
        method: 'POST',
        body: { kind, data: localData, updatedAt: pushAt },
      });
      if (pushed.ok) {
        libTs[kind] = pushAt;
        writeLibTs(libTs);
      }
    }
  }
}

export async function syncNow({ quiet = false } = {}) {
  if (!isPro()) {
    renderSyncBar();
    return { ok: false, skipped: true };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    syncState.status = 'offline';
    syncState.message = '';
    notifyPanels();
    return { ok: false, offline: true };
  }
  if (inFlight) {
    rerunQueued = true;
    return inFlight;
  }

  syncState.status = 'syncing';
  syncState.message = '';
  notifyPanels();

  inFlight = (async () => {
    try {
      const listRes = await accountFetch('sync-list');
      if (!listRes.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
          syncState.status = 'idle';
          return { ok: false, skipped: true };
        }
        throw new Error((listRes.data && listRes.data.error) || 'Could not reach cloud sync.');
      }
      const tooLargeCount = await syncProjects(listRes.data || {});
      await syncLibraries((listRes.data && listRes.data.libraries) || {});
      await window.__refreshShareLinks?.();
      syncState.status = 'synced';
      syncState.lastSyncedAt = Date.now();
      syncState.tooLargeCount = tooLargeCount;
      syncState.message = '';
      if (!quiet) showNotification('Synced projects, libraries and links.', 'success');
      return { ok: true };
    } catch (e) {
      syncState.status = 'error';
      syncState.message = (e && e.message) || 'Sync paused — try again';
      if (!quiet) showNotification(syncState.message, 'error');
      return { ok: false, error: syncState.message };
    } finally {
      inFlight = null;
      notifyPanels();
      if (rerunQueued) {
        rerunQueued = false;
        setTimeout(() => syncNow({ quiet: true }), 200);
      }
    }
  })();

  return inFlight;
}

function scheduleSync() {
  if (!isPro()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow({ quiet: true });
  }, 3000);
}

function handleAccountState() {
  if (isPro()) {
    if (!syncedForPro) {
      syncedForPro = true;
      syncNow({ quiet: true });
    }
  } else {
    syncedForPro = false;
    clearTimeout(debounceTimer);
    syncState.status = 'idle';
    syncState.lastSyncedAt = null;
    syncState.tooLargeCount = 0;
    syncState.message = '';
  }
  notifyPanels();
}

export function bindCloudSync() {
  window.__cloudSyncNow = syncNow;
  window.__cloudSyncStatus = getSyncState;
  window.__onLibraryChange = (kind) => {
    if (!SYNC_LIMITS.libraryKinds.includes(kind)) return;
    const ts = readLibTs();
    ts[kind] = Date.now();
    writeLibTs(ts);
    scheduleSync();
  };

  onProjectChange(({ fromSync }) => { if (!fromSync) scheduleSync(); });
  onAccountChange(handleAccountState);
  onAuthChange(handleAccountState);

  window.addEventListener('online', () => { if (isPro()) syncNow({ quiet: true }); });
  window.addEventListener('offline', () => { if (isPro()) { syncState.status = 'offline'; notifyPanels(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (isPro() && hiddenAt && Date.now() - hiddenAt > 60_000) {
      syncNow({ quiet: true });
    }
  });

  renderSyncBar();
}
