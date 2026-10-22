// v38 — Focus: Looks. A look is a named grade (the filter sliders plus curves
// and levels) kept in a small library (glint_looks), applied in one click, and
// shared as a .glintlook file or a one-line code. The starter looks and the
// file/code formats live in render/curves-core.js.
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { escapeHTML } from '../utils/dom.js';
import { download } from './motion-export.js';
import { STARTER_LOOKS, normalizeLook, normalizeFilters, normalizeColorTools, encodeLook, decodeLook, lookToJson } from '../render/curves-core.js';
import { openCurves } from './curves-ui.js';

const KEY = 'glint_looks';
const MAX = 60;
let seq = 0;

function loadAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.map(l => l && { ...normalizeLook(l), id: String(l.id) }).filter(l => l && l.name) : [];
  } catch (e) { return []; }
}
function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch (e) { showNotification('Could not save the look (storage full).', 'error'); return false; }
}
function genId() { return 'look_' + Date.now().toString(36) + '_' + (seq++); }

function allLooks() { return [...STARTER_LOOKS, ...loadAll()]; }

function currentLook(name) {
  return normalizeLook({ name, imageFilters: state.imageFilters, colorTools: state.colorTools });
}

export function applyLook(look) {
  const n = normalizeLook(look);
  if (!n) return;
  saveStateToHistory();
  state.imageFilters = normalizeFilters(n.imageFilters);
  state.colorTools = normalizeColorTools(n.colorTools);
  window.__updateUIFromState?.();
  render();
  showNotification(`Applied "${n.name}". Undo if needed.`, 'success');
}

function renderList() {
  if (!el.looksList) return;
  el.looksList.innerHTML = allLooks().map(l => `
    <span class="look-chip">
      <button type="button" class="look-apply" data-look="${escapeHTML(l.id)}" title="Apply ${escapeHTML(l.name)}">${escapeHTML(l.name)}</button>${l.builtIn ? '' : `<button type="button" class="look-delete" data-look-delete="${escapeHTML(l.id)}" title="Delete ${escapeHTML(l.name)}" aria-label="Delete ${escapeHTML(l.name)}">✕</button>`}
    </span>`).join('');
}

// v39 — one inline field under the Looks buttons stands in for the browser's
// prompt(): a name for Save and Export, a code for Paste, and a read-only code
// to copy by hand when the clipboard is blocked. Enter confirms, Escape cancels.
let fieldAction = null;

function closeField() {
  fieldAction = null;
  if (el.looksField) el.looksField.hidden = true;
}

function openField({ label, value = '', ok, readonly = false, onOk }) {
  if (!el.looksField || !el.looksFieldInput) return;
  openCurves();
  el.looksFieldLabel.textContent = label;
  el.looksFieldInput.value = value;
  el.looksFieldInput.readOnly = readonly;
  el.looksFieldInput.placeholder = readonly ? '' : label;
  el.looksFieldOk.textContent = ok;
  fieldAction = onOk || null;
  el.looksField.hidden = false;
  requestAnimationFrame(() => { el.looksFieldInput.focus(); el.looksFieldInput.select(); });
}

function confirmField() {
  const run = fieldAction;
  const value = el.looksFieldInput ? el.looksFieldInput.value : '';
  closeField();
  if (run) run(value);
}

export function saveLook() {
  if (loadAll().length >= MAX) { showNotification(`You can keep up to ${MAX} looks. Delete one first.`, 'error'); return; }
  openField({
    label: 'Name this look', value: 'My look', ok: 'Save',
    onOk: (name) => {
      const list = loadAll();
      if (list.length >= MAX) { showNotification(`You can keep up to ${MAX} looks. Delete one first.`, 'error'); return; }
      const look = { ...currentLook(name), id: genId() };
      list.push(look);
      if (persist(list)) { renderList(); showNotification(`Saved "${look.name}".`, 'success'); }
    },
  });
}

function deleteLook(id) {
  const list = loadAll();
  const look = list.find(l => l.id === id);
  if (!look || !confirm(`Delete the look "${look.name}"?`)) return;
  if (persist(list.filter(l => l.id !== id))) renderList();
}

function addImported(look) {
  const list = loadAll();
  if (list.length >= MAX) { applyLook(look); return; }
  list.push({ ...look, id: genId() });
  if (persist(list)) renderList();
  applyLook(look);
}

export async function copyLookCode() {
  const code = encodeLook(currentLook('Shared look'));
  try {
    await navigator.clipboard.writeText(code);
    showNotification('Look code copied. Paste it into Import on any Glint.', 'success');
  } catch (e) {
    openField({ label: 'Copy this look code', value: code, ok: 'Done', readonly: true });
  }
}

export function exportLookFile() {
  openField({
    label: 'Name the look file', value: 'My look', ok: 'Download',
    onOk: (name) => {
      const look = currentLook(name);
      const file = (look.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'look') + '.glintlook';
      download(new Blob([lookToJson(look)], { type: 'application/json' }), file);
    },
  });
}

export function importLookFile() {
  el.looksFileInput?.click();
}

export function pasteLookCode() {
  openField({
    label: 'Paste a look code', ok: 'Apply',
    onOk: (code) => {
      if (!code.trim()) return;
      const look = decodeLook(code);
      if (!look) { showNotification('That is not a Glint look code.', 'error'); return; }
      addImported(look);
    },
  });
}

function onFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 64 * 1024) { showNotification('That file is too big to be a look.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const look = decodeLook(String(reader.result || ''));
    if (!look) { showNotification('That file is not a Glint look.', 'error'); return; }
    addImported(look);
  };
  reader.readAsText(file);
}

export function bindLooks() {
  if (el.looksList) el.looksList.addEventListener('click', (e) => {
    const del = e.target.closest('[data-look-delete]');
    if (del) { deleteLook(del.dataset.lookDelete); return; }
    const btn = e.target.closest('[data-look]');
    if (!btn) return;
    const look = allLooks().find(l => l.id === btn.dataset.look);
    if (look) applyLook(look);
  });
  if (el.looksSaveBtn) el.looksSaveBtn.addEventListener('click', saveLook);
  if (el.looksCopyBtn) el.looksCopyBtn.addEventListener('click', copyLookCode);
  if (el.looksExportBtn) el.looksExportBtn.addEventListener('click', exportLookFile);
  if (el.looksImportBtn) el.looksImportBtn.addEventListener('click', importLookFile);
  if (el.looksPasteBtn) el.looksPasteBtn.addEventListener('click', pasteLookCode);
  if (el.looksFileInput) el.looksFileInput.addEventListener('change', onFile);
  el.looksFieldOk?.addEventListener('click', confirmField);
  el.looksFieldCancel?.addEventListener('click', closeField);
  el.looksFieldInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmField(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeField(); }
  });
  renderList();
}
