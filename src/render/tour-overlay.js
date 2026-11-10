// v25 — Interactive Tour: hotspot authoring overlay.
//
// Draws an editable box per hotspot on top of the preview canvas — pure preview
// chrome, deliberately OUTSIDE renderInto (like the minimap), so hotspots never
// bake into static PNG/JPEG exports; they live only in the exported player.
// Coordinates are normalized 0..1 over the FULL canvas (which is exactly the
// exported frame), so they survive any export size. Modeled on features/crop.js.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { uid } from '../features/document.js';

let active = false;
let overlay = null;   // .tour-overlay host inside the canvas viewport
let drag = null;      // { type:'create'|'move'|'resize', id, corner?, start, init }
let selectedId = null;
let changeCb = null;  // fired after structural changes / selection so the UI refreshes

export function onTourOverlayChange(fn) { changeCb = fn; }

// v42 — tours.js supplies the text for a hotspot's destination badge ("→ 3"),
// since it knows the pages. Returns '' for a hotspot that goes to the next step.
let badgeCb = null;
export function setTourBadge(fn) { badgeCb = fn; }
function badgeFor(h) { try { return badgeCb ? String(badgeCb(h) || '') : ''; } catch (e) { return ''; } }
function emit() { if (changeCb) { try { changeCb(); } catch (e) {} } }

export function isTourOverlayActive() { return active; }
export function getSelectedHotspotId() { return selectedId; }
export function getSelectedHotspot() { return hotspotById(selectedId); }

function hotspots() { return state.tour && Array.isArray(state.tour.hotspots) ? state.tour.hotspots : (state.tour.hotspots = []); }
function hotspotById(id) { return hotspots().find(h => h.id === id) || null; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Full-canvas DOM rect — reflects zoom/pan/tilt automatically (it's the rendered box).
function canvasRect() {
  const c = el.previewCanvas;
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return (r.width && r.height) ? r : null;
}

function clientToNorm(clientX, clientY) {
  const rect = canvasRect();
  if (!rect) return null;
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1)
  };
}

// ── DOM (re)build + positioning ──────────────────────────────────────────────
function buildBoxes() {
  if (!overlay) return;
  overlay.innerHTML = '';
  hotspots().forEach((h, i) => {
    const box = document.createElement('div');
    box.className = 'tour-hotspot' + (h.id === selectedId ? ' selected' : '');
    box.dataset.id = h.id;
    box.innerHTML =
      `<span class="tour-hotspot-num">${i + 1}</span>` +
      (badgeFor(h) ? `<span class="tour-hotspot-to">${badgeFor(h)}</span>` : '') +
      `<button class="tour-hotspot-del" data-del="${h.id}" title="Delete hotspot">✕</button>` +
      ['nw', 'ne', 'sw', 'se'].map(c => `<div class="tour-handle ${c}" data-corner="${c}"></div>`).join('');
    overlay.appendChild(box);
  });
  positionBoxes();
}

function positionBoxes() {
  if (!overlay || !el.canvasViewport) return;
  const rect = canvasRect();
  if (!rect) return;
  const vp = el.canvasViewport.getBoundingClientRect();
  overlay.querySelectorAll('.tour-hotspot').forEach(box => {
    const h = hotspotById(box.dataset.id);
    if (!h) return;
    box.style.left = (rect.left - vp.left + h.x * rect.width) + 'px';
    box.style.top = (rect.top - vp.top + h.y * rect.height) + 'px';
    box.style.width = (h.w * rect.width) + 'px';
    box.style.height = (h.h * rect.height) + 'px';
  });
}

// ── Pointer interaction ──────────────────────────────────────────────────────
function onPointerDown(e) {
  if (!active) return;
  const delBtn = e.target.closest('[data-del]');
  if (delBtn) { e.preventDefault(); e.stopPropagation(); deleteHotspot(delBtn.dataset.del); return; }

  const norm = clientToNorm(e.clientX, e.clientY);
  if (!norm) return;
  const handle = e.target.closest('.tour-handle');
  const box = e.target.closest('.tour-hotspot');

  if (handle && box) {
    selectHotspot(box.dataset.id);
    saveStateToHistory();
    drag = { type: 'resize', corner: handle.dataset.corner, id: box.dataset.id, start: norm, init: { ...hotspotById(box.dataset.id) } };
  } else if (box) {
    selectHotspot(box.dataset.id);
    saveStateToHistory();
    drag = { type: 'move', id: box.dataset.id, start: norm, init: { ...hotspotById(box.dataset.id) } };
  } else {
    // Draw a new hotspot on the empty backdrop (or click-to-drop a default box).
    saveStateToHistory();
    const h = { id: uid(), x: norm.x, y: norm.y, w: 0, h: 0, label: '', callout: { title: '', body: '', side: 'bottom' }, target: null };
    hotspots().push(h);
    selectedId = h.id;
    drag = { type: 'create', id: h.id, start: norm, init: { x: norm.x, y: norm.y } };
    buildBoxes();
  }
  e.preventDefault();
  e.stopPropagation();
}

function onPointerMove(e) {
  if (!drag) return;
  const norm = clientToNorm(e.clientX, e.clientY);
  if (!norm) return;
  const h = hotspotById(drag.id);
  if (!h) return;
  if (drag.type === 'create') {
    const x0 = drag.init.x, y0 = drag.init.y;
    h.x = Math.min(x0, norm.x); h.y = Math.min(y0, norm.y);
    h.w = Math.abs(norm.x - x0); h.h = Math.abs(norm.y - y0);
  } else if (drag.type === 'move') {
    const dx = norm.x - drag.start.x, dy = norm.y - drag.start.y;
    h.x = clamp(drag.init.x + dx, 0, 1 - drag.init.w);
    h.y = clamp(drag.init.y + dy, 0, 1 - drag.init.h);
  } else if (drag.type === 'resize') {
    let { x, y, w, h: hh } = drag.init;
    const dx = norm.x - drag.start.x, dy = norm.y - drag.start.y;
    if (drag.corner.includes('w')) { const nx = clamp(x + dx, 0, x + w - 0.03); w -= (nx - x); x = nx; }
    if (drag.corner.includes('e')) { w = clamp(w + dx, 0.03, 1 - x); }
    if (drag.corner.includes('n')) { const ny = clamp(y + dy, 0, y + hh - 0.03); hh -= (ny - y); y = ny; }
    if (drag.corner.includes('s')) { hh = clamp(hh + dy, 0.03, 1 - y); }
    h.x = x; h.y = y; h.w = w; h.h = hh;
  }
  positionBoxes();
  e.preventDefault();
}

function onPointerUp() {
  if (!drag) return;
  const h = hotspotById(drag.id);
  if (drag.type === 'create' && h && (h.w < 0.02 || h.h < 0.02)) {
    // A click rather than a drag — drop a sensibly-sized box centered on the point.
    const dw = 0.2, dh = 0.12;
    h.w = dw; h.h = dh;
    h.x = clamp(h.x - dw / 2, 0, 1 - dw);
    h.y = clamp(h.y - dh / 2, 0, 1 - dh);
  }
  drag = null;
  buildBoxes();
  emit();
}

// ── Public mutators ──────────────────────────────────────────────────────────
export function selectHotspot(id) {
  selectedId = id;
  if (overlay) overlay.querySelectorAll('.tour-hotspot').forEach(b => b.classList.toggle('selected', b.dataset.id === id));
  emit();
}

// Drop a default centered hotspot (the sidebar "Add hotspot" button) and select it.
export function addDefaultHotspot() {
  saveStateToHistory();
  const dw = 0.24, dh = 0.14;
  const h = { id: uid(), x: (1 - dw) / 2, y: (1 - dh) / 2, w: dw, h: dh, label: '', callout: { title: '', body: '', side: 'bottom' }, target: null };
  hotspots().push(h);
  selectedId = h.id;
  buildBoxes();
  emit();
  return h;
}

export function deleteHotspot(id) {
  saveStateToHistory();
  state.tour.hotspots = hotspots().filter(h => h.id !== id);
  if (selectedId === id) selectedId = null;
  buildBoxes();
  emit();
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
export function showTourOverlay() {
  if (active) return;
  active = true;
  overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  el.canvasViewport.appendChild(overlay);
  overlay.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', positionBoxes);
  window.__syncTourOverlay = positionBoxes;   // applyTransform() calls this on zoom/pan/tilt
  buildBoxes();
}

export function hideTourOverlay() {
  active = false;
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  drag = null;
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('resize', positionBoxes);
  if (window.__syncTourOverlay === positionBoxes) window.__syncTourOverlay = null;
}

// Rebuild from state after external changes (step switch, undo/redo).
export function refreshTourOverlay() {
  if (!active) return;
  if (selectedId && !hotspotById(selectedId)) selectedId = null;
  buildBoxes();
  emit();
}
