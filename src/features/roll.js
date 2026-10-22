// v37 — Exposure: the Roll (batch develop).
//
// One shared design styles a whole roll of screenshots. The contact sheet
// renders every shot with the current design; clicking a shot opens it on the
// canvas, where edits to the fields in roll-core ROLL_OVERRIDE_FIELDS apply to
// that shot only ("This shot") or to the whole roll ("Whole roll"). Develop
// renders every shot at every size into one ZIP (plus an optional PDF contact
// sheet). Replaces the v9 Batch mode.
//
// Design notes:
// - state.roll holds the shot list, order, per-shot `overrides` and Develop
//   settings; it is undoable and saved with the project. Shot images are in
//   imageRegistry (decoded) and roll-core rollSources (dataURLs).
// - While a shot is open, `active` keeps the roll's own values of the override
//   fields and its own image, so leaving the shot (or saving) restores them.
//   roll-core rollRuntime.view lets serializeFull() save the roll, not the shot.
// - Offscreen renders (thumbnails, Develop) apply a shot to the live state,
//   render synchronously, and restore it, like Merge Studio's export loop.

import { state, imageRegistry } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render, renderInto, renderAtSize } from '../render/render.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import { showNotification, showUndoToast } from '../ui/notification.js';
import { imageToDataUrl } from '../state/serialize.js';
import { ensureCompareImage } from '../render/compare.js';
import { syncCroppedImage } from '../render/crop-image.js';
import { cropSource } from '../render/crop-core.js';
import { normalizeModeFlip, sceneFlip } from '../render/mode-flip-core.js';
import {
  rollSources, rollRuntime, captureOverrideFields, diffOverrides, applyOverrides,
  smartFrameFor, classifyAspect, fileName, parseSizes, sizeLabel,
} from '../render/roll-core.js';
import { downloadZip } from './batch-export.js';
import { listExportPresets, encodeCanvas, upscaleCanvas } from './export-presets.js';
import { loadImageFile } from './set-ui.js';
import { revealSection } from './studio-nav.js';
import { escapeHTML } from '../utils/dom.js';

const MAX_SHOTS_HINT = 30;
const THUMB_W = 180;

let idCounter = 0;
const newShotId = () => `shot-${Date.now().toString(36)}-${idCounter++}`;

// The open shot: { id, base, view, image, imageSrc }. base = the roll's values
// of the override fields, view = the live values at the last flush.
let active = null;
let scope = 'shot';
let developing = null; // AbortController while Develop runs

const shots = () => state.roll.shots;
const findShot = (id) => shots().find((s) => s.id === id);

function inSingleMode() {
  if (state.mode === 'single') return true;
  showNotification('The Roll works in Single mode.', 'error');
  return false;
}

// ---- applying a shot to the live state --------------------------------------

function frameContext() {
  return { mockup3d: !!(state.mockup3d && state.mockup3d.enabled), surface: !!(state.surface && state.surface.enabled) };
}

// The roll's values for the override fields with this shot's smart frame. A
// crop always belongs to one image, so shots start uncropped.
function shotBase(shot, base) {
  const out = { ...base, imageCrop: null };
  const frame = smartFrameFor(shot, state.roll.smartFit, frameContext());
  if (frame !== undefined) out['deviceFrame.type'] = frame;
  return out;
}

// Write a shot (its smart frame, overrides and image) into the live state.
function applyShot(shot, base) {
  applyOverrides(state, shotBase(shot, base));
  applyOverrides(state, shot.overrides);
  state.image = imageRegistry[shot.id] || state.image;
  syncCroppedImage();
}

// File the open shot's edits since the last flush, by the current scope.
function flush() {
  if (!active) return;
  const shot = findShot(active.id);
  const cur = captureOverrideFields(state);
  if (shot) {
    if (scope === 'shot') {
      shot.overrides = diffOverrides(shotBase(shot, active.base), cur);
    } else {
      const changes = diffOverrides(active.view, cur);
      for (const [path, value] of Object.entries(changes)) {
        // A crop belongs to one image, so it stays with the shot in either scope.
        if (path === 'imageCrop') {
          if (value) shot.overrides.imageCrop = value; else delete shot.overrides.imageCrop;
          continue;
        }
        active.base[path] = value;
        delete shot.overrides[path];
      }
    }
  }
  active.view = cur;
}

function baseImageSrc() {
  if (active.imageSrc === undefined) active.imageSrc = imageToDataUrl(cropSource(active.image), 2000, 'image/jpeg', 0.9);
  return active.imageSrc;
}

function openShot(id) {
  if (!inSingleMode()) return;
  const shot = findShot(id);
  if (!shot || !imageRegistry[id]) return;
  if (active) {
    if (active.id === id) return;
    flush();
    applyOverrides(state, active.base);
    state.image = active.image;
  }
  const base = active ? active.base : captureOverrideFields(state);
  const image = active ? active.image : state.image;
  const imageSrc = active ? active.imageSrc : undefined;
  applyShot(shot, base);
  active = { id, base, image, imageSrc, view: captureOverrideFields(state) };
  state.roll.activeShot = id;
  rollRuntime.view = () => { flush(); return { fields: active.base, imageSrc: baseImageSrc() }; };
  afterLiveChange();
}

function closeShot({ keepEdits = true } = {}) {
  if (!active) return;
  if (keepEdits) flush();
  applyOverrides(state, active.base);
  state.image = active.image;
  active = null;
  state.roll.activeShot = null;
  rollRuntime.view = null;
  afterLiveChange();
}

function afterLiveChange() {
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
  render();
  syncShotBar();
  syncSheet(true);
}

function stepShot(dir) {
  const list = shots();
  if (!list.length) return;
  const i = active ? list.findIndex((s) => s.id === active.id) : -1;
  const next = list[(i + dir + list.length) % list.length];
  if (next) openShot(next.id);
}

function resetShot() {
  if (!active) return;
  const shot = findShot(active.id);
  if (!shot) return;
  saveStateToHistory();
  shot.overrides = {};
  applyShot(shot, active.base);
  active.view = captureOverrideFields(state);
  afterLiveChange();
}

// ---- offscreen render of one shot --------------------------------------------

// Apply `shot` to the live state, run the synchronous `fn`, and restore.
async function withShot(shot, fn) {
  const before = shot.overrides['compare.beforeSrc'];
  if (before) await ensureCompareImage(before);
  flush();
  const saved = captureOverrideFields(state);
  const savedImage = state.image;
  try {
    applyShot(shot, active ? active.base : saved);
    return fn();
  } finally {
    applyOverrides(state, saved);
    state.image = savedImage;
  }
}

// v39 — run `fn` with the light / dark flip forced to `mode` ('light' | 'dark';
// null leaves the design as set). A shot already in that mode comes out as it
// is (the pass skips a matching target). With matchScene the scene follows the
// mode. Everything touched is put back afterwards.
const SCENE_KEYS = ['bgColor', 'gradient', 'meshGradient', 'pattern', 'deviceFrame', 'textOverlay'];
function withMode(mode, matchScene, fn) {
  if (!mode) return fn();
  const savedFlip = state.modeFlip;
  const savedScene = SCENE_KEYS.map((k) => state[k]);
  try {
    state.modeFlip = { ...normalizeModeFlip(state.modeFlip), enabled: true, target: mode };
    if (matchScene) {
      for (const k of SCENE_KEYS) state[k] = JSON.parse(JSON.stringify(state[k] ?? null));
      sceneFlip(state, mode, state.modeFlip.surface);
    }
    return fn();
  } finally {
    state.modeFlip = savedFlip;
    SCENE_KEYS.forEach((k, i) => { state[k] = savedScene[i]; });
  }
}

// ---- adding, removing, reordering ----------------------------------------------

async function addFiles(fileList) {
  if (!inSingleMode()) return;
  const files = Array.from(fileList || []).filter((f) => f.type && f.type.startsWith('image/'));
  if (!files.length) return;
  saveStateToHistory();
  let added = 0;
  setProgress(`Adding ${files.length} screenshot${files.length === 1 ? '' : 's'}…`);
  for (const file of files) {
    try {
      const { img } = await loadImageFile(file);
      const id = newShotId();
      const src = imageToDataUrl(img, 3000, 'image/webp', 0.92);
      if (!src) continue;
      imageRegistry[id] = img;
      rollSources[id] = src;
      shots().push({ id, name: file.name, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, overrides: {} });
      added++;
    } catch (e) { /* skip unreadable files */ }
  }
  setProgress('');
  syncSheet(true);
  if (!added) { showNotification('No readable images in that selection.', 'error'); return; }
  const big = shots().length > MAX_SHOTS_HINT ? ` Rolls over ${MAX_SHOTS_HINT} shots make large project files.` : '';
  showNotification(`Added ${added} shot${added === 1 ? '' : 's'} to the roll.${big}`, big ? 'error' : 'success');
}

function removeShot(id) {
  const i = shots().findIndex((s) => s.id === id);
  if (i < 0) return;
  saveStateToHistory();
  if (active && active.id === id) closeShot({ keepEdits: false });
  shots().splice(i, 1);
  syncSheet(true);
  showUndoToast('Shot removed', render);
}

function clearRoll() {
  if (!shots().length) return;
  saveStateToHistory();
  if (active) closeShot({ keepEdits: false });
  state.roll.shots = [];
  syncSheet(true);
  showUndoToast('Roll cleared', render);
}

function moveShot(fromId, toId) {
  const list = shots();
  const from = list.findIndex((s) => s.id === fromId);
  const to = list.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  saveStateToHistory();
  const [s] = list.splice(from, 1);
  list.splice(to, 0, s);
  syncSheet(true);
}

// ---- contact sheet ---------------------------------------------------------------

let sheetSig = '';
let thumbTimer = null;
let thumbGen = 0;

function syncSheet(force) {
  const box = el.rollSheet;
  if (!box) return;
  const sig = shots().map((s) => `${s.id}:${s.name}:${Object.keys(s.overrides).length ? 1 : 0}`).join('|');
  box.querySelectorAll('.roll-tile').forEach((t) => t.classList.toggle('active', t.dataset.shot === state.roll.activeShot));
  if (force || sig !== sheetSig) {
    sheetSig = sig;
    // Keep the drawn thumbnails across the rebuild (no blank flash).
    const old = {};
    box.querySelectorAll('.roll-tile').forEach((t) => { old[t.dataset.shot] = t.querySelector('canvas'); });
    if (!shots().length) {
      box.innerHTML = '<p class="info-text roll-empty">No shots yet. Add screenshots above to start a roll.</p>';
    } else {
      box.innerHTML = shots().map((s, i) => `
        <div class="roll-tile${s.id === state.roll.activeShot ? ' active' : ''}" draggable="true" data-shot="${s.id}">
          <button type="button" class="roll-tile-open" data-roll-open="${s.id}" title="Edit ${escapeHTML(s.name)}">
            <canvas class="roll-thumb" width="${THUMB_W}" height="${THUMB_W}"></canvas>
            <span class="roll-tile-label"><b>${i + 1}</b> ${escapeHTML(s.name)}</span>
            <span class="roll-tile-kind">${classifyAspect(s.w, s.h)}${Object.keys(s.overrides).length ? ' · edited' : ''}</span>
          </button>
          <button type="button" class="roll-tile-del" data-roll-del="${s.id}" title="Remove shot">✕</button>
        </div>`).join('');
      box.querySelectorAll('.roll-tile').forEach((t) => {
        const prev = old[t.dataset.shot];
        const next = t.querySelector('canvas');
        if (prev && next && prev.width > 1) {
          next.width = prev.width; next.height = prev.height;
          next.getContext('2d').drawImage(prev, 0, 0);
        }
      });
    }
    if (el.rollCount) el.rollCount.textContent = shots().length ? `${shots().length} shot${shots().length === 1 ? '' : 's'}` : '';
  }
  scheduleThumbs();
}

// Re-render thumbnails a moment after the last change, one shot per tick.
// While the panel is hidden they stay dirty and draw when it shows (observer
// in bindRoll).
let thumbsDirty = true;
function scheduleThumbs() {
  thumbsDirty = true;
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(drawThumbs, 400);
}

async function drawThumbs() {
  if (developing || state.mode !== 'single' || !shots().length || !el.rollSheet) return;
  if (el.rollSheet.offsetParent === null) return;
  const gen = ++thumbGen;
  const off = document.createElement('canvas');
  for (const shot of shots().slice()) {
    if (gen !== thumbGen || developing || state.mode !== 'single') return;
    const tile = el.rollSheet.querySelector(`.roll-tile[data-shot="${shot.id}"] canvas`);
    if (!tile || !imageRegistry[shot.id]) continue;
    try {
      await withShot(shot, () => renderInto(off, true));
      if (gen !== thumbGen) return;
      const scale = Math.min(THUMB_W / off.width, THUMB_W / off.height);
      tile.width = Math.max(1, Math.round(off.width * scale));
      tile.height = Math.max(1, Math.round(off.height * scale));
      tile.getContext('2d').drawImage(off, 0, 0, tile.width, tile.height);
    } catch (e) { /* leave the old thumbnail */ }
    await new Promise((r) => setTimeout(r, 0));
  }
  if (gen === thumbGen) thumbsDirty = false;
}

// ---- open-shot bar ------------------------------------------------------------------

function syncShotBar() {
  if (!el.rollShotBar) return;
  const shot = active && findShot(active.id);
  el.rollShotBar.hidden = !shot;
  if (!shot) return;
  const i = shots().indexOf(shot);
  if (el.rollShotName) el.rollShotName.textContent = `Shot ${i + 1} of ${shots().length}: ${shot.name}`;
  document.querySelectorAll('[data-roll-scope]').forEach((b) =>
    b.classList.toggle('active', b.dataset.rollScope === scope));
  if (el.rollScopeHint) {
    el.rollScopeHint.textContent = scope === 'shot'
      ? 'Crop, caption, annotations, redactions, rotation, Before image and frame changes apply to this shot only. Every other change styles the whole roll.'
      : 'Every change styles the whole roll.';
  }
}

function setScope(next) {
  if (next !== 'shot' && next !== 'roll') return;
  flush();
  scope = next;
  syncShotBar();
}

// ---- develop settings ------------------------------------------------------------------

const FRAME_CHOICES = {
  phone: [['keep', "Design's frame"], ['iphone16pro', 'iPhone 16 Pro'], ['pixel', 'Pixel (Android)'], [null, 'None']],
  tablet: [['keep', "Design's frame"], ['ipadpro', 'iPad Pro'], [null, 'None']],
  wide: [['keep', "Design's frame"], ['chrome', 'Chrome Browser'], ['safari', 'Safari Browser'], ['firefox', 'Firefox Browser'],
    ['macos', 'macOS Window'], ['windows', 'Windows Window'], ['macbookpro', 'MacBook Pro'], ['winlaptop', 'Windows Laptop'],
    ['studiodisplay', 'Studio Display'], [null, 'None']],
};
const frameValue = (v) => (v === null ? '' : v);
const frameFromValue = (v) => (v === '' ? null : v);

function syncControls() {
  const r = state.roll;
  const idle = (node) => node && document.activeElement !== node;
  if (el.rollSmartFit) el.rollSmartFit.checked = !!r.smartFit.enabled;
  if (el.rollSmartFrames) el.rollSmartFrames.style.display = r.smartFit.enabled ? '' : 'none';
  for (const kind of ['phone', 'tablet', 'wide']) {
    const node = el[`rollFrame${kind[0].toUpperCase()}${kind.slice(1)}`];
    if (idle(node)) node.value = frameValue(r.smartFit[kind]);
  }
  if (idle(el.rollSizes)) el.rollSizes.value = r.sizes.map(sizeLabel).join(', ');
  if (idle(el.rollNaming)) el.rollNaming.value = r.naming;
  if (idle(el.rollPreset)) {
    const list = listExportPresets();
    const opts = list.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('');
    if (el.rollPreset.innerHTML !== opts) el.rollPreset.innerHTML = opts;
    el.rollPreset.value = list.some((p) => p.id === r.presetId) ? r.presetId : (list[0] && list[0].id) || '';
  }
  if (el.rollPdf) el.rollPdf.checked = !!r.pdf;
  if (el.rollModes) el.rollModes.checked = r.modes === 'both';   // v39
}

function bindSettings() {
  for (const kind of ['phone', 'tablet', 'wide']) {
    const node = el[`rollFrame${kind[0].toUpperCase()}${kind.slice(1)}`];
    if (!node) continue;
    node.innerHTML = FRAME_CHOICES[kind].map(([v, label]) => `<option value="${frameValue(v)}">${label}</option>`).join('');
    node.addEventListener('change', () => {
      const value = frameFromValue(node.value);
      saveStateToHistory();
      state.roll.smartFit[kind] = value;
      syncControls();
      reapplyOpenShot();
      syncSheet(true);
    });
  }
  el.rollSmartFit?.addEventListener('change', () => {
    const on = el.rollSmartFit.checked;
    saveStateToHistory();
    state.roll.smartFit.enabled = on;
    syncControls();
    reapplyOpenShot();
    syncSheet(true);
  });
  el.rollSizes?.addEventListener('change', () => {
    const sizes = parseSizes(el.rollSizes.value);
    saveStateToHistory();
    state.roll.sizes = sizes;
    el.rollSizes.value = state.roll.sizes.map(sizeLabel).join(', ');
    syncControls();
  });
  el.rollNaming?.addEventListener('change', () => {
    const naming = el.rollNaming.value.trim() || '{n}-{name}-{size}';
    saveStateToHistory();
    state.roll.naming = naming;
    el.rollNaming.value = state.roll.naming;
    syncControls();
  });
  // Each handler reads its control before saving: the save refreshes the
  // controls from state (onHistoryChange -> syncControls).
  el.rollPreset?.addEventListener('change', () => { const id = el.rollPreset.value; saveStateToHistory(); state.roll.presetId = id; syncControls(); });
  el.rollPdf?.addEventListener('change', () => { const on = el.rollPdf.checked; saveStateToHistory(); state.roll.pdf = on; syncControls(); });
  el.rollModes?.addEventListener('change', () => { const on = el.rollModes.checked; saveStateToHistory(); state.roll.modes = on ? 'both' : 'as-set'; syncControls(); });
}

// A smart-fit setting changed while a shot is open: show its new frame.
function reapplyOpenShot() {
  if (!active) return;
  const shot = findShot(active.id);
  if (!shot) return;
  flush();
  applyShot(shot, active.base);
  active.view = captureOverrideFields(state);
  afterLiveChange();
}

// ---- develop ---------------------------------------------------------------------------

function setProgress(msg) { if (el.rollProgress) el.rollProgress.textContent = msg || ''; }

function setDeveloping(on) {
  if (el.rollDevelopBtn) el.rollDevelopBtn.disabled = on;
  if (el.rollCancelBtn) el.rollCancelBtn.style.display = on ? '' : 'none';
}

function cancelDevelop() {
  if (developing) developing.abort();
}

export async function developRoll() {
  if (developing) return;
  revealSection(el.rollSection);
  if (!inSingleMode()) return;
  const list = shots().filter((s) => imageRegistry[s.id]);
  if (!list.length) { showNotification('Add screenshots to the roll first.', 'error'); return; }
  const presets = listExportPresets();
  const preset = presets.find((p) => p.id === state.roll.presetId) || presets[0] || { format: 'png', quality: 100, scale: 1 };
  const sizes = state.roll.sizes.length ? state.roll.sizes : [{ label: 'canvas' }];
  const pad = Math.max(2, String(list.length).length);
  // v39 — "Develop light and dark" renders every shot and size once per mode.
  const modes = state.roll.modes === 'both' ? ['light', 'dark'] : [null];
  const matchScene = document.getElementById('ld-scene') ? document.getElementById('ld-scene').checked : true;
  const total = list.length * sizes.length * modes.length;
  const files = {};
  const sheet = [];
  const off = document.createElement('canvas');
  const ctrl = new AbortController();
  developing = ctrl;
  setDeveloping(true);
  showNotification(`Developing ${total} image${total === 1 ? '' : 's'}…`, 'success', {
    action: { label: 'Cancel', run: cancelDevelop }, duration: 8000,
  });
  let done = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      const shot = list[i];
      for (const size of sizes) for (const mode of modes) {
        if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        await withShot(shot, () => withMode(mode, matchScene, () => {
          if (size.width && size.height) renderAtSize(off, { width: size.width, height: size.height });
          else renderInto(off, true);
        }));
        if (state.roll.pdf && size === sizes[0] && mode === modes[0]) sheet.push({ name: shot.name, n: i + 1, dataUrl: thumbJpeg(off) });
        const { blob, ext } = await encodeCanvas(upscaleCanvas(off, preset.scale || 1), preset.format, preset.quality);
        let name = fileName(state.roll.naming, { n: i + 1, name: shot.name, size, pad, ext, mode });
        for (let k = 2; files[name]; k++) name = name.replace(/(-\d+)?\.(\w+)$/, `-${k}.$2`);
        files[name] = new Uint8Array(await blob.arrayBuffer());
        done++;
        setProgress(`Developing ${done}/${total}…`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (state.roll.pdf && sheet.length) {
      setProgress('Making the contact sheet…');
      files['contact-sheet.pdf'] = await contactSheetPdf(sheet);
    }
    await downloadZip(files, `roll-${Date.now()}.zip`);
    setProgress(`Developed ${done} image${done === 1 ? '' : 's'}.`);
    showNotification(`Roll developed: ${done} image${done === 1 ? '' : 's'} in one ZIP.`, 'success');
  } catch (e) {
    if (e && e.name === 'AbortError') {
      setProgress(`Cancelled after ${done} of ${total}.`);
      showNotification('Develop cancelled.', 'success');
    } else {
      console.error(e);
      setProgress('Failed.');
      showNotification(`Develop failed: ${e.message || e}`, 'error');
    }
  } finally {
    developing = null;
    setDeveloping(false);
    render();
  }
}

function thumbJpeg(canvas) {
  const max = 600;
  const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height };
}

// A4 landscape pages, 4 x 3 grid, each shot fitted into its cell with a label.
async function contactSheetPdf(sheet) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 28, COLS = 4, ROWS = 3, GAP = 14, LABEL = 14;
  const cw = (W - M * 2 - GAP * (COLS - 1)) / COLS;
  const ch = (H - M * 2 - GAP * (ROWS - 1)) / ROWS - LABEL;
  pdf.setFontSize(8);
  sheet.forEach((item, i) => {
    const slot = i % (COLS * ROWS);
    if (i > 0 && slot === 0) pdf.addPage();
    const col = slot % COLS, row = Math.floor(slot / COLS);
    const x = M + col * (cw + GAP), y = M + row * (ch + LABEL + GAP);
    const { url, w, h } = item.dataUrl;
    const s = Math.min(cw / w, ch / h);
    pdf.addImage(url, 'JPEG', x + (cw - w * s) / 2, y + (ch - h * s) / 2, w * s, h * s);
    pdf.text(`${item.n}. ${item.name}`.slice(0, 48), x, y + ch + 10);
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}

// ---- binding -------------------------------------------------------------------------------

export function addToRoll() {
  revealSection(el.rollSection);
  el.rollFileInput?.click();
}

export function bindRoll() {
  rollRuntime.onDesignApplied = () => {
    active = null;
    rollRuntime.view = null;
    if (developing) developing.abort();
  };

  const input = el.rollFileInput;
  input?.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  const folder = el.rollFolderInput;
  folder?.addEventListener('change', () => { addFiles(folder.files); folder.value = ''; });
  el.rollAddFolderBtn?.addEventListener('click', () => folder?.click());
  el.rollClearBtn?.addEventListener('click', clearRoll);

  const drop = el.rollDrop;
  if (drop) {
    drop.addEventListener('click', () => input?.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
  }

  const sheet = el.rollSheet;
  if (sheet) {
    sheet.addEventListener('click', (e) => {
      const del = e.target.closest('[data-roll-del]');
      if (del) { removeShot(del.dataset.rollDel); return; }
      const open = e.target.closest('[data-roll-open]');
      if (open) openShot(open.dataset.rollOpen);
    });
    let dragId = null;
    sheet.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.roll-tile');
      if (!tile) return;
      dragId = tile.dataset.shot;
      tile.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); }
    });
    sheet.addEventListener('dragover', (e) => { if (dragId) e.preventDefault(); });
    sheet.addEventListener('drop', (e) => {
      const tile = e.target.closest('.roll-tile');
      if (!dragId || !tile) return;
      e.preventDefault();
      moveShot(dragId, tile.dataset.shot);
    });
    sheet.addEventListener('dragend', () => {
      dragId = null;
      sheet.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    });
  }

  document.querySelectorAll('[data-roll-scope]').forEach((b) =>
    b.addEventListener('click', () => setScope(b.dataset.rollScope)));
  el.rollPrevBtn?.addEventListener('click', () => stepShot(-1));
  el.rollNextBtn?.addEventListener('click', () => stepShot(1));
  el.rollResetShotBtn?.addEventListener('click', resetShot);
  el.rollDoneBtn?.addEventListener('click', () => closeShot());
  el.rollDevelopBtn?.addEventListener('click', developRoll);
  el.rollCancelBtn?.addEventListener('click', cancelDevelop);
  bindSettings();

  // Undo/redo replaces state.roll (activeShot is not snapshotted): keep the
  // open shot open, or close it if the undo removed it.
  onHistoryChange(() => {
    if (active) {
      if (findShot(active.id)) state.roll.activeShot = active.id;
      else {
        applyOverrides(state, active.base);
        state.image = active.image;
        active = null;
        rollRuntime.view = null;
        render();
      }
    }
    syncShotBar();
    syncSheet(true);
    syncControls();
  });

  // render() calls this after every preview frame (contact sheet + controls).
  window.__rollRefresh = () => { syncControls(); syncSheet(false); syncShotBar(); };
  // Leave an open shot before the editor switches mode (Set, Board, Tour).
  window.__closeRollShot = () => closeShot();

  window.__rollCommands = {
    add: addToRoll,
    develop: developRoll,
    next: () => stepShot(1),
    prev: () => stepShot(-1),
    toggleScope: () => { setScope(scope === 'shot' ? 'roll' : 'shot'); showNotification(scope === 'shot' ? 'Edits apply to this shot' : 'Edits apply to the whole roll', 'success'); },
    close: () => closeShot(),
    isOpen: () => !!active,
    hasShots: () => shots().length > 0,
    // v39 — Develop light and dark on / off.
    toggleModes: () => {
      saveStateToHistory();
      state.roll.modes = state.roll.modes === 'both' ? 'as-set' : 'both';
      syncControls();
      showNotification(state.roll.modes === 'both' ? 'Develop writes light and dark versions' : 'Develop writes the design as set', 'success');
    },
  };

  if (el.rollSheet && typeof IntersectionObserver === 'function') {
    new IntersectionObserver((entries) => {
      if (thumbsDirty && entries.some((e) => e.isIntersecting)) scheduleThumbs();
    }).observe(el.rollSheet);
  }

  syncControls();
  syncSheet(true);
  syncShotBar();
}
