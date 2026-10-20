// v37 — Crop & Straighten, now non-destructive. The tool edits state.imageCrop
// (render/crop-core.js) instead of cutting pixels out of the image: the
// original stays behind the cropped picture, so a crop can be undone, reopened
// and changed, saved with the project, and set per shot in the Roll. While the
// tool is open the canvas shows the whole original (cropRuntime.editing).

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification, showUndoToast } from '../ui/notification.js';
import { normalizeCrop, cropSource, cropRuntime } from '../render/crop-core.js';
import { syncCroppedImage, rotatedPreview } from '../render/crop-image.js';

let active = false;
let region = { x: 0, y: 0, w: 1, h: 1 }; // fractions of the original image
let rotation = 0; // -45..45 degrees
let aspect = 'free';
let drag = null;
let overlay = null;
let regionEl = null;
let source = null;      // the uncropped original
let savedCrop = null;   // imageCrop when the tool opened (for Cancel)

const ASPECTS = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  'twitter': 1200 / 675,
  'instagram': 1,
  'linkedin': 1200 / 627
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function sourceRatio() {
  const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
  return w / h;
}

function applyAspect() {
  const a = ASPECTS[aspect];
  if (!a || !source) return;
  const ir = sourceRatio();
  // Keep the top-left corner, recompute the height from the width.
  let w = region.w;
  let h = (w * ir) / a;
  if (h > 1) { h = 1; w = (h * a) / ir; }
  region.w = clamp(w, 0.05, 1);
  region.h = clamp(h, 0.05, 1);
  region.x = clamp(region.x, 0, 1 - region.w);
  region.y = clamp(region.y, 0, 1 - region.h);
}

function imageDisplayedRect() {
  // The preview-canvas DOM rect represents the full state.canvas. The image is
  // drawn at state.lastImageRect (canvas pixel coords); convert to DOM pixels.
  const canvas = el.previewCanvas;
  if (!canvas || !state.lastImageRect) return null;
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / canvas.width;
  const sy = rect.height / canvas.height;
  const r = state.lastImageRect;
  return { left: rect.left + r.x * sx, top: rect.top + r.y * sy, width: r.w * sx, height: r.h * sy };
}

function syncDom() {
  if (!regionEl) return;
  const rect = imageDisplayedRect();
  if (!rect) return;
  const viewport = el.canvasViewport.getBoundingClientRect();
  regionEl.style.left = (rect.left - viewport.left + region.x * rect.width) + 'px';
  regionEl.style.top = (rect.top - viewport.top + region.y * rect.height) + 'px';
  regionEl.style.width = (region.w * rect.width) + 'px';
  regionEl.style.height = (region.h * rect.height) + 'px';
}

// ---- pointer drag (mouse, pen and touch share one path) ---------------------------

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.classList.contains('crop-handle')) {
    drag = { type: 'resize', corner: e.target.dataset.corner, startX: e.clientX, startY: e.clientY, init: { ...region } };
  } else if (e.target === regionEl) {
    drag = { type: 'move', startX: e.clientX, startY: e.clientY, init: { ...region } };
  } else return;
  regionEl.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  e.stopPropagation();
}

function onPointerMove(e) {
  if (!drag) return;
  const rect = imageDisplayedRect();
  if (!rect) return;
  const dxF = (e.clientX - drag.startX) / rect.width;
  const dyF = (e.clientY - drag.startY) / rect.height;
  if (drag.type === 'move') {
    region.x = clamp(drag.init.x + dxF, 0, 1 - drag.init.w);
    region.y = clamp(drag.init.y + dyF, 0, 1 - drag.init.h);
  } else {
    let { x, y, w, h } = drag.init;
    if (drag.corner.includes('w')) { const nx = clamp(x + dxF, 0, x + w - 0.05); w -= (nx - x); x = nx; }
    if (drag.corner.includes('e')) { w = clamp(w + dxF, 0.05, 1 - x); }
    if (drag.corner.includes('n')) { const ny = clamp(y + dyF, 0, y + h - 0.05); h -= (ny - y); y = ny; }
    if (drag.corner.includes('s')) { h = clamp(h + dyF, 0.05, 1 - y); }
    region = { x, y, w, h };
    if (ASPECTS[aspect]) applyAspect();
  }
  syncDom();
}

function onPointerUp() { drag = null; }

function onKey(e) {
  if (!active) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Escape') return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelCrop(); }
  else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitCrop(); }
}

// ---- overlay ------------------------------------------------------------------------

function buildOverlay() {
  overlay = document.createElement('div');
  overlay.className = 'crop-overlay';
  regionEl = document.createElement('div');
  regionEl.className = 'crop-region';
  ['nw', 'ne', 'sw', 'se'].forEach((c) => {
    const h = document.createElement('div');
    h.className = 'crop-handle ' + c;
    h.dataset.corner = c;
    regionEl.appendChild(h);
  });
  const tb = document.createElement('div');
  tb.className = 'crop-toolbar';
  tb.innerHTML = `
    <select id="crop-aspect" aria-label="Aspect ratio">
      <option value="free">Free</option>
      <option value="1:1">1:1</option>
      <option value="4:3">4:3</option>
      <option value="16:9">16:9</option>
      <option value="9:16">9:16</option>
      <option value="twitter">Twitter</option>
      <option value="instagram">Instagram</option>
      <option value="linkedin">LinkedIn</option>
    </select>
    <label class="crop-rot-label" for="crop-rot">Straighten <span id="crop-rot-val">${rotation.toFixed(1)}°</span></label>
    <input type="range" id="crop-rot" min="-45" max="45" step="0.5" value="${rotation}">
    <button class="btn btn-secondary" id="crop-reset-btn">Reset</button>
    <button class="btn btn-secondary" id="crop-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="crop-apply-btn">Apply</button>
  `;
  overlay.appendChild(regionEl);
  overlay.appendChild(tb);
  el.canvasViewport.appendChild(overlay);

  regionEl.addEventListener('pointerdown', onPointerDown);
  regionEl.addEventListener('pointermove', onPointerMove);
  regionEl.addEventListener('pointerup', onPointerUp);
  regionEl.addEventListener('pointercancel', onPointerUp);

  tb.querySelector('#crop-aspect').addEventListener('change', (e) => {
    aspect = e.target.value;
    applyAspect();
    syncDom();
  });
  const rot = tb.querySelector('#crop-rot');
  const rotVal = tb.querySelector('#crop-rot-val');
  rot.addEventListener('input', (e) => {
    rotation = parseFloat(e.target.value) || 0;
    rotVal.textContent = rotation.toFixed(1) + '°';
    showPreview();
  });
  tb.querySelector('#crop-reset-btn').addEventListener('click', () => {
    region = { x: 0, y: 0, w: 1, h: 1 };
    rotation = 0;
    aspect = 'free';
    tb.querySelector('#crop-aspect').value = 'free';
    rot.value = '0';
    rotVal.textContent = '0.0°';
    showPreview();
    syncDom();
  });
  tb.querySelector('#crop-apply-btn').addEventListener('click', commitCrop);
  tb.querySelector('#crop-cancel-btn').addEventListener('click', cancelCrop);
}

// Show the whole original, straightened by the current angle.
function showPreview() {
  state.image = rotatedPreview(source, rotation);
  render();
  syncDom();
}

function teardown() {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  regionEl = null;
  drag = null;
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', syncDom);
  active = false;
  cropRuntime.editing = false;
  source = null;
}

function finish(crop) {
  const src = source;
  teardown();
  state.image = src;
  state.imageCrop = crop;
  syncCroppedImage();
  render();
  window.__updateUIFromState?.();
}

function commitCrop() {
  if (!active || !source) { teardown(); return; }
  const crop = normalizeCrop({ ...region, angle: rotation });
  // Snapshot with the crop as it was when the tool opened.
  state.imageCrop = savedCrop;
  saveStateToHistory();
  finish(crop);
  showNotification(crop ? 'Cropped. Open Crop again to change it.' : 'Crop removed.', 'success');
}

function cancelCrop() {
  if (!active) return;
  finish(savedCrop);
}

export function startCrop() {
  if (active) return;
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  if (state.mode !== 'single') { showNotification('Crop works in Single mode.', 'error'); return; }
  source = cropSource(state.image);
  savedCrop = normalizeCrop(state.imageCrop);
  const c = savedCrop || { x: 0, y: 0, w: 1, h: 1, angle: 0 };
  region = { x: c.x, y: c.y, w: c.w, h: c.h };
  rotation = c.angle || 0;
  aspect = 'free';
  active = true;
  cropRuntime.editing = true;
  buildOverlay();
  showPreview();
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', syncDom);
}

// Back to the whole original (one undo step).
export function removeCrop() {
  if (!state.imageCrop) return;
  saveStateToHistory();
  state.imageCrop = null;
  syncCroppedImage();
  render();
  showUndoToast('Crop removed', render);
}

export function bindCrop() {
  const btn = document.getElementById('crop-btn');
  if (btn) btn.addEventListener('click', startCrop);
  window.__startCrop = startCrop;
  window.__removeCrop = removeCrop;
}
