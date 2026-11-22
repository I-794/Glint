// v43 — Keepsake: DOM-free sync & share-list merge helpers shared by the
// editor, api/_sync.js, and the regression tests.

export const SYNC_LIMITS = {
  maxProjectBytes: 3_600_000,
  maxProjects: 40,
  maxTotalBytes: 50 * 1024 * 1024,
  maxLibraryBytes: 2_000_000,
  libraryKinds: ['looks', 'brandkits', 'templates'],
  tombstoneTtlMs: 90 * 24 * 60 * 60 * 1000,
};

export const FREE_MAX_EXPIRY = '30d';

const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DATA_THUMB_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const BLOB_THUMB_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>]+$/i;
const MAX_DATA_THUMB_CHARS = 300 * 1024;
const encoder = new TextEncoder();

export function isValidProjectId(id) {
  return typeof id === 'string' && PROJECT_ID_RE.test(id);
}

export function isLibraryKind(kind) {
  return typeof kind === 'string' && SYNC_LIMITS.libraryKinds.includes(kind);
}

export function utf8Bytes(str) {
  return encoder.encode(String(str == null ? '' : str)).length;
}

export function isSafeThumbUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (DATA_THUMB_RE.test(url)) return url.length <= MAX_DATA_THUMB_CHARS;
  if (BLOB_THUMB_RE.test(url)) return url.length <= 512;
  return false;
}

// Strip local-only version arrays and validate fields before measuring/pushing.
export function projectSyncRecord(proj) {
  const p = proj && typeof proj === 'object' ? proj : {};
  const now = Date.now();
  return {
    id: String(p.id || ''),
    name: String(p.name || 'Untitled').slice(0, 120),
    thumbnail: isSafeThumbUrl(p.thumbnail) ? p.thumbnail : null,
    payload: p.payload ?? null,
    createdAt: Number.isFinite(Number(p.createdAt)) && Number(p.createdAt) > 0 ? Math.floor(Number(p.createdAt)) : now,
    updatedAt: Number.isFinite(Number(p.updatedAt)) && Number(p.updatedAt) > 0 ? Math.floor(Number(p.updatedAt)) : now,
  };
}

export function measureProjectRecord(rec) {
  const json = JSON.stringify(rec);
  return { json, bytes: utf8Bytes(json) };
}

function projectBytes(local) {
  if (Number.isFinite(local._bytes)) return local._bytes;
  return measureProjectRecord(projectSyncRecord(local)).bytes;
}

// Compare local projects + tombstones against the server's sync-list summary.
// Returns { toPull, toPush, toDeleteLocal, toDeleteRemote, tooLarge }.
export function planProjectSync(localMap, remoteList, deletedMap, maxBytes = SYNC_LIMITS.maxProjectBytes) {
  const local = localMap && typeof localMap === 'object' ? localMap : {};
  const deleted = deletedMap && typeof deletedMap === 'object' ? deletedMap : {};
  const remoteById = new Map();
  if (Array.isArray(remoteList)) {
    for (const r of remoteList) {
      if (r && isValidProjectId(r.id)) remoteById.set(r.id, r);
    }
  }

  const ids = new Set([...Object.keys(local), ...remoteById.keys(), ...Object.keys(deleted)]);
  const toPull = [];
  const toPush = [];
  const toDeleteLocal = [];
  const toDeleteRemote = [];
  const tooLarge = [];

  for (const id of ids) {
    if (!isValidProjectId(id)) continue;
    const loc = local[id] || null;
    const rem = remoteById.get(id) || null;
    const delAt = Number(deleted[id]) || 0;

    if (!loc && rem) {
      if (rem.deleted) continue;
      if (delAt >= (Number(rem.updatedAt) || 0)) toDeleteRemote.push(id);
      else toPull.push(id);
    } else if (loc && !rem) {
      if (projectBytes(loc) > maxBytes) tooLarge.push(id);
      else toPush.push(id);
    } else if (loc && rem) {
      const locAt = Number(loc.updatedAt) || 0;
      const remAt = Number(rem.updatedAt) || 0;
      if (rem.deleted) {
        if (remAt > locAt) toDeleteLocal.push(id);
        else if (projectBytes(loc) > maxBytes) tooLarge.push(id);
        else toPush.push(id);
      } else if (remAt > locAt) {
        toPull.push(id);
      } else if (locAt > remAt) {
        if (projectBytes(loc) > maxBytes) tooLarge.push(id);
        else toPush.push(id);
      }
    }
  }

  return { toPull, toPush, toDeleteLocal, toDeleteRemote, tooLarge };
}

export function mergeLooks(localArr, remoteArr, max = 60) {
  const local = Array.isArray(localArr) ? localArr.filter((l) => l && typeof l.id === 'string' && l.name) : [];
  const remote = Array.isArray(remoteArr) ? remoteArr.filter((l) => l && typeof l.id === 'string' && l.name) : [];
  const remoteById = new Map(remote.map((l) => [l.id, l]));
  const seen = new Set();
  const merged = [];

  for (const l of local) {
    seen.add(l.id);
    merged.push(remoteById.has(l.id) ? remoteById.get(l.id) : l);
  }
  for (const r of remote) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }
  return merged.slice(0, max);
}

export function mergeKeyedLibrary(localObj, remoteObj, preferRemote = false) {
  const loc = localObj && typeof localObj === 'object' && !Array.isArray(localObj) ? localObj : {};
  const rem = remoteObj && typeof remoteObj === 'object' && !Array.isArray(remoteObj) ? remoteObj : {};
  return preferRemote ? { ...loc, ...rem } : { ...rem, ...loc };
}

export function pruneTombstones(deletedMap, now = Date.now()) {
  const out = {};
  if (!deletedMap || typeof deletedMap !== 'object') return out;
  for (const [id, at] of Object.entries(deletedMap)) {
    const ts = Number(at);
    if (isValidProjectId(id) && Number.isFinite(ts) && ts > 0 && now - ts <= SYNC_LIMITS.tombstoneTtlMs) {
      out[id] = ts;
    }
  }
  return out;
}

export function mergeShareLists(localList, remoteList, max = 50) {
  const byId = new Map();
  if (Array.isArray(localList)) {
    for (const item of localList) {
      if (!item || typeof item.id !== 'string') continue;
      byId.set(item.id, { ...item, synced: false });
    }
  }
  if (Array.isArray(remoteList)) {
    for (const r of remoteList) {
      if (!r || typeof r.id !== 'string') continue;
      const loc = byId.get(r.id);
      if (loc) {
        byId.set(r.id, {
          ...loc,
          ...r,
          title: r.title || loc.title || '',
          url: r.url || loc.url,
          key: r.key || loc.key || null,
          posterUrl: r.posterUrl || loc.posterUrl || null,
          expiresAt: r.expiresAt !== undefined ? r.expiresAt : (loc.expiresAt || null),
          createdAt: loc.createdAt || r.createdAt || null,
          thumb: loc.thumb || null,
          imageUrl: loc.imageUrl || null,
          w: loc.w || null,
          h: loc.h || null,
          note: loc.note || '',
          synced: true,
        });
      } else {
        byId.set(r.id, { ...r, synced: true });
      }
    }
  }
  return [...byId.values()]
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .slice(0, max);
}
