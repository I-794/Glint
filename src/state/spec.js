// v18 — Design Spec: a presentation-only description of how the screenshot is
// styled, plus a validated applier. This is the backbone of the AI arc — v18's
// recipes, v19's AI, and the v20 agent all emit specs and call applySpec().
//
// A Design Spec (all fields optional):
//   {
//     bg:     { mode:'gradient'|'mesh'|'solid'|'pattern',
//               gradient:{colors:[...], type, angle}, mesh:[...hex],
//               solid:'#hex', pattern:{type,fg,bg,size,angle} },
//     frame:  { type:<deviceFrame.type>|null, color:<finish> },
//     layout: { padding, scale, borderRadius },
//     shadow: <shadowPresets key>,
//     filter: <artFilterPresets key>,            // includes v17 temperature/tint
//     color:  { mode, paletteId, intensity, steps } | null   // v17 colorMap (v19+)
//   }
// Presentation only: never touches state.image, canvas size, annotations, text,
// or motion. Every field is validated; invalid values fall back to a safe
// default so a malformed spec can never corrupt state.

import { state } from './state.js';
import { shadowPresets, artFilterPresets } from './presets.js';

const BG_MODES = ['gradient', 'mesh', 'solid', 'pattern'];
const PATTERN_TYPES = ['dots', 'grid', 'lines', 'checker', 'diagonal'];
const FRAME_TYPES = [null, 'iphone', 'iphone16pro', 'ipadpro', 'macbookpro', 'watch', 'studiodisplay', 'pixel', 'winlaptop', 'chrome', 'safari', 'firefox', 'macos', 'windows'];
const FRAME_COLORS = ['dark', 'graphite', 'light', 'silver', 'titanium', 'gold'];
const COLOR_MODES = ['off', 'gradient', 'recolor', 'transfer'];

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
function oneOf(v, list, dflt) { return list.includes(v) ? v : dflt; }

export function applySpec(spec) {
  if (!spec || typeof spec !== 'object') return;

  // ---- Background ----
  if (spec.bg && typeof spec.bg === 'object') {
    const mode = oneOf(spec.bg.mode, BG_MODES, 'gradient');
    state.bgMode = mode;
    if (mode === 'gradient' && spec.bg.gradient) {
      const g = spec.bg.gradient;
      if (Array.isArray(g.colors) && g.colors.length >= 2) {
        state.gradient.colors = g.colors.slice(0, 4);
        state.gradient.positions = state.gradient.colors.map((_, i, a) => Math.round(i / (a.length - 1) * 100));
      }
      state.gradient.type = oneOf(g.type, ['linear', 'radial'], state.gradient.type);
      state.gradient.angle = clamp(g.angle, 0, 360, state.gradient.angle);
    } else if (mode === 'mesh' && Array.isArray(spec.bg.mesh) && spec.bg.mesh.length >= 1) {
      const positions = [{ x: 0.20, y: 0.25 }, { x: 0.80, y: 0.30 }, { x: 0.30, y: 0.80 }, { x: 0.85, y: 0.85 }];
      state.meshGradient.points = positions.map((p, i) => ({ x: p.x, y: p.y, color: spec.bg.mesh[i % spec.bg.mesh.length], radius: 0.55 }));
    } else if (mode === 'solid' && typeof spec.bg.solid === 'string') {
      state.bgColor = spec.bg.solid;
    } else if (mode === 'pattern' && spec.bg.pattern) {
      const p = spec.bg.pattern;
      state.pattern.type = oneOf(p.type, PATTERN_TYPES, state.pattern.type);
      if (typeof p.fg === 'string') state.pattern.fg = p.fg;
      if (typeof p.bg === 'string') state.pattern.bg = p.bg;
      state.pattern.size = clamp(p.size, 4, 200, state.pattern.size);
      state.pattern.angle = clamp(p.angle, 0, 360, state.pattern.angle);
    }
  }

  // ---- Frame ----
  if (spec.frame && typeof spec.frame === 'object') {
    state.deviceFrame.type = oneOf(spec.frame.type, FRAME_TYPES, null);
    state.deviceFrame.color = oneOf(spec.frame.color, FRAME_COLORS, state.deviceFrame.color);
  }

  // ---- Layout ----
  if (spec.layout && typeof spec.layout === 'object') {
    state.padding = clamp(spec.layout.padding, 0, 300, state.padding);
    state.scale = clamp(spec.layout.scale, 20, 200, state.scale);
    state.borderRadius = clamp(spec.layout.borderRadius, 0, 80, state.borderRadius);
  }

  // ---- Shadow preset ----
  if (typeof spec.shadow === 'string' && shadowPresets[spec.shadow]) {
    Object.assign(state.shadow, shadowPresets[spec.shadow]);
  }

  // ---- Filter preset (art filter, incl. v17 temperature/tint) ----
  if (typeof spec.filter === 'string' && artFilterPresets[spec.filter]) {
    state.imageFilters = { ...artFilterPresets[spec.filter] };
  }

  // ---- Color map (v17), optional — used by v19+ ----
  if (spec.color && typeof spec.color === 'object') {
    state.colorMap.mode = oneOf(spec.color.mode, COLOR_MODES, 'off');
    if (spec.color.paletteId && state.colorPalettes.library[spec.color.paletteId]) {
      state.colorPalettes.active = spec.color.paletteId;
    }
    state.colorMap.intensity = clamp(spec.color.intensity, 0, 100, state.colorMap.intensity);
    state.colorMap.steps = clamp(spec.color.steps, 0, 16, state.colorMap.steps);
  } else {
    state.colorMap.mode = 'off';
  }
}
