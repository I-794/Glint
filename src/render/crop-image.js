// v37 — builds the cropped picture for state.imageCrop from the original image.
// The result is a canvas tagged with __cropOriginal / __cropKey, so the
// original is never lost.

import { state } from '../state/state.js';
import { normalizeCrop, cropKey, cropSource, cropRect, cropRuntime } from './crop-core.js';

const cache = new WeakMap(); // original -> Map(key -> canvas)
const CACHE_MAX = 4;

function build(src, crop) {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  if (!w || !h) return src;
  const key = cropKey(crop);
  let byKey = cache.get(src);
  if (!byKey) { byKey = new Map(); cache.set(src, byKey); }
  if (byKey.has(key)) return byKey.get(key);
  const { sx, sy, sw, sh, angle } = cropRect(crop, w, h);
  const out = document.createElement('canvas');
  out.width = sw; out.height = sh;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (Math.abs(angle) < 0.01) {
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    // Straighten the whole original around its centre (what the crop tool
    // previews), then cut the crop out of it.
    ctx.translate(-sx, -sy);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(src, 0, 0);
  }
  out.__cropOriginal = src;
  out.__cropKey = key;
  byKey.set(key, out);
  if (byKey.size > CACHE_MAX) byKey.delete(byKey.keys().next().value);
  return out;
}

// The whole original straightened by `angle` (the crop tool's live preview).
export function rotatedPreview(src, angle) {
  if (!src || !angle) return src;
  return build(src, { x: 0, y: 0, w: 1, h: 1, angle });
}

// Make state.image show state.imageCrop applied to its original. Call it right
// after setting state.image to an original whose saved crop should apply
// (project/page load, Roll shots).
export function syncCroppedImage() {
  const src = cropSource(state.image);
  if (!src) return;
  const crop = normalizeCrop(state.imageCrop);
  state.imageCrop = crop;
  // Remember this original, so a redo that brings a crop back applies it.
  src.__cropBase = true;
  state.image = crop ? build(src, crop) : src;
}

// Called at the start of every render: after undo/redo (or a Roll shot switch)
// changed imageCrop, rebuild the picture from its original. A brand-new image
// from anywhere else (upload, paste, AI edit, code snippet) has never been
// through syncCroppedImage, so it starts uncropped.
export function ensureCrop() {
  const img = state.image;
  if (!img || cropRuntime.editing) return;
  if (img.__cropOriginal) {
    if (img.__cropKey !== cropKey(state.imageCrop)) syncCroppedImage();
  } else if (state.imageCrop) {
    if (img.__cropBase) syncCroppedImage();
    else state.imageCrop = null;
  }
}
