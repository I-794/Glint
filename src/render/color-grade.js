// v17 — Color grade cache (Approach A).
//
// The render pipeline draws the source screenshot in two places (the flat path
// in render.js and the device-screen path in mockups.js) and applies cheap
// adjustments via ctx.filter. The expensive, per-pixel color work that CSS
// filters can't do — temperature/tint and the three Color Map modes — is baked
// here instead, ONCE, into an offscreen canvas keyed by a signature of the
// inputs. Both seams call getGradedImage(state.image): when nothing per-pixel is
// active it returns the source image untouched (the common case), so there's no
// cost; otherwise it returns the cached graded canvas. Because the signature is
// stable across animation/video frames, playback reuses one compute instead of
// reprocessing pixels every frame.

import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import {
  luminance, rgbToLab, labToRgb, buildGradientRamp, nearestSwatch, paletteLabStats
} from '../utils/color.js';
import { applyBokeh, bokehActive, maskFits } from './bokeh.js';
import { applyCompare } from './compare.js';

let idCounter = 0;
const cache = { sig: null, canvas: null };
let taintWarned = false;

// Resolve the active palette's swatches (or [] when none selected).
function activeSwatches() {
  const cp = state.colorPalettes;
  if (!cp || !cp.active) return [];
  const p = cp.library && cp.library[cp.active];
  return (p && Array.isArray(p.swatches)) ? p.swatches : [];
}

// Does the current state require a per-pixel pass at all?
function gradeActive() {
  const f = state.imageFilters || {};
  if ((f.temperature || 0) !== 0 || (f.tint || 0) !== 0) return true;
  const cm = state.colorMap || {};
  if (cm.mode && cm.mode !== 'off') {
    const sw = activeSwatches();
    if (cm.mode === 'gradient' || cm.mode === 'recolor') return sw.length >= 2;
    if (cm.mode === 'transfer') return sw.length >= 1;
  }
  return false;
}

function signature(img) {
  if (!img.__gradeId) img.__gradeId = ++idCounter;
  const f = state.imageFilters || {};
  const cm = state.colorMap || {};
  return JSON.stringify({
    id: img.__gradeId,
    t: f.temperature || 0,
    n: f.tint || 0,
    m: cm.mode || 'off',
    i: cm.intensity ?? 100,
    s: cm.steps ?? 6,
    sw: activeSwatches()
  });
}

// Apply temperature/tint in place to one pixel's [r,g,b]. temp>0 warms (more
// red, less blue); tint>0 pushes magenta (less green). Both -100..100.
function applyTempTint(rgb, tempK, tintK) {
  rgb[0] += tempK;       // red
  rgb[2] -= tempK;       // blue
  rgb[1] -= tintK;       // green (magenta when reduced)
}

function gradeImage(srcImage) {
  if (!srcImage || !srcImage.width || !srcImage.height) return srcImage;
  if (!gradeActive()) return srcImage;

  const sig = signature(srcImage);
  if (cache.sig === sig && cache.canvas) return cache.canvas;

  const w = srcImage.width, h = srcImage.height;
  const canvas = (cache.canvas && cache.canvas.width === w && cache.canvas.height === h)
    ? cache.canvas : document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(srcImage, 0, 0);

  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    // Cross-origin tainted canvas — getImageData throws. Fall back to source.
    if (!taintWarned) {
      taintWarned = true;
      showNotification('Color grading unavailable for this cross-origin image.', 'error');
    }
    return srcImage;
  }

  const data = imgData.data;
  const f = state.imageFilters || {};
  const cm = state.colorMap || {};
  const tempK = (f.temperature || 0) / 100 * 50;
  const tintK = (f.tint || 0) / 100 * 50;
  const intensity = (cm.intensity ?? 100) / 100;

  // Pre-build whatever the active mode needs (outside the per-pixel loop).
  const swatches = activeSwatches();
  const mode = (cm.mode && cm.mode !== 'off') ? cm.mode : null;
  let ramp = null, swatchLabs = null, steps = 0;
  let srcStats = null, tgtStats = null;

  if (mode === 'gradient') {
    ramp = buildGradientRamp(swatches);
    steps = Math.max(0, Math.min(32, cm.steps || 0));
  } else if (mode === 'recolor') {
    swatchLabs = swatches.map(hex => {
      const c = hexFromString(hex);
      return c ? { r: c.r, g: c.g, b: c.b, lab: rgbToLab(c.r, c.g, c.b) } : null;
    }).filter(Boolean);
  } else if (mode === 'transfer') {
    tgtStats = paletteLabStats(swatches);
    srcStats = sampleSourceLabStats(data);
  }

  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    if (tempK || tintK) applyTempTint(rgb, tempK, tintK);

    let out = rgb;
    if (mode === 'gradient') {
      let lum = Math.max(0, Math.min(255, luminance(rgb[0], rgb[1], rgb[2])));
      if (steps > 1) lum = Math.round(Math.round(lum / 255 * (steps - 1)) / (steps - 1) * 255);
      const c = ramp[Math.round(lum)];
      out = [c.r, c.g, c.b];
    } else if (mode === 'recolor' && swatchLabs && swatchLabs.length) {
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      const s = nearestSwatch(lab, swatchLabs);
      out = [s.r, s.g, s.b];
    } else if (mode === 'transfer' && srcStats && tgtStats) {
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      const nl = {
        L: (lab.L - srcStats.mean.L) / srcStats.std.L * tgtStats.std.L + tgtStats.mean.L,
        a: (lab.a - srcStats.mean.a) / srcStats.std.a * tgtStats.std.a + tgtStats.mean.a,
        b: (lab.b - srcStats.mean.b) / srcStats.std.b * tgtStats.std.b + tgtStats.mean.b
      };
      const c = labToRgb(nl.L, nl.a, nl.b);
      out = [c.r, c.g, c.b];
    } else {
      // temperature/tint only — clamp the adjusted channels.
      out = [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])];
    }

    // Blend graded result back toward the (temp/tinted) original by intensity.
    if (mode && intensity < 1) {
      out = [
        rgb[0] + (out[0] - rgb[0]) * intensity,
        rgb[1] + (out[1] - rgb[1]) * intensity,
        rgb[2] + (out[2] - rgb[2]) * intensity
      ];
    }

    data[i] = clamp(out[0]); data[i + 1] = clamp(out[1]); data[i + 2] = clamp(out[2]);
    // alpha (data[i+3]) untouched
  }

  ctx.putImageData(imgData, 0, 0);
  cache.sig = sig;
  cache.canvas = canvas;
  return canvas;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function hexFromString(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// Source-image LAB mean/std, sampled (every Nth pixel) for speed.
function sampleSourceLabStats(data) {
  const stride = Math.max(4, Math.floor(data.length / 4 / 20000) * 4); // ~20k samples
  const labs = [];
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] < 16) continue; // skip transparent
    labs.push(rgbToLab(data[i], data[i + 1], data[i + 2]));
  }
  const n = labs.length || 1;
  const mean = { L: 0, a: 0, b: 0 };
  for (const l of labs) { mean.L += l.L; mean.a += l.a; mean.b += l.b; }
  mean.L /= n; mean.a /= n; mean.b /= n;
  const std = { L: 0, a: 0, b: 0 };
  for (const l of labs) { std.L += (l.L - mean.L) ** 2; std.a += (l.a - mean.a) ** 2; std.b += (l.b - mean.b) ** 2; }
  std.L = Math.sqrt(std.L / n) || 1; std.a = Math.sqrt(std.a / n) || 1; std.b = Math.sqrt(std.b / n) || 1;
  return { mean, std };
}

// Let a fresh image re-warn about tainting (called from image load if desired).
export function resetGradeCache() { cache.sig = null; cache.canvas = null; }

function imageId(img) {
  if (!img.__gradeId) img.__gradeId = ++idCounter;
  return img.__gradeId;
}

// v34 — every caller gets Bokeh on top of the grade for free: this one seam
// feeds the flat, 2D mockup, 3D screen, and Surface paths.
export function getGradedImage(srcImage) {
  // v35 — Before / After Compare wraps the finished After image (grade + Bokeh).
  const out = gradeAndBlur(srcImage);
  return srcImage === state.image ? applyCompare(out) : out;
}

function gradeAndBlur(srcImage) {
  const graded = gradeImage(srcImage);
  if (!graded || !graded.width) return graded;
  // maskFits first (even with Bokeh off) so the one-shot claim after a page
  // load goes to that page's own image, not one rendered later.
  if (!maskFits(srcImage) || !bokehActive()) return graded;   // mask belongs to another image
  const baseKey = graded === srcImage ? 'src:' + imageId(srcImage) : 'grade:' + cache.sig;
  return applyBokeh(graded, baseKey);
}
