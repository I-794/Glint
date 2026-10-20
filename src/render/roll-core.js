// v37 — Exposure: DOM-free Roll logic (per-shot overrides, smart fit, file
// names, defaults). Imported by features/roll.js and the Node regression tests,
// so nothing here may touch window/document.

import { getByPath, setByPath, sanitize } from '../state/paths.js';

// The fields one shot may change on top of the roll's shared design. Every
// other edit always applies to the whole roll.
export const ROLL_OVERRIDE_FIELDS = [
  'imageTransform',
  'textOverlay.enabled',
  'textOverlay.content',
  'annotations',
  'redactions',
  'compare.enabled',
  'compare.beforeSrc',
  'deviceFrame.type',
];

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Snapshot the override fields of a state-like object.
export function captureOverrideFields(src) {
  const out = {};
  for (const path of ROLL_OVERRIDE_FIELDS) out[path] = clone(getByPath(src, path));
  return out;
}

// { path: value } for every override field where `current` differs from `base`
// (both are captureOverrideFields() maps).
export function diffOverrides(base, current) {
  const out = {};
  for (const path of ROLL_OVERRIDE_FIELDS) {
    if (!same(base[path], current[path])) out[path] = clone(current[path]);
  }
  return out;
}

// Write a { path: value } map into `target`. Unknown paths are ignored.
export function applyOverrides(target, overrides) {
  if (!overrides) return target;
  for (const path of ROLL_OVERRIDE_FIELDS) {
    if (path in overrides) setByPath(target, path, clone(overrides[path]));
  }
  return target;
}

// Shape of a screenshot by height / width.
export function classifyAspect(w, h) {
  if (!(w > 0) || !(h > 0)) return 'wide';
  const r = h / w;
  if (r >= 1.4) return 'phone';
  if (r >= 1.05) return 'tablet';
  return 'wide';
}

// The 2D frame smart fit picks for a shot, or undefined to leave the design's
// frame alone (smart fit off, a 3D/Surface mockup owns the frame, or the shot
// sets its own frame).
export function smartFrameFor(shot, smartFit, { mockup3d = false, surface = false } = {}) {
  if (!smartFit || !smartFit.enabled || mockup3d || surface) return undefined;
  if (shot.overrides && 'deviceFrame.type' in shot.overrides) return undefined;
  const kind = classifyAspect(shot.w, shot.h);
  const type = smartFit[kind];
  // 'keep' leaves the design's own frame on that kind of shot.
  return type === undefined || type === 'keep' ? undefined : type;
}

export function sizeLabel(size) {
  if (!size || !size.width || !size.height) return 'canvas';
  return size.label || `${size.width}x${size.height}`;
}

// Fill a naming pattern. {n} is the 1-based shot number padded to `pad`,
// {name} the shot's file name without its extension, {size} the size label.
export function fileName(pattern, { n, name, size, pad = 2, ext = 'png' }) {
  const stem = String(pattern || '{n}-{name}-{size}')
    .replace(/\{n\}/g, String(n).padStart(pad, '0'))
    .replace(/\{name\}/g, sanitize(String(name || 'shot').replace(/\.[^.]+$/, ''), 'shot'))
    .replace(/\{size\}/g, sanitize(sizeLabel(size), 'canvas'));
  return `${sanitize(stem, 'shot')}.${ext}`;
}

// Shot image data (capped dataURLs) keyed by shot id. Kept out of state.roll so
// undo snapshots (deep clones) never copy every screenshot; serializeRoll()
// puts it back for saving and normalizeRoll() takes it out again on load.
export const rollSources = {};

// While a single shot is open on the canvas, features/roll.js sets `view` to a
// function returning { fields, imageSrc }: the roll's own values for the
// override fields and its own image. serializeFull() uses it so a save made
// mid-edit stores the roll's design, not the open shot's. onDesignApplied is
// called by document.js before a page or project replaces the live state.
export const rollRuntime = { view: null, onDesignApplied: null };

export function serializeRoll(roll) {
  const r = normalizeRoll(roll);
  r.shots = r.shots.map((s) => ({ ...s, src: rollSources[s.id] }));
  return JSON.parse(JSON.stringify(r));
}

export const ROLL_FRAME_TYPES = ['keep', null, 'iphone', 'iphone16pro', 'pixel', 'ipadpro', 'macbookpro', 'winlaptop',
  'studiodisplay', 'chrome', 'safari', 'firefox', 'macos', 'windows'];

export function rollDefaults() {
  return {
    shots: [],
    sizes: [{ label: 'canvas' }],
    presetId: 'png-1x',
    naming: '{n}-{name}-{size}',
    smartFit: { enabled: true, phone: 'iphone16pro', tablet: 'ipadpro', wide: 'chrome' },
    pdf: false,
    activeShot: null,
  };
}

// Repair a saved or partial roll block. A shot's image data (`src`) moves into
// rollSources; shots without an id or image data are dropped. activeShot is
// runtime-only and always comes back null.
export function normalizeRoll(roll) {
  const d = rollDefaults();
  if (!roll || typeof roll !== 'object') return d;
  const shots = Array.isArray(roll.shots) ? roll.shots : [];
  d.shots = shots
    .filter((s) => {
      if (!s || typeof s.id !== 'string') return false;
      if (typeof s.src === 'string' && s.src.startsWith('data:')) rollSources[s.id] = s.src;
      return typeof rollSources[s.id] === 'string';
    })
    .map((s) => ({
      id: s.id,
      name: typeof s.name === 'string' ? s.name : 'shot',
      w: Number(s.w) > 0 ? Number(s.w) : 0,
      h: Number(s.h) > 0 ? Number(s.h) : 0,
      overrides: s.overrides && typeof s.overrides === 'object' ? s.overrides : {},
    }));
  if (Array.isArray(roll.sizes)) {
    const sizes = roll.sizes
      .filter((s) => s && typeof s === 'object')
      .map((s) => (Number(s.width) > 0 && Number(s.height) > 0
        ? { label: String(s.label || `${s.width}x${s.height}`), width: Math.round(s.width), height: Math.round(s.height) }
        : { label: 'canvas' }));
    if (sizes.length) d.sizes = sizes;
  }
  if (typeof roll.presetId === 'string' && roll.presetId) d.presetId = roll.presetId;
  if (typeof roll.naming === 'string' && roll.naming.trim()) d.naming = roll.naming;
  if (roll.smartFit && typeof roll.smartFit === 'object') {
    d.smartFit.enabled = roll.smartFit.enabled !== false;
    for (const k of ['phone', 'tablet', 'wide']) {
      if (ROLL_FRAME_TYPES.includes(roll.smartFit[k])) d.smartFit[k] = roll.smartFit[k];
    }
  }
  d.pdf = roll.pdf === true;
  return d;
}

// Parse "1080x1920, 1242x2688" (or "canvas") into a sizes list.
export function parseSizes(text) {
  const out = [];
  for (const part of String(text || '').split(/[,\s]+/)) {
    const p = part.trim().toLowerCase();
    if (!p) continue;
    if (p === 'canvas') { out.push({ label: 'canvas' }); continue; }
    const m = p.match(/^(\d{2,5})x(\d{2,5})$/);
    if (m) out.push({ label: `${m[1]}x${m[2]}`, width: Number(m[1]), height: Number(m[2]) });
  }
  return out.length ? out : [{ label: 'canvas' }];
}
