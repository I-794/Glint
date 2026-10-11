// v31 — Merge Studio: data-driven batch (CSV → N designs).
//
// The current design IS the template. The user types {{tokens}} into normal
// text/color fields (headline, watermark, browser title/URL, background &
// text color), uploads a CSV whose column headers match those tokens (plus an
// optional `image` column that swaps the screenshot per row), previews rows on
// the live canvas, and exports one PNG per row bundled into a ZIP.
//
// Design notes:
// - state.mergeStudio is RUNTIME-ONLY (columns/rows re-uploaded each session):
//   not snapshotted, not serialized. The template lives in the already-
//   serialized text/color fields, so it travels with the project for free.
// - The batch loop mirrors exportBatch() (batch-export.js): mutate the live
//   state per row, renderInto() an offscreen canvas, collect the PNG, restore.
// - Per-row images load through the pure loadImageEl() helper (url-load.js),
//   which routes remote URLs via /api/fetch-url so the export stays untainted.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render, renderInto } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { saveStateToHistory } from '../state/history.js';
import { downloadZip } from './batch-export.js';
import { loadImageEl } from './url-load.js';
import { revealSection } from './studio-nav.js';

// The fields a {{token}} may live in. `type` drives the panel affordance:
// text fields are edited in their normal sidebar controls; color fields can't
// hold a token there (the pickers validate hex), so Merge Studio gives them
// their own inputs below.
const MERGE_FIELDS = [
  { path: 'textOverlay.content', type: 'text',  label: 'Text overlay' },
  { path: 'watermark.text',      type: 'text',  label: 'Watermark' },
  { path: 'deviceFrame.title',   type: 'text',  label: 'Browser title' },
  { path: 'deviceFrame.url',     type: 'text',  label: 'Browser URL' },
  { path: 'bgColor',             type: 'color', label: 'Background color' },
  { path: 'textOverlay.color',   type: 'color', label: 'Text color' },
];

const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
// Column names with a special meaning (never treated as an "unused" column).
const RESERVED = ['image', 'filename'];

// --- path helpers -----------------------------------------------------------
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setByPath(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o == null ? o : o[k]), obj);
  if (target) target[last] = val;
}

// --- token scan + substitution ---------------------------------------------
export function scanTokens() {
  const seen = [];
  for (const f of MERGE_FIELDS) {
    const v = getByPath(state, f.path);
    if (typeof v !== 'string') continue;
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(v))) if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

// Case-insensitive column lookup within a parsed row.
function matchColumn(row, name) {
  const want = name.toLowerCase();
  for (const key of Object.keys(row)) if (key.toLowerCase() === want) return row[key];
  return null;
}

function substitute(str, row) {
  if (typeof str !== 'string') return str;
  return str.replace(TOKEN_RE, (_, name) => {
    const v = matchColumn(row, name);
    return v == null ? '' : v;
  });
}

// --- CSV parser (tiny, RFC-4180-ish: quoted fields, "" escapes, CRLF/LF) -----
export function parseCsv(text) {
  const s = (text || '').replace(/^﻿/, ''); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignore — the paired \n ends the record
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { columns: [], rows: [] };

  const columns = rows[0].map((h) => h.trim());
  const dataRows = rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== '')) // skip blank lines
    .map((r) => {
      const obj = {};
      columns.forEach((col, idx) => { obj[col] = (r[idx] ?? '').trim(); });
      return obj;
    });
  return { columns, rows: dataRows };
}

// --- live preview (transient — never touches history) ----------------------
let previewSaved = null; // { fields: {path: value}, image }
let previewIndex = -1;

function captureFields() {
  const fields = {};
  for (const f of MERGE_FIELDS) fields[f.path] = getByPath(state, f.path);
  return { fields, image: state.image };
}

async function applyRow(i) {
  const rows = state.mergeStudio.rows;
  const row = rows[i];
  if (!row) return;
  for (const f of MERGE_FIELDS) {
    setByPath(state, f.path, substitute(previewSaved.fields[f.path], row));
  }
  const imgUrl = matchColumn(row, 'image');
  if (imgUrl) {
    try { state.image = await loadImageEl(imgUrl); }
    catch { state.image = previewSaved.image; }
  } else {
    state.image = previewSaved.image;
  }
  render();
}

async function gotoPreview(i) {
  const rows = state.mergeStudio.rows;
  if (!rows.length) return;
  if (!previewSaved) previewSaved = captureFields();
  previewIndex = Math.max(0, Math.min(i, rows.length - 1));
  await applyRow(previewIndex);
  updatePreviewUi();
}

function stopPreview() {
  if (!previewSaved) return;
  for (const f of MERGE_FIELDS) setByPath(state, f.path, previewSaved.fields[f.path]);
  state.image = previewSaved.image;
  previewSaved = null;
  previewIndex = -1;
  render();
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
  updatePreviewUi();
}

// --- filenames --------------------------------------------------------------
function sanitize(name) {
  return String(name).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'row';
}
function fileNameFor(row, i, pad) {
  const raw = matchColumn(row, 'filename') || matchColumn(row, 'name') || 'row';
  // Always prefix the index so filenames stay unique even on duplicate values.
  return `${String(i + 1).padStart(pad, '0')}-${sanitize(raw)}.png`;
}

// --- export -----------------------------------------------------------------
function setProgress(msg) { if (el.mergeProgress) el.mergeProgress.textContent = msg || ''; }

export async function exportMerge() {
  const rows = state.mergeStudio.rows;
  if (!rows.length) { showNotification('Upload a CSV with at least one row first.', 'error'); return; }
  if (!state.image) { showNotification('Load a screenshot to use as the template first.', 'error'); return; }

  stopPreview(); // render from the clean template, not a previewed row
  const off = document.createElement('canvas');
  const saved = captureFields();
  const pad = String(rows.length).length;
  const files = {};
  let imgFailures = 0;

  setProgress('Rendering…');
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const f of MERGE_FIELDS) setByPath(state, f.path, substitute(saved.fields[f.path], row));
      const imgUrl = matchColumn(row, 'image');
      if (imgUrl) {
        try { state.image = await loadImageEl(imgUrl); }
        catch { state.image = saved.image; imgFailures++; }
      } else {
        state.image = saved.image;
      }
      renderInto(off, true);
      const blob = await new Promise((res) => off.toBlob(res, 'image/png'));
      files[fileNameFor(row, i, pad)] = new Uint8Array(await blob.arrayBuffer());
      setProgress(`Rendering ${i + 1}/${rows.length}…`);
      await new Promise((r) => setTimeout(r, 0));
    }
    await downloadZip(files, `merge-${Date.now()}.zip`);
    const warn = imgFailures ? ` (${imgFailures} image${imgFailures === 1 ? '' : 's'} failed → used base screenshot)` : '';
    setProgress(`Exported ${rows.length} design${rows.length === 1 ? '' : 's'}.${warn}`);
    showNotification(`Merge exported ${rows.length} design${rows.length === 1 ? '' : 's'} as ZIP.`, 'success');
  } catch (e) {
    console.error(e);
    setProgress('Failed.');
    showNotification(`Merge export failed: ${e.message || e}`, 'error');
  } finally {
    for (const f of MERGE_FIELDS) setByPath(state, f.path, saved.fields[f.path]);
    state.image = saved.image;
    render();
  }
}

// --- sample CSV -------------------------------------------------------------
function downloadSampleCsv() {
  const tokens = scanTokens();
  const header = [...tokens];
  if (!header.map((h) => h.toLowerCase()).includes('image')) header.push('image');
  if (!header.map((h) => h.toLowerCase()).includes('filename')) header.push('filename');
  const example = header.map((h) => {
    const l = h.toLowerCase();
    if (l === 'image') return 'https://example.com/shot.png';
    if (l === 'filename') return 'design-1';
    return `${h}-value`;
  });
  const csv = `${header.join(',')}\n${example.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'merge-sample.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- UI ---------------------------------------------------------------------
function updatePreviewUi() {
  const rows = state.mergeStudio.rows;
  const on = previewSaved != null;
  if (el.mergePreviewLabel) {
    el.mergePreviewLabel.textContent = on
      ? `Previewing row ${previewIndex + 1} / ${rows.length}`
      : (rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'} ready` : 'No rows loaded');
  }
  if (el.mergePreviewStop) el.mergePreviewStop.style.display = on ? '' : 'none';
  const disabled = rows.length === 0;
  if (el.mergePreviewPrev) el.mergePreviewPrev.disabled = disabled;
  if (el.mergePreviewNext) el.mergePreviewNext.disabled = disabled;
}

// Rebuild the discovered-token list + CSV match summary. Cheap; called whenever
// a templatable field changes or a CSV loads.
export function refreshMergeStudio() {
  const tokens = scanTokens();
  const columns = state.mergeStudio.columns || [];
  const colsLower = columns.map((c) => c.toLowerCase());

  if (el.mergeTokens) {
    if (!tokens.length) {
      el.mergeTokens.innerHTML = '<p class="info-text">No <code>{{tokens}}</code> yet. Type e.g. <code>{{name}}</code> into your text overlay, watermark, or browser title/URL — or into the color fields below.</p>';
    } else {
      el.mergeTokens.innerHTML = tokens.map((t) => {
        const matched = colsLower.includes(t.toLowerCase());
        const cls = matched ? 'merge-chip ok' : 'merge-chip warn';
        const mark = matched ? '✓' : '⚠';
        return `<span class="${cls}" title="${matched ? 'matched to a CSV column' : 'no matching CSV column'}">${mark} {{${t}}}</span>`;
      }).join('');
    }
  }

  // Summary: row count + which columns are unmatched (ignoring reserved ones).
  if (el.mergeSummary) {
    if (!columns.length) {
      el.mergeSummary.textContent = '';
    } else {
      const tokLower = tokens.map((t) => t.toLowerCase());
      const unused = columns.filter((c) => c && !tokLower.includes(c.toLowerCase()) && !RESERVED.includes(c.toLowerCase()));
      const missing = tokens.filter((t) => !colsLower.includes(t.toLowerCase()));
      const parts = [`${state.mergeStudio.rows.length} row${state.mergeStudio.rows.length === 1 ? '' : 's'}, ${columns.length} column${columns.length === 1 ? '' : 's'}.`];
      if (colsLower.includes('image')) parts.push('Per-row image column detected.');
      if (missing.length) parts.push(`⚠ Tokens without a column: ${missing.map((t) => `{{${t}}}`).join(', ')} → blank.`);
      if (unused.length) parts.push(`Unused columns: ${unused.join(', ')}.`);
      el.mergeSummary.textContent = parts.join(' ');
    }
  }

  // Keep the color-template inputs mirrored to the live template values.
  if (el.mergeColorBg && document.activeElement !== el.mergeColorBg) el.mergeColorBg.value = state.bgColor || '';
  if (el.mergeColorText && document.activeElement !== el.mergeColorText) el.mergeColorText.value = state.textOverlay.color || '';

  updatePreviewUi();
}

function loadCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const { columns, rows } = parseCsv(e.target.result);
    if (!rows.length) { showNotification('That CSV had no data rows.', 'error'); return; }
    stopPreview();
    state.mergeStudio.columns = columns;
    state.mergeStudio.rows = rows;
    refreshMergeStudio();
    showNotification(`Loaded ${rows.length} row${rows.length === 1 ? '' : 's'} from CSV.`, 'success');
  };
  reader.readAsText(file);
}

// Open + focus the Merge Studio section (command-palette entry point).
export function openMergeStudio() {
  document.querySelector('.rail-btn[data-group="export"]')?.click();
  const section = document.getElementById('merge-studio-section');
  if (section) {
    revealSection(section);   // v35 — shown even in Simple mode
    section.classList.remove('collapsed');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  refreshMergeStudio();
}

export function bindMergeStudio() {
  // CSV upload (button + drop zone).
  if (el.mergeCsvInput) el.mergeCsvInput.addEventListener('change', (e) => loadCsvFile(e.target.files[0]));
  if (el.mergeCsvDrop) {
    el.mergeCsvDrop.addEventListener('click', () => el.mergeCsvInput && el.mergeCsvInput.click());
    el.mergeCsvDrop.addEventListener('dragover', (e) => { e.preventDefault(); el.mergeCsvDrop.classList.add('dragover'); });
    el.mergeCsvDrop.addEventListener('dragleave', () => el.mergeCsvDrop.classList.remove('dragover'));
    el.mergeCsvDrop.addEventListener('drop', (e) => {
      e.preventDefault(); el.mergeCsvDrop.classList.remove('dragover');
      loadCsvFile(e.dataTransfer.files[0]);
    });
  }

  if (el.mergeSampleBtn) el.mergeSampleBtn.addEventListener('click', downloadSampleCsv);
  if (el.mergeExportBtn) el.mergeExportBtn.addEventListener('click', exportMerge);

  // Preview stepper.
  if (el.mergePreviewPrev) el.mergePreviewPrev.addEventListener('click', () => gotoPreview((previewIndex < 0 ? 0 : previewIndex) - 1));
  if (el.mergePreviewNext) el.mergePreviewNext.addEventListener('click', () => gotoPreview((previewIndex < 0 ? -1 : previewIndex) + 1));
  if (el.mergePreviewStop) el.mergePreviewStop.addEventListener('click', stopPreview);

  // Color-template inputs (the pickers can't hold {{tokens}}). Mirror the
  // linkColor pattern: live-update on input, snapshot history on change.
  const bindColorTemplate = (input, path) => {
    if (!input) return;
    input.addEventListener('input', (e) => {
      if (previewSaved) stopPreview();
      setByPath(state, path, e.target.value);
      render();
      refreshMergeStudio();
    });
    input.addEventListener('change', () => saveStateToHistory());
  };
  bindColorTemplate(el.mergeColorBg, 'bgColor');
  bindColorTemplate(el.mergeColorText, 'textOverlay.color');

  // Live token rescan when a templatable text field changes elsewhere. Deferred
  // to a macrotask: bindMergeStudio runs before bindAllControls in main.js, so
  // this listener would otherwise fire before bindings writes the new value to
  // state — reading it a keystroke stale. setTimeout(0) runs after that write.
  ['textContent', 'watermarkText', 'frameTitle', 'frameUrl'].forEach((k) => {
    if (el[k]) el[k].addEventListener('input', () => setTimeout(refreshMergeStudio, 0));
  });

  window.__mergeStudioRefresh = refreshMergeStudio;
  refreshMergeStudio();
}
