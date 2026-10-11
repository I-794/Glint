// v35 — Before / After Compare render pass.
//
// Builds one composite the size of the After screenshot: After everywhere,
// Before on its side of the divider, plus the divider, its handle, and the
// Before / After labels. Called from color-grade.js getGradedImage(), the seam
// all four composition paths draw through, so the comparison bakes into every
// path (flat, 2D device, 3D, surface) and every export, and the sidebar image
// filters apply to both halves alike. The per-pixel color grade and Bokeh
// apply to After only (Before is the untouched second screenshot).
//
// Cached by inputs, so a still preview composites once; a wipe animation
// re-composites per frame (two drawImage calls).

import { state } from '../state/state.js';
import { localProgress } from '../state/motion-clock.js';
import { wipeSplit, dividerAt, fitRect } from './compare-core.js';

const IMG_CACHE_MAX = 4;
const imgCache = new Map();   // beforeSrc -> { img, ready }
const cache = { key: null, canvas: null };
let idCounter = 0;
let onReady = null;

export function setCompareImageListener(fn) { onReady = fn; }

export function compareActive() {
  const c = state.compare;
  return !!(c && c.enabled && c.beforeSrc) && !(state.video && state.video.loaded);
}

// Decode (once) the Before image for a dataURL. Resolves when it's usable, so an
// offscreen page render can wait for it.
export function ensureCompareImage(src) {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null);
  const hit = imgCache.get(src);
  if (hit) return hit.ready;
  const img = new Image();
  const entry = { img, ok: false, ready: null };
  entry.ready = new Promise((resolve) => {
    img.onload = () => { entry.ok = true; resolve(img); if (onReady) onReady(); };
    img.onerror = () => { imgCache.delete(src); resolve(null); };
  });
  img.src = src;
  imgCache.set(src, entry);
  if (imgCache.size > IMG_CACHE_MAX) imgCache.delete(imgCache.keys().next().value);
  return entry.ready;
}

export function getCompareImage(src) {
  const hit = src && imgCache.get(src);
  return hit && hit.ok ? hit.img : null;
}

// The split in effect now: the Motion Studio wipe while the unified clock is
// driving, else the sidebar value.
export function currentSplit() {
  const c = state.compare;
  if (c.wipe) {
    const p = localProgress('compare', null, null);
    if (p != null) return wipeSplit(p);
  }
  return c.split;
}

function imageId(img) {
  if (!img.__cmpId) img.__cmpId = ++idCounter;
  return img.__cmpId;
}

function pill(ctx, text, x, y, s, alignRight) {
  ctx.save();
  ctx.font = `600 ${Math.round(15 * s)}px Geist, -apple-system, "Segoe UI", sans-serif`;
  const padX = 11 * s, h = 28 * s;
  const w = ctx.measureText(text).width + padX * 2;
  const left = alignRight ? x - w : x;
  ctx.fillStyle = 'rgba(12, 13, 18, 0.62)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, y, w, h, h / 2); else ctx.rect(left, y, w, h);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, y + h / 2 + 0.5 * s);
  ctx.restore();
  return { w, h };
}

function measurePill(ctx, text, s) {
  ctx.save();
  ctx.font = `600 ${Math.round(15 * s)}px Geist, -apple-system, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width + 22 * s;
  ctx.restore();
  return w;
}

function drawChrome(ctx, w, h, split, c) {
  // Chrome scales with the screenshot, so it reads the same at any resolution.
  const s = Math.max(0.75, Math.max(w, h) / 800);
  const vertical = c.orientation !== 'horizontal';
  const showDivider = split > 0.001 && split < 0.999;

  if (showDivider && c.divider.width > 0) {
    const d = dividerAt({ x: 0, y: 0, w, h }, split, c.orientation);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 8 * s;
    ctx.strokeStyle = c.divider.color;
    ctx.lineWidth = c.divider.width * s;
    ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
    if (c.divider.handle) {
      const cx = (d.x1 + d.x2) / 2, cy = (d.y1 + d.y2) / 2, r = 19 * s;
      ctx.fillStyle = c.divider.color;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(17, 18, 24, 0.85)';
      ctx.lineWidth = 2.2 * s;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const a = 5 * s, o = 6 * s;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(cx - o + a * 0.2, cy - a); ctx.lineTo(cx - o - a * 0.8, cy); ctx.lineTo(cx - o + a * 0.2, cy + a);
        ctx.moveTo(cx + o - a * 0.2, cy - a); ctx.lineTo(cx + o + a * 0.8, cy); ctx.lineTo(cx + o - a * 0.2, cy + a);
      } else {
        ctx.moveTo(cx - a, cy - o + a * 0.2); ctx.lineTo(cx, cy - o - a * 0.8); ctx.lineTo(cx + a, cy - o + a * 0.2);
        ctx.moveTo(cx - a, cy + o - a * 0.2); ctx.lineTo(cx, cy + o + a * 0.8); ctx.lineTo(cx + a, cy + o - a * 0.2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const L = c.labels;
  if (!L || !L.enabled) return;
  // Inset a few percent too: device screens crop the image edges slightly.
  const padX = Math.max(16 * s, w * 0.04), padY = Math.max(16 * s, h * 0.04), ph = 28 * s;
  const before = (L.before || '').trim(), after = (L.after || '').trim();
  if (vertical) {
    const y = L.position === 'bottom' ? h - padY - ph : padY;
    // Show a label only when its side has room for it.
    if (before && split * w >= measurePill(ctx, before, s) + padX * 2) pill(ctx, before, padX, y, s, false);
    if (after && (1 - split) * w >= measurePill(ctx, after, s) + padX * 2) pill(ctx, after, w - padX, y, s, true);
  } else {
    const right = L.position === 'bottom';
    const x = right ? w - padX : padX;
    if (before && split * h >= ph + padY * 2) pill(ctx, before, x, padY, s, right);
    if (after && (1 - split) * h >= ph + padY * 2) pill(ctx, after, x, h - padY - ph, s, right);
  }
}

// Returns `after` unchanged when Compare is off (or Before is still decoding);
// otherwise the cached composite.
export function applyCompare(after) {
  if (!after || !after.width || !after.height || !compareActive()) return after;
  const c = state.compare;
  const before = getCompareImage(c.beforeSrc);
  if (!before) { ensureCompareImage(c.beforeSrc); return after; }

  const split = currentSplit();
  const w = after.width, h = after.height;
  const key = JSON.stringify([imageId(after), c.beforeSrc.length, c.beforeSrc.slice(-32), Math.round(split * 10000),
    c.orientation, c.fit, c.labels, c.divider, w, h]);
  if (cache.key === key && cache.canvas) return cache.canvas;

  const canvas = cache.canvas && cache.canvas.width === w && cache.canvas.height === h
    ? cache.canvas : document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(after, 0, 0, w, h);

  if (split > 0) {
    ctx.save();
    ctx.beginPath();
    if (c.orientation === 'horizontal') ctx.rect(0, 0, w, h * split);
    else ctx.rect(0, 0, w * split, h);
    ctx.clip();
    ctx.clearRect(0, 0, w, h);   // 'contain' letterbox shows the design behind
    const r = fitRect(before.width, before.height, w, h, c.fit);
    ctx.drawImage(before, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  drawChrome(ctx, w, h, split, c);
  cache.key = key;
  cache.canvas = canvas;
  return canvas;
}
