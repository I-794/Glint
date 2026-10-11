import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';

let active = false;
let region = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }; // fractions of image natural size
let rotation = 0; // -45..+45 degrees applied on commit
let aspect = 'free';
let drag = null;
let overlay = null;
let regionEl = null;

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

function applyAspect() {
  const a = ASPECTS[aspect];
  if (!a || !state.image) return;
  const ir = state.image.naturalWidth / state.image.naturalHeight;
  // Keep top-left, recompute h from w
  let w = region.w;
  let h = (w * ir) / a;
  if (h > 1) { h = 1; w = (h * a) / ir; }
  region.w = clamp(w, 0.05, 1);
  region.h = clamp(h, 0.05, 1);
  region.x = clamp(region.x, 0, 1 - region.w);
  region.y = clamp(region.y, 0, 1 - region.h);
}

function imageDisplayedRect() {
  // The preview-canvas DOM rect represents the full state.canvas. The actual image
  // is drawn at state.lastImageRect (canvas pixel coords). We need DOM pixel coords.
  const canvas = el.previewCanvas;
  if (!canvas || !state.lastImageRect) return null;
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / canvas.width;
  const sy = rect.height / canvas.height;
  const r = state.lastImageRect;
  return {
    left: rect.left + r.x * sx,
    top: rect.top + r.y * sy,
    width: r.w * sx,
    height: r.h * sy
  };
}

function syncDom() {
  if (!regionEl) return;
  const rect = imageDisplayedRect();
  if (!rect) return;
  const viewport = el.canvasViewport.getBoundingClientRect();
  const left = rect.left - viewport.left + region.x * rect.width;
  const top = rect.top - viewport.top + region.y * rect.height;
  const w = region.w * rect.width;
  const h = region.h * rect.height;
  regionEl.style.left = left + 'px';
  regionEl.style.top = top + 'px';
  regionEl.style.width = w + 'px';
  regionEl.style.height = h + 'px';
}

function onMouseDown(e) {
  if (e.target.classList.contains('crop-handle')) {
    drag = { type: 'resize', corner: e.target.dataset.corner, startX: e.clientX, startY: e.clientY, init: { ...region } };
  } else if (e.target === regionEl) {
    drag = { type: 'move', startX: e.clientX, startY: e.clientY, init: { ...region } };
  }
  e.preventDefault();
  e.stopPropagation();
}

function onMouseMove(e) {
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

function onMouseUp() {
  drag = null;
}

function buildOverlay() {
  const viewport = el.canvasViewport;
  overlay = document.createElement('div');
  overlay.className = 'crop-overlay';
  regionEl = document.createElement('div');
  regionEl.className = 'crop-region';
  ['nw', 'ne', 'sw', 'se'].forEach(c => {
    const h = document.createElement('div');
    h.className = 'crop-handle ' + c;
    h.dataset.corner = c;
    regionEl.appendChild(h);
  });
  const tb = document.createElement('div');
  tb.className = 'crop-toolbar';
  tb.innerHTML = `
    <select id="crop-aspect">
      <option value="free">Free</option>
      <option value="1:1">1:1</option>
      <option value="4:3">4:3</option>
      <option value="16:9">16:9</option>
      <option value="9:16">9:16</option>
      <option value="twitter">Twitter</option>
      <option value="instagram">Instagram</option>
      <option value="linkedin">LinkedIn</option>
    </select>
    <label style="font-size:12px;">Rotate <span id="crop-rot-val">0°</span></label>
    <input type="range" id="crop-rot" min="-45" max="45" step="0.5" value="0" style="width:120px;">
    <button class="btn btn-primary" id="crop-apply-btn" style="padding:6px 14px;">Apply</button>
    <button class="btn btn-secondary" id="crop-cancel-btn" style="padding:6px 14px;">Cancel</button>
  `;
  regionEl.appendChild(tb);
  overlay.appendChild(regionEl);
  viewport.appendChild(overlay);

  regionEl.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  document.getElementById('crop-aspect').addEventListener('change', (e) => {
    aspect = e.target.value;
    applyAspect();
    syncDom();
  });
  const rot = document.getElementById('crop-rot');
  const rotVal = document.getElementById('crop-rot-val');
  rot.addEventListener('input', (e) => {
    rotation = parseFloat(e.target.value);
    rotVal.textContent = rotation.toFixed(1) + '°';
  });
  document.getElementById('crop-apply-btn').addEventListener('click', commitCrop);
  document.getElementById('crop-cancel-btn').addEventListener('click', cancelCrop);
}

function teardown() {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  regionEl = null;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('resize', syncDom);
  active = false;
}

function commitCrop() {
  if (!state.image) { teardown(); return; }
  const img = state.image;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const cropX = region.x * iw;
  const cropY = region.y * ih;
  const cropW = region.w * iw;
  const cropH = region.h * ih;

  // Output canvas: rotate first via offscreen, then crop.
  const rad = rotation * Math.PI / 180;
  const out = document.createElement('canvas');
  out.width = Math.round(cropW);
  out.height = Math.round(cropH);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  if (Math.abs(rotation) < 0.01) {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  } else {
    // Rotate the source image around the center of the crop region, then draw.
    ctx.translate(cropW / 2, cropH / 2);
    ctx.rotate(rad);
    ctx.translate(-(cropX + cropW / 2), -(cropY + cropH / 2));
    ctx.drawImage(img, 0, 0);
  }

  saveStateToHistory();
  const newImg = new Image();
  newImg.onload = () => {
    state.image = newImg;
    render();
    window.__updateUIFromState?.();
  };
  newImg.src = out.toDataURL('image/png');
  showNotification('Cropped.', 'success');
  teardown();
}

function cancelCrop() {
  teardown();
}

export function startCrop() {
  if (active) return;
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  if (!state.lastImageRect) { render(); }
  active = true;
  region = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  rotation = 0;
  aspect = 'free';
  buildOverlay();
  syncDom();
  window.addEventListener('resize', syncDom);
}

export function bindCrop() {
  const btn = document.getElementById('crop-btn');
  if (btn) btn.addEventListener('click', startCrop);
}
