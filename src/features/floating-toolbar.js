// v35 — Floating selection toolbar.
//
// When canvas objects are selected, a small toolbar floats just above them with
// the edits people reach for most: color and stroke for annotations, color /
// size / bold / italic for the text overlay, the style of a redaction, plus
// Duplicate, Bring to front, Send to back, Delete, and "More" (the right-click
// menu). It acts on state.canvasSelection through the same selection.js handles
// as the context menu, so one object or a multi-selection behave the same.
//
// It is preview-only HTML (never drawn into the canvas, so it never exports).
// render() calls window.__syncFloatingToolbar after each preview frame; while
// it is showing, a rAF loop keeps it pinned through zoom, pan, and scrolling,
// and hides it if the selection or mode changed without a render().

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { saveStateToHistory } from '../state/history.js';
import { resolveRef, selectionBounds, duplicateSelection } from './selection.js';
import { deleteSelected } from './canvas-tools.js';
import { openContextMenuAt } from './context-menu.js';
import { gesture } from './gesture.js';
import { showNotification } from '../ui/notification.js';

const ENABLED_KEY = 'snapshotpro_float_toolbar';
const GAP = 10;          // px between the selection and the toolbar
const EDGE = 8;          // keep this far from the container edges
const STROKE_MIN = 1, STROKE_MAX = 30;
const TEXT_MIN = 12, TEXT_MAX = 200;

let bar = null;
let enabled = true;
let signature = '';      // rebuild the controls only when the selection changes
let anchor = null;       // selection bounds in canvas px, from the last sync
let lastRect = '';
let rafId = 0;

const ICONS = {
  duplicate: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  front: '<svg viewBox="0 0 24 24"><path d="M12 19V7"/><path d="m7 11 5-5 5 5"/><path d="M5 3h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M12 5v12"/><path d="m7 13 5 5 5-5"/><path d="M5 21h14"/></svg>',
  delete: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
};

const KIND_LABEL = { redaction: 'Redaction', extraImage: 'Image', text: 'Text', spotlight: 'Focus area' };

// --- Helpers --------------------------------------------------------------

function selectedAnnotations() {
  return state.canvasSelection
    .filter((r) => r.kind === 'annotation')
    .map((r) => (state.annotations || []).find((a) => a.id === r.id))
    .filter(Boolean);
}

function selectedRedactions() {
  return state.canvasSelection
    .filter((r) => r.kind === 'redaction')
    .map((r) => (state.redactions || []).find((x) => x.id === r.id))
    .filter(Boolean);
}

function labelFor(sel) {
  if (sel.length > 1) return `${sel.length} items`;
  const ref = sel[0];
  if (ref.kind === 'annotation') {
    const ann = (state.annotations || []).find((a) => a.id === ref.id);
    const t = ann && ann.type ? String(ann.type) : 'Shape';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return KIND_LABEL[ref.kind] || 'Object';
}

function toHex(c) {
  return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffffff';
}

function refreshSidebar() {
  if (window.__updateUIFromState) window.__updateUIFromState();
}

// Run a one-shot edit as its own undo step, then redraw.
function commit(fn) {
  saveStateToHistory();
  fn();
  render();
}

// --- Controls -------------------------------------------------------------

function iconButton(icon, label, run) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ftb-btn';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = ICONS[icon];
  b.addEventListener('click', (e) => { e.stopPropagation(); run(e); });
  return b;
}

function textButton(text, label, run, pressed) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ftb-btn ftb-text';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.textContent = text;
  if (pressed != null) b.setAttribute('aria-pressed', String(!!pressed));
  b.addEventListener('click', (e) => { e.stopPropagation(); run(b); });
  return b;
}

// Color input: live preview on `input`, one undo step on `change` (history.js
// snapshots at the first `input`, so the step restores the original color).
function colorInput(label, value, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'ftb-color';
  wrap.title = label;
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = toHex(value);
  inp.setAttribute('aria-label', label);
  wrap.style.setProperty('--swatch', inp.value);
  inp.addEventListener('input', () => {
    wrap.style.setProperty('--swatch', inp.value);
    onInput(inp.value);
    render();
  });
  inp.addEventListener('change', () => { saveStateToHistory(); refreshSidebar(); });
  wrap.appendChild(inp);
  return wrap;
}

// − value + stepper. get() returns the current number; set(n) applies it.
function stepper(label, unit, get, set, min, max, step) {
  const wrap = document.createElement('div');
  wrap.className = 'ftb-stepper';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', label);
  const val = document.createElement('span');
  val.className = 'ftb-value';
  const show = () => { val.textContent = Math.round(get()) + unit; };
  const bump = (d) => {
    const next = Math.max(min, Math.min(max, Math.round(get()) + d));
    if (next === Math.round(get())) return;
    commit(() => set(next));
    show();
    refreshSidebar();
  };
  wrap.append(
    textButton('−', `Decrease ${label.toLowerCase()}`, () => bump(-step)),
    val,
    textButton('+', `Increase ${label.toLowerCase()}`, () => bump(step)),
  );
  show();
  return wrap;
}

function divider() {
  const d = document.createElement('span');
  d.className = 'ftb-sep';
  return d;
}

function build() {
  const sel = state.canvasSelection;
  bar.textContent = '';

  const chip = document.createElement('span');
  chip.className = 'ftb-label';
  chip.textContent = labelFor(sel);
  bar.appendChild(chip);

  const anns = selectedAnnotations();
  const reds = selectedRedactions();
  const onlyText = sel.length === 1 && sel[0].kind === 'text';

  if (anns.length) {
    bar.appendChild(divider());
    bar.appendChild(colorInput('Color', anns[0].color, (c) => anns.forEach((a) => { a.color = c; })));
    bar.appendChild(stepper('Stroke width', '', () => anns[0].strokeWidth || 4,
      (n) => anns.forEach((a) => { a.strokeWidth = n; }), STROKE_MIN, STROKE_MAX, 1));
  }

  if (onlyText) {
    const t = state.textOverlay;
    bar.appendChild(divider());
    bar.appendChild(colorInput('Text color', t.color, (c) => { t.color = c; }));
    bar.appendChild(stepper('Text size', '', () => t.size, (n) => { t.size = n; }, TEXT_MIN, TEXT_MAX, 4));
    bar.appendChild(textButton('B', 'Bold', (b) => {
      commit(() => { t.bold = !t.bold; });
      b.setAttribute('aria-pressed', String(t.bold));
      refreshSidebar();
    }, t.bold));
    bar.appendChild(textButton('I', 'Italic', (b) => {
      commit(() => { t.italic = !t.italic; });
      b.setAttribute('aria-pressed', String(t.italic));
      refreshSidebar();
    }, t.italic));
  }

  if (reds.length && !anns.length) {
    bar.appendChild(divider());
    const s = document.createElement('select');
    s.className = 'ftb-select';
    s.title = 'Redaction style';
    s.setAttribute('aria-label', 'Redaction style');
    s.innerHTML = '<option value="pixelate">Pixelate</option><option value="blur">Blur</option>';
    s.value = reds[0].type === 'blur' ? 'blur' : 'pixelate';
    s.addEventListener('change', () => {
      saveStateToHistory();
      reds.forEach((r) => { r.type = s.value; });
      render();
    });
    bar.appendChild(s);
  }

  const editable = sel.some((r) => r.kind !== 'text');
  const stackable = sel.some((r) => r.kind !== 'text' && r.kind !== 'spotlight');
  if (editable || stackable) bar.appendChild(divider());
  if (editable) {
    bar.appendChild(iconButton('duplicate', 'Duplicate (Ctrl/⌘ D)', () => { if (duplicateSelection()) render(); }));
  }
  if (stackable) {
    bar.appendChild(iconButton('front', 'Bring to front', () => reorder('front')));
    bar.appendChild(iconButton('back', 'Send to back', () => reorder('back')));
  }
  if (editable) {
    const del = iconButton('delete', 'Delete (Del)', () => deleteSelected());
    del.classList.add('ftb-danger');
    bar.appendChild(del);
  }
  bar.appendChild(iconButton('more', 'More actions', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openContextMenuAt(r.left, r.bottom + 6);
  }));
}

function reorder(dir) {
  commit(() => {
    state.canvasSelection.forEach((ref) => {
      const h = resolveRef(ref);
      if (!h) return;
      if (dir === 'front') h.raiseToFront(); else h.sendToBack();
    });
  });
}

// --- Visibility + position ------------------------------------------------

function canShow() {
  if (!enabled || !bar) return false;
  if (state.mode !== 'single' || !state.image) return false;
  if (!state.canvasSelection.length || gesture.canvasBusy) return false;
  const wrap = el.canvasWrapper || document.getElementById('canvas-wrapper');
  if (wrap && wrap.style.display === 'none') return false;
  return true;
}

function sigOf() {
  return state.canvasSelection.map((r) => `${r.kind}:${r.id ?? ''}`).join('|') +
    `#${(state.annotations || []).length}#${(state.redactions || []).length}`;
}

function hide() {
  if (!bar) return;
  bar.classList.remove('visible');
  bar.setAttribute('aria-hidden', 'true');
  signature = '';
  anchor = null;
  lastRect = '';
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
}

function place() {
  if (!anchor || !bar) return;
  const canvas = el.previewCanvas;
  const host = bar.parentElement;
  if (!canvas || !host || !canvas.width || !canvas.height) return;
  const cr = canvas.getBoundingClientRect();
  const hr = host.getBoundingClientRect();
  if (!cr.width || !cr.height) return;
  const sx = cr.width / canvas.width, sy = cr.height / canvas.height;
  const boxLeft = cr.left + anchor.x * sx, boxTop = cr.top + anchor.y * sy;
  const boxW = anchor.w * sx, boxH = anchor.h * sy;
  const bw = bar.offsetWidth, bh = bar.offsetHeight;

  let left = boxLeft + boxW / 2 - bw / 2 - hr.left;
  let top = boxTop - bh - GAP - hr.top;
  // Not enough room above the selection → put it underneath.
  if (top < EDGE) top = boxTop + boxH + GAP - hr.top;
  left = Math.max(EDGE, Math.min(left, hr.width - bw - EDGE));
  top = Math.max(EDGE, Math.min(top, hr.height - bh - EDGE));
  bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

// Follow zoom / pan / scroll / resize while visible: re-place only when the
// canvas's on-screen rect actually moves.
function track() {
  rafId = 0;
  if (!bar || !bar.classList.contains('visible')) return;
  // Some switches (Board view, document loads) skip render(); catch them here.
  if (!canShow()) { hide(); return; }
  const cr = el.previewCanvas.getBoundingClientRect();
  const hr = bar.parentElement.getBoundingClientRect();
  const key = `${cr.left}|${cr.top}|${cr.width}|${cr.height}|${hr.left}|${hr.top}|${hr.width}|${hr.height}`;
  if (key !== lastRect) { lastRect = key; place(); }
  rafId = requestAnimationFrame(track);
}

export function syncFloatingToolbar() {
  if (!canShow()) { hide(); return; }
  const b = selectionBounds();
  if (!b) { hide(); return; }
  anchor = b;
  const sig = sigOf();
  // Don't rebuild while the person is using one of the toolbar's own inputs
  // (the color picker re-renders on every input event).
  const busy = bar.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (sig !== signature && !busy) { signature = sig; build(); }
  bar.classList.add('visible');
  bar.removeAttribute('aria-hidden');
  place();
  if (!rafId) rafId = requestAnimationFrame(track);
}

export function setFloatingToolbarEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(ENABLED_KEY, enabled ? 'on' : 'off'); } catch (e) {}
  if (enabled) syncFloatingToolbar(); else hide();
}

export function toggleFloatingToolbar() {
  setFloatingToolbarEnabled(!enabled);
  showNotification(enabled ? 'Floating toolbar on' : 'Floating toolbar off. Turn it back on from Cmd-K.', 'success');
}

export function isFloatingToolbarEnabled() { return enabled; }

export function bindFloatingToolbar() {
  const host = document.getElementById('drop-zone');
  if (!host) return;
  try { enabled = localStorage.getItem(ENABLED_KEY) !== 'off'; } catch (e) { enabled = true; }

  bar = document.createElement('div');
  bar.className = 'floating-toolbar';
  bar.id = 'floating-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Selection');
  bar.setAttribute('aria-hidden', 'true');
  // Keep clicks here from reaching the drop zone / viewport (pan, deselect).
  ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel'].forEach((t) =>
    bar.addEventListener(t, (e) => e.stopPropagation()));
  bar.addEventListener('contextmenu', (e) => e.preventDefault());
  host.appendChild(bar);

  window.__syncFloatingToolbar = syncFloatingToolbar;
  // A drag ends without always re-rendering; re-show the bar once it's done.
  window.addEventListener('pointerup', () => requestAnimationFrame(syncFloatingToolbar));
}
