import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { undo, redo } from '../state/history.js';
import { render } from '../render/render.js';
import { holdOriginal } from '../render/hold-original.js';
import { exportImage, copyToClipboard } from './export.js';
import { openPalette, closePalette } from './palette.js';
import { closeStickerDrawer } from './stickers.js';
import { setTool, deleteSelected, nudgeSelected } from './canvas-tools.js';
import { clearSelection, selectAll, duplicateSelection } from './selection.js';
import { isTypingTarget, isTextEntry } from '../utils/dom.js';
import { timelineActive, timelineStepFrame, timelineSetIn, timelineSetOut } from './timeline.js';
import { matchEvent } from './shortcuts.js';
import { quickExport } from './export-presets.js';

function showShortcuts(show) {
  if (!el.shortcutsOverlay) return;
  el.shortcutsOverlay.style.display = show ? 'flex' : 'none';
}

// v39 — hold backslash to see the screenshot without its flip, grade, curves,
// Bokeh, Compare and filters. Preview only (render/hold-original.js); a small
// chip on the canvas says so while it is held.
let holdChip = null;
function setHoldOriginal(on) {
  if (holdOriginal.held === on) return;
  holdOriginal.held = on;
  if (!holdChip && on) {
    holdChip = document.createElement('div');
    holdChip.className = 'hold-original-chip';
    holdChip.setAttribute('role', 'status');
    holdChip.setAttribute('aria-live', 'polite');
    holdChip.textContent = 'Original';
    (document.getElementById('drop-zone') || document.body).appendChild(holdChip);
  }
  if (holdChip) holdChip.classList.toggle('show', on);
  render();
}
const isHoldKey = (e) => e.code === 'Backslash' && !e.ctrlKey && !e.metaKey && !e.altKey;

export function bindKeyboard() {
  document.addEventListener('keyup', (e) => { if (e.code === 'Backslash') setHoldOriginal(false); });
  window.addEventListener('blur', () => setHoldOriginal(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setHoldOriginal(false); });

  document.addEventListener('keydown', (e) => {
    const cmd = e.ctrlKey || e.metaKey;

    // Cmd/Ctrl+K toggles the palette and must work even while it's open.
    if (cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (state.ui.paletteOpen) closePalette(); else openPalette();
      return;
    }
    if (state.ui.paletteOpen) return;

    if (isHoldKey(e) && !isTypingTarget(e.target) && state.mode === 'single' && state.image) {
      e.preventDefault();
      if (!e.repeat) setHoldOriginal(true);
      return;
    }

    if (e.key === 'Escape') {
      // v32.1 — board Esc cascade: cancel connect → clear selection → exit board.
      if (state.mode === 'board' && typeof window.__boardEscape === 'function') { window.__boardEscape(); return; }
      if (el.shortcutsOverlay && el.shortcutsOverlay.style.display === 'flex') { showShortcuts(false); return; }
      if (state.ui.stickerDrawerOpen) { closeStickerDrawer(); return; }
      if (state.tool !== 'select') { setTool('select'); clearSelection(); render(); return; }
      clearSelection();
      render();
      return;
    }

    // Declarative global shortcuts — single source of truth is shortcuts.js.
    const sc = matchEvent(e);
    // v38 — undo/redo still work from a focused slider, checkbox or color
    // picker; only real text fields keep the browser's own undo.
    if (isTypingTarget(e.target) && !((sc === 'undo' || sc === 'redo') && !isTextEntry(e.target))) return;

    if (sc) {
      e.preventDefault();
      // v32.1 — on the board these act on the board, not the hidden active page.
      if (state.mode === 'board') {
        switch (sc) {
          case 'undo':       window.__boardUndo?.(); return;
          case 'redo':       window.__boardRedo?.(); return;
          case 'select-all': window.__boardSelectAll?.(); return;
          case 'export':     window.__boardExport?.(); return;
          case 'quick-export': window.__boardExport?.(); return;
          case 'duplicate':  return;
        }
      }
      switch (sc) {
        case 'undo':   undo(render); return;
        case 'redo':   redo(render); return;
        case 'export': exportImage(); return;
        case 'quick-export': quickExport(); return;
        case 'copy':   copyToClipboard(); return;
        case 'help':   showShortcuts(el.shortcutsOverlay.style.display !== 'flex'); return;
        case 'duplicate':  if (duplicateSelection()) render(); return;
        case 'select-all': if (state.image && state.tool === 'select') { selectAll(); render(); } return;
      }
    }

    // Bespoke, context-sensitive handlers (listed in shortcuts.js as displayOnly).
    if (!cmd) {
      // v15.1 — frame-accurate timeline control when a clip is loaded.
      if (timelineActive()) {
        if (e.key === ',') { e.preventDefault(); timelineStepFrame(-1); return; }
        if (e.key === '.') { e.preventDefault(); timelineStepFrame(1); return; }
        if (e.key === '[') { e.preventDefault(); timelineSetIn(); return; }
        if (e.key === ']') { e.preventDefault(); timelineSetOut(); return; }
      }
      // v32 — these bespoke canvas handlers own Delete/Backspace and arrow-nudge
      // for the SINGLE-canvas editor. In board mode the board's own window-level
      // handler owns Delete (acting on boardSelection); skip here so Delete
      // doesn't also run deleteSelected() on a stale canvasSelection.
      if (state.mode === 'single') {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          if (nudgeSelected(dx, dy, !e.repeat)) e.preventDefault();
          return;
        }
      }
    }
  });

  if (el.shortcutsBtn) el.shortcutsBtn.addEventListener('click', () => showShortcuts(true));
  if (el.closeShortcutsBtn) el.closeShortcutsBtn.addEventListener('click', () => showShortcuts(false));
  if (el.shortcutsOverlay) el.shortcutsOverlay.addEventListener('click', (e) => {
    if (e.target === el.shortcutsOverlay) showShortcuts(false);
  });
}
