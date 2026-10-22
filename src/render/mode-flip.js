// v39 — Glossifier: light to dark render pass. Called first in color-grade.js
// gradeAndBlur(), before the v17 grade, curves and Bokeh, so the user's grade
// styles the flipped image, and because it sits behind getGradedImage() it
// bakes into all four composition paths and every export. The source pixels,
// photo mask and detected mode are cached per source image; the lookup table
// per setting; so a slider drag only reruns the table lookup.
import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { normalizeModeFlip, modeFlipKey, resolveTarget, detectMode, photoMask, surfaceMask, mergeMasks, buildLut3d, applyFlip } from './mode-flip-core.js';

const src = { img: null, frame: -1, data: null, mask: null, mode: null, keep: {} };
const lutCache = { key: null, lut: null };
const out = { key: null, canvas: null };
let taintWarned = false;
let idCounter = 0;

function imageId(img) {
  if (!img.__flipId) img.__flipId = ++idCounter;
  return img.__flipId;
}

// Per-frame photo analysis on a playing video is out of scope (same as Bokeh
// and Compare), so the flip stays off while a video is loaded.
function videoLoaded() {
  return !!(state.video && state.video.loaded);
}

function sourceInfo(img) {
  const frame = img.__frame || 0;
  if (src.img === img && src.frame === frame && src.data && src.data.width === img.width && src.data.height === img.height) return src;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);   // throws on a cross-origin image
  const mask = photoMask(data.data, data.width, data.height);
  Object.assign(src, { img, frame, data, mask, mode: detectMode(data.data, data.width, data.height, mask), keep: {} });
  return src;
}

// 'light' | 'dark' | null for an image (null when it cannot be read). The UI
// uses this to label the button "Flip to dark" or "Flip to light".
export function detectImageMode(img) {
  if (!img || !img.width || !img.height) return null;
  try { return sourceInfo(img).mode; } catch (e) { return null; }
}

export function modeFlipActive() {
  return !!(state.modeFlip && state.modeFlip.enabled) && !videoLoaded();
}

// Returns { image, key }. key is '' when nothing changed, so callers can fold
// it into their own cache keys.
export function applyModeFlip(img) {
  if (!modeFlipActive() || !img || !img.width || !img.height) return { image: img, key: '' };
  const mf = normalizeModeFlip(state.modeFlip);
  let info;
  try {
    info = sourceInfo(img);
  } catch (e) {
    if (!taintWarned) { taintWarned = true; showNotification('Light / Dark is unavailable for this cross-origin image.', 'error'); }
    return { image: img, key: '' };
  }
  const target = resolveTarget(mf.target, info.mode);
  if (!target) return { image: img, key: '' };   // already the target mode

  const key = `flip:${imageId(img)}:${info.frame}:${target}:${modeFlipKey(mf)}`;
  if (out.key === key && out.canvas) return { image: out.canvas, key };

  const lutKey = `${target}:${mf.surface}:${mf.protect}`;
  if (lutCache.key !== lutKey) { lutCache.key = lutKey; lutCache.lut = buildLut3d(target, mf.surface, mf.protect); }
  // Photos plus the panels that already are the target mode (cached per target).
  if (!(target in info.keep)) info.keep[target] = mergeMasks(info.mask, surfaceMask(info.data.data, info.data.width, info.data.height, target));
  const px = new ImageData(new Uint8ClampedArray(info.data.data), info.data.width, info.data.height);
  applyFlip(px.data, lutCache.lut, info.keep[target], mf.protect);

  // A fresh canvas per recompute: the 3D screen texture, the v17 grade and
  // Compare key off image identity, so redrawing one canvas in place would go stale.
  const canvas = document.createElement('canvas');
  canvas.width = px.width; canvas.height = px.height;
  canvas.getContext('2d').putImageData(px, 0, 0);
  out.key = key;
  out.canvas = canvas;
  return { image: canvas, key };
}
