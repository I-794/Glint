// v10 — Brand Kit.
//
// A Brand Kit is a saved bundle of brand identity that applies across the
// editor in one click: background (gradient or mesh), heading font, a logo
// watermark, a text watermark, the device colorway, and the App Store caption
// colors. Kits live in localStorage (so they persist + travel with the user)
// keyed by name.
//
// Two apply targets share the same kit:
//   • Apply to Design — restores the look onto the normal single-image editor.
//   • Apply to Set     — pushes the look + caption colors onto the App Store
//                        set so every panel adopts the brand at once.
//
// The decoded logo Image lives in `brandAssets.logoImage` (state holds only the
// dataUrl); overlays.js draws it. We re-render once the image decodes.

import { state, brandAssets } from '../state/state.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { saveStateToHistory } from '../state/history.js';
import { syncFromGradientState } from './gradient-editor.js';

const KEY = 'glint_brandkits';
const MAX_LOGO = 1.5 * 1024 * 1024; // 1.5MB cap on the stored logo dataUrl

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function saveAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
  catch (e) { showNotification('Could not save brand kit (storage full).', 'error'); return false; }
}

// ---- helpers --------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

// The brand swatches shown for a kit: the colors that define its background.
function kitColors(kit) {
  if (!kit) return [];
  if (kit.bgMode === 'mesh' && kit.meshGradient) {
    return kit.meshGradient.points.map((p) => p.color);
  }
  if (kit.gradient) return kit.gradient.colors.slice();
  if (kit.bgColor) return [kit.bgColor];
  return [];
}

// Build a kit object from the current design state.
function captureKit() {
  return {
    bgMode: state.bgMode,
    gradient: clone(state.gradient),
    meshGradient: clone(state.meshGradient),
    bgColor: state.bgColor,
    font: state.textOverlay.font,
    watermark: clone(state.watermark),
    logo: clone(state.logo),
    deviceColor: state.deviceFrame.color,
    caption: {
      font: state.screenshotSet.shared.font,
      headlineColor: state.screenshotSet.shared.headlineColor,
      subheadColor: state.screenshotSet.shared.subheadColor
    }
  };
}

// Decode state.logo.src into brandAssets.logoImage, re-rendering on load.
export function loadLogoImage() {
  brandAssets.logoImage = null;
  if (!state.logo.src) { render(); return; }
  const img = new Image();
  img.onload = () => { brandAssets.logoImage = img; render(); };
  img.onerror = () => { brandAssets.logoImage = null; };
  img.src = state.logo.src;
}

// Shared application of the visual identity (background + logo + device color).
function applyVisuals(kit) {
  if (kit.bgMode) state.bgMode = kit.bgMode;
  if (kit.gradient) state.gradient = clone(kit.gradient);
  if (kit.meshGradient) state.meshGradient = clone(kit.meshGradient);
  if (kit.bgColor) state.bgColor = kit.bgColor;
  if (kit.deviceColor) {
    state.deviceFrame.color = kit.deviceColor;
    const dc = $('device-frame-color');
    if (dc) dc.value = kit.deviceColor;
  }
  if (kit.logo) {
    state.logo = {
      enabled: !!kit.logo.enabled && !!kit.logo.src,
      src: kit.logo.src || null,
      position: kit.logo.position || 'bottom-right',
      scale: kit.logo.scale ?? 0.12,
      opacity: kit.logo.opacity ?? 90
    };
    loadLogoImage();
    syncLogoUI();
  }
}

// ---- actions --------------------------------------------------------------

function saveKit() {
  const input = $('brand-name');
  const name = (input?.value || '').trim();
  if (!name) { showNotification('Enter a brand kit name first.', 'error'); return; }
  const all = loadAll();
  all[name] = captureKit();
  if (!saveAll(all)) return;
  if (input) input.value = '';
  refreshList(name);
  showNotification(`Saved brand kit "${name}"`, 'success');
}

function selectedKit() {
  const sel = $('brand-list');
  const name = sel?.value || '';
  if (!name) return null;
  return loadAll()[name] || null;
}

function applyToDesign() {
  const kit = selectedKit();
  if (!kit) { showNotification('Select a brand kit first.', 'error'); return; }
  applyKitObject(kit);
  showNotification('Brand kit applied to design.', 'success');
}

// Apply an arbitrary kit object (not just the selected one) to the design.
// Used by the community gallery (v11.3) to apply a brand-kit it loaded.
export function applyKitObject(kit) {
  if (!kit) return;
  saveStateToHistory();
  applyVisuals(kit);
  if (kit.font) state.textOverlay.font = kit.font;
  if (kit.watermark) state.watermark = clone(kit.watermark);
  syncFromGradientState();
  render();
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
}

// Serialize the current design's identity as a brand-kit payload (for the
// gallery's "publish brand kit"). Mirrors the internal captureKit().
export function captureKitObject() {
  return captureKit();
}

function applyToSet() {
  const kit = selectedKit();
  if (!kit) { showNotification('Select a brand kit first.', 'error'); return; }
  saveStateToHistory();
  applyVisuals(kit);
  const sh = state.screenshotSet.shared;
  const capFont = kit.caption?.font || kit.font;
  if (capFont) sh.font = capFont;
  if (kit.caption?.headlineColor) sh.headlineColor = kit.caption.headlineColor;
  if (kit.caption?.subheadColor) sh.subheadColor = kit.caption.subheadColor;
  // Reflect the caption colors in the Set section's controls if present.
  const hc = $('set-headline-color'); if (hc) hc.value = sh.headlineColor;
  const sc = $('set-subhead-color');  if (sc) sc.value = sh.subheadColor;
  syncFromGradientState();
  render();
  if (typeof window.__refreshSetUi === 'function') window.__refreshSetUi();
  showNotification('Brand kit applied to App Store set.', 'success');
}

function deleteKit() {
  const sel = $('brand-list');
  const name = sel?.value || '';
  if (!name) { showNotification('Select a brand kit to delete.', 'error'); return; }
  if (!confirm(`Delete brand kit "${name}"?`)) return;
  const all = loadAll();
  delete all[name];
  saveAll(all);
  refreshList('');
  showNotification(`Deleted "${name}"`, 'success');
}

// ---- logo upload + live controls ------------------------------------------

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function handleLogoFile(file) {
  if (!file.type.startsWith('image/')) { showNotification('Logo must be an image.', 'error'); return; }
  const dataUrl = await fileToDataUrl(file);
  if (dataUrl.length > MAX_LOGO) {
    showNotification('Logo too large (max ~1.5MB). Use a smaller PNG/SVG.', 'error');
    return;
  }
  state.logo.src = dataUrl;
  state.logo.enabled = true;
  loadLogoImage();
  syncLogoUI();
  showNotification('Brand logo added.', 'success');
}

function clearLogo() {
  state.logo.src = null;
  state.logo.enabled = false;
  brandAssets.logoImage = null;
  syncLogoUI();
  render();
}

// Push state.logo into the logo controls (after upload / kit apply).
function syncLogoUI() {
  const en = $('brand-logo-enabled');
  if (en) en.checked = !!state.logo.enabled;
  const ctrls = $('brand-logo-controls');
  if (ctrls) ctrls.style.display = state.logo.enabled ? 'block' : 'none';
  const pos = $('brand-logo-position'); if (pos) pos.value = state.logo.position;
  const scale = $('brand-logo-scale');
  if (scale) {
    scale.value = Math.round(state.logo.scale * 100);
    const v = $('brand-logo-scale-value'); if (v) v.textContent = `${scale.value}%`;
  }
  const op = $('brand-logo-opacity');
  if (op) {
    op.value = state.logo.opacity;
    const v = $('brand-logo-opacity-value'); if (v) v.textContent = `${op.value}%`;
  }
}

// ---- list rendering -------------------------------------------------------

function refreshList(selectName) {
  const sel = $('brand-list');
  const all = loadAll();
  const names = Object.keys(all);
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Brand Kit --</option>' +
      names.map((n) => `<option value="${n}"${n === selectName ? ' selected' : ''}>${n}</option>`).join('');
  }
  const info = $('brand-info');
  if (info) info.textContent = names.length ? `${names.length} brand kit${names.length === 1 ? '' : 's'} saved` : 'No brand kits saved';
  renderSwatches();
}

function renderSwatches() {
  const box = $('brand-swatches');
  if (!box) return;
  const kit = selectedKit();
  const colors = kitColors(kit);
  box.innerHTML = colors.length
    ? colors.map((c) => `<div class="palette-swatch" style="background:${c};" title="${c}"></div>`).join('')
    : '';
}

// ---- bind -----------------------------------------------------------------

export function bindBrandKit() {
  $('brand-save-btn')?.addEventListener('click', saveKit);
  $('brand-apply-design')?.addEventListener('click', applyToDesign);
  $('brand-apply-set')?.addEventListener('click', applyToSet);
  $('brand-delete-btn')?.addEventListener('click', deleteKit);
  $('brand-list')?.addEventListener('change', renderSwatches);

  // Logo upload
  const logoInput = $('brand-logo-input');
  $('brand-logo-btn')?.addEventListener('click', () => logoInput?.click());
  logoInput?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleLogoFile(f);
    logoInput.value = '';
  });
  $('brand-logo-clear')?.addEventListener('click', clearLogo);

  // Logo live controls
  $('brand-logo-enabled')?.addEventListener('change', (e) => {
    state.logo.enabled = e.target.checked;
    const ctrls = $('brand-logo-controls');
    if (ctrls) ctrls.style.display = state.logo.enabled ? 'block' : 'none';
    render();
  });
  $('brand-logo-position')?.addEventListener('change', (e) => { state.logo.position = e.target.value; render(); });
  $('brand-logo-scale')?.addEventListener('input', (e) => {
    state.logo.scale = (+e.target.value) / 100;
    const v = $('brand-logo-scale-value'); if (v) v.textContent = `${e.target.value}%`;
    render();
  });
  $('brand-logo-opacity')?.addEventListener('input', (e) => {
    state.logo.opacity = +e.target.value;
    const v = $('brand-logo-opacity-value'); if (v) v.textContent = `${e.target.value}%`;
    render();
  });

  refreshList('');
}
