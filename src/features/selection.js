// v28 — Studio Quality-of-Life: unified canvas-object selection model.
//
// Before v28 the canvas could only select one thing at a time, tracked across
// three separate fields (selectedAnnotation/selectedRedaction by index,
// selectedExtraImage by id, plus the singleton textOverlay). This module gives
// every selectable object a uniform *ref* — { kind, id } — and a uniform handle
// (box / moveBy / clone / remove / raise / lower / style) so multi-select, group
// move, context-menu actions, and align all operate through one code path.
//
// state.canvasSelection (array of refs) is the source of truth. To keep the
// existing sidebar bindings, nudge, and align working unchanged, syncLegacy()
// mirrors a *single* selection back into the legacy selectedAnnotation/etc.
// fields; an empty or multi selection clears them.

import { state, imageRegistry } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { annotationBBox } from '../render/annotations.js';

// kinds: 'annotation' | 'redaction' | 'extraImage' | 'text' | 'spotlight' (v34)
// text is a singleton overlay, so its ref has no id.

function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export function refsEqual(a, b) {
  return a && b && a.kind === b.kind && a.id === b.id;
}

export function isRefSelected(ref) {
  return state.canvasSelection.some((r) => refsEqual(r, ref));
}

// v33 — hidden or locked objects (Layers panel eye/lock) can't be picked on the
// canvas: hit tests, marquee, and Select all all skip them.
export function isPickable(obj) {
  return !!obj && obj.visible !== false && !obj.locked;
}

// Enumerate every currently selectable object on the canvas, top-most last.
export function objectRefs() {
  const refs = [];
  (state.annotations || []).forEach((a) => { if (isPickable(a)) refs.push({ kind: 'annotation', id: a.id }); });
  (state.redactions || []).forEach((r) => { if (isPickable(r)) refs.push({ kind: 'redaction', id: r.id }); });
  // v34 — spotlight focus regions (the spotlight is shown/hidden as a whole).
  if (state.spotlight && state.spotlight.enabled && Array.isArray(state.spotlight.regions)) {
    state.spotlight.regions.forEach((r) => refs.push({ kind: 'spotlight', id: r.id }));
  }
  (state.extraImages || []).forEach((e) => { if (isPickable(e)) refs.push({ kind: 'extraImage', id: e.id }); });
  if (state.textOverlay.enabled && state.textOverlay.content) refs.push({ kind: 'text' });
  return refs;
}

// Resolve a ref into a uniform handle. Returns null if the object no longer
// exists. box/moveBy work in canvas pixels; extraImage/text convert to/from the
// fractional coords they store internally.
export function resolveRef(ref) {
  const canvas = el.previewCanvas;
  const cw = canvas.width, ch = canvas.height;

  if (ref.kind === 'annotation') {
    const ann = (state.annotations || []).find((a) => a.id === ref.id);
    if (!ann) return null;
    // Indices are recomputed at call time (not captured) so batch reorder/remove
    // stays correct as the array shifts under us.
    const at = () => state.annotations.indexOf(ann);
    return {
      box: annotationBBox(ann),
      moveBy(dx, dy) {
        if (Array.isArray(ann.points)) ann.points.forEach((p) => { p.x += dx; p.y += dy; });
        ann.x1 += dx; ann.y1 += dy; ann.x2 += dx; ann.y2 += dy;
      },
      clone() {
        const copy = JSON.parse(JSON.stringify(ann));
        copy.id = newId();
        const r = { kind: 'annotation', id: copy.id };
        if (Array.isArray(copy.points)) copy.points.forEach((p) => { p.x += CLONE_OFFSET; p.y += CLONE_OFFSET; });
        copy.x1 += CLONE_OFFSET; copy.y1 += CLONE_OFFSET; copy.x2 += CLONE_OFFSET; copy.y2 += CLONE_OFFSET;
        state.annotations.push(copy);
        return r;
      },
      remove() { const i = at(); if (i !== -1) state.annotations.splice(i, 1); },
      raiseToFront() { const i = at(); if (i !== -1) state.annotations.push(state.annotations.splice(i, 1)[0]); },
      sendToBack() { const i = at(); if (i !== -1) state.annotations.unshift(state.annotations.splice(i, 1)[0]); },
      getStyle() {
        return {
          color: ann.color, strokeWidth: ann.strokeWidth,
          fill: ann.fill, fillColor: ann.fillColor, fillOpacity: ann.fillOpacity,
        };
      },
      // v33 — scale to w x h around the box's top-left. Fixed-size badges
      // (number, sticker) and zero-size axes are left alone.
      resize(w, h) {
        if (ann.type === 'number' || ann.type === 'sticker') return;
        const bb = annotationBBox(ann);
        const sx = bb.w > 0 && w != null ? w / bb.w : 1;
        const sy = bb.h > 0 && h != null ? h / bb.h : 1;
        const fx = (v) => bb.x + (v - bb.x) * sx, fy = (v) => bb.y + (v - bb.y) * sy;
        if (Array.isArray(ann.points)) ann.points.forEach((p) => { p.x = fx(p.x); p.y = fy(p.y); });
        ann.x1 = fx(ann.x1); ann.x2 = fx(ann.x2); ann.y1 = fy(ann.y1); ann.y2 = fy(ann.y2);
      },
      target: ann,
      setStyle(s) {
        if (s.color != null) ann.color = s.color;
        if (s.strokeWidth != null) ann.strokeWidth = s.strokeWidth;
        if (s.fill != null) ann.fill = s.fill;
        if (s.fillColor != null) ann.fillColor = s.fillColor;
        if (s.fillOpacity != null) ann.fillOpacity = s.fillOpacity;
      },
    };
  }

  if (ref.kind === 'redaction') {
    const r = (state.redactions || []).find((x) => x.id === ref.id);
    if (!r) return null;
    const at = () => state.redactions.indexOf(r);
    return {
      box: { x: r.x, y: r.y, w: r.w, h: r.h },
      moveBy(dx, dy) { r.x += dx; r.y += dy; },
      resize(w, h) { if (w != null) r.w = w; if (h != null) r.h = h; },
      target: r,
      clone() {
        const copy = JSON.parse(JSON.stringify(r));
        copy.id = newId();
        copy.x += CLONE_OFFSET; copy.y += CLONE_OFFSET;
        state.redactions.push(copy);
        return { kind: 'redaction', id: copy.id };
      },
      remove() { const i = at(); if (i !== -1) state.redactions.splice(i, 1); },
      raiseToFront() { const i = at(); if (i !== -1) state.redactions.push(state.redactions.splice(i, 1)[0]); },
      sendToBack() { const i = at(); if (i !== -1) state.redactions.unshift(state.redactions.splice(i, 1)[0]); },
    };
  }

  if (ref.kind === 'extraImage') {
    const ei = (state.extraImages || []).find((e) => e.id === ref.id);
    const img = ei && imageRegistry[ei.id];
    if (!ei || !img) return null;
    const at = () => state.extraImages.indexOf(ei);
    const w = img.width * ei.scaleFrac, h = img.height * ei.scaleFrac;
    return {
      box: { x: cw * ei.xFrac - w / 2, y: ch * ei.yFrac - h / 2, w, h },
      moveBy(dx, dy) { ei.xFrac += dx / cw; ei.yFrac += dy / ch; },
      // Images keep their aspect ratio, so matching one dimension scales both.
      resize(nw, nh) {
        if (nw != null) ei.scaleFrac = nw / img.width;
        else if (nh != null) ei.scaleFrac = nh / img.height;
      },
      target: ei,
      clone() {
        const id = 'extra_' + newId();
        imageRegistry[id] = img;           // share the same decoded image
        const copy = { ...JSON.parse(JSON.stringify(ei)), id };
        copy.xFrac += CLONE_OFFSET / cw; copy.yFrac += CLONE_OFFSET / ch;
        state.extraImages.push(copy);
        return { kind: 'extraImage', id };
      },
      remove() { const i = at(); if (i !== -1) state.extraImages.splice(i, 1); },
      raiseToFront() { const i = at(); if (i !== -1) state.extraImages.push(state.extraImages.splice(i, 1)[0]); },
      sendToBack() { const i = at(); if (i !== -1) state.extraImages.unshift(state.extraImages.splice(i, 1)[0]); },
    };
  }

  if (ref.kind === 'spotlight') {
    if (!state.spotlight || !state.spotlight.enabled) return null;
    const list = Array.isArray(state.spotlight.regions) ? state.spotlight.regions : [];
    const r = list.find((x) => x.id === ref.id);
    if (!r) return null;
    const at = () => list.indexOf(r);
    return {
      box: { x: r.x * cw, y: r.y * ch, w: r.w * cw, h: r.h * ch },
      moveBy(dx, dy) { r.x += dx / cw; r.y += dy / ch; },
      resize(w, h) { if (w != null) r.w = Math.max(4, w) / cw; if (h != null) r.h = Math.max(4, h) / ch; },
      // The spotlight is hidden/locked as a whole (sidebar + Layers), so a
      // region has no per-object hide/lock target.
      target: null,
      clone() {
        const copy = { ...r, id: newId(), x: r.x + CLONE_OFFSET / cw, y: r.y + CLONE_OFFSET / ch };
        list.push(copy);
        return { kind: 'spotlight', id: copy.id };
      },
      remove() { const i = at(); if (i !== -1) list.splice(i, 1); },
      raiseToFront() {},
      sendToBack() {},
    };
  }
  if (ref.kind === 'text') {
    const t = state.textOverlay;
    if (!t.enabled || !t.content) return null;
    const ctx = canvas.getContext('2d');
    let f = '';
    if (t.italic) f += 'italic ';
    if (t.bold) f += 'bold ';
    ctx.save(); ctx.font = `${f}${t.size}px ${t.font}`;
    const w = ctx.measureText(t.content).width; ctx.restore();
    const h = t.size;
    return {
      box: { x: cw * t.x - w / 2, y: ch * t.y - h / 2, w, h },
      moveBy(dx, dy) { t.x += dx / cw; t.y += dy / ch; },
      // Text is a singleton overlay: it can't be duplicated or deleted from the
      // canvas (it's owned by the Text sidebar section), so these are no-ops.
      clone() { return null; },
      resize() {},
      target: null,
      remove() {},
      raiseToFront() {},
      sendToBack() {},
    };
  }

  return null;
}

const CLONE_OFFSET = 16;

// --- Selection mutation ---------------------------------------------------

export function clearSelection() {
  state.canvasSelection = [];
  syncLegacy();
}

export function setSelection(refs) {
  state.canvasSelection = (refs || []).slice();
  syncLegacy();
}

export function selectOnly(ref) {
  setSelection([ref]);
}

export function toggleRef(ref) {
  const i = state.canvasSelection.findIndex((r) => refsEqual(r, ref));
  if (i === -1) state.canvasSelection.push(ref);
  else state.canvasSelection.splice(i, 1);
  syncLegacy();
}

export function selectAll() {
  setSelection(objectRefs());
}

// v33 — drop refs whose object was just hidden or locked (text has no lock).
export function pruneSelection() {
  const live = objectRefs();
  setSelection(state.canvasSelection.filter((r) => r.kind === 'text' || live.some((l) => refsEqual(l, r))));
}

// v33 — hide or lock every selected object (one history entry). Text is the
// sidebar-owned singleton, so it's skipped.
export function setSelectionFlag(flag) {
  const targets = state.canvasSelection.map(resolveRef).filter((h) => h && h.target).map((h) => h.target);
  if (!targets.length) return false;
  saveStateToHistory();
  targets.forEach((o) => { if (flag === 'hide') o.visible = false; else o.locked = true; });
  clearSelection();
  return true;
}

// v33 — unlock + unhide everything on the canvas. Returns how many changed.
export function unlockAll() {
  const all = [...(state.annotations || []), ...(state.redactions || []), ...(state.extraImages || [])];
  const hit = all.filter((o) => o.locked || o.visible === false);
  if (!hit.length) return 0;
  saveStateToHistory();
  hit.forEach((o) => { o.locked = false; o.visible = true; });
  return hit.length;
}

// Mirror a lone selection into the legacy single-select fields so the existing
// sidebar bindings, nudgeSelected, and alignSelectedToCanvas keep working. A
// multi or empty selection clears them.
export function syncLegacy() {
  state.selectedAnnotation = null;
  state.selectedRedaction = null;
  state.selectedExtraImage = null;
  if (state.canvasSelection.length === 1) {
    const r = state.canvasSelection[0];
    if (r.kind === 'annotation') {
      const i = state.annotations.findIndex((a) => a.id === r.id);
      if (i !== -1) state.selectedAnnotation = i;
    } else if (r.kind === 'redaction') {
      const i = state.redactions.findIndex((x) => x.id === r.id);
      if (i !== -1) state.selectedRedaction = i;
    } else if (r.kind === 'extraImage') {
      state.selectedExtraImage = r.id;
    }
  }
}

// Duplicate every selected object (offset slightly) and select the copies.
// Records one history entry. Text (singleton) is skipped. Returns true if any
// object was duplicated. Callers render() afterward.
export function duplicateSelection() {
  if (!state.canvasSelection.length) return false;
  saveStateToHistory();
  const clones = [];
  state.canvasSelection.forEach((ref) => {
    const h = resolveRef(ref);
    if (!h) return;
    const c = h.clone();
    if (c) clones.push(c);
  });
  if (clones.length) setSelection(clones);
  return clones.length > 0;
}

// --- Group operations -----------------------------------------------------

// Union bounding box of the current selection (canvas px), or null if empty.
export function selectionBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  state.canvasSelection.forEach((ref) => {
    const h = resolveRef(ref);
    if (!h) return;
    any = true;
    minX = Math.min(minX, h.box.x); minY = Math.min(minY, h.box.y);
    maxX = Math.max(maxX, h.box.x + h.box.w); maxY = Math.max(maxY, h.box.y + h.box.h);
  });
  return any ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

// Move the whole selection so its union box aligns to a canvas edge/center.
export function groupAlign(how) {
  const canvas = el.previewCanvas;
  const b = selectionBounds();
  if (!b) return;
  let dx = 0, dy = 0;
  switch (how) {
    case 'left':    dx = -b.x; break;
    case 'hcenter': dx = (canvas.width - b.w) / 2 - b.x; break;
    case 'right':   dx = canvas.width - b.w - b.x; break;
    case 'top':     dy = -b.y; break;
    case 'vcenter': dy = (canvas.height - b.h) / 2 - b.y; break;
    case 'bottom':  dy = canvas.height - b.h - b.y; break;
  }
  state.canvasSelection.forEach((ref) => { const h = resolveRef(ref); if (h) h.moveBy(dx, dy); });
}

// v33 — spread 3+ selected objects so the gaps between them are equal. The
// outermost two stay put. axis: 'h' | 'v'. Returns false if fewer than 3.
export function groupDistribute(axis) {
  const items = state.canvasSelection.map(resolveRef).filter(Boolean);
  if (items.length < 3) return false;
  const pos = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h';
  items.sort((a, b) => a.box[pos] - b.box[pos]);
  const first = items[0], last = items[items.length - 1];
  const span = (last.box[pos] + last.box[size]) - first.box[pos];
  const total = items.reduce((sum, it) => sum + it.box[size], 0);
  const gap = (span - total) / (items.length - 1);
  let cursor = first.box[pos] + first.box[size] + gap;
  for (let i = 1; i < items.length - 1; i++) {
    const d = cursor - items[i].box[pos];
    if (axis === 'h') items[i].moveBy(d, 0); else items[i].moveBy(0, d);
    cursor += items[i].box[size] + gap;
  }
  return true;
}

// v33 — make every selected object as wide (dim 'w') or tall (dim 'h') as the
// largest one. Returns false if fewer than 2 resizable objects.
export function groupMatchSize(dim) {
  // Spotlight regions have target: null (no per-object hide/lock) but still resize; text stays excluded.
  const items = state.canvasSelection
    .map((ref) => ({ ref, h: resolveRef(ref) }))
    .filter(({ ref, h }) => h && (h.target || ref.kind === 'spotlight'))
    .map(({ h }) => h);
  if (items.length < 2) return false;
  const target = Math.max(...items.map((h) => h.box[dim]));
  items.forEach((h) => { if (dim === 'w') h.resize(target, null); else h.resize(null, target); });
  return true;
}
