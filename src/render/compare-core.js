// v35 — Before / After Compare: DOM-free defaults + geometry.
//
// Kept free of DOM and imports so state.js, serialize.js, and the Node
// regression tests can use it. The drawing lives in render/compare.js.

export const COMPARE_ORIENTATIONS = ['vertical', 'horizontal'];
export const COMPARE_FITS = ['cover', 'contain'];

export function compareDefaults() {
  return {
    enabled: false,
    beforeSrc: null,          // dataURL of the Before screenshot (capped on load)
    orientation: 'vertical',  // 'vertical' divider (Before left) | 'horizontal' (Before top)
    split: 0.5,               // 0..1 share of the frame showing Before
    fit: 'cover',             // how Before fills the After frame
    labels: { enabled: true, before: 'Before', after: 'After', position: 'top' },
    divider: { color: '#ffffff', width: 3, handle: true },
    wipe: false,              // Motion Studio lane: sweep from Before to After
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Fill in missing or invalid fields (older projects, hand-edited payloads).
// Returns a new object; never mutates the input.
export function normalizeCompare(c) {
  const d = compareDefaults();
  if (!c || typeof c !== 'object') return d;
  const labels = { ...d.labels, ...(c.labels && typeof c.labels === 'object' ? c.labels : {}) };
  const divider = { ...d.divider, ...(c.divider && typeof c.divider === 'object' ? c.divider : {}) };
  if (labels.position !== 'bottom') labels.position = 'top';
  const w = Number(divider.width);
  divider.width = Number.isFinite(w) ? Math.max(0, Math.min(12, w)) : d.divider.width;
  const split = Number(c.split);
  return {
    enabled: !!c.enabled,
    beforeSrc: typeof c.beforeSrc === 'string' && c.beforeSrc ? c.beforeSrc : null,
    orientation: COMPARE_ORIENTATIONS.includes(c.orientation) ? c.orientation : d.orientation,
    split: Number.isFinite(split) ? clamp01(split) : d.split,
    fit: COMPARE_FITS.includes(c.fit) ? c.fit : d.fit,
    labels,
    divider,
    wipe: !!c.wipe,
  };
}

// Wipe animation: the divider starts with all of Before showing and sweeps
// across to reveal After, easing in and out. p is 0..1 clip progress.
export function wipeSplit(p) {
  const t = clamp01(p);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return 1 - e;
}

// Divider position inside a rect ({x, y, w, h}), in the rect's coordinates.
export function dividerAt(rect, split, orientation) {
  return orientation === 'horizontal'
    ? { x1: rect.x, y1: rect.y + rect.h * split, x2: rect.x + rect.w, y2: rect.y + rect.h * split }
    : { x1: rect.x + rect.w * split, y1: rect.y, x2: rect.x + rect.w * split, y2: rect.y + rect.h };
}

// Split value for a point dragged inside a rect (clamped to 0..1).
export function splitFromPoint(rect, x, y, orientation) {
  if (!rect || !rect.w || !rect.h) return 0.5;
  return clamp01(orientation === 'horizontal' ? (y - rect.y) / rect.h : (x - rect.x) / rect.w);
}

// Is (x, y) within `tol` of the divider, inside the rect?
export function hitDivider(rect, split, orientation, x, y, tol) {
  if (!rect || !rect.w || !rect.h) return false;
  if (x < rect.x - tol || x > rect.x + rect.w + tol || y < rect.y - tol || y > rect.y + rect.h + tol) return false;
  const d = dividerAt(rect, split, orientation);
  return orientation === 'horizontal' ? Math.abs(y - d.y1) <= tol : Math.abs(x - d.x1) <= tol;
}

// Where Before is drawn inside a w x h frame: 'cover' fills it (cropping),
// 'contain' fits it whole (letterboxed). Centered either way.
export function fitRect(bw, bh, w, h, fit) {
  if (!bw || !bh) return { x: 0, y: 0, w, h };
  const s = fit === 'contain' ? Math.min(w / bw, h / bh) : Math.max(w / bw, h / bh);
  const dw = bw * s, dh = bh * s;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}
