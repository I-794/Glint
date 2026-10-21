// v38 — Focus: curves + levels, DOM-free logic. state.colorTools holds a curve
// (control points, x/y 0..255, end points pinned at x=0 and x=255) and levels
// (black/white input points + gamma) for the master channel and for R, G and B.
// Everything bakes down to three 256-entry LUTs, so the per-pixel pass is one
// table lookup per channel (see render/curves.js). Looks (a saved grade)
// and their share codes live here too, so tests and the site-shot script can
// use them without a DOM.

export const CHANNELS = ['rgb', 'r', 'g', 'b'];
const MAX_POINTS = 16;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

const identityCurve = () => [[0, 0], [255, 255]];
const identityLevels = () => ({ black: 0, white: 255, gamma: 1 });

export function colorToolsDefaults() {
  const curves = {}, levels = {};
  for (const c of CHANNELS) { curves[c] = identityCurve(); levels[c] = identityLevels(); }
  return { curves, levels };
}

// Sort, clamp, de-duplicate x, pin the end points to x=0 / x=255 and cap the
// count. Bad input becomes the identity curve.
export function normalizeCurve(points) {
  if (!Array.isArray(points)) return identityCurve();
  const byX = new Map();
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Math.round(clamp(num(p[0], NaN), 0, 255));
    const y = Math.round(clamp(num(p[1], NaN), 0, 255));
    if (Number.isFinite(x) && Number.isFinite(y)) byX.set(x, y);
  }
  if (!byX.has(0)) byX.set(0, 0);
  if (!byX.has(255)) byX.set(255, 255);
  let pts = [...byX.entries()].sort((a, b) => a[0] - b[0]);
  if (pts.length > MAX_POINTS) pts = [...pts.slice(0, MAX_POINTS - 1), pts[pts.length - 1]];
  return pts.map(([x, y]) => [x, y]);
}

export function normalizeLevels(l) {
  if (!l || typeof l !== 'object') return identityLevels();
  const black = Math.round(clamp(num(l.black, 0), 0, 253));
  const white = Math.round(clamp(num(l.white, 255), black + 2, 255));
  const gamma = Math.round(clamp(num(l.gamma, 1), 0.1, 5) * 100) / 100;
  return { black, white, gamma };
}

export function normalizeColorTools(ct) {
  const src = ct && typeof ct === 'object' ? ct : {};
  const out = { curves: {}, levels: {} };
  for (const c of CHANNELS) {
    out.curves[c] = normalizeCurve(src.curves && src.curves[c]);
    out.levels[c] = normalizeLevels(src.levels && src.levels[c]);
  }
  return out;
}

// v38 schema 23: every applied design carries a valid colorTools block, so a
// page that predates v38 never inherits the previous page's curves.
export function ensureColorToolsDefaults(design) {
  if (design) design.colorTools = normalizeColorTools(design.colorTools);
  return design;
}

const curveIsIdentity = (pts) => pts.every(([x, y]) => x === y);
const levelsIsIdentity = (l) => l.black === 0 && l.white === 255 && l.gamma === 1;

export function isIdentity(ct) {
  const n = normalizeColorTools(ct);
  return CHANNELS.every(c => curveIsIdentity(n.curves[c]) && levelsIsIdentity(n.levels[c]));
}

export function colorToolsKey(ct) {
  return JSON.stringify(normalizeColorTools(ct));
}

// Monotone cubic (Fritsch-Carlson) through the points, so a curve never
// overshoots between two points and an S-curve stays an S.
export function curveLut(points) {
  const pts = normalizeCurve(points);
  const n = pts.length;
  const lut = new Uint8Array(256);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    const t = (x - xs[seg]) / h;
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg]
      + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1];
    lut[x] = Math.round(clamp(y, 0, 255));
  }
  return lut;
}

export function levelsLut(levels) {
  const { black, white, gamma } = normalizeLevels(levels);
  const lut = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    const v = clamp((x - black) / (white - black), 0, 1);
    lut[x] = Math.round(255 * Math.pow(v, 1 / gamma));
  }
  return lut;
}

// Per output channel: master levels -> channel levels -> channel curve ->
// master curve, composed into one table each for R, G and B.
export function channelLuts(ct) {
  const n = normalizeColorTools(ct);
  const mLev = levelsLut(n.levels.rgb), mCur = curveLut(n.curves.rgb);
  return ['r', 'g', 'b'].map(c => {
    const lev = levelsLut(n.levels[c]), cur = curveLut(n.curves[c]);
    const lut = new Uint8Array(256);
    for (let x = 0; x < 256; x++) lut[x] = mCur[cur[lev[mLev[x]]]];
    return lut;
  });
}

// In place over RGBA pixel data; alpha is left alone.
export function applyLuts(data, lr, lg, lb) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lr[data[i]];
    data[i + 1] = lg[data[i + 1]];
    data[i + 2] = lb[data[i + 2]];
  }
  return data;
}

// ---- Looks: a named grade (filter sliders + curves/levels) -----------------

export const FILTER_RANGES = {
  brightness: [0, 200, 100], contrast: [0, 200, 100], saturation: [0, 200, 100],
  blur: [0, 20, 0], grayscale: [0, 100, 0], sepia: [0, 100, 0],
  temperature: [-100, 100, 0], tint: [-100, 100, 0],
};

export function normalizeFilters(f) {
  const src = f && typeof f === 'object' ? f : {};
  const out = {};
  for (const [k, [lo, hi, d]] of Object.entries(FILTER_RANGES)) out[k] = Math.round(clamp(num(src[k], d), lo, hi));
  return out;
}

export function normalizeLook(look) {
  if (!look || typeof look !== 'object') return null;
  if (!look.colorTools && !look.imageFilters) return null;
  const name = String(look.name || 'Untitled look').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Untitled look';
  return { name, imageFilters: normalizeFilters(look.imageFilters), colorTools: normalizeColorTools(look.colorTools) };
}

const CODE_PREFIX = 'glint-look:';

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
}

// The file form: small, readable JSON.
export function lookToJson(look) {
  const n = normalizeLook(look);
  return JSON.stringify({ type: 'glint-look', v: 1, ...n });
}

// The paste form: one line, safe in chat and URLs.
export function encodeLook(look) {
  return CODE_PREFIX + toBase64Url(lookToJson(look));
}

// Accepts a share code or the JSON file text; returns a normalized look or null.
export function decodeLook(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  try {
    const json = t.startsWith(CODE_PREFIX) ? fromBase64Url(t.slice(CODE_PREFIX.length)) : t;
    const obj = JSON.parse(json);
    if (!obj || obj.type !== 'glint-look' || obj.v !== 1) return null;
    return normalizeLook(obj);
  } catch {
    return null;
  }
}

// Built-in starter looks (shown first in the Looks row, never deleted).
const look = (id, name, filters, curves, levels = {}) => ({
  id, name, builtIn: true,
  imageFilters: normalizeFilters(filters),
  colorTools: normalizeColorTools({ curves, levels }),
});

export const STARTER_LOOKS = [
  look('starter-matte', 'Matte', { saturation: 90 },
    { rgb: [[0, 28], [64, 70], [192, 196], [255, 240]] }),
  look('starter-cool-night', 'Cool Night', { saturation: 95 },
    { rgb: [[0, 0], [128, 118], [255, 250]], r: [[0, 0], [128, 120], [255, 245]], b: [[0, 20], [128, 142], [255, 255]] }),
  look('starter-warm-film', 'Warm Film', { saturation: 105 },
    { rgb: [[0, 16], [60, 58], [190, 200], [255, 248]], r: [[0, 8], [128, 138], [255, 255]], b: [[0, 0], [128, 116], [255, 232]] }),
  look('starter-hard-contrast', 'Hard Contrast', { saturation: 110 },
    { rgb: [[0, 0], [64, 46], [192, 214], [255, 255]] }, { rgb: { black: 8, white: 246, gamma: 1 } }),
];
