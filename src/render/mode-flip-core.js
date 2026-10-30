// v39 — Glossifier: light to dark mode, DOM-free logic. state.modeFlip turns a
// light-mode screenshot dark (or the reverse) by flipping lightness in OKLab
// while keeping hue, so a blue stays blue. The per-pixel pass is a trilinear
// lookup into a 33x33x33 table built once per setting (render/mode-flip.js),
// with two guards: saturated colors (brand buttons, status colors) keep their
// lightness, and photo areas (busy 16x16 tiles) keep their original pixels.
// Match the scene (sceneFlip) and the tests use the same math without a DOM.

export const TARGETS = ['auto', 'dark', 'light'];
const INK = 0.93;            // OKLab L that black text becomes in dark mode
const RAISE_FROM = 0.93;     // OKLab L where the dark flip starts to fold (#e5e5e5 is just below)
const RAISE_PAGE = 0.97;     // OKLab L of a light-gray page (#f5f5f5): lands on the surface
const RAISE = 0.05;          // how far above the surface a white card sits
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
export function flipLightness(L, target, surface = 20, raise = true) {
  const s = clamp(surface, 12, 36) / 100;
  L = clamp(L, 0, 1);
  if (target !== 'dark') return clamp((INK - L) / (INK - s), 0, 1);
  // v41.0.1 — raised cards: a straight flip made a white card darker than the
  // light-gray page around it, the opposite of a dark interface. The top of
  // the range folds: light grays (a page) still reach the surface, and the
  // last stretch up to white climbs RAISE above it, so cards sit on the page.
  if (!raise || L <= RAISE_FROM) return INK - (INK - s) * L;
  if (L <= RAISE_PAGE) return INK - (INK - s) * RAISE_FROM + (s - (INK - (INK - s) * RAISE_FROM)) * (L - RAISE_FROM) / (RAISE_PAGE - RAISE_FROM);
  return s + RAISE * (L - RAISE_PAGE) / (1 - RAISE_PAGE);
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

// Photo mask, one byte per pixel (255 = keep the original). Each 16x16 tile is
// a candidate when it is busy (many distinct colors) or noisy (smooth, but
// almost no pixel exactly equals its neighbor: photos carry noise, interface
// surfaces repeat one exact color). Candidates group into regions, and only a
// region that looks like a photo counts: at least 3x3 tiles and a fair share of
// busy tiles. That drops lines of small text and CSS gradients, which would
// otherwise come out as a checkerboard of kept and flipped tiles. A region that
// mostly fills its bounding box is filled out to that rectangle (photos are
// rectangles, and flat patches like a blown-out sky stay with their photo).
// Inside a photo every pixel is kept; on its edge tiles only the non-flat
// pixels are, so the flat interface around a photo still flips.
export function photoMask(data, w, h) {
  const tw = Math.ceil(w / TILE), th = Math.ceil(h / TILE);
  const cand = new Uint8Array(tw * th);   // 0 no, 1 noisy, 2 busy
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
      if (distinct >= Math.max(12, area * 0.19)) cand[ty * tw + tx] = 2;
      else if (pairs >= 8 && equal / pairs < 0.3) cand[ty * tw + tx] = 1;
    }
  }

  // Group candidate tiles (4-connected) and keep the photo-like regions.
  const photo = new Uint8Array(tw * th);
  const done = new Uint8Array(tw * th);
  const queue = new Int32Array(tw * th);
  for (let start = 0; start < tw * th; start++) {
    if (!cand[start] || done[start]) continue;
    let head = 0, tail = 0, busy = 0;
    let minX = tw, minY = th, maxX = -1, maxY = -1;
    queue[tail++] = start; done[start] = 1;
    while (head < tail) {
      const t = queue[head++];
      const tx = t % tw, ty = (t - tx) / tw;
      if (cand[t] === 2) busy++;
      if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
      const next = [tx > 0 ? t - 1 : -1, tx < tw - 1 ? t + 1 : -1, ty > 0 ? t - tw : -1, ty < th - 1 ? t + tw : -1];
      for (const n of next) if (n >= 0 && cand[n] && !done[n]) { done[n] = 1; queue[tail++] = n; }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (tail < 9 || bw < 3 || bh < 3 || busy / tail < 0.3) continue;
    if (tail / (bw * bh) >= 0.6) {
      for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) photo[ty * tw + tx] = 1;
    } else {
      for (let k = 0; k < tail; k++) photo[queue[k]] = 1;
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

// Surface mask for one target: large flat panels that already are the target
// mode (a dark sidebar, header or code block when flipping to dark) keep their
// pixels, text included, the way a real dark theme leaves them. A tile counts
// when 70% of it is one exact color on the target side; tiles group into
// regions, and only regions at least 3 tiles in both directions and 12 tiles
// in all count (a black button flips, a sidebar stays). Panels fill out to
// their rectangle or fill their small holes, so the text on them stays too.
// Returns null when there is no such panel.
export function surfaceMask(data, w, h, target) {
  if (target !== 'dark' && target !== 'light') return null;
  const tw = Math.ceil(w / TILE), th = Math.ceil(h / TILE);
  const color = new Int32Array(tw * th).fill(-1);
  const counts = new Map();
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      counts.clear();
      let best = -1, bestN = 0, area = 0;
      const y1 = Math.min(h, (ty + 1) * TILE), x1 = Math.min(w, (tx + 1) * TILE);
      for (let y = ty * TILE; y < y1; y++) {
        for (let x = tx * TILE; x < x1; x++) {
          const i = (y * w + x) * 4;
          const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          const n = (counts.get(key) || 0) + 1;
          counts.set(key, n);
          if (n > bestN) { bestN = n; best = key; }
          area++;
        }
      }
      if (bestN < area * 0.7) continue;
      const L = srgbToOklab(best >> 16, (best >> 8) & 255, best & 255)[0];
      if (target === 'dark' ? L < 0.42 : L > 0.72) color[ty * tw + tx] = best;
    }
  }
  const region = new Uint8Array(tw * th);
  const regionColor = new Int32Array(tw * th).fill(-1);   // the panel's color, per panel tile
  const done = new Uint8Array(tw * th);
  const queue = new Int32Array(tw * th);
  let any = false;
  for (let start = 0; start < tw * th; start++) {
    if (color[start] < 0 || done[start]) continue;
    let head = 0, tail = 0;
    let minX = tw, minY = th, maxX = -1, maxY = -1;
    queue[tail++] = start; done[start] = 1;
    while (head < tail) {
      const t = queue[head++];
      const tx = t % tw, ty = (t - tx) / tw;
      if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
      const next = [tx > 0 ? t - 1 : -1, tx < tw - 1 ? t + 1 : -1, ty > 0 ? t - tw : -1, ty < th - 1 ? t + tw : -1];
      for (const n of next) if (n >= 0 && color[n] >= 0 && !done[n] && Math.abs((color[n] >> 16) - (color[t] >> 16)) + Math.abs(((color[n] >> 8) & 255) - ((color[t] >> 8) & 255)) + Math.abs((color[n] & 255) - (color[t] & 255)) <= 12) { done[n] = 1; queue[tail++] = n; }
    }
    if (tail < 12 || maxX - minX < 2 || maxY - minY < 2) continue;
    // A panel that mostly fills its rectangle is the rectangle (its text,
    // icons and selected items are holes in the flat color, not outside it).
    const seed = color[start];
    if (tail / ((maxX - minX + 1) * (maxY - minY + 1)) >= 0.6) {
      for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) { region[ty * tw + tx] = 1; regionColor[ty * tw + tx] = seed; }
    } else {
      for (let k = 0; k < tail; k++) { region[queue[k]] = 1; regionColor[queue[k]] = seed; }
    }
    any = true;
  }
  if (!any) return null;
  // Small holes in other shapes (text inside an L-shaped header and sidebar)
  // join their panel: flood the non-panel tiles from the border; enclosed
  // groups of up to 64 tiles are holes. A big enclosed area stays out.
  {
    const outside = new Uint8Array(tw * th);
    let head = 0, tail = 0;
    const push = (t) => { if (!region[t] && !outside[t]) { outside[t] = 1; queue[tail++] = t; } };
    for (let tx = 0; tx < tw; tx++) { push(tx); push((th - 1) * tw + tx); }
    for (let ty = 0; ty < th; ty++) { push(ty * tw); push(ty * tw + tw - 1); }
    while (head < tail) {
      const t = queue[head++], tx = t % tw, ty = (t - tx) / tw;
      if (tx > 0) push(t - 1); if (tx < tw - 1) push(t + 1); if (ty > 0) push(t - tw); if (ty < th - 1) push(t + tw);
    }
    const seenHole = new Uint8Array(tw * th);
    for (let start = 0; start < tw * th; start++) {
      if (region[start] || outside[start] || seenHole[start]) continue;
      head = 0; tail = 0; queue[tail++] = start; seenHole[start] = 1;
      while (head < tail) {
        const t = queue[head++], tx = t % tw, ty = (t - tx) / tw;
        const next = [tx > 0 ? t - 1 : -1, tx < tw - 1 ? t + 1 : -1, ty > 0 ? t - tw : -1, ty < th - 1 ? t + tw : -1];
        for (const n of next) if (n >= 0 && !region[n] && !outside[n] && !seenHole[n]) { seenHole[n] = 1; queue[tail++] = n; }
      }
      if (tail <= 64) for (let k = 0; k < tail; k++) region[queue[k]] = 2;
    }
  }
  const mask = new Uint8Array(w * h);
  // On a panel's edge tiles (which the panel only partly covers) keep the
  // pixels on the target side (the panel) and flip the rest (the page).
  const inRegion = (tx, ty) => tx >= 0 && ty >= 0 && tx < tw && ty < th && region[ty * tw + tx] > 0;
  const sideLut = new Uint8Array(4096);   // 4 bits per channel -> on the target side?
  for (let k = 0; k < 4096; k++) {
    const L = srgbToOklab(((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17)[0];
    sideLut[k] = (target === 'dark' ? L < 0.5 : L >= 0.6) ? 1 : 0;
  }
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      if (!region[ty * tw + tx]) continue;
      const edge = !(inRegion(tx - 1, ty) && inRegion(tx + 1, ty) && inRegion(tx, ty - 1) && inRegion(tx, ty + 1));
      const y1 = Math.min(h, (ty + 1) * TILE), x1 = Math.min(w, (tx + 1) * TILE);
      for (let y = ty * TILE; y < y1; y++) {
        for (let x = tx * TILE; x < x1; x++) {
          const p = y * w + x, i = p * 4;
          if (!edge || sideLut[((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)]) mask[p] = 255;
        }
      }
    }
  }
  // A panel edge often ends mid-tile, in a tile too mixed to count. In tiles
  // touching a panel, keep the pixels that match the panel's own color (dark
  // page text is not that close to it, so it still flips).
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const t = ty * tw + tx;
      if (region[t]) continue;
      let c = -1;
      if (tx > 0 && regionColor[t - 1] >= 0) c = regionColor[t - 1];
      else if (tx < tw - 1 && regionColor[t + 1] >= 0) c = regionColor[t + 1];
      else if (ty > 0 && regionColor[t - tw] >= 0) c = regionColor[t - tw];
      else if (ty < th - 1 && regionColor[t + tw] >= 0) c = regionColor[t + tw];
      if (c < 0) continue;
      const cr = c >> 16, cg = (c >> 8) & 255, cb = c & 255;
      const y1 = Math.min(h, (ty + 1) * TILE), x1 = Math.min(w, (tx + 1) * TILE);
      for (let y = ty * TILE; y < y1; y++) {
        for (let x = tx * TILE; x < x1; x++) {
          const p = y * w + x, i = p * 4;
          if (Math.abs(data[i] - cr) + Math.abs(data[i + 1] - cg) + Math.abs(data[i + 2] - cb) <= 9) mask[p] = 255;
        }
      }
    }
  }
  return mask;
}

// Per-pixel maximum of two masks (either may be null).
export function mergeMasks(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] > b[i] ? a[i] : b[i];
  return out;
}

// ---- the lookup table -------------------------------------------------------

// 33^3 RGB table for one (target, surface, protect). Saturated colors keep their
// own lightness, so brand colors survive the flip. `protect` sets how saturated
// a color must be to count: higher protects more colors, 0 protects none.
// (It moves the threshold rather than blending, so a protected color is fully
// kept, matching photos, and a guarded region never comes out half flipped.)
export function chromaKeep(C, protect) {
  const p = clamp(protect, 0, 100) / 100;
  if (p <= 0) return 0;
  const lo = 0.22 - 0.16 * p;
  return smoothstep(lo, lo + 0.06, C);
}

export function buildLut3d(target, surface = 20, protect = 60) {
  const lut = new Uint8Array(LUT_N * LUT_N * LUT_N * 3);
  let o = 0;
  for (let ri = 0; ri < LUT_N; ri++) {
    for (let gi = 0; gi < LUT_N; gi++) {
      for (let bi = 0; bi < LUT_N; bi++) {
        const [L, a, b] = srgbToOklab(ri * 255 / (LUT_N - 1), gi * 255 / (LUT_N - 1), bi * 255 / (LUT_N - 1));
        const C = Math.hypot(a, b);
        const t = chromaKeep(C, protect);
        const L2 = flipLightness(L, target, surface) * (1 - t) + L * t;
        const rgb = oklabToSrgb(L2, a, b);
        lut[o++] = rgb[0]; lut[o++] = rgb[1]; lut[o++] = rgb[2];
      }
    }
  }
  return lut;
}

// Flip `data` (RGBA, in place). `mask` (photoMask) keeps photo pixels: fully
// from protect 30 up, fading out to none at 0. Alpha is untouched.
export function applyFlip(data, lut, mask = null, protect = 60) {
  const S = (LUT_N - 1) / 255;
  const N2 = LUT_N * LUT_N;
  const keep = smoothstep(0, 30, clamp(protect, 0, 100));
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
  // Mid tones sit near the flip's fixed point; never lighten on the way to
  // dark (or darken on the way to light).
  // The scene around the screenshot is the page, not a card: no raise.
  const f = flipLightness(L, target, surface, false);
  return toHex(oklabToSrgb(target === 'dark' ? Math.min(L, f) : Math.max(L, f), a, b));
}

// ---- scene record ---------------------------------------------------------------
// v41.0.1 — one runtime record of the last Match the scene, shared by the
// Light / Dark panel and the Design Agent (they used to keep one each, so the
// panel's Turn off could not put back a scene the agent had matched). Turning
// the flip off restores the scene exactly, unless it was edited since.
export const SCENE_KEYS = ['bgColor', 'gradient', 'meshGradient', 'pattern', 'deviceFrame', 'textOverlay'];
let sceneRecord = null;
const sceneOf = (design) => JSON.stringify(SCENE_KEYS.map((k) => design[k]));

// sceneFlip + remember the scene before and after.
export function matchScene(design, target, surface = 20) {
  const before = JSON.parse(JSON.stringify(SCENE_KEYS.map((k) => design[k] === undefined ? null : design[k])));
  sceneFlip(design, target, surface);
  sceneRecord = { before, after: sceneOf(design) };
  return design;
}

export function forgetScene() { sceneRecord = null; }

// Put the matched scene back if it is still as the match left it. Returns
// whether it was restored; the record is dropped either way.
export function restoreScene(design) {
  const ok = !!(sceneRecord && sceneRecord.after === sceneOf(design));
  if (ok) SCENE_KEYS.forEach((k, i) => { design[k] = sceneRecord.before[i]; });
  sceneRecord = null;
  return ok;
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
