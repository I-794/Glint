// v38 — Focus: curves + levels render pass. Called from getGradedImage() (after
// the v17 grade, before Bokeh), the seam all four composition paths draw
// through, so it bakes into every path and every export. The base pixels are
// cached by the input's key, so dragging a curve point only reruns the LUT loop.
import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { isIdentity, colorToolsKey, channelLuts, applyLuts } from './curves-core.js';

const base = { key: null, data: null, w: 0, h: 0 };
const out = { key: null, canvas: null };
let taintWarned = false;

// Works on video too: the base key carries the frame counter video.js bumps on
// every drawFrame, so each new frame is regraded.
export function colorToolsActive() {
  return !!state.colorTools && !isIdentity(state.colorTools);
}

function baseData(src, baseKey) {
  if (base.key === baseKey && base.data && base.w === src.width && base.h === src.height) return base.data;
  const w = src.width, h = src.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);   // throws on a cross-origin image
  Object.assign(base, { key: baseKey, data, w, h });
  return data;
}

// Returns { image, key }: key extends baseKey so Bokeh downstream re-keys too.
export function applyColorTools(src, baseKey) {
  if (!colorToolsActive() || !src || !src.width || !src.height) return { image: src, key: baseKey };
  const key = baseKey + '|ct:' + colorToolsKey(state.colorTools);
  if (out.key === key && out.canvas) return { image: out.canvas, key };

  let data;
  try {
    data = baseData(src, baseKey);
  } catch (e) {
    if (!taintWarned) { taintWarned = true; showNotification('Curves are unavailable for this cross-origin image.', 'error'); }
    return { image: src, key: baseKey };
  }
  const [lr, lg, lb] = channelLuts(state.colorTools);
  const px = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  applyLuts(px.data, lr, lg, lb);

  // A fresh canvas per recompute: the 3D screen texture and Compare's cache
  // key off image identity, so redrawing one canvas in place would go stale.
  const canvas = document.createElement('canvas');
  canvas.width = data.width; canvas.height = data.height;
  canvas.getContext('2d').putImageData(px, 0, 0);
  out.key = key;
  out.canvas = canvas;
  return { image: canvas, key };
}

// 64-bin luminance + R/G/B histograms of an image, sampled small, for the
// curve editor's backdrop. Cached by image identity.
const histCache = new WeakMap();
export function histogramOf(img) {
  if (!img || !img.width || !img.height) return null;
  if (histCache.has(img)) return histCache.get(img);
  const s = Math.min(1, 256 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  let d;
  try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }
  const bins = { rgb: new Array(64).fill(0), r: new Array(64).fill(0), g: new Array(64).fill(0), b: new Array(64).fill(0) };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    bins.r[r >> 2]++; bins.g[g >> 2]++; bins.b[b >> 2]++;
    bins.rgb[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b) >> 2]++;
  }
  histCache.set(img, bins);
  return bins;
}
