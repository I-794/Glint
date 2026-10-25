// v40 — Hindsight: pins (called versions in code). "Pin this step" keeps the
// current design under a name in state.versions (per page, saved with the
// project, at most MAX_VERSIONS). Restoring one is a normal undo step. A pin
// holds the design, not the screenshot, the same as every undo step.
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { saveStateToHistory, currentSnapshot, applySnapshot } from '../state/history.js';
import { makeVersion, MAX_VERSIONS, cleanName } from '../state/versions-core.js';
import { renderStepThumb } from '../render/history-thumbs.js';
import { ensureCompareImage } from '../render/compare.js';
import { notifyDocumentChange } from './pages.js';
import { showNotification } from '../ui/notification.js';
import { escapeHTML } from '../utils/dom.js';

const SINGLE_ONLY = 'Pins work in Single mode.';

let seq = 0;
const newId = () => 'ver_' + Date.now().toString(36) + '_' + (seq++);
let lastList = null;
let fieldAction = null;
let locked = false;

const list = () => (Array.isArray(state.versions) ? state.versions : []);

function commit(next) {
  state.versions = next;
  renderVersions();
  notifyDocumentChange();   // autosave picks it up (versions are not in undo)
}

function thumbOf(snap) {
  const c = renderStepThumb(snap, 160);
  try { return c ? c.toDataURL('image/jpeg', 0.7) : null; } catch (e) { return null; }
}

function closeField() {
  fieldAction = null;
  if (el.versionsField) el.versionsField.hidden = true;
}

function openField({ label, value, ok, onOk }) {
  if (!el.versionsField) return;
  el.versionsFieldLabel.textContent = label;
  el.versionsFieldInput.value = value;
  el.versionsFieldOk.textContent = ok;
  fieldAction = onOk;
  el.versionsField.hidden = false;
  requestAnimationFrame(() => { el.versionsFieldInput.focus(); el.versionsFieldInput.select(); });
}

function confirmField() {
  const run = fieldAction;
  const value = el.versionsFieldInput ? el.versionsFieldInput.value : '';
  closeField();
  if (run) run(value);
}

// Outside Single mode the live state is a set or board, not this page's scene,
// so saving or restoring a version there would capture or overwrite the wrong
// thing. The button and list go inert with the History list (history-panel.js
// shows the note), and an open name field is dropped.
function syncLock() {
  const on = state.mode !== 'single';
  if (on === locked) return;
  locked = on;
  if (el.historyVersionBtn) el.historyVersionBtn.disabled = on;
  if (el.versionsList) {
    el.versionsList.inert = on;
    el.versionsList.classList.toggle('hx-locked', on);
  }
  if (on) closeField();
}

export function saveVersion() {
  if (state.mode !== 'single') { showNotification(SINGLE_ONLY, 'error'); return; }
  if (list().length >= MAX_VERSIONS) { showNotification(`You can keep ${MAX_VERSIONS} pins per page. Delete one first.`, 'error'); return; }
  openField({
    label: 'Name this pin', value: `Pin ${list().length + 1}`, ok: 'Save',
    onOk: (name) => {
      if (state.mode !== 'single') { showNotification(SINGLE_ONLY, 'error'); return; }
      if (list().length >= MAX_VERSIONS) return;
      const snap = currentSnapshot();
      commit([...list(), makeVersion({ id: newId(), name, at: Date.now(), snap, thumb: thumbOf(snap) })]);
      showNotification(`Pinned "${cleanName(name)}".`, 'success');
    },
  });
}

export function restoreVersion(id) {
  if (state.mode !== 'single') { showNotification(SINGLE_ONLY, 'error'); return; }
  const v = list().find((x) => x.id === id);
  if (!v) return;
  saveStateToHistory(`Restored ${v.name}`);
  applySnapshot(JSON.parse(JSON.stringify(v.snap)));
  ensureCompareImage(state.compare && state.compare.beforeSrc).then(() => render());
  window.__motionStudioRefresh?.();
  render();
  showNotification(`Back to "${v.name}". Undo to return.`, 'success');
}

function renameVersion(id) {
  const v = list().find((x) => x.id === id);
  if (!v) return;
  openField({
    label: 'Rename pin', value: v.name, ok: 'Rename',
    onOk: (name) => commit(list().map((x) => (x.id === id ? { ...x, name: cleanName(name, x.name) } : x))),
  });
}

function deleteVersion(id) {
  const before = list();
  const i = before.findIndex((x) => x.id === id);
  if (i < 0) return;
  const gone = before[i];
  commit(before.filter((x) => x.id !== id));
  const owner = state.versions;   // a page switch or project load swaps the list; Undo then does nothing
  showNotification(`Removed "${gone.name}".`, 'success', {
    action: {
      label: 'Undo',
      run: () => {
        if (state.versions !== owner) return;
        const now = list();
        if (now.some((x) => x.id === gone.id) || now.length >= MAX_VERSIONS) return;
        const next = now.slice();
        next.splice(Math.min(i, next.length), 0, gone);
        commit(next);
      },
    },
  });
}

export function renderVersions() {
  lastList = state.versions;
  syncLock();
  if (!el.versionsList) return;
  const vs = list();
  if (el.versionsEmpty) el.versionsEmpty.hidden = vs.length > 0;
  el.versionsList.innerHTML = vs.map((v) => {
    const id = escapeHTML(v.id), name = escapeHTML(v.name);
    const day = new Date(v.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<li class="hx-version">
      <button type="button" class="hx-jump" data-version="${id}" title="Restore ${name}">
        <span class="hx-thumb">${v.thumb ? `<img src="${v.thumb}" alt="">` : ''}</span>
        <span class="hx-label">${name}</span>
        <span class="hx-time">${escapeHTML(day)}</span>
      </button>
      <button type="button" class="hx-icon" data-version-rename="${id}" title="Rename ${name}" aria-label="Rename ${name}">✎</button>
      <button type="button" class="hx-icon" data-version-delete="${id}" title="Remove ${name}" aria-label="Remove ${name}">✕</button>
    </li>`;
  }).join('');
}

export function bindVersions() {
  el.historyVersionBtn?.addEventListener('click', saveVersion);
  el.versionsList?.addEventListener('click', (e) => {
    if (state.mode !== 'single') return;
    const del = e.target.closest('[data-version-delete]');
    if (del) { deleteVersion(del.dataset.versionDelete); return; }
    const ren = e.target.closest('[data-version-rename]');
    if (ren) { renameVersion(ren.dataset.versionRename); return; }
    const btn = e.target.closest('[data-version]');
    if (btn) restoreVersion(btn.dataset.version);
  });
  el.versionsFieldOk?.addEventListener('click', confirmField);
  el.versionsFieldCancel?.addEventListener('click', closeField);
  el.versionsFieldInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmField(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeField(); }
  });
  // A page switch or project load replaces state.versions without a history change.
  // An open name field belongs to the old list, so it is dropped.
  window.__versionsCheck = () => {
    if (state.versions !== lastList) { closeField(); renderVersions(); } else syncLock();
  };
  // Set and Board mode never reach render()'s __versionsCheck, so check the
  // mode whenever a pointer or focus comes near the section (as the History list does).
  el.historySection?.addEventListener('pointerenter', syncLock);
  el.historySection?.addEventListener('focusin', syncLock);
  renderVersions();
}
