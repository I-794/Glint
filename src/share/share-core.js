// v41 — Share links: DOM-free core shared by the editor, the viewer and api/*.
//
// A share is a folder in Vercel Blob (`shares/<id>/`) holding rendered images
// plus a manifest.json. The manifest names its images by FILE NAME only
// (`3.webp`), never by URL, so a share can only ever point at its own files.
// Everything here is pure: randomness and HMAC are injected so the same module
// runs in Node (api/, tests) and in the browser (editor, viewer).

export const LIMITS = {
  fileBytes: 8 * 1024 * 1024,
  shareBytes: 40 * 1024 * 1024,
  steps: 30,
  hotspots: 12,
  title: 120,
  label: 80,
  body: 400,
  dim: 8192,
  autoAdvanceMs: 60000,
  types: ['image/webp', 'image/jpeg', 'image/png'],
};

export const KINDS = ['image', 'tour', 'compare'];
export const MANIFEST_NAME = 'manifest.json';

const ID_RE = /^[A-Za-z0-9]{12}$/;
const ASSET_RE = /^(\d{1,2}|poster)\.(webp|jpg|png)$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const SIDES = ['top', 'bottom', 'left', 'right'];
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const isShareId = (id) => typeof id === 'string' && ID_RE.test(id);
export const isAssetName = (n) => typeof n === 'string' && ASSET_RE.test(n);
export const assetPath = (id, name) => `shares/${id}/${name}`;
export const sharePrefix = (id) => `shares/${id}/`;

export function extFor(type) {
  return { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[type] || null;
}

export function typeFor(name) {
  const ext = String(name).split('.').pop();
  return { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }[ext] || null;
}

function fail(field) {
  const err = new Error(`bad manifest: ${field}`);
  err.field = field;
  throw err;
}

// ── ids and keys ─────────────────────────────────────────────────────────────

// randomBytes(n) -> Uint8Array-like. Rejection sampling keeps the 62 symbols
// equally likely (248 = 4 * 62).
export function newShareId(randomBytes) {
  let out = '';
  while (out.length < 12) {
    const bytes = randomBytes(24);
    for (let i = 0; i < bytes.length && out.length < 12; i++) {
      if (bytes[i] < 248) out += B62[bytes[i] % 62];
    }
  }
  return out;
}

export function base64url(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
  }
  return out;
}

// hmac(secret, message) -> Uint8Array | Promise<Uint8Array>.
export async function shareKey(hmac, secret, id) {
  if (!secret) throw new Error('no signing secret');
  if (!isShareId(id)) throw new Error('bad id');
  const mac = await hmac(secret, 'own:' + id);
  return base64url(mac);
}

export async function verifyKey(hmac, secret, id, key) {
  if (typeof key !== 'string' || !isShareId(id) || !secret) return false;
  const expected = await shareKey(hmac, secret, id);
  if (expected.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

// ── upload planning ──────────────────────────────────────────────────────────

// The server names every file itself; the client only says what it will send.
// Returns [{ name, type, size }] (poster last) or throws.
export function planUploads({ kind, files, poster } = {}) {
  if (!KINDS.includes(kind)) fail('kind');
  if (!Array.isArray(files)) fail('files');
  const want = kind === 'image' ? [1, 1] : kind === 'compare' ? [2, 2] : [1, LIMITS.steps];
  if (files.length < want[0] || files.length > want[1]) fail('files');
  const plan = [];
  const check = (f, name) => {
    if (!f || !LIMITS.types.includes(f.type)) fail(`${name}.type`);
    const size = Number(f.size);
    if (!Number.isFinite(size) || size <= 0 || size > LIMITS.fileBytes) fail(`${name}.size`);
    return { type: f.type, size };
  };
  files.forEach((f, i) => {
    const c = check(f, 'file');
    plan.push({ name: `${i}.${extFor(c.type)}`, ...c });
  });
  if (poster) {
    const c = check(poster, 'poster');
    plan.push({ name: `poster.${extFor(c.type)}`, ...c });
  }
  const total = plan.reduce((s, p) => s + p.size, 0);
  if (total > LIMITS.shareBytes) fail('total');
  return plan;
}

// ── manifest ─────────────────────────────────────────────────────────────────

function text(v, max) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

function frac(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function dim(v, field) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) fail(field);
  return Math.min(LIMITS.dim, n);
}

function asset(v, field) {
  if (!isAssetName(v)) fail(field);
  return v;
}

function normalizeHotspot(h) {
  if (!h || typeof h !== 'object') fail('hotspot');
  const x = frac(h.x), y = frac(h.y);
  const out = {
    x, y,
    w: Math.min(frac(h.w), 1 - x),
    h: Math.min(frac(h.h), 1 - y),
    label: text(h.label, LIMITS.label),
    callout: null,
  };
  const c = h.callout;
  if (c && typeof c === 'object') {
    const title = text(c.title, LIMITS.label);
    const body = text(c.body, LIMITS.body);
    if (title || body) out.callout = { title, body, side: SIDES.includes(c.side) ? c.side : 'bottom' };
  }
  return out;
}

function normalizeStep(s) {
  if (!s || typeof s !== 'object') fail('step');
  const hotspots = s.hotspots == null ? [] : s.hotspots;
  if (!Array.isArray(hotspots) || hotspots.length > LIMITS.hotspots) fail('hotspots');
  const ms = Math.round(Number(s.autoAdvanceMs));
  return {
    src: asset(s.src, 'step.src'),
    w: dim(s.w, 'step.w'),
    h: dim(s.h, 'step.h'),
    autoAdvanceMs: Number.isFinite(ms) ? Math.max(0, Math.min(LIMITS.autoAdvanceMs, ms)) : 0,
    hotspots: hotspots.map(normalizeHotspot),
  };
}

function normalizeCompareBlock(c) {
  if (!c || typeof c !== 'object') fail('compare');
  const r = c.rect && typeof c.rect === 'object' ? c.rect : {};
  const rx = frac(r.x), ry = frac(r.y);
  const labels = c.labels && typeof c.labels === 'object' ? c.labels : {};
  const divider = c.divider && typeof c.divider === 'object' ? c.divider : {};
  const width = Number(divider.width);
  return {
    before: asset(c.before, 'compare.before'),
    after: asset(c.after, 'compare.after'),
    w: dim(c.w, 'compare.w'),
    h: dim(c.h, 'compare.h'),
    rect: { x: rx, y: ry, w: Math.min(frac(r.w, 1), 1 - rx), h: Math.min(frac(r.h, 1), 1 - ry) },
    orientation: c.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    split: frac(c.split, 0.5),
    labels: {
      enabled: labels.enabled === true,
      before: text(labels.before, LIMITS.label),
      after: text(labels.after, LIMITS.label),
      position: labels.position === 'bottom' ? 'bottom' : 'top',
    },
    divider: {
      color: typeof divider.color === 'string' && HEX_RE.test(divider.color) ? divider.color : '#ffffff',
      width: Number.isFinite(width) ? Math.max(0, Math.min(12, width)) : 3,
      handle: divider.handle !== false,
    },
  };
}

// Returns a clean manifest or throws Error('bad manifest: <field>'). Unknown
// keys and the blocks for other kinds are dropped. `id` (when given) wins over
// the manifest's own; `now` (server side) stamps createdAt.
export function normalizeManifest(raw, { id, now } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('root');
  if (!KINDS.includes(raw.kind)) fail('kind');
  const shareId = id != null ? id : raw.id;
  if (!isShareId(shareId)) fail('id');
  let createdAt = null;
  if (now != null) createdAt = new Date(now).toISOString();
  else if (typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))) createdAt = new Date(raw.createdAt).toISOString();

  const out = {
    v: 1,
    id: shareId,
    kind: raw.kind,
    title: text(raw.title, LIMITS.title),
    createdAt,
    poster: raw.poster == null ? null : asset(raw.poster, 'poster'),
  };

  if (raw.kind === 'image') {
    const im = raw.image;
    if (!im || typeof im !== 'object') fail('image');
    out.image = { src: asset(im.src, 'image.src'), w: dim(im.w, 'image.w'), h: dim(im.h, 'image.h'), alt: text(im.alt, LIMITS.body) };
  } else if (raw.kind === 'tour') {
    const steps = raw.tour && raw.tour.steps;
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > LIMITS.steps) fail('tour.steps');
    out.tour = { steps: steps.map(normalizeStep) };
  } else {
    out.compare = normalizeCompareBlock(raw.compare);
  }
  return out;
}

// Every file name a manifest refers to (poster included).
export function manifestAssets(m) {
  const names = [];
  if (m.poster) names.push(m.poster);
  if (m.kind === 'image') names.push(m.image.src);
  else if (m.kind === 'tour') m.tour.steps.forEach((s) => names.push(s.src));
  else names.push(m.compare.before, m.compare.after);
  return [...new Set(names)];
}

// One-line description for link previews.
export function describeShare(m) {
  if (m.kind === 'tour') {
    const n = m.tour.steps.length;
    return `An interactive tour in ${n} step${n === 1 ? '' : 's'}. Made with Glint.`;
  }
  if (m.kind === 'compare') return 'A before and after you can drag. Made with Glint.';
  return 'Made with Glint.';
}
