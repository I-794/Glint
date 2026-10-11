// v35 — Simple / Pro mode.
//
// Simple mode trims the sidebar to the essentials (the sections tagged
// data-simple in editor/index.html: upload, basic adjustments, text, background,
// frame, export, projects). Pro shows everything. It only changes which panels
// are visible; every feature keeps working and anything already applied keeps
// rendering and exporting.
//
// First-time visitors start in Simple. Anyone who has used the editor before
// (welcome dismissed, a saved sidebar tab, or a seen version) starts in Pro so
// their panels don't vanish on upgrade. The choice persists in localStorage.

import { setSimpleFilter } from './studio-nav.js';
import { showNotification } from '../ui/notification.js';

const KEY = 'snapshotpro_ui_mode';
const RETURNING_KEYS = ['snapshotpro_welcome_v1', 'snapshotpro_studio_group', 'snapshotpro_lastseen_version'];

let mode = 'pro';

function initialMode() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'simple' || saved === 'pro') return saved;
    return RETURNING_KEYS.some(k => localStorage.getItem(k) != null) ? 'pro' : 'simple';
  } catch (e) {
    return 'pro';
  }
}

export function getUiMode() { return mode; }

export function setUiMode(next, { announce = false } = {}) {
  if (next !== 'simple' && next !== 'pro') return;
  mode = next;
  try { localStorage.setItem(KEY, next); } catch (e) {}
  document.body.classList.toggle('ui-simple', next === 'simple');
  document.querySelectorAll('#ui-mode-toggle [data-mode]').forEach(b => {
    const on = b.dataset.mode === next;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  setSimpleFilter(next === 'simple');
  if (announce) {
    showNotification(next === 'simple'
      ? 'Simple mode: just the essentials. Switch to Pro any time for every tool.'
      : 'Pro mode: every tool is showing.', 'success');
  }
}

export function toggleUiMode() {
  setUiMode(mode === 'simple' ? 'pro' : 'simple', { announce: true });
}

export function bindUiMode() {
  const wrap = document.getElementById('ui-mode-toggle');
  if (wrap) {
    wrap.querySelectorAll('[data-mode]').forEach(b =>
      b.addEventListener('click', () => {
        if (b.dataset.mode !== mode) setUiMode(b.dataset.mode, { announce: true });
      }));
  }
  window.__setUiMode = (m) => setUiMode(m, { announce: true });
  setUiMode(initialMode());
}
