// v40 — Hindsight: the History panel. Every undo step is a row, newest first,
// with a name (state/history-labels.js), a small picture (render/history-thumbs.js)
// and an eye to peek. Click a row to go there; hold the eye to look without
// moving. Replaces the v4 history dots, which never had markup in the editor.
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { history, onHistoryChange, historyTimeline, goToStep, peekStep, endPeek, isPeeking } from '../state/history.js';
import { describeChange } from '../state/history-labels.js';
import { renderStepThumb } from '../render/history-thumbs.js';
import { revealSection } from './studio-nav.js';
import { escapeHTML } from '../utils/dom.js';

const THUMB_W = 96;   // drawn at 2x the 48px slot
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

let thumbs = new WeakMap();   // step record -> canvas; a non-current step never changes
let thumbImage = null;        // the screenshot the cached thumbs were drawn with
const labels = new WeakMap(); // step record -> inferred name
let queue = [];
let idleHandle = null;
let liveTimer = null;
let stale = true;             // a history change arrived while the list could not be drawn
let labelFrame = null;
let peekVia = null;           // { pointerId } or 'key' while this panel holds a peek
let locked = false;           // the list is frozen outside Single mode
let note = null;

const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 60));

function sectionOpen() {
  const sec = el.historySection;
  return !!sec && state.mode === 'single' && sec.offsetParent !== null && !sec.classList.contains('collapsed');
}

function labelFor(entry, prev) {
  if (entry.step.label) return entry.step.label;
  if (!prev) return history.trimmed ? 'Earliest kept step' : 'Start';
  if (!entry.current && labels.has(entry.step)) return labels.get(entry.step);
  const text = describeChange(prev.snap, entry.snap);
  if (!entry.current) labels.set(entry.step, text);
  return text;
}

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

function checkImage() {
  if (state.image !== thumbImage) { thumbs = new WeakMap(); thumbImage = state.image; }
}

function placeThumb(index, canvas) {
  const slot = el.historyList && el.historyList.querySelector(`[data-thumb="${index}"]`);
  if (slot && canvas) slot.replaceChildren(canvas);
}

// Outside Single mode the rows would jump or peek a scene snapshot behind the
// set or board, and their indexes go out of date as more steps are saved, so
// the list is frozen with a note until it is rebuilt in Single mode.
function setLocked(on) {
  if (!el.historyList || on === locked) return;
  locked = on;
  el.historyList.inert = on;
  el.historyList.classList.toggle('hx-locked', on);
  if (on && !note) {
    note = document.createElement('p');
    note.className = 'info-text hx-note';
    note.textContent = 'History works in Single mode.';
    el.historyList.before(note);
  }
  if (note) note.hidden = !on;
}

// One full offscreen render per idle slice, older steps first, the live one
// last so the single-image caches (grade, Bokeh, flip, compare) end warm for
// the preview.
function drainThumbs() {
  idleHandle = null;
  if (!sectionOpen() || !state.image || isPeeking()) {
    if (queue.length) stale = true;
    queue = [];
    return;
  }
  checkImage();
  while (queue.length) {
    const entry = queue.shift();
    const cached = entry.current ? null : thumbs.get(entry.step);
    if (cached) { placeThumb(entry.index, cached); continue; }
    const canvas = renderStepThumb(entry.snap, THUMB_W);
    if (canvas && !entry.current) thumbs.set(entry.step, canvas);
    placeThumb(entry.index, canvas);
    break;
  }
  if (queue.length && idleHandle == null) idleHandle = idle(drainThumbs);
}

export function renderHistoryPanel() {
  if (el.undoBtn) el.undoBtn.disabled = history.past.length === 0;
  if (el.redoBtn) el.redoBtn.disabled = history.future.length === 0;
  syncPeekChrome();
  if (state.mode !== 'single') setLocked(true);
  if (!el.historyList || !sectionOpen() || isPeeking()) { stale = true; return; }
  stale = false;
  setLocked(false);
  const tl = historyTimeline();
  const rows = tl.map((entry, i) => ({ entry, label: labelFor(entry, tl[i - 1]) })).reverse();
  el.historyList.innerHTML = rows.map(({ entry, label }) => {
    const cls = entry.current ? ' current' : (entry.index > history.past.length ? ' future' : '');
    const name = escapeHTML(label);
    return `<li class="hx-row${cls}">
      <button type="button" class="hx-jump" data-index="${entry.index}"${entry.current ? ' aria-current="step"' : ''} title="${entry.current ? 'You are here' : `Go to: ${name}`}">
        <span class="hx-thumb" data-thumb="${entry.index}"></span>
        <span class="hx-label">${name}</span>
        <span class="hx-time">${ago(entry.step.at)}</span>
      </button>${entry.current ? '' : `
      <button type="button" class="hx-peek" data-peek="${entry.index}" title="Hold to preview" aria-label="Hold to preview: ${name}">${EYE}</button>`}
    </li>`;
  }).join('');
  if (el.historyCount) el.historyCount.textContent = `${tl.length} step${tl.length === 1 ? '' : 's'}`;
  queue = rows.filter((r) => !r.entry.current).concat(rows.filter((r) => r.entry.current)).map((r) => r.entry);
  if (idleHandle == null) idleHandle = idle(drainThumbs);
}

function fixCurrentLabel() {
  const name = el.historyList?.querySelector('.hx-row.current .hx-label');
  if (!name) return;
  const tl = historyTimeline();
  const cur = tl[history.past.length];
  name.textContent = labelFor(cur, tl[cur.index - 1]);
  return tl;
}

// Most actions save before they mutate, so the list drawn on that save named
// the live row before its change; name it again on the next frame.
function afterHistoryChange() {
  renderHistoryPanel();
  if (labelFrame != null) cancelAnimationFrame(labelFrame);
  labelFrame = requestAnimationFrame(() => {
    labelFrame = null;
    if (sectionOpen() && !isPeeking() && !stale) fixCurrentLabel();
  });
}

// After a live edit (a slider drag renders without a history change), redraw
// only the current row's picture and name, once the canvas settles.
function onRendered() {
  syncPeekChrome();
  if (state.mode !== 'single') { setLocked(true); return; }
  if (!sectionOpen() || isPeeking()) return;
  // Back in Single mode: rebuild before the frozen rows can be used.
  if (locked) { renderHistoryPanel(); return; }
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    if (!sectionOpen() || isPeeking() || !state.image) return;
    const before = thumbImage;
    checkImage();
    // Back from Set or Board mode, or edits made while the list was hidden.
    if (stale || before !== thumbImage) { renderHistoryPanel(); return; }
    const tl = fixCurrentLabel() || historyTimeline();
    const cur = tl[history.past.length];
    placeThumb(cur.index, renderStepThumb(cur.snap, THUMB_W));
  }, 500);
}

// Shares the v39 hold-to-compare chip style, which is shown by the .show class.
let chip = null;
function showPeekChip(on) {
  if (!chip && on && el.dropZone) {
    chip = document.createElement('div');
    chip.className = 'history-peek-chip';
    chip.setAttribute('role', 'status');
    chip.setAttribute('aria-live', 'polite');
    chip.textContent = 'Previewing a step';
    el.dropZone.appendChild(chip);
  }
  if (chip) chip.classList.toggle('show', on);
}

// The chip and the pressed eye follow isPeeking(), so they cannot outlive a
// peek that undo, a save or a jump ended.
function syncPeekChrome() {
  const on = isPeeking();
  if (!on) {
    peekVia = null;
    el.historyList?.querySelectorAll('.hx-peek.active').forEach((b) => b.classList.remove('active'));
  }
  if (chip || on) showPeekChip(on);
}

function startPeek(btn, via) {
  if (state.mode !== 'single' || !peekStep(Number(btn.dataset.peek), render)) return false;
  peekVia = via;
  btn.classList.add('active');
  showPeekChip(true);
  return true;
}

function stopPeek() {
  const chipWasOn = !!chip && chip.classList.contains('show');
  // A peek ended elsewhere without a re-render still needs the canvas redrawn.
  if (!endPeek(render) && chipWasOn) render();
  peekVia = null;
  syncPeekChrome();
}

export function openHistory() {
  if (!el.historySection) return;
  revealSection(el.historySection);
  el.historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  requestAnimationFrame(renderHistoryPanel);
}

export function bindHistoryPanel() {
  onHistoryChange(afterHistoryChange);
  window.__historyPanelCheck = onRendered;
  if (!el.historyList) return;

  el.historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-index]');
    if (!btn || state.mode !== 'single') return;
    if (goToStep(Number(btn.dataset.index), render)) {
      el.historyList.querySelector('.hx-row.current .hx-jump')?.focus();
    }
  });

  // Hold the eye (mouse, pen or touch) to peek. The press is ended from
  // window listeners: a list rebuild during the hold (undo, a save) detaches
  // the button, so listeners on it would never hear the release.
  el.historyList.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-peek]');
    if (!btn || e.button !== 0) return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    startPeek(btn, { pointerId: e.pointerId });
  });
  const endPointerPeek = (e) => {
    if (peekVia && typeof peekVia === 'object' && peekVia.pointerId === e.pointerId) stopPeek();
  };
  window.addEventListener('pointerup', endPointerPeek, true);
  window.addEventListener('pointercancel', endPointerPeek, true);

  // Keyboard: hold Space or Enter on the eye. Releasing the key anywhere, or
  // focus leaving the eye (Tab, a click elsewhere), ends it.
  el.historyList.addEventListener('keydown', (e) => {
    const btn = e.target.closest && e.target.closest('[data-peek]');
    if (!btn || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    startPeek(btn, 'key');
  });
  window.addEventListener('keyup', (e) => {
    if (peekVia === 'key' && (e.key === ' ' || e.key === 'Enter')) stopPeek();
  }, true);
  el.historyList.addEventListener('focusout', (e) => {
    if (peekVia === 'key' && e.target.closest && e.target.closest('[data-peek]')) stopPeek();
  });
  window.addEventListener('blur', () => { if (isPeeking()) stopPeek(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && isPeeking()) stopPeek(); });

  // Set and Board mode draw their own preview and never reach onRendered, so
  // the list checks the mode itself whenever a pointer or focus comes near it.
  const checkMode = () => {
    if (state.mode !== 'single') setLocked(true);
    else if (locked && sectionOpen()) renderHistoryPanel();
  };
  el.historySection.addEventListener('pointerenter', checkMode);
  el.historySection.addEventListener('focusin', checkMode);

  // Draw when the section comes into view or is expanded.
  el.historySection.querySelector('.section-title')?.addEventListener('click', () => requestAnimationFrame(renderHistoryPanel));
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) renderHistoryPanel(); }).observe(el.historySection);
  }
}
