// v17 — Custom color palettes.
//
// A saved palette library (localStorage, mirroring brand-kit.js) plus an inline
// editor and harmony generator. The "active" palette is the single source the
// Color Map (features/color-map.js) reads from. Library + active selection live
// on state.colorPalettes; the durable copy is localStorage. Edits are undoable
// (colorPalettes is in history.snapshot) and persisted on commit.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { isValidHex, generateHarmony } from '../utils/color.js';
import { refreshColorMapUI } from './color-map.js';

const KEY = 'glint_colorpalettes';
const MAX = 60;
let seq = 0;

function loadStore() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state.colorPalettes.library)); return true; }
  catch (e) { showNotification('Could not save palette (storage full).', 'error'); return false; }
}

function lib() { return state.colorPalettes.library || (state.colorPalettes.library = {}); }
function active() { const a = state.colorPalettes.active; return a ? lib()[a] : null; }
function genId() { return 'pal_' + Date.now().toString(36) + '_' + (seq++); }

// Hydrate the in-memory library from localStorage at startup. Drops a dangling
// active id that points at a palette no longer in the library.
export function hydratePalettes() {
  state.colorPalettes.library = loadStore();
  if (state.colorPalettes.active && !lib()[state.colorPalettes.active]) {
    state.colorPalettes.active = null;
  }
}

// ---- rendering ------------------------------------------------------------

function renderList() {
  if (!el.colorPaletteList) return;
  const ids = Object.keys(lib());
  const opts = ['<option value="">-- No palette --</option>']
    .concat(ids.map(id => `<option value="${id}">${escapeHtml(lib()[id].name || 'Untitled')}</option>`));
  el.colorPaletteList.innerHTML = opts.join('');
  el.colorPaletteList.value = state.colorPalettes.active || '';
}

function renderEditor() {
  const p = active();
  if (el.colorPaletteEditor) el.colorPaletteEditor.style.display = p ? 'block' : 'none';
  if (el.colorPaletteHint) {
    el.colorPaletteHint.textContent = p
      ? 'Drag swatches to reorder. The active palette feeds the Color Map below.'
      : 'Create a palette, then use it in the Color Map below.';
  }
  if (!p) return;
  if (el.colorPaletteName && el.colorPaletteName.value !== p.name) el.colorPaletteName.value = p.name || '';

  const c = el.colorPaletteSwatches;
  if (!c) return;
  c.innerHTML = p.swatches.map((hex, i) => `
    <div class="color-swatch-chip" draggable="true" data-idx="${i}"
         style="display:inline-flex;align-items:center;gap:4px;margin:4px 6px 0 0;padding:4px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);">
      <input type="color" value="${isValidHex(hex) ? hex : '#000000'}" data-idx="${i}"
             style="width:32px;height:28px;border:none;background:none;cursor:pointer;padding:0;">
      <button class="swatch-del" data-idx="${i}" title="Remove"
              style="border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:13px;line-height:1;">✕</button>
    </div>`).join('');

  c.querySelectorAll('input[type="color"]').forEach(inp => {
    inp.addEventListener('input', e => {
      p.swatches[+e.target.dataset.idx] = e.target.value;
      render();
    });
    inp.addEventListener('change', () => { saveStateToHistory(); persist(); refreshColorMapUI(); });
  });
  c.querySelectorAll('.swatch-del').forEach(btn => {
    btn.addEventListener('click', e => removeSwatch(+e.target.dataset.idx));
  });
  bindDragReorder(c);
}

let dragFrom = null;
function bindDragReorder(container) {
  container.querySelectorAll('.color-swatch-chip').forEach(chip => {
    chip.addEventListener('dragstart', () => { dragFrom = +chip.dataset.idx; });
    chip.addEventListener('dragover', e => e.preventDefault());
    chip.addEventListener('drop', e => {
      e.preventDefault();
      const to = +chip.dataset.idx;
      if (dragFrom === null || dragFrom === to) return;
      const p = active(); if (!p) return;
      saveStateToHistory();
      const [m] = p.swatches.splice(dragFrom, 1);
      p.swatches.splice(to, 0, m);
      dragFrom = null;
      persist(); renderEditor(); refreshColorMapUI(); render();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Called from updateUIFromState and after any library/active change.
export function refreshPalettesUI() {
  renderList();
  renderEditor();
}

// ---- actions --------------------------------------------------------------

function createPalette(swatches, name) {
  if (Object.keys(lib()).length >= MAX) { showNotification(`Palette limit (${MAX}) reached.`, 'error'); return null; }
  saveStateToHistory();
  const id = genId();
  const n = Object.keys(lib()).length + 1;
  lib()[id] = { name: name || ('Palette ' + n), swatches: swatches || ['#2348ff', '#ffffff', '#0b0b0d'] };
  state.colorPalettes.active = id;
  persist();
  refreshPalettesUI(); refreshColorMapUI();
  return id;
}

function deletePalette() {
  const id = state.colorPalettes.active;
  if (!id || !lib()[id]) return;
  saveStateToHistory();
  delete lib()[id];
  state.colorPalettes.active = null;
  persist();
  refreshPalettesUI(); refreshColorMapUI(); render();
  showNotification('Palette deleted.', 'success');
}

function addSwatch() {
  const p = active(); if (!p) return;
  saveStateToHistory();
  p.swatches.push('#ffffff');
  persist(); renderEditor(); refreshColorMapUI(); render();
}

function removeSwatch(i) {
  const p = active(); if (!p) return;
  saveStateToHistory();
  p.swatches.splice(i, 1);
  persist(); renderEditor(); refreshColorMapUI(); render();
}

function generateForActive() {
  const base = el.colorHarmonyBase ? el.colorHarmonyBase.value : '#2348ff';
  const type = el.colorHarmonyType ? el.colorHarmonyType.value : 'complementary';
  const swatches = generateHarmony(base, type);
  let p = active();
  if (!p) { createPalette(swatches, type[0].toUpperCase() + type.slice(1)); }
  else {
    saveStateToHistory();
    p.swatches = swatches;
    persist();
  }
  refreshPalettesUI(); refreshColorMapUI(); render();
  showNotification(`Generated ${type} palette.`, 'success');
}

// Public — used by palette-extract.js "Save as palette".
export function saveSwatchesAsPalette(swatches, name) {
  if (!swatches || !swatches.length) { showNotification('Nothing to save.', 'error'); return; }
  const id = createPalette([...swatches], name);
  if (id) showNotification('Saved as palette.', 'success');
  return id;
}

export function bindPalettes() {
  hydratePalettes();

  el.colorPaletteList?.addEventListener('change', e => {
    state.colorPalettes.active = e.target.value || null;
    refreshPalettesUI(); refreshColorMapUI(); render();
  });
  el.colorPaletteNew?.addEventListener('click', () => createPalette());
  el.colorPaletteDelete?.addEventListener('click', deletePalette);
  el.colorAddSwatch?.addEventListener('click', addSwatch);
  el.colorHarmonyGenerate?.addEventListener('click', generateForActive);

  if (el.colorPaletteName) {
    el.colorPaletteName.addEventListener('input', e => {
      const p = active(); if (!p) return;
      p.name = e.target.value;
    });
    el.colorPaletteName.addEventListener('change', () => {
      if (!active()) return;
      saveStateToHistory(); persist(); renderList();
    });
  }

  refreshPalettesUI();
}
