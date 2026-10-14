import { state, imageRegistry } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { withLayer } from '../render/blend.js';
import { applyEntrance } from './animation.js';
import { captureAsset } from './asset-library.js';
import { selectOnly, clearSelection } from './selection.js';

const ACCENT = '#f2a93b';

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Clean, modern selection: a thin accent outline + small square corner handles,
// sized relative to the canvas so they stay visible when the canvas is scaled
// down to fit. Replaces the old bright cyan dashed box.
function drawSelectionChrome(ctx, x, y, w, h, radius, cw) {
  const lw = Math.max(2, cw * 0.0018);
  const hs = Math.max(10, cw * 0.011);
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = lw;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([px, py]) => {
    ctx.beginPath();
    ctx.rect(px - hs / 2, py - hs / 2, hs, hs);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();
  });
  ctx.restore();
}

export function renderExtraImages(ctx, canvas) {
  state.extraImages.forEach(ei => {
    if (ei.visible === false) return;
    const img = imageRegistry[ei.id];
    if (!img) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.width * ei.scaleFrac;
    const ih = img.height * ei.scaleFrac;
    const tx = cw * ei.xFrac - iw / 2;
    const ty = ch * ei.yFrac - ih / 2;
    const radius = Math.max(4, Math.min(iw, ih) * 0.05);

    // v15.2 — per-element entrance, about the image's center. Wraps the draw
    // (not the selection chrome, which must stay legible/untransformed).
    const entered = applyEntrance(ctx, 'L:extra:' + ei.id, cw * ei.xFrac, ch * ei.yFrac);
    // v15.0 — blend mode + opacity for this image layer. Wraps the shadow + the
    // image itself; the selection chrome below stays at full strength so it's
    // always legible regardless of the layer's opacity.
    withLayer(ctx, ei, () => {
      // Soft drop shadow so the image sits on the stage instead of looking pasted.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.38)';
      ctx.shadowBlur = Math.max(12, iw * 0.045);
      ctx.shadowOffsetY = Math.max(4, ih * 0.025);
      roundRectPath(ctx, tx, ty, iw, ih, radius);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();

      // Rounded-corner image (matches the main screenshot's framing).
      ctx.save();
      roundRectPath(ctx, tx, ty, iw, ih, radius);
      ctx.clip();
      ctx.drawImage(img, tx, ty, iw, ih);
      ctx.restore();
    });
    if (entered) ctx.restore();

    if (state.selectedExtraImage === ei.id ||
        state.canvasSelection.some((s) => s.kind === 'extraImage' && s.id === ei.id)) {
      drawSelectionChrome(ctx, tx, ty, iw, ih, radius, cw);
    }
  });
}

export function hitTestExtraImageAtPoint(x, y, canvas) {
  const cw = canvas.width;
  const ch = canvas.height;
  for (let i = state.extraImages.length - 1; i >= 0; i--) {
    const ei = state.extraImages[i];
    if (ei.visible === false || ei.locked) continue;   // v33 — hidden/locked aren't pickable
    const img = imageRegistry[ei.id];
    if (!img) continue;
    const iw = img.width * ei.scaleFrac;
    const ih = img.height * ei.scaleFrac;
    const tx = cw * ei.xFrac - iw / 2;
    const ty = ch * ei.yFrac - ih / 2;
    if (x >= tx && x <= tx + iw && y >= ty && y <= ty + ih) return i;
  }
  return -1;
}

// v28 — add an extra image layer from any source (dataURL / object URL). Shared
// by the file upload path and the reusable asset library ("add as layer").
export function addExtraImageFromSrc(src) {
  const img = new Image();
  img.onload = () => {
    const id = 'extra_' + Date.now();
    imageRegistry[id] = img;
    const maxSize = Math.min(el.previewCanvas.width, el.previewCanvas.height) * 0.4;
    const scaleFrac = Math.min(1.0, maxSize / Math.max(img.width, img.height));
    state.extraImages.push({ id, xFrac: 0.5, yFrac: 0.5, scaleFrac });
    saveStateToHistory();
    render();
    updateExtraImagesList();
    showNotification('Image added!', 'success');
  };
  img.src = src;
}

export function loadExtraImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    addExtraImageFromSrc(e.target.result);
    captureAsset(e.target.result, file && file.name);   // v28 — remember for re-use
  };
  reader.readAsDataURL(file);
}

export function updateExtraImagesList() {
  const list = el.extraImagesList;
  if (!list) return;
  list.innerHTML = '';
  if (state.extraImages.length === 0) return;
  state.extraImages.forEach((ei, idx) => {
    const img = imageRegistry[ei.id];
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px;background:var(--bg-tertiary);border-radius:6px;border:1px solid var(--border-color);cursor:pointer;';
    item.addEventListener('click', () => {
      selectOnly({ kind: 'extraImage', id: ei.id });   // v28 — keep canvasSelection in sync
      render();
    });
    if (img) {
      const thumb = document.createElement('canvas');
      thumb.width = 40; thumb.height = 40;
      const tc = thumb.getContext('2d');
      const s = Math.min(40 / img.width, 40 / img.height);
      const tw = img.width * s, th = img.height * s;
      tc.drawImage(img, (40 - tw) / 2, (40 - th) / 2, tw, th);
      thumb.style.cssText = 'border-radius:4px;flex-shrink:0;';
      item.appendChild(thumb);
    }
    const label = document.createElement('span');
    label.textContent = `Image ${idx + 1}`;
    label.style.cssText = 'flex:1;font-size:13px;color:var(--text-primary);';
    item.appendChild(label);
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.className = 'btn btn-secondary';
    removeBtn.style.cssText = 'padding:4px 8px;font-size:12px;flex-shrink:0;';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveStateToHistory();
      state.extraImages.splice(idx, 1);
      if (state.selectedExtraImage === ei.id) clearSelection();   // v28
      render();
      updateExtraImagesList();
    });
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

export function bindExtraImagesEvents() {
  if (el.addImageBtn) el.addImageBtn.addEventListener('click', () => el.extraFileInput.click());
  if (el.extraFileInput) el.extraFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      loadExtraImage(file);
      el.extraFileInput.value = '';
    }
  });
}
