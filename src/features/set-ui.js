// v9.0 — App Store Sets sidebar UI.
//
// Owns the Single | Set mode toggle and the dynamic UI for Set mode: the set
// filmstrip + per-panel caption editor. (v37 — the Batch tray moved to the
// Roll, features/roll.js.)
// Bound from main.js (following the mockup-ui.js precedent — keeps the large
// bindings.js untouched). Static controls live in editor/index.html; the
// filmstrip and caption editor are rendered here.

import { state, imageRegistry } from '../state/state.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { fitZoom } from './zoom-pan.js';
import { STORE_PRESETS, STORE_PRESET_ORDER, getStorePreset } from '../state/store-presets.js';
import { exportSet } from './batch-export.js';
import { escapeHTML } from '../utils/dom.js';

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${idCounter++}`;

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, dataUrl: reader.result });
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---- mode toggle ----------------------------------------------------------

// Set mode resizes the canvas to the store preset; remember the single-mode
// canvas so leaving Set restores it rather than stranding a tall canvas.
let savedCanvas = null;

export function setMode(mode) {
  const prev = state.mode;
  // v37 — leaving Single closes an open Roll shot (it borrows the live state).
  if (mode !== 'single') window.__closeRollShot?.();
  // v25 — leaving an active Tour for Set must tear down the hotspot overlay
  // (it covers the whole canvas), or it would strand and intercept every click.
  if (prev === 'tour' && mode !== 'tour' && typeof window.__exitTourMode === 'function') window.__exitTourMode();
  // v32 — leaving the Board for Single/Set must tear down the board surface
  // + toolbar and un-hide #canvas-wrapper (which enterBoardMode hid), or the board
  // cards would strand over a hidden set preview. Mirrors the v25 tour guard.
  if (prev === 'board' && mode !== 'board' && typeof window.__teardownBoardChrome === 'function') window.__teardownBoardChrome();
  if (mode === 'set' && prev !== 'set') savedCanvas = { ...state.canvas };
  state.mode = mode;
  document.querySelectorAll('[data-app-mode]').forEach((b) =>
    b.classList.toggle('active', b.dataset.appMode === mode));
  const setBox = document.getElementById('set-controls');
  if (setBox) setBox.style.display = mode === 'set' ? 'block' : 'none';
  if (mode === 'set') {
    const p = getStorePreset(state.screenshotSet.preset);
    state.canvas = { width: p.w, height: p.h };
    renderFilmstrip();
    renderPanelEditor();
    render();
    fitZoom();
  } else {
    if (prev === 'set' && savedCanvas) { state.canvas = savedCanvas; savedCanvas = null; }
    render();
    fitZoom();
  }
}

// ---- set: filmstrip + panel editor ---------------------------------------

function renderFilmstrip() {
  const strip = document.getElementById('set-filmstrip');
  if (!strip) return;
  const ss = state.screenshotSet;
  strip.innerHTML = ss.panels.map((p, i) => {
    const thumb = (p.imageId && imageRegistry[p.imageId]) ? imageRegistry[p.imageId].src
      : (state.image ? state.image.src : '');
    const label = p.headline ? escapeHTML(p.headline) : `Panel ${i + 1}`;
    return `<div class="set-panel-chip${i === ss.active ? ' active' : ''}" data-panel="${i}" title="${label}">
        <div class="set-panel-thumb">${thumb ? `<img src="${thumb}" alt="">` : '<span>+</span>'}</div>
        <span class="set-panel-num">${i + 1}</span>
      </div>`;
  }).join('');
  strip.querySelectorAll('.set-panel-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.screenshotSet.active = parseInt(chip.dataset.panel, 10);
      renderFilmstrip();
      renderPanelEditor();
      render();
    });
  });
}

function renderPanelEditor() {
  const box = document.getElementById('set-panel-editor');
  if (!box) return;
  const ss = state.screenshotSet;
  const panel = ss.panels[ss.active];
  if (!panel) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="control-group">
      <label class="control-label">Headline</label>
      <input type="text" class="control-input" id="set-headline" value="${escapeHTML(panel.headline || '')}" placeholder="Capture anything">
    </div>
    <div class="control-group">
      <label class="control-label">Subhead</label>
      <input type="text" class="control-input" id="set-subhead" value="${escapeHTML(panel.subhead || '')}" placeholder="One tap and done.">
    </div>
    <div class="control-group">
      <label class="control-label">Caption position</label>
      <select class="control-input" id="set-position">
        <option value="top"${panel.position === 'top' ? ' selected' : ''}>Top</option>
        <option value="bottom"${panel.position === 'bottom' ? ' selected' : ''}>Bottom</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Panel screenshot ${panel.imageId ? '(custom)' : '(using main image)'}</label>
      <input type="file" class="control-input" id="set-panel-image" accept="image/*">
    </div>
    <div style="display:flex;gap:8px;">
      ${panel.imageId ? '<button class="btn btn-secondary" id="set-clear-image" style="flex:1;">Use main image</button>' : ''}
      <button class="btn btn-secondary" id="set-remove-panel" style="flex:1;"${ss.panels.length <= 1 ? ' disabled' : ''}>🗑 Remove panel</button>
    </div>`;

  const head = document.getElementById('set-headline');
  const sub = document.getElementById('set-subhead');
  const pos = document.getElementById('set-position');
  if (head) head.addEventListener('input', () => { panel.headline = head.value; render(); renderFilmstrip(); });
  if (sub) sub.addEventListener('input', () => { panel.subhead = sub.value; render(); });
  if (pos) pos.addEventListener('change', () => { panel.position = pos.value; render(); });

  const imgInput = document.getElementById('set-panel-image');
  if (imgInput) imgInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const { img } = await loadImageFile(file);
      if (!panel.imageId) panel.imageId = nextId('set');
      imageRegistry[panel.imageId] = img;
      render();
      renderFilmstrip();
      renderPanelEditor();
    } catch (err) { showNotification('Could not load image.', 'error'); }
  });

  const clearImg = document.getElementById('set-clear-image');
  if (clearImg) clearImg.addEventListener('click', () => {
    if (panel.imageId) { delete imageRegistry[panel.imageId]; panel.imageId = null; }
    render(); renderFilmstrip(); renderPanelEditor();
  });

  const removeBtn = document.getElementById('set-remove-panel');
  if (removeBtn) removeBtn.addEventListener('click', () => {
    if (ss.panels.length <= 1) return;
    if (panel.imageId) delete imageRegistry[panel.imageId];
    ss.panels.splice(ss.active, 1);
    ss.active = Math.max(0, ss.active - 1);
    renderFilmstrip(); renderPanelEditor(); render();
  });
}

function addPanel() {
  const ss = state.screenshotSet;
  const prev = ss.panels[ss.active] || {};
  ss.panels.push({ imageId: null, headline: '', subhead: '', position: prev.position || 'top' });
  ss.active = ss.panels.length - 1;
  renderFilmstrip();
  renderPanelEditor();
  render();
}

// ---- binding --------------------------------------------------------------

export function bindSetUi() {
  // Mode toggle
  document.querySelectorAll('[data-app-mode]').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.appMode)));

  // Preset select
  const presetSel = document.getElementById('set-preset');
  if (presetSel) {
    presetSel.innerHTML = STORE_PRESET_ORDER.map((id) => {
      const p = STORE_PRESETS[id];
      return `<option value="${id}"${state.screenshotSet.preset === id ? ' selected' : ''}>${p.label} — ${p.w}×${p.h}</option>`;
    }).join('');
    presetSel.addEventListener('change', () => {
      state.screenshotSet.preset = presetSel.value;
      const p = getStorePreset(presetSel.value);
      state.canvas = { width: p.w, height: p.h };
      render();
      fitZoom();
    });
  }

  // Caption color + font shared controls
  const headColor = document.getElementById('set-headline-color');
  if (headColor) headColor.addEventListener('input', () => { state.screenshotSet.shared.headlineColor = headColor.value; render(); });
  const subColor = document.getElementById('set-subhead-color');
  if (subColor) subColor.addEventListener('input', () => { state.screenshotSet.shared.subheadColor = subColor.value; render(); });

  // Locales (v11.2): parse "en, es, de" into state.screenshotSet.locales.
  const localesInput = document.getElementById('set-locales');
  if (localesInput) {
    localesInput.value = (state.screenshotSet.locales || ['en']).join(', ');
    const sync = () => {
      const list = localesInput.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      state.screenshotSet.locales = list.length ? Array.from(new Set(list)) : ['en'];
    };
    localesInput.addEventListener('input', sync);
  }

  const addBtn = document.getElementById('set-add-panel-btn');
  if (addBtn) addBtn.addEventListener('click', addPanel);

  const exportSetBtn = document.getElementById('set-export-btn');
  if (exportSetBtn) exportSetBtn.addEventListener('click', exportSet);

  // Let other modules (e.g. Brand Kit) refresh the set preview + filmstrip.
  window.__refreshSetUi = () => { renderFilmstrip(); renderPanelEditor(); };
}
