// v39 — Glossifier: light to dark mode, DOM-free logic. state.modeFlip turns a
// light-mode screenshot dark (or the reverse) by flipping lightness in OKLab
// while keeping hue, so a blue stays blue. The per-pixel pass is a trilinear
// lookup into a 33x33x33 table built once per setting (render/mode-flip.js),
// with two guards: saturated colors (brand buttons, status colors) keep their
// lightness, and photo areas (busy 16x16 tiles) keep their original pixels.
// Match the scene (sceneFlip) and the tests use the same math without a DOM.

export const TARGETS = ['auto', 'dark', 'light'];
const INK = 0.93;            // OKLab L that black text becomes in dark mode
const LUT_N = 33;            // table points per axis
const TILE = 16;             // photo-detection tile size in pixels

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- state ------------------------------------------------------------------

export function modeFlipDefaults() {
  return { enabled: false, target: 'auto', surface: 20, protect: 60 };
}

export function normalizeModeFlip(mf) {
  const src = mf && typeof mf === 'object' ? mf : {};
  return {
    enabled: src.enabled === true,
    target: TARGETS.includes(src.target) ? src.target : 'auto',
    surface: Math.round(clamp(num(src.surface, 20), 12, 36)),
    protect: Math.round(clamp(num(src.protect, 60), 0, 100)),
  };
}

// v39 schema 24: every applied design carries a valid modeFlip block, so a page
// that predates v39 never inherits the previous page's flip.
export function ensureModeFlipDefaults(design) {
  if (design) design.modeFlip = normalizeModeFlip(design.modeFlip);
  return design;
}

export function modeFlipKey(mf) {
  const n = normalizeModeFlip(mf);
  return `${n.target}:${n.surface}:${n.protect}`;
}

// 'auto' means the opposite of what the image is now. Returns null when the
// image already is the target mode (the pass then does nothing), which is what
// lets the Roll develop "light" and "dark" for every shot without double flips.
export function resolveTarget(target, detected) {
  if (target === 'dark' || target === 'light') return target === detected ? null : target;
  return detected === 'light' ? 'dark' : 'light';
}

// ---- OKLab ------------------------------------------------------------------

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// r, g, b 0..255 -> [L, a, b] (L 0..1)
export function srgbToOklab(r, g, b) {
  const lr = toLinear(r / 255), lg = toLinear(g / 255), lb = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

// [L, a, b] -> linear RGB 0..1 (may fall outside the gamut)
function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

// [L, a, b] -> [r, g, b] 0..255. Colors outside sRGB lose chroma (hue and
// lightness stay) until they fit, instead of clipping into a different hue.
export function oklabToSrgb(L, a, b) {
  let rgb = oklabToLinear(L, a, b);
  if (!inGamut(rgb)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(L, a * mid, b * mid))) lo = mid; else hi = mid;
    }
    rgb = oklabToLinear(L, a * lo, b * lo);
  }
  return rgb.map((c) => Math.round(clamp(toGamma(clamp(c, 0, 1)), 0, 1) * 255));
}

// Dark: white becomes the surface level and black becomes soft ink, like a real
// dark theme. Light is the exact inverse, so flipping twice comes back close.
export function flipLightness(L, target, surface = 20) {
  const s = clamp(surface, 12, 36) / 100;
  if (target === 'dark') return INK - (INK - s) * clamp(L, 0, 1);
  return clamp((INK - L) / (INK - s), 0, 1);
}

// ---- detection --------------------------------------------------------------

// 'light' or 'dark' from the mean lightness of about 4000 sampled pixels.
// Photo pixels (mask > 127) are skipped when a mask is given, so a dark photo
// on a light page still reads as a light page.
export function detectMode(data, w, h, mask = null) {
  const total = w * h;
  if (!total) return 'light';
  const step = Math.max(1, Math.floor(total / 4000));
  let sum = 0, n = 0;
  for (let p = 0; p < total; p += step) {
    if (mask && mask[p] > 127) continue;
    const i = p * 4;
    if (data[i + 3] < 16) continue;
    sum += srgbToOklab(data[i], data[i + 1], data[i + 2])[0];
    n++;
  }
  if (!n) return 'light';
  return sum / n >= 0.55 ? 'light' : 'dark';
}

// Photo mask, one byte per pixel (255 = keep the original). A 16x16 tile is a
// photo when it has many distinct colors, or when it is smooth but almost no
// pixel exactly equals its right-hand neighbor (sky, skin: photos carry noise,
// while interface surfaces repeat one exact color). Inside a photo
// every pixel is kept; on a photo's edge tiles only the non-flat pixels are, so
// the flat interface around a photo still flips and no light halo is left.
export function photoMask(data, w, h) {
  const tw = Math.ceil(w / TILE), th = Math.ceil(h / TILE);
  const photo = new Uint8Array(tw * th);
  const seen = new Uint32Array(32768);
  let stamp = 0;
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      stamp++;
      let distinct = 0, pairs = 0, equal = 0;
      const y1 = Math.min(h, (ty + 1) * TILE), x1 = Math.min(w, (tx + 1) * TILE);
      for (let y = ty * TILE; y < y1; y++) {
        for (let x = tx * TILE; x < x1; x++) {
          const i = (y * w + x) * 4;
          const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
          if (seen[key] !== stamp) { seen[key] = stamp; distinct++; }
          if (x + 1 < x1) {
            pairs++;
            if (data[i] === data[i + 4] && data[i + 1] === data[i + 5] && data[i + 2] === data[i + 6]) equal++;
          }
        }
      }
      const area = (y1 - ty * TILE) * (x1 - tx * TILE);
      const busy = distinct >= Math.max(12, area * 0.19);
      const noisy = pairs >= 8 && equal / pairs < 0.3;
      photo[ty * tw + tx] = busy || noisy ? 1 : 0;
    }
  }
  const mask = new Uint8Array(w * h);
  const isPhoto = (tx, ty) => tx < 0 || ty < 0 || tx >= tw || ty >= th ? 1 : photo[ty * tw + tx];
  const same = (i, j) => data[i] === data[j] && data[i + 1] === data[j + 1] && data[i + 2] === data[j + 2];
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      if (!photo[ty * tw + tx]) continue;
      let interior = true;
      for (let dy = -1; dy <= 1 && interior; dy++) for (let dx = -1; dx <= 1; dx++) if (!isPhoto(tx + dx, ty + dy)) { interior = false; break; }
      const y1 = Math.min(h, (ty + 1) * TILE), x1 = Math.min(w, (tx + 1) * TILE);
      for (let y = ty * TILE; y < y1; y++) {
        for (let x = tx * TILE; x < x1; x++) {
          const p = y * w + x;
          if (interior) { mask[p] = 255; continue; }
          const i = p * 4;
          let flat = 0;
          if (x > 0 && same(i, i - 4)) flat++;
          if (x < w - 1 && same(i, i + 4)) flat++;
          if (y > 0 && same(i, i - w * 4)) flat++;
          if (y < h - 1 && same(i, i + w * 4)) flat++;
          mask[p] = flat >= 3 ? 0 : 255;
        }
      }
    }
  }
  return mask;
}

// ---- the lookup table -------------------------------------------------------

// 33^3 RGB table for one (target, surface, protect). Saturated colors blend back
// toward their own lightness by `protect`, so brand colors survive the flip.
export function buildLut3d(target, surface = 20, protect = 60) {
  const lut = new Uint8Array(LUT_N * LUT_N * LUT_N * 3);
  const keep = clamp(protect, 0, 100) / 100;
  let o = 0;
  for (let ri = 0; ri < LUT_N; ri++) {
    for (let gi = 0; gi < LUT_N; gi++) {
      for (let bi = 0; bi < LUT_N; bi++) {
        const [L, a, b] = srgbToOklab(ri * 255 / (LUT_N - 1), gi * 255 / (LUT_N - 1), bi * 255 / (LUT_N - 1));
        const C = Math.hypot(a, b);
        const t = smoothstep(0.07, 0.17, C) * keep;
        const L2 = flipLightness(L, target, surface) * (1 - t) + L * t;
        const rgb = oklabToSrgb(L2, a, b);
        lut[o++] = rgb[0]; lut[o++] = rgb[1]; lut[o++] = rgb[2];
      }
    }
  }
  return lut;
}

// Flip `data` (RGBA, in place). `mask` (photoMask) keeps photo pixels in
// proportion to `protect`; alpha is untouched.
export function applyFlip(data, lut, mask = null, protect = 60) {
  const S = (LUT_N - 1) / 255;
  const N2 = LUT_N * LUT_N;
  const keep = clamp(protect, 0, 100) / 100;
  // Interfaces are mostly runs of one color, so a repeat of the previous
  // unmasked pixel reuses its result instead of interpolating again.
  let pr = -1, pg = -1, pb = -1, or = 0, og = 0, ob = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const m = mask ? (mask[p] / 255) * keep : 0;
    if (m >= 1) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (m === 0 && r === pr && g === pg && b === pb) { data[i] = or; data[i + 1] = og; data[i + 2] = ob; continue; }
    const fr = r * S, fg = g * S, fb = b * S;
    const r0 = Math.min(LUT_N - 2, fr | 0), g0 = Math.min(LUT_N - 2, fg | 0), b0 = Math.min(LUT_N - 2, fb | 0);
    const dr = fr - r0, dg = fg - g0, db = fb - b0;
    const base = (r0 * N2 + g0 * LUT_N + b0) * 3;
    for (let c = 0; c < 3; c++) {
      const c000 = lut[base + c], c001 = lut[base + 3 + c];
      const c010 = lut[base + LUT_N * 3 + c], c011 = lut[base + LUT_N * 3 + 3 + c];
      const c100 = lut[base + N2 * 3 + c], c101 = lut[base + N2 * 3 + 3 + c];
      const c110 = lut[base + (N2 + LUT_N) * 3 + c], c111 = lut[base + (N2 + LUT_N) * 3 + 3 + c];
      const c00 = c000 + (c001 - c000) * db, c01 = c010 + (c011 - c010) * db;
      const c10 = c100 + (c101 - c100) * db, c11 = c110 + (c111 - c110) * db;
      const c0 = c00 + (c01 - c00) * dg, c1 = c10 + (c11 - c10) * dg;
      const v = c0 + (c1 - c0) * dr;
      const orig = data[i + c];
      data[i + c] = m > 0 ? Math.round(v * (1 - m) + orig * m) : Math.round(v);
    }
    if (m === 0) { pr = r; pg = g; pb = b; or = data[i]; og = data[i + 1]; ob = data[i + 2]; }
  }
  return data;
}

// ---- Match the scene ---------------------------------------------------------

function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

// The same flip for one CSS hex color, keeping hue. A color already on the
// target side (a dark color for a dark target) is returned as it was, so a
// scene that is already dark stays put. Non-hex values pass through.
export function flipColorHex(hex, target, surface = 20) {
  const rgb = parseHex(hex);
  if (!rgb || (target !== 'dark' && target !== 'light')) return hex;
  const [L, a, b] = srgbToOklab(...rgb);
  if (target === 'dark' ? L < 0.5 : L >= 0.5) return hex;
  return toHex(oklabToSrgb(flipLightness(L, target, surface), a, b));
}

const FRAME_TO_DARK = { light: 'dark', silver: 'dark', gold: 'dark', titanium: 'dark' };
const FRAME_TO_LIGHT = { dark: 'silver', graphite: 'silver' };

// Flip the parts of a design around the screenshot to match: the active
// background's colors, the device frame finish, and the caption color (which
// goes the other way, so it stays readable on the new background). Mutates and
// returns `design`; anything missing is skipped.
export function sceneFlip(design, target, surface = 20) {
  if (!design || (target !== 'dark' && target !== 'light')) return design;
  const f = (c) => flipColorHex(c, target, surface);
  const mode = design.bgMode;
  if (mode === 'solid' && design.bgColor) design.bgColor = f(design.bgColor);
  if (mode === 'gradient' && design.gradient && Array.isArray(design.gradient.colors)) design.gradient.colors = design.gradient.colors.map(f);
  if (mode === 'mesh' && design.meshGradient && Array.isArray(design.meshGradient.points)) {
    design.meshGradient.points = design.meshGradient.points.map((p) => ({ ...p, color: f(p.color) }));
  }
  if (mode === 'pattern' && design.pattern) design.pattern = { ...design.pattern, fg: f(design.pattern.fg), bg: f(design.pattern.bg) };
  if (design.deviceFrame) {
    const map = target === 'dark' ? FRAME_TO_DARK : FRAME_TO_LIGHT;
    if (map[design.deviceFrame.color]) design.deviceFrame = { ...design.deviceFrame, color: map[design.deviceFrame.color] };
  }
  if (design.textOverlay && design.textOverlay.color) {
    design.textOverlay = { ...design.textOverlay, color: flipColorHex(design.textOverlay.color, target === 'dark' ? 'light' : 'dark', surface) };
  }
  return design;
}
