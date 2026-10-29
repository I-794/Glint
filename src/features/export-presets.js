// v28 — Studio Quality-of-Life: export presets.
//
// One-click export at a saved format + quality + pixel scale. Presets are global
// (cross-project, in localStorage) and independent of the per-project
// state.exportSettings. The "scale" multiplier re-exports the composed canvas at
// N× resolution via an offscreen upscale, so a 2× retina or 3× print export is a
// single click. (Fixed pixel-dimension targets like 1080×1080 are intentionally
// out of scope — the canvas layout owns its own aspect ratio.)

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { askText } from '../ui/dialog.js';

const LS_KEY = 'glint_export_presets';
const LAST_KEY = 'glint_last_export_preset';   // v33 — quick export

const BUILTINS = [
  { id: 'png-1x',  name: 'PNG · 1×',           format: 'png',  quality: 100, scale: 1 },
  { id: 'png-2x',  name: 'PNG · 2× (Retina)',  format: 'png',  quality: 100, scale: 2 },
  { id: 'jpg-1x',  name: 'JPEG · 1× (small)',  format: 'jpeg', quality: 85,  scale: 1 },
  { id: 'webp-2x', name: 'WebP · 2×',          format: 'webp', quality: 90,  scale: 2 },
  { id: 'print-3x', name: 'Print · 3×',        format: 'png',  quality: 100, scale: 3 },
];

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) {}
  return BUILTINS.slice();
}

function write(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {}
}

export function listExportPresets() { return read(); }

// v37 — shared encoder (also used by the Roll's Develop): format → mime +
// extension; PNG takes no quality argument. Resolves to { blob, ext }.
export function encodeCanvas(canvas, format, quality) {
  let mime = 'image/png', ext = 'png';
  if (format === 'jpeg') { mime = 'image/jpeg'; ext = 'jpg'; }
  else if (format === 'webp') { mime = 'image/webp'; ext = 'webp'; }
  return new Promise((resolve) => {
    const done = (blob) => resolve({ blob, ext });
    if (mime === 'image/png') canvas.toBlob(done, mime);
    else canvas.toBlob(done, mime, (quality || 92) / 100);
  });
}

// v37 — `canvas` drawn onto a new canvas `scale`× its size (returns `canvas`
// itself at 1×).
export function upscaleCanvas(canvas, scale) {
  if (!scale || scale === 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

// Clean export of the composed canvas at `scale`×, without preview chrome.
function exportScaled(scale, format, quality) {
  if (!state.image) { showNotification('Load an image first!', 'error'); return; }
  // render(true) leaves out all preview chrome (selection, Spotlight handles);
  // not in Set mode, see export.js exportImage. The preview is put back only
  // after encoding, since at 1x upscaleCanvas returns the preview canvas itself.
  const bracket = state.mode !== 'set';
  if (bracket) render(true);

  encodeCanvas(upscaleCanvas(el.previewCanvas, scale), format, quality).finally(() => {
    if (bracket) render();
  }).then(({ blob, ext }) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `screenshot-${Date.now()}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(`Exported ${ext.toUpperCase()} @${scale}×`, 'success');
  });
}

export function applyExportPreset(id) {
  const p = read().find((x) => x.id === id);
  if (!p) return;
  try { localStorage.setItem(LAST_KEY, p.id); } catch (e) {}
  if (el.exportPresetSelect) el.exportPresetSelect.value = p.id;
  // Keep the editor's export settings + UI in sync with the preset.
  state.exportSettings.format = p.format;
  if (p.quality != null) state.exportSettings.quality = p.quality;
  if (el.exportFormat) el.exportFormat.value = p.format;
  exportScaled(p.scale || 1, p.format, p.quality);
}

// v33 — the last preset used (falls back to the first one), for one-key re-export.
export function lastExportPreset() {
  const list = read();
  let id = null;
  try { id = localStorage.getItem(LAST_KEY); } catch (e) {}
  return list.find((x) => x.id === id) || list[0] || null;
}

export function quickExport() {
  const p = lastExportPreset();
  if (p) applyExportPreset(p.id);
}

async function saveCurrentAsPreset(scale) {
  const name = await askText('Name this export preset', { value: `${state.exportSettings.format.toUpperCase()} · ${scale}×` });
  if (!name) return;
  const list = read();
  list.push({
    id: 'p_' + Date.now(),
    name: name.trim(),
    format: state.exportSettings.format === 'gif' ? 'png' : state.exportSettings.format,
    quality: state.exportSettings.quality,
    scale,
  });
  write(list);
  renderUi();
  showNotification('Export preset saved', 'success');
  // Surface the new preset in Cmd-K without a reload.
  if (window.__refreshPaletteCommands) window.__refreshPaletteCommands();
}

function renderUi() {
  const sel = el.exportPresetSelect;
  if (!sel) return;
  const list = read();
  sel.innerHTML = list.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  const last = lastExportPreset();
  if (last) sel.value = last.id;
}

export function bindExportPresets() {
  renderUi();
  if (el.exportPresetApply) {
    el.exportPresetApply.addEventListener('click', () => {
      if (el.exportPresetSelect && el.exportPresetSelect.value) applyExportPreset(el.exportPresetSelect.value);
    });
  }
  if (el.exportPresetSave) {
    el.exportPresetSave.addEventListener('click', () => {
      const scale = el.exportPresetScale ? parseInt(el.exportPresetScale.value, 10) || 1 : 1;
      saveCurrentAsPreset(scale);
    });
  }
}
