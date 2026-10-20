// v25 — Interactive Tours.
//
// A Tour turns the existing page sequence into a clickable, embeddable product
// demo: each page is a step, and each step carries hotspots + callouts (state.tour,
// which rides the page payload via serialize.js, so steps persist with the project
// and hotspot edits are undoable). This module is thin orchestration:
//   • a "Tour mode" toggle that shows the hotspot-authoring overlay (tour-overlay.js)
//   • step management reused wholesale from pages.js (addPage/switchTo/filmstrip)
//   • a per-step hotspot list + callout editor in the sidebar
//   • Preview / Export / Embed, delegated to tour-export.js
// Follows the deck/pages convention of using getElementById directly.

import { state } from '../state/state.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import { addPage } from './pages.js';
import {
  showTourOverlay, hideTourOverlay, refreshTourOverlay, onTourOverlayChange,
  getSelectedHotspot, selectHotspot, deleteHotspot, addDefaultHotspot
} from '../render/tour-overlay.js';
import { previewTour, exportTour, tourEmbedCode } from './tour-export.js';
import { showNotification } from '../ui/notification.js';

const $ = (id) => document.getElementById(id);

function inTourMode() { return state.mode === 'tour'; }

export function enterTourMode() {
  if (inTourMode()) return;
  window.__closeRollShot?.();   // v37 — a tour step saves the roll's design
  state.mode = 'tour';
  showTourOverlay();
  refreshTourUI();
}

export function exitTourMode() {
  if (!inTourMode()) return;
  state.mode = 'single';
  hideTourOverlay();
  refreshTourUI();
}

export function toggleTourMode() { inTourMode() ? exitTourMode() : enterTourMode(); }

// ── Sidebar sync ──────────────────────────────────────────────────────────────
function renderHotspotList() {
  const list = $('tour-hotspot-list');
  if (!list) return;
  const hs = (state.tour && state.tour.hotspots) || [];
  const sel = getSelectedHotspot();
  if (!hs.length) {
    list.innerHTML = `<p class="info-text" style="margin:4px 0;">No hotspots yet — drag on the canvas, or use “Add hotspot”.</p>`;
    return;
  }
  list.innerHTML = hs.map((h, i) => {
    const title = (h.callout && h.callout.title) || h.label || `Hotspot ${i + 1}`;
    const on = sel && sel.id === h.id;
    return `<div class="tour-hs-row${on ? ' active' : ''}" data-id="${h.id}">
      <span class="tour-hs-row-num">${i + 1}</span>
      <span class="tour-hs-row-label">${escapeHtml(title)}</span>
      <button class="tour-hs-row-del" data-del="${h.id}" title="Delete">✕</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.tour-hs-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      selectHotspot(row.dataset.id);
    });
  });
  list.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', (e) => { e.stopPropagation(); deleteHotspot(b.dataset.del); }));
}

function renderCalloutEditor() {
  const editor = $('tour-hotspot-editor');
  if (!editor) return;
  const h = getSelectedHotspot();
  editor.style.display = h ? '' : 'none';
  if (!h) return;
  const c = h.callout || (h.callout = { title: '', body: '', side: 'bottom' });
  if ($('tour-callout-title')) $('tour-callout-title').value = c.title || '';
  if ($('tour-callout-body')) $('tour-callout-body').value = c.body || '';
  if ($('tour-callout-side')) $('tour-callout-side').value = c.side || 'bottom';
}

function renderAutoAdvance() {
  const slider = $('tour-auto'), label = $('tour-auto-value');
  if (!slider) return;
  const ms = (state.tour && state.tour.autoAdvanceMs) | 0;
  slider.value = ms;
  if (label) label.textContent = ms > 0 ? (ms / 1000) + 's' : 'Off';
}

export function refreshTourUI() {
  const toggle = $('tour-toggle-btn'), editor = $('tour-editor'), section = $('tour-section');
  const on = inTourMode();
  if (toggle) toggle.textContent = on ? '■ Exit Tour mode' : '▶ Enter Tour mode';
  if (toggle) toggle.classList.toggle('btn-primary', !on);
  if (toggle) toggle.classList.toggle('btn-secondary', on);
  if (editor) editor.style.display = on ? '' : 'none';
  if (section) section.classList.toggle('tour-active', on);
  if (!on) return;
  renderHotspotList();
  renderCalloutEditor();
  renderAutoAdvance();
}

function escapeHtml(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

// ── Bind ──────────────────────────────────────────────────────────────────────
export function bindTours() {
  const toggle = $('tour-toggle-btn');
  if (toggle) toggle.addEventListener('click', toggleTourMode);

  const add = $('tour-add-step'), dup = $('tour-dup-step');
  if (add) add.addEventListener('click', () => addPage());
  if (dup) dup.addEventListener('click', () => addPage({ duplicate: true }));

  const addHs = $('tour-add-hotspot');
  if (addHs) addHs.addEventListener('click', () => { if (inTourMode()) addDefaultHotspot(); });

  // Callout edits: live-update state on input, commit to history on change.
  const wireCallout = (id, key) => {
    const node = $(id);
    if (!node) return;
    node.addEventListener('input', () => {
      const h = getSelectedHotspot();
      if (!h) return;
      (h.callout || (h.callout = { title: '', body: '', side: 'bottom' }))[key] = node.value;
      renderHotspotList();   // keep the list label in sync as you type
    });
    node.addEventListener('change', () => { if (getSelectedHotspot()) saveStateToHistory(); });
  };
  wireCallout('tour-callout-title', 'title');
  wireCallout('tour-callout-body', 'body');
  const side = $('tour-callout-side');
  if (side) side.addEventListener('change', () => {
    const h = getSelectedHotspot();
    if (!h) return;
    saveStateToHistory();
    (h.callout || (h.callout = {})).side = side.value;
  });

  const auto = $('tour-auto');
  if (auto) {
    auto.addEventListener('input', () => {
      state.tour.autoAdvanceMs = parseInt(auto.value, 10) || 0;
      renderAutoAdvance();
    });
    auto.addEventListener('change', () => saveStateToHistory());
  }

  const prev = $('tour-preview-btn'), exp = $('tour-export-btn'), emb = $('tour-embed-btn');
  if (prev) prev.addEventListener('click', previewTour);
  if (exp) exp.addEventListener('click', exportTour);
  if (emb) emb.addEventListener('click', async () => {
    const code = tourEmbedCode('tour.html');
    try { await navigator.clipboard.writeText(code); showNotification('Embed code copied. Host the exported .html and paste this iframe.', 'success'); }
    catch (e) { showNotification('Could not copy embed code.', 'error'); }
  });

  // Overlay → sidebar: selection/CRUD on the canvas updates the list + editor.
  onTourOverlayChange(() => { if (inTourMode()) { renderHotspotList(); renderCalloutEditor(); } });
  // Undo/redo (history.restore mutates state directly) → rebuild overlay + sidebar.
  onHistoryChange(() => { if (inTourMode()) { refreshTourOverlay(); renderHotspotList(); renderCalloutEditor(); renderAutoAdvance(); } });
  // After a step apply settles (document.js applyPayload .then) state.tour is fresh.
  window.__refreshTourUi = () => { if (inTourMode()) { refreshTourOverlay(); refreshTourUI(); } };
  // set-ui.js / video.js call this when they force a mode change away from Tour.
  window.__exitTourMode = exitTourMode;

  refreshTourUI();
}
