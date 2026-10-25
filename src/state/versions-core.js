// v40 — Hindsight: saved versions. A version is a named copy of one undo
// snapshot (the design, not the screenshot) that stays when the undo list moves
// on and travels with the project, per page. DOM-free (the tests import it).

export const MAX_VERSIONS = 12;
const NAME_MAX = 40;
const THUMB_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// A pin thumbnail is only ever a plain base64 image dataURL. Checked again at
// render, since state.versions can arrive from payloads that skip normalizeVersions.
export function isSafeThumb(s) {
  return typeof s === 'string' && THUMB_RE.test(s);
}

export function cleanName(name, fallback = 'Pin') {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || fallback;
}

// A version never carries the Roll: shot images live outside the snapshot, so
// an old roll could point at shots that are gone.
function versionSnap(snap) {
  const { roll, ...rest } = snap || {};
  return JSON.parse(JSON.stringify(rest));
}

export function makeVersion({ id, name, at, snap, thumb }) {
  return {
    id: String(id),
    name: cleanName(name),
    at: Number.isFinite(at) ? at : Date.now(),
    snap: versionSnap(snap),
    thumb: isSafeThumb(thumb) ? thumb : null,
  };
}

// migrateSnap runs the design migrations on each saved snapshot, so a version
// saved today still restores after a later schema bump.
export function normalizeVersions(list, migrateSnap = (s) => s) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const v of list) {
    if (out.length >= MAX_VERSIONS) break;
    if (!v || typeof v !== 'object' || !v.id) continue;
    if (!v.snap || typeof v.snap !== 'object' || Array.isArray(v.snap)) continue;
    out.push(makeVersion({ ...v, snap: migrateSnap(versionSnap(v.snap)) }));
  }
  return out;
}

export function ensureVersionsDefaults(design, migrateSnap) {
  if (design) design.versions = normalizeVersions(design.versions, migrateSnap);
  return design;
}
