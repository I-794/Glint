// v34 — Bokeh core: a lens blur over raw RGBA pixels. DOM-free so it can be
// checked in plain Node; render/bokeh.js does the canvas work around it.
//
// Light adds up linearly in a real lens, so pixels are averaged in linear
// light (gamma 2.2), not sRGB. The average is weighted: bright pixels get more
// weight (smoothly, above BRIGHT), so they bloom into the kernel's shape (round
// or hexagonal "bokeh balls"), while a flat area keeps its value because every
// pixel in it carries the same weight. Weights are also scaled by alpha, so
// transparent pixels don't darken the edges of opaque ones.

const GAMMA = 2.2;
const BRIGHT = 0.6;   // linear luminance (about 0.79 in sRGB) where blooming starts

export function bokehDefaults() {
  return { enabled: false, amount: 12, highlights: 0.4, shape: 'circle', maskDataUrl: null, maskSig: null };
}

// Offsets (dx, dy pairs) of every pixel inside a circle or flat-top hexagon.
export function buildKernel(radius, shape = 'circle') {
  const r = Math.max(1, Math.round(radius));
  const pts = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const inside = shape === 'hexagon'
        ? Math.abs(dy) <= 0.8660254 * r && 1.7320508 * Math.abs(dx) + Math.abs(dy) <= 1.7320508 * r
        : dx * dx + dy * dy <= r * r;
      if (inside) pts.push(dx, dy);
    }
  }
  return Int16Array.from(pts);
}

// Blur `src` (RGBA, w x h) with a disc/hex kernel. Edges clamp. Returns a new
// array; color is alpha-weighted, and the alpha channel itself is a plain
// average. A radius under 0.5 (or not a number) returns an unchanged copy.
export function lensBlur(src, w, h, radius, shape = 'circle', highlights = 0) {
  if (!Number.isFinite(radius) || radius < 0.5) return new Uint8ClampedArray(src);
  const n = w * h;
  // Per pixel: weighted linear RGB (r*w, g*w, b*w), the weight w, and raw alpha.
  const lin = new Float32Array(n * 5);
  const hl = Number.isFinite(highlights) ? Math.min(1, Math.max(0, highlights)) : 0;
  const boost = 1 + hl * 6;
  for (let i = 0; i < n; i++) {
    const p = i * 4, o = i * 5;
    const r = (src[p] / 255) ** GAMMA, g = (src[p + 1] / 255) ** GAMMA, b = (src[p + 2] / 255) ** GAMMA;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let t = (lum - BRIGHT) / (1 - BRIGHT);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const wgt = (1 + (boost - 1) * t * t * (3 - 2 * t)) * (src[p + 3] / 255);
    lin[o] = r * wgt; lin[o + 1] = g * wgt; lin[o + 2] = b * wgt; lin[o + 3] = wgt; lin[o + 4] = src[p + 3];
  }
  const kern = buildKernel(radius, shape);
  const count = kern.length / 2;
  const inv = 1 / GAMMA;
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sw = 0, sa = 0;
      for (let k = 0; k < kern.length; k += 2) {
        let xx = x + kern[k], yy = y + kern[k + 1];
        if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
        if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
        const q = (yy * w + xx) * 5;
        sr += lin[q]; sg += lin[q + 1]; sb += lin[q + 2]; sw += lin[q + 3]; sa += lin[q + 4];
      }
      const p = (y * w + x) * 4;
      if (sw > 0) {
        out[p] = 255 * Math.min(1, sr / sw) ** inv;
        out[p + 1] = 255 * Math.min(1, sg / sw) ** inv;
        out[p + 2] = 255 * Math.min(1, sb / sw) ** inv;
      }
      out[p + 3] = sa / count;
    }
  }
  return out;
}
