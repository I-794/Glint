// v35 — Before / After Compare: sidebar section (Import group), on-canvas
// divider drag, and Cmd-K entry points. The drawing is render/compare.js.
//
// Workflow: the loaded screenshot is After. Add the old screenshot as Before,
// or press "Use current as Before" and then load the new screenshot. Drag the
// divider on the canvas (or use the slider), animate a wipe through Motion
// Studio, or export an interactive slider page (compare-export.js).

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import { showNotification } from '../ui/notification.js';
import { imageToDataUrl } from '../state/serialize.js';
import { getCanvasCoords } from '../utils/geometry.js';
import { loadImageFromSrc } from './upload.js';
import { gesture } from './gesture.js';
import { timelineEngaged } from '../state/motion-clock.js';
import {
  compareActive, ensureCompareImage, getCompareImage, setCompareImageListener,
} from '../render/compare.js';
import { hitDivider, splitFromPoint } from '../render/compare-core.js';
import { isDeviceMockup3d } from '../render/mockups-3d.js';
import { isSurfaceMockup } from '../render/surfaces.js';

const BEFORE_EDGE = 2400;   // long edge cap for the stored Before image
const HIT_PX = 10;          // on-screen grab distance around the divider

function encodeBefore(img) {
  return imageToDataUrl(img, BEFORE_EDGE, 'image/webp', 0.92) ||
    imageToDataUrl(img, BEFORE_EDGE, 'image/jpeg', 0.92);
}

function refreshMotion() {
  if (window.__motionStudioRefresh) window.__motionStudioRefresh();
}

// --- Setting the Before image ----------------------------------------------

function setBefore(src, message) {
  if (!src) { showNotification('Could not read that image.', 'error'); return; }
  saveStateToHistory();
  state.compare = { ...state.compare, beforeSrc: src, enabled: true };
  ensureCompareImage(src).then(() => { render(); refreshCompareUI(); });
  refreshCompareUI();
  refreshMotion();
  render();
  if (message) showNotification(message, 'success');
}

export function addBeforeFromFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showNotification('Pick an image file for Before.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => setBefore(encodeBefore(img),
      state.image ? 'Before added. Drag the divider to compare.' : 'Before added. Now load your new screenshot as After.');
    img.onerror = () => showNotification('Could not read that image.', 'error');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

export function pickBeforeImage() {
  if (el.compareFileInput) { el.compareFileInput.value = ''; el.compareFileInput.click(); }
}

// Keep the current screenshot as Before; the next one loaded becomes After.
export function useCurrentAsBefore() {
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return; }
  if (state.video && state.video.loaded) { showNotification('Compare works with still images, not video.', 'error'); return; }
  setBefore(encodeBefore(state.image), 'Saved as Before. Now load the new screenshot (upload, paste, or drop it).');
}

export function swapBeforeAfter() {
  const c = state.compare;
  const before = getCompareImage(c.beforeSrc);
  if (!before || !state.image) { showNotification('Add both a Before and an After image first.', 'error'); return; }
  const afterSrc = encodeBefore(state.image);
  const oldBefore = c.beforeSrc;
  saveStateToHistory();
  state.compare = { ...c, beforeSrc: afterSrc };
  ensureCompareImage(afterSrc);
  loadImageFromSrc(oldBefore);   // becomes the new After (renders when decoded)
}

export function removeBefore() {
  if (!state.compare.beforeSrc) return;
  saveStateToHistory();
  state.compare = { ...state.compare, beforeSrc: null, enabled: false, wipe: false };
  refreshCompareUI();
  refreshMotion();
  render();
}

export function toggleCompare() {
  if (!state.compare.beforeSrc) { pickBeforeImage(); return; }
  saveStateToHistory();
  state.compare.enabled = !state.compare.enabled;
  refreshCompareUI();
  refreshMotion();
  render();
}

// --- Sidebar ---------------------------------------------------------------

export function refreshCompareUI() {
  const c = state.compare;
  if (!c) return;
  const has = !!c.beforeSrc;
  if (el.compareThumbRow) el.compareThumbRow.style.display = has ? 'flex' : 'none';
  if (el.compareThumb && has && el.compareThumb.getAttribute('src') !== c.beforeSrc) el.compareThumb.src = c.beforeSrc;
  if (el.compareEnabled) el.compareEnabled.checked = !!c.enabled;
  if (el.compareControls) el.compareControls.style.display = c.enabled && has ? 'block' : 'none';
  const pct = Math.round(c.split * 100);
  if (el.compareSplit) el.compareSplit.value = pct;
  if (el.compareSplitValue) el.compareSplitValue.textContent = pct + '%';
  if (el.compareOrientation) el.compareOrientation.value = c.orientation;
  if (el.compareFit) el.compareFit.value = c.fit;
  if (el.compareLabelsEnabled) el.compareLabelsEnabled.checked = !!c.labels.enabled;
  if (el.compareLabelFields) el.compareLabelFields.style.display = c.labels.enabled ? 'block' : 'none';
  if (el.compareLabelBefore && document.activeElement !== el.compareLabelBefore) el.compareLabelBefore.value = c.labels.before;
  if (el.compareLabelAfter && document.activeElement !== el.compareLabelAfter) el.compareLabelAfter.value = c.labels.after;
  if (el.compareLabelPosition) el.compareLabelPosition.value = c.labels.position;
  if (el.compareDividerColor) el.compareDividerColor.value = c.divider.color;
  if (el.compareDividerColorText && document.activeElement !== el.compareDividerColorText) el.compareDividerColorText.value = c.divider.color;
  if (el.compareDividerWidth) el.compareDividerWidth.value = c.divider.width;
  if (el.compareDividerWidthValue) el.compareDividerWidthValue.textContent = c.divider.width + 'px';
  if (el.compareHandle) el.compareHandle.checked = !!c.divider.handle;
  if (el.compareWipe) el.compareWipe.checked = !!c.wipe;
  if (el.compareStatus) {
    el.compareStatus.textContent = !has
      ? 'Your loaded screenshot is After. Add the old one as Before.'
      : !state.image ? 'Before is ready. Load the new screenshot as After.'
        : (state.video && state.video.loaded) ? 'Compare is paused while a video is loaded.'
          : 'Tip: drag the divider right on the canvas.';
  }
}

// Live preview on `input`, one undo step on `change` (history.js snapshots at
// the control's first input).
function live(input, apply, { label, fmt } = {}) {
  if (!input) return;
  input.addEventListener('input', () => {
    apply(input);
    if (label && fmt) label.textContent = fmt(input.value);
    render();
  });
  input.addEventListener('change', () => { saveStateToHistory(); apply(input); refreshMotion(); render(); });
}

function once(input, apply) {
  if (!input) return;
  input.addEventListener('change', () => {
    saveStateToHistory();
    apply(input);
    refreshCompareUI();
    refreshMotion();
    render();
  });
}

function bindSidebar() {
  el.compareUploadBtn?.addEventListener('click', pickBeforeImage);
  el.compareUseCurrentBtn?.addEventListener('click', useCurrentAsBefore);
  el.compareFileInput?.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) addBeforeFromFile(f); });
  el.compareSwapBtn?.addEventListener('click', swapBeforeAfter);
  el.compareRemoveBtn?.addEventListener('click', removeBefore);
  el.compareExportHtmlBtn?.addEventListener('click', () =>
    import('./compare-export.js').then((m) => m.exportCompareHTML()));

  if (el.compareEnabled) el.compareEnabled.addEventListener('change', (e) => {
    if (e.target.checked && !state.compare.beforeSrc) {
      e.target.checked = false;
      pickBeforeImage();
      return;
    }
    saveStateToHistory();
    state.compare.enabled = e.target.checked;
    refreshCompareUI();
    refreshMotion();
    render();
  });

  live(el.compareSplit, (i) => { state.compare.split = (+i.value) / 100; },
    { label: el.compareSplitValue, fmt: (v) => v + '%' });
  once(el.compareOrientation, (i) => { state.compare.orientation = i.value === 'horizontal' ? 'horizontal' : 'vertical'; });
  once(el.compareFit, (i) => { state.compare.fit = i.value === 'contain' ? 'contain' : 'cover'; });
  once(el.compareLabelsEnabled, (i) => { state.compare.labels = { ...state.compare.labels, enabled: i.checked }; });
  live(el.compareLabelBefore, (i) => { state.compare.labels = { ...state.compare.labels, before: i.value.slice(0, 40) }; });
  live(el.compareLabelAfter, (i) => { state.compare.labels = { ...state.compare.labels, after: i.value.slice(0, 40) }; });
  once(el.compareLabelPosition, (i) => { state.compare.labels = { ...state.compare.labels, position: i.value === 'bottom' ? 'bottom' : 'top' }; });
  live(el.compareDividerColor, (i) => {
    state.compare.divider = { ...state.compare.divider, color: i.value };
    if (el.compareDividerColorText) el.compareDividerColorText.value = i.value;
  });
  if (el.compareDividerColorText) el.compareDividerColorText.addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(v)) { e.target.value = state.compare.divider.color; return; }
    saveStateToHistory();
    state.compare.divider = { ...state.compare.divider, color: v };
    refreshCompareUI();
    render();
  });
  live(el.compareDividerWidth, (i) => { state.compare.divider = { ...state.compare.divider, width: +i.value }; },
    { label: el.compareDividerWidthValue, fmt: (v) => v + 'px' });
  once(el.compareHandle, (i) => { state.compare.divider = { ...state.compare.divider, handle: i.checked }; });
  once(el.compareWipe, (i) => {
    state.compare.wipe = i.checked;
    if (i.checked) showNotification('Wipe added to Motion Studio (Export tab). Press play there to preview it.', 'success');
  });
}

// --- On-canvas divider drag -------------------------------------------------

// The divider maps onto lastImageRect only when the screenshot is drawn as a
// plain rectangle: the flat path or a 2D device screen, unrotated, unflipped,
// with no Ken Burns crop. 3D and surface mockups warp it, so drag is off there.
function dragRect() {
  if (!compareActive() || state.mode !== 'single' || state.tool !== 'select') return null;
  if (timelineEngaged() && state.compare.wipe) return null;
  if (state.mockup3d?.enabled && isDeviceMockup3d(state.mockup3d.device)) return null;
  if (state.surface?.enabled && isSurfaceMockup(state.surface.type)) return null;
  if (state.autoLayout && state.autoLayout.pattern !== 'free') return null;
  const t = state.imageTransform || {};
  if ((t.rotation || 0) !== 0 || t.flipH || t.flipV) return null;
  if (state.kenBurns && state.kenBurns.enabled) return null;
  return state.lastImageRect || null;
}

function tolerance(canvas) {
  const r = canvas.getBoundingClientRect();
  return r.width ? HIT_PX * (canvas.width / r.width) : HIT_PX;
}

function bindDividerDrag() {
  const canvas = el.previewCanvas;
  if (!canvas) return;
  let drag = null;   // { id, rect }

  // Window capture runs before canvas-tools' own pointerdown, so grabbing the
  // divider never starts a marquee or selects an annotation underneath it.
  window.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas || e.button !== 0) return;
    const rect = dragRect();
    if (!rect) return;
    const { x, y } = getCanvasCoords(e, canvas);
    if (!hitDivider(rect, state.compare.split, state.compare.orientation, x, y, tolerance(canvas))) return;
    e.stopPropagation();
    e.preventDefault();
    saveStateToHistory();
    drag = { id: e.pointerId, rect };
    gesture.canvasBusy = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      if (e.pointerId !== drag.id) return;
      const { x, y } = getCanvasCoords(e, canvas);
      state.compare.split = splitFromPoint(drag.rect, x, y, state.compare.orientation);
      render();
      const pct = Math.round(state.compare.split * 100);
      if (el.compareSplit) el.compareSplit.value = pct;
      if (el.compareSplitValue) el.compareSplitValue.textContent = pct + '%';
      return;
    }
    // Hover hint. Registered after canvas-tools, so it wins over its cursor.
    const rect = dragRect();
    if (!rect || e.buttons) return;
    const { x, y } = getCanvasCoords(e, canvas);
    if (hitDivider(rect, state.compare.split, state.compare.orientation, x, y, tolerance(canvas))) {
      canvas.style.cursor = state.compare.orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
    }
  });

  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    try { canvas.releasePointerCapture(drag.id); } catch (_) {}
    drag = null;
    gesture.canvasBusy = false;
    refreshCompareUI();
    render();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
}

export function bindCompare() {
  setCompareImageListener(() => render());
  bindSidebar();
  bindDividerDrag();
  // Undo/redo restore state without touching the sidebar; sync after the
  // caller's mutation (history emits on save too, before the mutation).
  onHistoryChange(() => queueMicrotask(() => { refreshCompareUI(); }));
  if (state.compare.beforeSrc) ensureCompareImage(state.compare.beforeSrc);
  refreshCompareUI();
}
