// v14 — Smart alignment guides + snapping.
//
// Pure geometry helper used by the canvas drag handler. Given the proposed
// bounding box of the element being dragged, nudge it so one of its edges or its
// center aligns to the canvas (center + edges) or to the edges/centers of the
// OTHER elements, when within a small pixel threshold. The matched alignment
// lines are recorded as transient module-scoped "guides" that render.js paints
// in the preview only — they must never appear in an export.
//
// All math is in canvas pixels: zoom/pan are CSS-only, so canvas space is stable
// and a fixed pixel threshold behaves the same at every zoom level.

import { state, imageRegistry } from '../state/state.js';
import { annotationBBox } from '../render/annotations.js';

const THRESHOLD = 6;            // canvas px — how close before an edge snaps
let _guides = [];               // [{ orientation: 'v' | 'h', pos }]
let _measureCtx = null;

export function getGuides() { return _guides; }
export function clearGuides() { _guides = []; }

function measureCtx() {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  return _measureCtx;
}

function textFont(t) {
  let f = '';
  if (t.italic) f += 'italic ';
  if (t.bold) f += 'bold ';
  return `${f}${t.size}px ${t.font}`;
}

// Bounding box of the text overlay in canvas px (it draws from a centered
// anchor), or null when there's nothing to show.
function textBox(canvas) {
  const t = state.textOverlay;
  if (!t.enabled || !t.content) return null;
  const ctx = measureCtx();
  ctx.font = textFont(t);
  const w = ctx.measureText(t.content).width;
  const h = t.size;
  return { x: canvas.width * t.x - w / 2, y: canvas.height * t.y - h / 2, w, h };
}

// Bounding box of an extra image in canvas px (xFrac/yFrac is its center).
function extraImageBox(ei, canvas) {
  const img = imageRegistry[ei.id];
  if (!img) return null;
  const w = img.width * ei.scaleFrac;
  const h = img.height * ei.scaleFrac;
  return { x: canvas.width * ei.xFrac - w / 2, y: canvas.height * ei.yFrac - h / 2, w, h };
}

// Every element's box EXCEPT the one being dragged, so it can snap to its peers.
function otherBoxes(kind, excludeId, canvas) {
  const boxes = [];
  (state.annotations || []).forEach((ann, idx) => {
    if (kind === 'annotation' && idx === excludeId) return;
    if (ann.visible === false) return;
    boxes.push(annotationBBox(ann));
  });
  (state.redactions || []).forEach((r, idx) => {
    if (kind === 'redaction' && idx === excludeId) return;
    boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h });
  });
  (state.extraImages || []).forEach(ei => {
    if (kind === 'extraImage' && ei.id === excludeId) return;
    if (ei.visible === false) return;
    const b = extraImageBox(ei, canvas);
    if (b) boxes.push(b);
  });
  if (kind !== 'text') {
    const tb = textBox(canvas);
    if (tb) boxes.push(tb);
  }
  return boxes;
}

// Find the smallest in-threshold shift that lands one of `edges` on a `target`.
function snapAxis(edges, targets) {
  let best = null;
  for (const e of edges) {
    for (const t of targets) {
      const d = t - e;
      const ad = Math.abs(d);
      if (ad <= THRESHOLD && (best === null || ad < Math.abs(best.delta))) {
        best = { delta: d, line: t };
      }
    }
  }
  return best;
}

// Snap `box` ({x,y,w,h} canvas px) to the canvas + peer elements, record the
// active guide lines, and return the adjusted box (same w/h, shifted x/y).
export function snapDragPosition(kind, box, canvas, excludeId) {
  _guides = [];
  const cw = canvas.width, ch = canvas.height;
  const others = otherBoxes(kind, excludeId, canvas);

  const xTargets = [0, cw / 2, cw];
  const yTargets = [0, ch / 2, ch];
  others.forEach(b => {
    xTargets.push(b.x, b.x + b.w / 2, b.x + b.w);
    yTargets.push(b.y, b.y + b.h / 2, b.y + b.h);
  });

  const sx = snapAxis([box.x, box.x + box.w / 2, box.x + box.w], xTargets);
  const sy = snapAxis([box.y, box.y + box.h / 2, box.y + box.h], yTargets);

  const out = { x: box.x, y: box.y, w: box.w, h: box.h };
  if (sx) { out.x += sx.delta; _guides.push({ orientation: 'v', pos: sx.line }); }
  if (sy) { out.y += sy.delta; _guides.push({ orientation: 'h', pos: sy.line }); }
  return out;
}

// Convenience for the text overlay: snap a proposed CENTER (canvas px) using the
// overlay's measured box; returns the snapped center { cx, cy }.
export function snapTextCenter(cx, cy, canvas) {
  const t = state.textOverlay;
  const ctx = measureCtx();
  ctx.font = textFont(t);
  const w = ctx.measureText(t.content || '').width;
  const h = t.size;
  const s = snapDragPosition('text', { x: cx - w / 2, y: cy - h / 2, w, h }, canvas, null);
  return { cx: s.x + w / 2, cy: s.y + h / 2 };
}

// Convenience for an extra image: snap a proposed CENTER (canvas px); returns the
// snapped center { cx, cy }.
export function snapExtraImageCenter(ei, cx, cy, canvas) {
  const b = extraImageBox(ei, canvas);
  if (!b) { clearGuides(); return { cx, cy }; }
  const s = snapDragPosition('extraImage', { x: cx - b.w / 2, y: cy - b.h / 2, w: b.w, h: b.h }, canvas, ei.id);
  return { cx: s.x + b.w / 2, cy: s.y + b.h / 2 };
}

// Paint the active guide lines. Caller must gate on !forExport.
export function drawGuides(ctx) {
  if (!_guides.length) return;
  const canvas = ctx.canvas;
  ctx.save();
  ctx.strokeStyle = '#f2a93b';
  ctx.lineWidth = Math.max(1, canvas.width * 0.0012);
  ctx.setLineDash([]);
  _guides.forEach(g => {
    ctx.beginPath();
    if (g.orientation === 'v') {
      ctx.moveTo(g.pos, 0);
      ctx.lineTo(g.pos, canvas.height);
    } else {
      ctx.moveTo(0, g.pos);
      ctx.lineTo(canvas.width, g.pos);
    }
    ctx.stroke();
  });
  ctx.restore();
}
