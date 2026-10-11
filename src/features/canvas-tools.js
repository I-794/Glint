import { state, imageRegistry } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { showUndoToast } from '../ui/notification.js';
import { render } from '../render/render.js';
import { drawArrow, drawStroke, annotationBBox, drawShape, SHAPE_TYPES } from '../render/annotations.js';
import { hitTestExtraImageAtPoint } from './extra-images.js';
import { getCanvasCoords } from '../utils/geometry.js';
import { activePointers, gesture } from './gesture.js';
import { snapDragPosition, snapTextCenter, snapExtraImageCenter, clearGuides } from './snapping.js';
import {
  resolveRef, objectRefs, isRefSelected, selectOnly, toggleRef,
  clearSelection, setSelection,
} from './selection.js';
import { hitRegionEdge, hitRegionCorner, regionFromDrag, traceRegion, upgradeSpotlight } from '../render/spotlight-geom.js';

let drawing = { active: false, startX: 0, startY: 0, points: [] };
let dragOffset = { dx: 0, dy: 0 };
let isDraggingAnnotation = false;
let isDraggingText = false;
let textDragOffset = { dx: 0, dy: 0 };
let isDraggingExtraImage = false;
let capturedPointerId = null;
// v28 — multi-select drag of 2+ objects, and rubber-band marquee selection.
let groupDrag = { active: false, lastX: 0, lastY: 0, saved: false };
let marquee = null;
// v34 — corner-drag resize of a selected spotlight region.
let regionResize = null;

// Abandon any in-progress one-finger interaction (used when a 2nd finger lands,
// so the viewport can take over for pinch/two-finger pan).
function cancelInteraction() {
  drawing.active = false;
  drawing.points = [];
  isDraggingText = false;
  isDraggingAnnotation = false;
  isDraggingExtraImage = false;
  groupDrag.active = false;
  marquee = null;
  regionResize = null;
  gesture.canvasBusy = false;
  clearGuides();
  if (capturedPointerId !== null) {
    try { el.previewCanvas.releasePointerCapture(capturedPointerId); } catch (_) {}
    capturedPointerId = null;
  }
  render();
}

export function hitTestAnnotations(x, y) {
  if (!state.annotations) return -1;
  for (let i = state.annotations.length - 1; i >= 0; i--) {
    const ann = state.annotations[i];
    if (ann.visible === false || ann.locked) continue;   // v33 — hidden/locked aren't pickable
    const bb = annotationBBox(ann);
    const pad = 10;
    if (x >= bb.x - pad && x <= bb.x + bb.w + pad &&
        y >= bb.y - pad && y <= bb.y + bb.h + pad) return i;
  }
  return -1;
}

export function hitTestText(x, y) {
  if (!state.textOverlay.enabled || !state.textOverlay.content) return false;
  const ctx = el.previewCanvas.getContext('2d');
  const tx = el.previewCanvas.width * state.textOverlay.x;
  const ty = el.previewCanvas.height * state.textOverlay.y;
  let fontStr = '';
  if (state.textOverlay.italic) fontStr += 'italic ';
  if (state.textOverlay.bold) fontStr += 'bold ';
  fontStr += `${state.textOverlay.size}px ${state.textOverlay.font}`;
  ctx.save();
  ctx.font = fontStr;
  const metrics = ctx.measureText(state.textOverlay.content);
  ctx.restore();
  const hw = metrics.width / 2 + 10;
  const hh = state.textOverlay.size / 2 + 10;
  return Math.abs(x - tx) <= hw && Math.abs(y - ty) <= hh;
}

export function hitTestRedactions(x, y) {
  if (!state.redactions) return -1;
  for (let i = state.redactions.length - 1; i >= 0; i--) {
    const r = state.redactions[i];
    if (r.visible === false || r.locked) continue;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

// v34 — spotlight regions are hit on their outline band (or resize corner) only.
export function hitTestSpotlight(x, y) {
  const sp = state.spotlight;
  if (!sp || !sp.enabled || !Array.isArray(sp.regions)) return null;
  const cw = el.previewCanvas.width, ch = el.previewCanvas.height;
  for (let i = sp.regions.length - 1; i >= 0; i--) {
    const r = sp.regions[i];
    if (hitRegionEdge(r, cw, ch, x, y) || hitRegionCorner(r, cw, ch, x, y)) return r.id;
  }
  return null;
}

// v34 — the selected spotlight region whose resize corner is under (x, y).
function spotlightCornerHit(x, y) {
  const sp = state.spotlight;
  if (!sp || !sp.enabled || !Array.isArray(sp.regions)) return null;
  const cw = el.previewCanvas.width, ch = el.previewCanvas.height;
  return sp.regions.find((r) => isRefSelected({ kind: 'spotlight', id: r.id }) &&
    hitRegionCorner(r, cw, ch, x, y)) || null;
}

// v28 — resolve the top-most object under a point into a selection ref, using
// the same priority the old single-select path used: text → annotation →
// redaction → extra image.
export function hitTopRef(x, y) {
  const canvas = el.previewCanvas;
  if (hitTestText(x, y)) return { kind: 'text' };
  const a = hitTestAnnotations(x, y);
  if (a !== -1) return { kind: 'annotation', id: state.annotations[a].id };
  const r = hitTestRedactions(x, y);
  if (r !== -1) return { kind: 'redaction', id: state.redactions[r].id };
  const eIdx = hitTestExtraImageAtPoint(x, y, canvas);
  if (eIdx !== -1) return { kind: 'extraImage', id: state.extraImages[eIdx].id };
  const s = hitTestSpotlight(x, y);
  if (s != null) return { kind: 'spotlight', id: s };
  return null;
}

// v28 — delete every object in the multi-selection (one history entry). Handles
// fall back to the legacy single-select fields kept in sync by selection.js.
export function deleteSelected() {
  if (state.canvasSelection.length) {
    // Text is the sidebar-owned singleton and can't be deleted from the canvas.
    const handles = state.canvasSelection.filter((r) => r.kind !== 'text').map(resolveRef).filter(Boolean);
    if (!handles.length) return;
    saveStateToHistory();
    // Resolve handles up front; each remove() recomputes its live index so the
    // batch stays correct as the underlying arrays shrink.
    handles.forEach((h) => h.remove());
    clearSelection();
    render();
    // v33 — one-click Undo (same as Cmd+Z; the deletion is one history entry).
    showUndoToast(handles.length === 1 ? 'Deleted' : `Deleted ${handles.length} items`, render);
  }
}

// v33.2 — Clear All (annotation toolbar, Cmd-K) and Clear All Redactions get
// the same one-click Undo toast as canvas deletes. No-op when already empty.
export function clearAllAnnotations() {
  const n = state.annotations.length;
  if (!n) return;
  saveStateToHistory();
  state.annotations = [];
  clearSelection();
  render();
  showUndoToast(n === 1 ? 'Cleared 1 annotation' : `Cleared ${n} annotations`, render);
}

export function clearAllRedactions() {
  const n = state.redactions.length;
  if (!n) return;
  saveStateToHistory();
  state.redactions = [];
  clearSelection();
  render();
  showUndoToast(n === 1 ? 'Cleared 1 redaction' : `Cleared ${n} redactions`, render);
}

// v14 — resolve the currently "selected" element into a uniform handle: its
// bounding box (canvas px) and a moveTo(x,y) that repositions its top-left.
// Priority: annotation → redaction → extra image → text overlay (there is no
// multi-select, so one element is active at a time).
function selectedTarget() {
  const canvas = el.previewCanvas;
  const cw = canvas.width, ch = canvas.height;

  if (state.selectedAnnotation !== null && state.annotations[state.selectedAnnotation]) {
    const ann = state.annotations[state.selectedAnnotation];
    const bb = annotationBBox(ann);
    return { box: bb, moveTo(nx, ny) {
      const sx = nx - bb.x, sy = ny - bb.y;
      if (Array.isArray(ann.points)) ann.points.forEach(p => { p.x += sx; p.y += sy; });
      ann.x1 += sx; ann.y1 += sy; ann.x2 += sx; ann.y2 += sy;
    } };
  }
  if (state.selectedRedaction !== null && state.redactions[state.selectedRedaction]) {
    const r = state.redactions[state.selectedRedaction];
    return { box: { x: r.x, y: r.y, w: r.w, h: r.h }, moveTo(nx, ny) { r.x = nx; r.y = ny; } };
  }
  if (state.selectedExtraImage !== null) {
    const ei = state.extraImages.find(e => e.id === state.selectedExtraImage);
    const img = ei && imageRegistry[ei.id];
    if (ei && img) {
      const w = img.width * ei.scaleFrac, h = img.height * ei.scaleFrac;
      return { box: { x: cw * ei.xFrac - w / 2, y: ch * ei.yFrac - h / 2, w, h }, moveTo(nx, ny) {
        ei.xFrac = (nx + w / 2) / cw; ei.yFrac = (ny + h / 2) / ch;
      } };
    }
  }
  if (state.textOverlay.enabled && state.textOverlay.content) {
    const t = state.textOverlay;
    const ctx = canvas.getContext('2d');
    let f = '';
    if (t.italic) f += 'italic ';
    if (t.bold) f += 'bold ';
    ctx.save(); ctx.font = `${f}${t.size}px ${t.font}`;
    const w = ctx.measureText(t.content).width; ctx.restore();
    const h = t.size;
    return { box: { x: cw * t.x - w / 2, y: ch * t.y - h / 2, w, h }, moveTo(nx, ny) {
      t.x = (nx + w / 2) / cw; t.y = (ny + h / 2) / ch;
    } };
  }
  return null;
}

// Arrow-key nudge of the selected element by (dx,dy) canvas px. `save` records a
// single history entry at the start of a key-repeat burst. Returns whether
// anything moved (so the caller can decide to preventDefault).
export function nudgeSelected(dx, dy, save) {
  // v28 — nudge the whole multi-selection together.
  if (state.canvasSelection.length > 1 || state.canvasSelection[0]?.kind === 'spotlight') {
    // Resolve first: refs left dangling (e.g. regions just cleared) move nothing,
    // so they must not push an empty history entry.
    const handles = state.canvasSelection.map(resolveRef).filter(Boolean);
    if (!handles.length) return false;
    if (save) saveStateToHistory();
    handles.forEach((h) => h.moveBy(dx, dy));
    render();
    return true;
  }
  const t = selectedTarget();
  if (!t) return false;
  if (save) saveStateToHistory();
  t.moveTo(t.box.x + dx, t.box.y + dy);
  render();
  return true;
}

// Align the selected element's bounding box to the canvas.
export function alignSelectedToCanvas(how) {
  const canvas = el.previewCanvas;
  const t = selectedTarget();
  if (!t) return;
  saveStateToHistory();
  const { box } = t;
  let nx = box.x, ny = box.y;
  switch (how) {
    case 'left':    nx = 0; break;
    case 'hcenter': nx = (canvas.width - box.w) / 2; break;
    case 'right':   nx = canvas.width - box.w; break;
    case 'top':     ny = 0; break;
    case 'vcenter': ny = (canvas.height - box.h) / 2; break;
    case 'bottom':  ny = canvas.height - box.h; break;
  }
  t.moveTo(nx, ny);
  render();
}

function drawPreviewAnnotation(startX, startY, curX, curY) {
  if (!state.image) return;
  render();
  const ctx = el.previewCanvas.getContext('2d');
  ctx.save();
  ctx.strokeStyle = state.annotationColor;
  ctx.fillStyle = state.annotationColor;
  ctx.lineWidth = state.annotationStrokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const tool = state.tool;
  if (tool === 'arrow') {
    drawArrow(ctx, startX, startY, curX, curY, state.annotationColor, state.annotationStrokeWidth);
  } else if (tool === 'pen' || tool === 'highlighter') {
    drawStroke(ctx, {
      type: tool,
      points: drawing.points,
      color: state.annotationColor,
      strokeWidth: state.annotationStrokeWidth
    });
  } else if (SHAPE_TYPES.has(tool)) {
    // v16.0 — live preview mirrors the final paint via the shared renderer.
    drawShape(ctx, {
      type: tool, x1: startX, y1: startY, x2: curX, y2: curY,
      fill: tool !== 'line' && state.annotationFill.enabled,
      fillColor: state.annotationFill.color,
      fillOpacity: state.annotationFill.opacity,
      sides: state.polygonSides,
      points: state.starPoints
    });
  } else if (tool === 'redact') {
    const rx = Math.min(startX, curX), ry = Math.min(startY, curY);
    const rw = Math.abs(curX - startX), rh = Math.abs(curY - startY);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,102,0,0.2)';
    ctx.fillRect(rx, ry, rw, rh);
  } else if (tool === 'spotlight') {
    // v34 — preview the region being dragged (Shift = ellipse) as a hole in the dim.
    const cw = el.previewCanvas.width, ch = el.previewCanvas.height;
    const sp = state.spotlight;
    const r = regionFromDrag(startX, startY, curX, curY, cw, ch, drawing.shift ? 'ellipse' : (sp.shape || 'rect'), 0);
    ctx.fillStyle = `rgba(0,0,0,${sp.opacity ?? 0.65})`;
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    traceRegion(ctx, r, cw, ch);
    ctx.fill('evenodd');
  } else if (tool === 'glass') {
    // v16.1 — preview the glass panel footprint (the real frosted draw happens
    // on the next render once the region is committed).
    const rx = Math.min(startX, curX), ry = Math.min(startY, curY);
    const rw = Math.abs(curX - startX), rh = Math.abs(curY - startY);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function canvasMouseDown(e) {
  if (!state.image) return;
  // v28 — right-click is owned by the context menu (context-menu.js); don't let
  // it start a draw/drag/marquee here.
  if (e.button === 2) return;
  // A second touch/pen pointer landed → abandon the one-finger interaction and
  // let the viewport handle pinch-zoom / two-finger pan instead.
  if (e.pointerType !== 'mouse' && activePointers.size >= 1) {
    cancelInteraction();
    return;
  }
  canvasDownLogic(e);
  // Claim the pointer only when we actually started drawing or dragging, so an
  // empty-canvas tap with the Select tool falls through to the viewport (pan).
  gesture.canvasBusy = drawing.active || isDraggingText || isDraggingAnnotation ||
    isDraggingExtraImage || groupDrag.active || !!marquee || !!regionResize;
  if (gesture.canvasBusy && e.pointerId != null) {
    try { el.previewCanvas.setPointerCapture(e.pointerId); capturedPointerId = e.pointerId; } catch (_) {}
  }
}

function canvasDownLogic(e) {
  const canvas = el.previewCanvas;
  const { x, y } = getCanvasCoords(e, canvas);

  if (state.tool === 'select') {
    // v28 — unified multi-select. Shift toggles; plain click selects/keeps; an
    // empty click starts a rubber-band marquee. A click on an already-multi
    // selection starts a group drag; otherwise the single-object drag path
    // (with snapping) runs as before.
    const corner = spotlightCornerHit(x, y);
    if (corner) { regionResize = { region: corner, saved: false }; return; }
    const ref = hitTopRef(x, y);
    if (e.shiftKey) {
      if (ref) { toggleRef(ref); render(); }
      return;            // shift-click only toggles; never drags or marquees
    }
    if (ref) {
      if (!isRefSelected(ref)) selectOnly(ref);
      if (state.canvasSelection.length > 1 || ref.kind === 'spotlight') {
        groupDrag = { active: true, lastX: x, lastY: y, saved: false };
      } else {
        startSingleDrag(ref, x, y);
      }
      render();
    } else {
      clearSelection();
      marquee = { x0: x, y0: y, x1: x, y1: y };
      render();
    }
    return;
  }

  drawing.active = true;
  drawing.startX = x;
  drawing.startY = y;
  drawing.points = (state.tool === 'pen' || state.tool === 'highlighter') ? [{ x, y }] : [];
}

// v28 — set up the legacy single-object drag (with snapping) for the one
// selected object. selection.js has already synced the legacy selected* fields.
function startSingleDrag(ref, x, y) {
  const canvas = el.previewCanvas;
  if (ref.kind === 'text') {
    isDraggingText = true;
    textDragOffset = { dx: x - canvas.width * state.textOverlay.x, dy: y - canvas.height * state.textOverlay.y };
  } else if (ref.kind === 'annotation') {
    const ann = state.annotations[state.selectedAnnotation];
    if (ann) { dragOffset = { dx: x - ann.x1, dy: y - ann.y1 }; isDraggingAnnotation = true; }
  } else if (ref.kind === 'redaction') {
    const r = state.redactions[state.selectedRedaction];
    if (r) { dragOffset = { dx: x - r.x, dy: y - r.y }; isDraggingAnnotation = true; }
  } else if (ref.kind === 'extraImage') {
    const ei = state.extraImages.find((e) => e.id === ref.id);
    if (ei) { dragOffset = { dx: x - canvas.width * ei.xFrac, dy: y - canvas.height * ei.yFrac }; isDraggingExtraImage = true; }
  }
}

// v28 — transient rubber-band overlay (preview-only; never persisted/exported).
function drawMarquee() {
  render();
  const ctx = el.previewCanvas.getContext('2d');
  const rx = Math.min(marquee.x0, marquee.x1), ry = Math.min(marquee.y0, marquee.y1);
  const rw = Math.abs(marquee.x1 - marquee.x0), rh = Math.abs(marquee.y1 - marquee.y0);
  ctx.save();
  ctx.fillStyle = 'rgba(84,112,255,0.12)';
  ctx.strokeStyle = 'rgba(84,112,255,0.9)';
  ctx.lineWidth = Math.max(1.5, el.previewCanvas.width * 0.0015);
  ctx.setLineDash([5, 3]);
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.setLineDash([]);
  ctx.restore();
}

// v28 — commit the marquee: select every object whose box intersects it. A
// near-zero drag is treated as a click (selection was already cleared on down).
// v34 — a spotlight focus area is selected only when the marquee fully contains
// it, so a marquee drawn inside a large area picks the objects, not the area.
function finalizeMarquee() {
  const rx = Math.min(marquee.x0, marquee.x1), ry = Math.min(marquee.y0, marquee.y1);
  const rw = Math.abs(marquee.x1 - marquee.x0), rh = Math.abs(marquee.y1 - marquee.y0);
  if (rw < 4 && rh < 4) return;
  const hits = objectRefs().filter((ref) => {
    const h = resolveRef(ref);
    if (!h) return false;
    const b = h.box;
    if (ref.kind === 'spotlight') return b.x >= rx && b.y >= ry && b.x + b.w <= rx + rw && b.y + b.h <= ry + rh;
    return !(b.x > rx + rw || b.x + b.w < rx || b.y > ry + rh || b.y + b.h < ry);
  });
  setSelection(hits);
}

function canvasMouseMove(e) {
  if (!state.image) return;
  const canvas = el.previewCanvas;
  const { x, y } = getCanvasCoords(e, canvas);

  // v28 — group drag: move every selected object by the pointer delta.
  if (groupDrag.active) {
    const dx = x - groupDrag.lastX, dy = y - groupDrag.lastY;
    if (dx === 0 && dy === 0) return; // no movement: no move, no empty undo entry
    if (!groupDrag.saved) { saveStateToHistory(); groupDrag.saved = true; }
    state.canvasSelection.forEach((ref) => { const h = resolveRef(ref); if (h) h.moveBy(dx, dy); });
    groupDrag.lastX = x; groupDrag.lastY = y;
    render();
    return;
  }
  // v34 — resize a spotlight region from its bottom-right corner.
  if (regionResize) {
    if (!regionResize.saved) { saveStateToHistory(); regionResize.saved = true; }
    const r = regionResize.region;
    r.w = Math.max(8, x - r.x * canvas.width) / canvas.width;
    r.h = Math.max(8, y - r.y * canvas.height) / canvas.height;
    render();
    return;
  }
  // v28 — rubber-band marquee.
  if (marquee) {
    marquee.x1 = x; marquee.y1 = y;
    drawMarquee();
    return;
  }

  if (isDraggingText) {
    const { cx, cy } = snapTextCenter(x - textDragOffset.dx, y - textDragOffset.dy, canvas);
    state.textOverlay.x = Math.max(0, Math.min(1, cx / canvas.width));
    state.textOverlay.y = Math.max(0, Math.min(1, cy / canvas.height));
    render();
    return;
  }

  if (isDraggingExtraImage && state.selectedExtraImage !== null) {
    const eiIdx = state.extraImages.findIndex(ei => ei.id === state.selectedExtraImage);
    if (eiIdx !== -1) {
      const ei = state.extraImages[eiIdx];
      const { cx, cy } = snapExtraImageCenter(ei, x - dragOffset.dx, y - dragOffset.dy, canvas);
      ei.xFrac = Math.max(0, Math.min(1, cx / canvas.width));
      ei.yFrac = Math.max(0, Math.min(1, cy / canvas.height));
      render();
    }
    return;
  }

  if (state.tool === 'select' && isDraggingAnnotation) {
    if (state.selectedAnnotation !== null && state.annotations[state.selectedAnnotation]) {
      const ann = state.annotations[state.selectedAnnotation];
      // Intended move, then snap the resulting bounding box to canvas/peers.
      const bb = annotationBBox(ann);
      let shiftX = (x - dragOffset.dx) - ann.x1;
      let shiftY = (y - dragOffset.dy) - ann.y1;
      const snapped = snapDragPosition('annotation',
        { x: bb.x + shiftX, y: bb.y + shiftY, w: bb.w, h: bb.h }, canvas, state.selectedAnnotation);
      shiftX += snapped.x - (bb.x + shiftX);
      shiftY += snapped.y - (bb.y + shiftY);
      if ((ann.type === 'pen' || ann.type === 'highlighter') && Array.isArray(ann.points)) {
        ann.points.forEach(p => { p.x += shiftX; p.y += shiftY; });
      }
      ann.x1 += shiftX; ann.y1 += shiftY;
      ann.x2 += shiftX; ann.y2 += shiftY;
      render();
    } else if (state.selectedRedaction !== null && state.redactions[state.selectedRedaction]) {
      const r = state.redactions[state.selectedRedaction];
      const snapped = snapDragPosition('redaction',
        { x: x - dragOffset.dx, y: y - dragOffset.dy, w: r.w, h: r.h }, canvas, state.selectedRedaction);
      r.x = snapped.x;
      r.y = snapped.y;
      render();
    }
    return;
  }

  if (state.tool === 'select') {
    const canMove = hitTestText(x, y) || hitTestExtraImageAtPoint(x, y, canvas) !== -1 ||
                    hitTestAnnotations(x, y) !== -1 || hitTestRedactions(x, y) !== -1 ||
                    hitTestSpotlight(x, y) != null;
    canvas.style.cursor = spotlightCornerHit(x, y) ? 'nwse-resize' : (canMove ? 'move' : '');
  }

  if (!drawing.active) return;
  if (state.tool === 'pen' || state.tool === 'highlighter') {
    const last = drawing.points[drawing.points.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 1.5) {
      drawing.points.push({ x, y });
    }
  }
  drawing.shift = e.shiftKey;   // v34 — Shift-drag previews an ellipse spotlight region
  drawPreviewAnnotation(drawing.startX, drawing.startY, x, y);
}

function canvasMouseUp(e) {
  canvasUpLogic(e);
  gesture.canvasBusy = false;
  clearGuides();
  if (capturedPointerId !== null) {
    try { el.previewCanvas.releasePointerCapture(capturedPointerId); } catch (_) {}
    capturedPointerId = null;
  }
  render();
}

function canvasUpLogic(e) {
  if (!state.image) return;
  const canvas = el.previewCanvas;
  // v34 — end a spotlight corner resize (history saved on first move).
  if (regionResize) { regionResize = null; return; }

  // v28 — end a group drag (history already saved on first move).
  if (groupDrag.active) { groupDrag.active = false; return; }
  // v28 — commit the marquee selection.
  if (marquee) { finalizeMarquee(); marquee = null; return; }

  if (isDraggingText) {
    saveStateToHistory();
    isDraggingText = false;
    return;
  }
  if (isDraggingExtraImage) {
    saveStateToHistory();
    isDraggingExtraImage = false;
    return;
  }
  if (state.tool === 'select') {
    if (isDraggingAnnotation) {
      saveStateToHistory();
      isDraggingAnnotation = false;
    }
    return;
  }
  if (!drawing.active) return;
  drawing.active = false;

  const { x, y } = getCanvasCoords(e, canvas);
  const dx = Math.abs(x - drawing.startX), dy = Math.abs(y - drawing.startY);
  if (dx < 3 && dy < 3 && state.tool !== 'number') return;

  saveStateToHistory();

  if (state.tool === 'pen' || state.tool === 'highlighter') {
    if (drawing.points.length >= 2) {
      const bb = (() => {
        let mnx = drawing.points[0].x, mxx = mnx, mny = drawing.points[0].y, mxy = mny;
        for (const p of drawing.points) {
          if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
          if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y;
        }
        return { x1: mnx, y1: mny, x2: mxx, y2: mxy };
      })();
      state.annotations.push({
        id: Date.now(),
        type: state.tool,
        points: drawing.points.slice(),
        x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2,
        color: state.annotationColor,
        strokeWidth: state.annotationStrokeWidth,
        number: null
      });
    }
    drawing.points = [];
  } else if (state.tool === 'arrow' || SHAPE_TYPES.has(state.tool)) {
    const ann = {
      id: Date.now(),
      type: state.tool,
      x1: drawing.startX, y1: drawing.startY,
      x2: x, y2: y,
      color: state.annotationColor,
      strokeWidth: state.annotationStrokeWidth,
      number: null
    };
    // v16.0 — bake the fill + shape params onto closeable shapes at creation, so
    // each record renders independently of the current toolbar state.
    if (state.tool !== 'arrow' && state.tool !== 'line' && state.annotationFill.enabled) {
      ann.fill = true;
      ann.fillColor = state.annotationFill.color;
      ann.fillOpacity = state.annotationFill.opacity;
    }
    if (state.tool === 'polygon') ann.sides = state.polygonSides;
    if (state.tool === 'star') ann.points = state.starPoints;
    state.annotations.push(ann);
  } else if (state.tool === 'number') {
    state.annotations.push({
      id: Date.now(),
      type: 'number',
      x1: x, y1: y, x2: x, y2: y,
      color: state.annotationColor,
      strokeWidth: state.annotationStrokeWidth,
      number: state.nextNumber++
    });
  } else if (state.tool === 'redact') {
    const rx = Math.min(drawing.startX, x);
    const ry = Math.min(drawing.startY, y);
    const rw = Math.abs(x - drawing.startX);
    const rh = Math.abs(y - drawing.startY);
    if (rw > 4 && rh > 4) {
      state.redactions.push({
        id: Date.now(),
        x: rx, y: ry, w: rw, h: rh,
        type: state.redactType,
        intensity: state.redactIntensity
      });
    }
  } else if (state.tool === 'spotlight') {
    // v34 — every drag adds a focus region (Shift = ellipse) and selects it.
    const cw = canvas.width, ch = canvas.height;
    if (Math.abs(x - drawing.startX) > 4 && Math.abs(y - drawing.startY) > 4) {
      const sp = state.spotlight = upgradeSpotlight(state.spotlight);
      const region = regionFromDrag(drawing.startX, drawing.startY, x, y, cw, ch,
        e.shiftKey ? 'ellipse' : sp.shape, Date.now());
      sp.regions.push(region);
      sp.enabled = true;
      selectOnly({ kind: 'spotlight', id: region.id });
      window.__updateUIFromState?.();
    }
  } else if (state.tool === 'glass') {
    // v16.1 — commit the glass panel region (fractional, like spotlight).
    const cw = canvas.width, ch = canvas.height;
    const rx = Math.min(drawing.startX, x);
    const ry = Math.min(drawing.startY, y);
    const rw = Math.abs(x - drawing.startX);
    const rh = Math.abs(y - drawing.startY);
    if (rw > 8 && rh > 8) {
      state.glass.x = rx / cw;
      state.glass.y = ry / ch;
      state.glass.w = rw / cw;
      state.glass.h = rh / ch;
      state.glass.enabled = true;
      if (el.glassEnabled) el.glassEnabled.checked = true;
      if (el.glassControls) el.glassControls.style.display = 'block';
    }
  }

  render();
}

export function setTool(t) {
  state.tool = t;
  el.previewCanvas.dataset.tool = t;
  document.querySelectorAll('.ann-tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
}

export function bindCanvasTools() {
  // Pointer events give a single code path for mouse + touch + pen.
  el.previewCanvas.addEventListener('pointerdown', canvasMouseDown);
  el.previewCanvas.addEventListener('pointermove', canvasMouseMove);
  el.previewCanvas.addEventListener('pointerup', canvasMouseUp);
  el.previewCanvas.addEventListener('pointercancel', canvasMouseUp);

  document.querySelectorAll('.ann-tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      clearSelection();
      setTool(btn.dataset.tool);
      render();
    });
  });

  const annColor = document.getElementById('ann-color');
  const annStroke = document.getElementById('ann-stroke');
  const annDeleteBtn = document.getElementById('ann-delete-btn');
  const annClearBtn = document.getElementById('ann-clear-btn');
  if (annColor) annColor.addEventListener('input', (e) => { state.annotationColor = e.target.value; });
  if (annStroke) annStroke.addEventListener('change', (e) => { state.annotationStrokeWidth = parseInt(e.target.value); });

  // v16.0 — shape fill + polygon/star params. Live preview reads these on the
  // next drag; they bake onto each new record at creation.
  const annFillEnabled = document.getElementById('ann-fill-enabled');
  const annFillColor = document.getElementById('ann-fill-color');
  const annSides = document.getElementById('ann-sides');
  const annPoints = document.getElementById('ann-points');
  if (annFillEnabled) annFillEnabled.addEventListener('change', (e) => { state.annotationFill.enabled = e.target.checked; });
  if (annFillColor) annFillColor.addEventListener('input', (e) => { state.annotationFill.color = e.target.value; });
  if (annSides) annSides.addEventListener('change', (e) => { state.polygonSides = Math.max(3, Math.min(12, parseInt(e.target.value) || 6)); });
  if (annPoints) annPoints.addEventListener('change', (e) => { state.starPoints = Math.max(3, Math.min(12, parseInt(e.target.value) || 5)); });
  if (annDeleteBtn) annDeleteBtn.addEventListener('click', deleteSelected);
  if (annClearBtn) annClearBtn.addEventListener('click', clearAllAnnotations);

  // v14 — align the selected element to the canvas.
  document.querySelectorAll('.align-canvas-btn[data-align-canvas]').forEach(btn => {
    btn.addEventListener('click', () => alignSelectedToCanvas(btn.dataset.alignCanvas));
  });
}
