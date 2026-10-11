// v11.3 — Shared project serializer.
//
// Extracted from cloud-sync.js so the cloud sync, the community gallery
// (v11.3), and live collaboration (v11.4) all serialize a design the same way.
// These are the JSON-safe, design-defining fields — deliberately NOT including
// `image`/`logo`/`screenshotSet`/`batch` (large or non-portable). Keep this list
// the single source of truth for "what travels with a saved/shared design".

import { state } from './state.js';
import { upgradeSpotlight } from '../render/spotlight-geom.js';
import { bokehDefaults } from '../render/bokeh-core.js';
import { normalizeCompare } from '../render/compare-core.js';

export const SERIALIZED_FIELDS = [
  'imageTransform', 'imageFilters', 'imageLayer', 'textOverlay', 'watermark', 'gradient',
  'padding', 'scale', 'borderRadius', 'showBorder', 'borderWidth', 'borderColor',
  'shadow', 'reflection', 'canvas', 'bgMode', 'bgColor', 'deviceFrame', 'annotations',
  'redactions', 'spotlight', 'meshGradient', 'tilt3d', 'scene', 'autoLayout',
  // v15.2 — animation tracks (entrance + easing) and Ken Burns are design-
  // defining and lightweight, so shared/gallery designs animate too.
  'animation', 'kenBurns',
  // v16.1 — Studio Effects overlays (liquid glass + film grain).
  'glass', 'grain',
  // v16.2 — pattern background (active only when bgMode === 'pattern').
  'pattern',
  // v17 - Color Map palette selection and map settings.
  'colorPalettes', 'colorMap',
  // v21 — 3D / isometric device mockup (orbit/zoom/scene/material/spin).
  'mockup3d',
  // v27 — Surface Studio (physical & print mockup) settings.
  'surface',
  // v29 — Motion Studio unified timeline (lane/clip layout). Lightweight + design-
  // defining, so shared/gallery designs carry their timeline arrangement too.
  'timeline'
];

// v21 — strip the runtime-only orbitProgress so a saved/shared/restored design
// never arrives mid-spin (mirrors sanitizeAnimationRuntime).
export function sanitizeMockup3dRuntime(design) {
  if (design && design.mockup3d) {
    design.mockup3d = { ...design.mockup3d, orbitProgress: 0 };
  }
  return design;
}

// v15.2 — strip the animation playback runtime so a saved, shared, or restored
// design never arrives mid-frame (mid-playback or at a non-zero currentTime).
// Mutates the passed design's animation in place and returns it.
export function sanitizeAnimationRuntime(design) {
  if (design && design.animation) {
    design.animation = { ...design.animation, playing: false, currentTime: 0 };
  }
  return design;
}

// v29 — strip the Motion Studio playback runtime (currentTime / playing /
// _driving) so a saved/shared/restored design never arrives mid-playback. The
// lane/clip layout is kept. Mirrors sanitizeAnimationRuntime.
export function sanitizeTimelineRuntime(design) {
  if (design && design.timeline) {
    design.timeline = { ...design.timeline, currentTime: 0, playing: false, _driving: false };
  }
  return design;
}

function sanitizeMotionRuntime(design) {
  return sanitizeTimelineRuntime(sanitizeMockup3dRuntime(sanitizeAnimationRuntime(design)));
}

export function snapshotProject() {
  const out = {};
  for (const k of SERIALIZED_FIELDS) out[k] = state[k];
  return sanitizeMotionRuntime(JSON.parse(JSON.stringify(out)));
}

// ── v12 — Projects & Version History ──────────────────────────────────────
// A *full* project is self-contained: every design field that defines the look
// PLUS the source image (as a dataURL) so reloading a saved project actually
// restores the artwork — unlike snapshotProject(), which stays deliberately
// lean for realtime collab/gallery payloads. Bump SCHEMA_VERSION whenever the
// field set changes so normalizeProject() can migrate older saves.
export const SCHEMA_VERSION = 21;

// SERIALIZED_FIELDS + the rest of the design-defining state. Kept separate from
// SERIALIZED_FIELDS so collab/gallery stay small; projects want full fidelity.
export const PROJECT_FIELDS = [
  ...SERIALIZED_FIELDS,
  'windowOverlay', 'annotationColor', 'annotationStrokeWidth', 'nextNumber',
  'redactType', 'redactIntensity', 'logo', 'exportSettings', 'exportMotion',
  // v16.0 — shape-tool defaults (per-shape fill/sides/points already ride along
  // inside each `annotations` record, which is serialized above).
  'annotationFill', 'polygonSides', 'starPoints',
  // v24 — Code Snippet Studio settings. The baked image travels in the envelope
  // too (getImageDataURL); on load, applyPayload re-rasterizes for crispness.
  'codeSnippet',
  // v25 — Interactive Tour. Per-step hotspots/callouts ride the page payload, so
  // a tour's steps persist with the project (each page is a tour step).
  'tour',
  // v30 — Brand Brain system (carries logo dataUrl; full-fidelity project field
  // only, deliberately not in the lean SERIALIZED_FIELDS, mirroring `logo`).
  'brand',
  // v34 — Subject Bokeh (carries a mask dataURL, so project-only like `brand`).
  'bokeh',
  // v35 — Before / After Compare (carries the Before dataURL, so project-only).
  'compare'
];

// v25 — guarantee every applied design carries a `tour` block. Because
// applyDesignToState() does Object.assign(state, design), a page payload that
// predates Tours (or simply has none) must explicitly reset state.tour, or the
// previous step's hotspots would bleed onto it. Mutates + returns the design.
export function ensureTourDefaults(design) {
  if (design && !design.tour) {
    design.tour = { hotspots: [], autoAdvanceMs: 0 };
  }
  return design;
}

// v32 — cap an <img> to maxEdge on the long edge and encode to a dataURL. Returns
// null if the canvas is tainted (cross-origin source) or the image is empty.
export function imageToDataUrl(img, maxEdge, mime = 'image/jpeg', quality = 0.9) {
  if (!img || !img.width || !img.height) return null;
  try {
    let w = img.width, h = img.height;
    const longEdge = Math.max(w, h);
    if (longEdge > maxEdge) { const s = maxEdge / longEdge; w = Math.round(w * s); h = Math.round(h * s); }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL(mime, quality);
  } catch (e) { return null; }
}

// Re-encode the loaded screenshot to a bounded dataURL so it travels with the
// project. Capped at 2000px on the long edge + JPEG to keep localStorage/jsonb
// payloads sane. Returns null if there's no image or the canvas is tainted
// (cross-origin source) — the project still saves, just without baked artwork.
export function getImageDataURL() {
  return imageToDataUrl(state.image, 2000, 'image/jpeg', 0.9);
}

export function serializeFull() {
  const design = {};
  for (const k of PROJECT_FIELDS) design[k] = state[k];
  return {
    schemaVersion: SCHEMA_VERSION,
    design: sanitizeMotionRuntime(JSON.parse(JSON.stringify(design))),
    image: getImageDataURL(),
    svgCode: state.svgCode || null
  };
}

// v29 — schema 18 migration: build default Motion Studio lanes from a pre-v29
// design's existing motion (entrance tracks, Ken Burns, turntable spin) so old
// projects open with a populated, playable timeline. The video lane is created
// on clip load (video isn't serialized), so it's intentionally absent here.
export function migrateTimelineV18(design) {
  if (!design || (design.timeline && Array.isArray(design.timeline.lanes))) return design;
  const a = design.animation || {};
  const baseDur = a.duration || 3000;
  const lanes = [];
  if (a.enabled && Array.isArray(a.tracks)) {
    for (const tr of a.tracks) {
      const target = tr.target || 'image';
      lanes.push({ id: 'ent:' + target, kind: 'entrance', target,
        clips: [{ start: tr.startTime || 0, duration: baseDur, easing: tr.easing, ref: { preset: tr.preset } }] });
    }
  }
  if (design.kenBurns && design.kenBurns.enabled) {
    lanes.push({ id: 'kenburns', kind: 'kenburns', target: null,
      clips: [{ start: 0, duration: baseDur, easing: design.kenBurns.easing, ref: {} }] });
  }
  if (design.mockup3d && design.mockup3d.spin && design.mockup3d.spin.enabled) {
    lanes.push({ id: 'turntable', kind: 'turntable', target: null,
      clips: [{ start: 0, duration: 3000, ref: { turns: design.mockup3d.spin.turns || 1 } }] });
  }
  design.timeline = {
    enabled: lanes.length > 0, currentTime: 0, duration: baseDur,
    playing: false, _driving: false, fps: 30, loop: true, lanes
  };
  return design;
}

// v30 — schema 19 migration: guarantee every applied design carries a default
// `brand` block so pre-v30 projects open without an undefined brand (and so
// Object.assign-based applyPayload never leaks a previous page's brand). Mutates
// + returns the design. Mirrors ensureTourDefaults.
export function ensureBrandDefaults(design) {
  if (design && !design.brand) {
    design.brand = {
      enabled: false, name: '', sourceUrl: '', palette: [],
      background: { mode: 'gradient', gradient: { colors: [], type: 'linear', angle: 135 } },
      frame: { type: null, color: 'dark' },
      typography: { headlineFont: 'Arial', captionFont: 'Arial' },
      colorMap: { mode: 'off', intensity: 100, steps: 6 },
      filter: 'none',
      logo: { dataUrl: null, position: 'bottom-right', scale: 0.12, opacity: 90 },
      watermark: { text: '', color: '#ffffff', position: 'bottom-right', size: 16, opacity: 50 },
      enforce: false
    };
  }
  return design;
}

// v34 — guarantee every applied design carries a `bokeh` block, so a page that
// predates v34 never inherits the previous page's mask via Object.assign.
export function ensureBokehDefaults(design) {
  if (design && !design.bokeh) design.bokeh = bokehDefaults();
  return design;
}

// v35 — schema 21 migration: every applied design carries a valid `compare`
// block, so a page that predates v35 never inherits the previous page's Before
// image via Object.assign. Mutates + returns the design.
export function ensureCompareDefaults(design) {
  if (design) design.compare = normalizeCompare(design.compare);
  return design;
}

// v34 — schema 20 migration: v1's single spotlight rect becomes regions[0] of
// Spotlight 2.0 (blur/feather/tint default to the v1 look). Mutates + returns.
export function migrateSpotlightV20(design) {
  if (design && 'spotlight' in design) design.spotlight = upgradeSpotlight(design.spotlight);
  return design;
}

// Accept both the v12 envelope ({schemaVersion, design, image, svgCode}) and
// the legacy flat payload written by the old cloud-sync saveProject() (raw
// design fields, no image), returning a normalized v12 envelope either way.
export function normalizeProject(payload) {
  if (!payload || typeof payload !== 'object') {
    return { schemaVersion: SCHEMA_VERSION, design: {}, image: null, svgCode: null };
  }
  const migrate = (d) => ensureCompareDefaults(ensureBokehDefaults(migrateSpotlightV20(ensureBrandDefaults(migrateTimelineV18(ensureTourDefaults(sanitizeMotionRuntime(d)))))));
  if (payload.design) {
    return {
      schemaVersion: payload.schemaVersion || SCHEMA_VERSION,
      design: migrate(payload.design),
      image: payload.image || null,
      svgCode: payload.svgCode || null
    };
  }
  // Legacy flat design payload (pre-v12): the whole object is the design.
  return { schemaVersion: 11, design: migrate(payload), image: null, svgCode: payload.svgCode || null };
}
