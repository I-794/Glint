// v37 — non-destructive crop: DOM-free logic. state.imageCrop is
// { x, y, w, h, angle } in fractions of the ORIGINAL image (angle in degrees,
// -45..45: the original is straightened around its centre, then cropped), or
// null for no crop. The cropped
// picture is rebuilt from the original whenever imageCrop changes (see
// render/crop-image.js), so undo, redo, saving and Roll shots all keep the
// original pixels.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Repair a crop block; a full-frame, unrotated crop is the same as no crop.
export function normalizeCrop(c) {
  if (!c || typeof c !== 'object') return null;
  const x = clamp(num(c.x, 0), 0, 0.95);
  const y = clamp(num(c.y, 0), 0, 0.95);
  const w = clamp(num(c.w, 1), 0.05, 1 - x);
  const h = clamp(num(c.h, 1), 0.05, 1 - y);
  const angle = clamp(num(c.angle, 0), -45, 45);
  const r = (v) => Math.round(v * 10000) / 10000;
  const out = { x: r(x), y: r(y), w: r(w), h: r(h), angle: Math.round(angle * 10) / 10 };
  const full = out.x === 0 && out.y === 0 && out.w === 1 && out.h === 1 && out.angle === 0;
  return full ? null : out;
}

export function cropKey(c) {
  const n = normalizeCrop(c);
  return n ? `${n.x},${n.y},${n.w},${n.h},${n.angle}` : '';
}

// The uncropped original behind a cropped picture (or the image itself).
export function cropSource(img) {
  return (img && img.__cropOriginal) || img;
}

// Pixel rectangle of a crop on a w x h original.
export function cropRect(c, w, h) {
  const n = normalizeCrop(c) || { x: 0, y: 0, w: 1, h: 1, angle: 0 };
  return {
    sx: n.x * w, sy: n.y * h,
    sw: Math.max(1, Math.round(n.w * w)), sh: Math.max(1, Math.round(n.h * h)),
    angle: n.angle,
  };
}

// While the crop tool is open the canvas shows the original, so the renderer
// must not apply the crop.
export const cropRuntime = { editing: false };

// v37 schema 22: every applied design carries imageCrop (null by default), so a
// page without a crop never inherits the previous page's crop.
export function ensureCropDefaults(design) {
  if (design) design.imageCrop = normalizeCrop(design.imageCrop);
  return design;
}
