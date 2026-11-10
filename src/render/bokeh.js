// v34 — Subject Bokeh render pass. Keeps the subject (from a saved mask) sharp
// and swaps the background for a lens-blurred copy with bright-spot bloom.
// Called from getGradedImage(), the seam all four composition paths draw
// through, so it bakes into every path and every export. Cached by input +
// settings, so animation frames reuse one compute.
import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { lensBlur, tiltBand, pullEase } from './bokeh-core.js';
import { localProgress } from '../state/motion-clock.js';

const cache = { key: null, maskSrc: null, canvas: null };
// Decoded mask images by dataURL. A few entries, so a multi-page export can hold
// every page's mask ready instead of swapping a single slot back and forth.
const MASK_CACHE_MAX = 4;
const maskCache = new Map();   // src -> { img, ready: Promise }
let onMaskReady = null;
let taintWarned = false;

export function setBokehMaskListener(fn) { onMaskReady = fn; }

export function bokehActive() {
  const b = state.bokeh;
  return !!(b && b.enabled && b.mode !== 'tilt' && b.maskDataUrl) && !(state.video && state.video.loaded);
}

// v42 — tilt-shift: a sharp band with the blur growing away from it. No mask.
export function tiltActive() {
  const b = state.bokeh;
  return !!(b && b.enabled && b.mode === 'tilt') && !(state.video && state.video.loaded);
}

// v42 — eased progress of the Motion Studio focus pull, or null when the pull
// is off or the timeline is not driving the preview (the still design shows).
export function focusProgress() {
  const b = state.bokeh;
  if (!b || !b.pull || !b.pull.enabled) return null;
  const p = localProgress('focus', null, null);
  return p == null ? null : pullEase(p);
}

// Aspect-ratio signature: survives the JPEG re-encode a saved project gets, and
// changes when the image is cropped or swapped for a different shape.
export function aspectSig(img) {
  return (img.width / img.height).toFixed(3);
}

// The saved signature is rounded to 3 decimals and a saved project downscales
// large photos (rounding each side), so compare with a relative tolerance.
function sameAspect(sig, img) {
  const a = img.width / img.height;
  return Math.abs(parseFloat(sig) - a) / a < 0.01;
}

// Which masks belong to which image: each image object carries the set of mask
// strings detected on (or claimed by) it, so undo/redo back to an earlier mask
// still finds its image, and no module-level reference keeps an image alive.
// Runtime-only; never persisted or snapshotted.
function tag(img, src) {
  if (!img.__bokehMasks) img.__bokehMasks = new Set();
  img.__bokehMasks.add(src);
}

// A page/project load decodes a fresh image object that has no tags yet. Only
// right after a load (releaseMaskOwner) may the first image checked claim the
// mask; undo/redo swapping the mask string never opens a claim.
let pendingClaim = false;

export function bindMaskOwner(img) {
  pendingClaim = false;
  if (img && state.bokeh && state.bokeh.maskDataUrl) tag(img, state.bokeh.maskDataUrl);
}

export function releaseMaskOwner() {
  pendingClaim = true;
}

// Does the saved mask belong to this exact source image? The claim after a load
// is one-shot: the first image checked (the page's own) uses it either way.
export function maskFits(img) {
  const b = state.bokeh;
  const claim = pendingClaim;
  if (img) pendingClaim = false;
  if (!b || !b.maskDataUrl || !img || !img.width || !img.height) return false;
  if (b.maskSig && !sameAspect(b.maskSig, img)) return false;
  if (img.__bokehMasks && img.__bokehMasks.has(b.maskDataUrl)) return true;
  if (claim) { tag(img, b.maskDataUrl); return true; }
  return false;
}

// Same test as maskFits, but it never claims: for status text and other reads
// that must not use up the one-shot claim after a load.
export function maskMatches(img) {
  const b = state.bokeh;
  if (!b || !b.maskDataUrl || !img || !img.width || !img.height) return false;
  if (b.maskSig && !sameAspect(b.maskSig, img)) return false;
  if (img.__bokehMasks && img.__bokehMasks.has(b.maskDataUrl)) return true;
  return pendingClaim;
}

function maskEntry(src) {
  let e = maskCache.get(src);
  if (e) { maskCache.delete(src); maskCache.set(src, e); return e; }   // most recent last
  const img = new Image();
  const ready = new Promise((resolve) => {
    img.onload = () => { resolve(); if (onMaskReady) onMaskReady(); };
    img.onerror = () => resolve();
  });
  img.src = src;
  e = { img, ready };
  maskCache.set(src, e);
  while (maskCache.size > MASK_CACHE_MAX) maskCache.delete(maskCache.keys().next().value);
  return e;
}

function maskImage(src) {
  const img = maskEntry(src).img;
  return img.complete && img.naturalWidth ? img : null;
}

// Resolves once this mask is decoded (or failed), so an offscreen render right
// after a page apply draws its Bokeh instead of skipping it mid-decode.
export function ensureBokehMask(src) {
  if (!src) return Promise.resolve();
  return maskEntry(src).ready;
}

// v42 — the lens blur is the slow part, so blurred copies are kept by input +
// settings. The focus pull and the tilt band only composite these, so playing
// a pull or dragging the band never re-runs the blur.
const BLUR_CACHE_MAX = 3;
const blurCache = new Map();   // key -> full-size blurred canvas

function blurredCopy(src, baseKey, amount) {
  const b = state.bokeh;
  const key = [baseKey, amount, b.highlights, b.shape].join('|');
  const hit = blurCache.get(key);
  if (hit) { blurCache.delete(key); blurCache.set(key, hit); return hit; }

  const w = src.width, h = src.height;
  // Work small: the heavier the blur, the less detail survives anyway, so the
  // working size shrinks with the amount to keep the kernel near 8px.
  const workLong = Math.max(160, Math.min(640, Math.round(8000 / amount)));
  const s = Math.min(1, workLong / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * s)), sh = Math.max(1, Math.round(h * s));
  const work = document.createElement('canvas');
  work.width = sw; work.height = sh;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(src, 0, 0, sw, sh);
  let data;
  try {
    data = wctx.getImageData(0, 0, sw, sh);
  } catch (e) {
    if (!taintWarned) { taintWarned = true; showNotification('Bokeh is unavailable for this cross-origin image.', 'error'); }
    return null;
  }
  const radius = Math.max(1, amount * Math.max(sw, sh) / 1000);
  data.data.set(lensBlur(data.data, sw, sh, radius, b.shape, b.highlights));
  wctx.putImageData(data, 0, 0);

  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const f = full.getContext('2d');
  f.imageSmoothingQuality = 'high';
  f.drawImage(work, 0, 0, w, h);
  blurCache.set(key, full);
  while (blurCache.size > BLUR_CACHE_MAX) blurCache.delete(blurCache.keys().next().value);
  return full;
}

// One scratch canvas for masked layers; only the result is a fresh canvas.
let scratch = null;
function scratchFor(w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const c = scratch.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  c.globalAlpha = 1;
  c.clearRect(0, 0, w, h);
  return c;
}

export function applyBokeh(src, baseKey) {
  if (!bokehActive() || !src || !src.width || !src.height) return src;
  const b = state.bokeh;
  if (b.maskSig && !sameAspect(b.maskSig, src)) return src;    // stale mask
  const mask = maskImage(b.maskDataUrl);
  if (!mask) return src;                                      // still decoding

  const amount = Math.max(1, b.amount || 12);
  // v42 — a focus pull racks the blur strength between `from` and `to`.
  const p = focusProgress();
  const strength = p == null ? 1 : b.pull.from + (b.pull.to - b.pull.from) * p;
  const key = [baseKey, amount, b.highlights, b.shape, Math.round(strength * 1000)].join('|');
  if (cache.key === key && cache.maskSrc === b.maskDataUrl && cache.canvas) return cache.canvas;

  const blurred = blurredCopy(src, baseKey, amount);
  if (!blurred) return src;
  const w = src.width, h = src.height;

  // A fresh canvas per recompute (not the cached one redrawn in place): the 3D
  // screen texture is cached by image identity, so reusing the object would
  // leave the 3D mockup showing the previous amount/shape.
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  if (strength < 1) {
    o.drawImage(src, 0, 0);
    o.globalAlpha = Math.max(0, strength);
    o.drawImage(blurred, 0, 0);
    o.globalAlpha = 1;
  } else {
    o.drawImage(blurred, 0, 0);
  }

  // Sharp subject on top, cut by a slightly softened mask so edges blend.
  const sc = scratchFor(w, h);
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = 'destination-in';
  sc.filter = `blur(${Math.max(1, Math.round(Math.max(w, h) / 600))}px)`;
  sc.drawImage(mask, 0, 0, w, h);
  o.drawImage(scratch, 0, 0);

  cache.key = key; cache.maskSrc = b.maskDataUrl; cache.canvas = out;
  return out;
}

// v42 — tilt-shift. The sharp image, then a half-strength blur and a full blur
// on top, each cut by a gradient across the band (bokeh-core tiltBand), so the
// blur grows with distance from the band.
const tiltCache = { key: null, canvas: null };

export function applyTiltShift(src, baseKey) {
  if (!tiltActive() || !src || !src.width || !src.height) return src;
  const b = state.bokeh;
  const amount = Math.max(1, b.amount || 12);
  const p = focusProgress();
  const pos = p == null ? b.tilt.pos : b.pull.from + (b.pull.to - b.pull.from) * p;
  const key = [baseKey, amount, b.highlights, b.shape, b.tilt.width, b.tilt.feather, b.tilt.angle, Math.round(pos * 2000)].join('|');
  if (tiltCache.key === key && tiltCache.canvas) return tiltCache.canvas;

  const full = blurredCopy(src, baseKey, amount);
  const mid = full && blurredCopy(src, baseKey, Math.max(1, amount / 2));
  if (!full || !mid) return src;

  const w = src.width, h = src.height;
  const band = tiltBand(b.tilt, w, h, pos);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  o.drawImage(src, 0, 0);
  for (const [layer, stops] of [[mid, band.mid], [full, band.full]]) {
    const sc = scratchFor(w, h);
    sc.drawImage(layer, 0, 0);
    const g = sc.createLinearGradient(band.line.x0, band.line.y0, band.line.x1, band.line.y1);
    for (const [at, alpha] of stops) g.addColorStop(at, `rgba(0,0,0,${alpha})`);
    sc.globalCompositeOperation = 'destination-in';
    sc.fillStyle = g;
    sc.fillRect(0, 0, w, h);
    o.drawImage(scratch, 0, 0);
  }
  tiltCache.key = key; tiltCache.canvas = out;
  return out;
}
