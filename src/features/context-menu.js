// v28 — Studio Quality-of-Life: right-click context menu for canvas objects.
//
// Listens for `contextmenu` on the preview canvas, hit-tests the point through
// the shared selection model, and shows a small HTML menu at the cursor. All
// actions operate on the current multi-selection via selection.js handles, so
// "Duplicate", "Delete", reorder, copy/paste style, and align work on one object
// or many identically.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { saveStateToHistory } from '../state/history.js';
import { getCanvasCoords } from '../utils/geometry.js';
import {
  resolveRef, isRefSelected, selectOnly, selectAll, clearSelection,
  groupAlign, duplicateSelection,
  groupDistribute, groupMatchSize, setSelectionFlag, unlockAll,
} from './selection.js';
import { hitTopRef, deleteSelected } from './canvas-tools.js';
import { renderLayersPanel } from './layers.js';
import { showNotification } from '../ui/notification.js';

let menuEl = null;
// Module-level "style clipboard" — copied from an annotation, pasted onto others.
let styleClipboard = null;

function hasAnnotationSelected() {
  return state.canvasSelection.some((r) => r.kind === 'annotation');
}

// --- Actions --------------------------------------------------------------

function duplicate() {
  if (duplicateSelection()) render();
  closeMenu();
}

function reorder(dir) {
  if (!state.canvasSelection.length) return;
  saveStateToHistory();
  state.canvasSelection.forEach((ref) => {
    const h = resolveRef(ref);
    if (!h) return;
    if (dir === 'front') h.raiseToFront(); else h.sendToBack();
  });
  render();
  closeMenu();
}

function copyStyle() {
  const h = state.canvasSelection.map(resolveRef).find((x) => x && x.getStyle);
  if (h) styleClipboard = h.getStyle();
  closeMenu();
}

function pasteStyle() {
  if (!styleClipboard) { closeMenu(); return; }
  saveStateToHistory();
  state.canvasSelection.forEach((ref) => { const h = resolveRef(ref); if (h && h.setStyle) h.setStyle(styleClipboard); });
  render();
  closeMenu();
}

function align(how) {
  saveStateToHistory();
  groupAlign(how);
  render();
  closeMenu();
}

// v33 — distribute / match size / hide / lock.
function distribute(axis) {
  saveStateToHistory();
  groupDistribute(axis);
  render();
  closeMenu();
}

function matchSize(dim) {
  saveStateToHistory();
  groupMatchSize(dim);
  render();
  closeMenu();
}

function flag(which) {
  if (setSelectionFlag(which)) {
    render(); renderLayersPanel();
    showNotification(which === 'hide' ? 'Hidden. Show it again from Layers or "Unlock & show all".' : 'Locked. Unlock from Layers or "Unlock & show all".', 'success');
  }
  closeMenu();
}

function unlockEverything() {
  const n = unlockAll();
  if (n) { render(); renderLayersPanel(); }
  showNotification(n ? `Unlocked ${n} object${n === 1 ? '' : 's'}` : 'Nothing is hidden or locked', 'success');
  closeMenu();
}

function hasHiddenOrLocked() {
  return [...(state.annotations || []), ...(state.redactions || []), ...(state.extraImages || [])]
    .some((o) => o.locked || o.visible === false);
}

function alignItems() {
  return [
    { label: 'Left',     run: () => align('left') },
    { label: 'Center',   run: () => align('hcenter') },
    { label: 'Right',    run: () => align('right') },
    { label: 'Top',      run: () => align('top') },
    { label: 'Middle',   run: () => align('vcenter') },
    { label: 'Bottom',   run: () => align('bottom') },
  ];
}

// Build the item list for the current selection.
function buildItems() {
  const n = state.canvasSelection.length;
  if (n === 0) {
    const items = [{ label: 'Select all', icon: '▦', run: () => { selectAll(); render(); closeMenu(); } }];
    if (styleClipboard) items.push({ label: 'Paste style', icon: '🖌', disabled: true });
    if (hasHiddenOrLocked()) items.push({ label: 'Unlock & show all', icon: '🔓', run: unlockEverything });
    return items;
  }
  const dupable = state.canvasSelection.some((r) => r.kind !== 'text');
  const items = [];
  if (dupable) items.push({ label: n > 1 ? `Duplicate ${n} items` : 'Duplicate', icon: '⧉', keys: 'Ctrl/⌘ D', run: duplicate });
  items.push({ label: n > 1 ? `Delete ${n} items` : 'Delete', icon: '🗑', keys: 'Del', run: () => { deleteSelected(); closeMenu(); } });
  // v34 — focus areas have no stacking order.
  if (!state.canvasSelection.every((r) => r.kind === 'spotlight')) {
    items.push({ sep: true });
    items.push({ label: 'Bring to front', icon: '⤒', run: () => reorder('front') });
    items.push({ label: 'Send to back', icon: '⤓', run: () => reorder('back') });
  }
  if (hasAnnotationSelected()) {
    items.push({ sep: true });
    items.push({ label: 'Copy style', icon: '🎨', run: copyStyle });
    if (styleClipboard) items.push({ label: 'Paste style', icon: '🖌', run: pasteStyle });
  }
  items.push({ sep: true });
  items.push({ label: 'Align', icon: '⊞', submenu: alignItems() });
  if (n >= 3) {
    items.push({ label: 'Distribute', icon: '⇹', submenu: [
      { label: 'Horizontally', run: () => distribute('h') },
      { label: 'Vertically',   run: () => distribute('v') },
    ] });
  }
  if (state.canvasSelection.filter((r) => r.kind !== 'text').length >= 2) {
    items.push({ label: 'Match size', icon: '⇔', submenu: [
      { label: 'Width (largest)',  run: () => matchSize('w') },
      { label: 'Height (largest)', run: () => matchSize('h') },
    ] });
  }
  if (state.canvasSelection.some((r) => r.kind !== 'text' && r.kind !== 'spotlight')) {
    items.push({ sep: true });
    items.push({ label: 'Hide', icon: '⊘', run: () => flag('hide') });
    items.push({ label: 'Lock', icon: '🔒', run: () => flag('lock') });
  }
  return items;
}

// --- Menu DOM -------------------------------------------------------------

const MENU_CSS = 'position:fixed;z-index:10000;min-width:184px;padding:6px;' +
  'background:var(--bg-secondary,#1c1d23);border:1px solid var(--border-color,#33343c);' +
  'border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.4);font-size:13px;' +
  'color:var(--text-primary,#eaeaf0);user-select:none;';

function makeMenu(items, x, y) {
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.cssText = MENU_CSS;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  let openSub = null;

  items.forEach((it) => {
    if (it.sep) {
      const hr = document.createElement('div');
      hr.style.cssText = 'height:1px;margin:5px 4px;background:var(--border-color,#33343c);';
      menu.appendChild(hr);
      return;
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:6px;' +
      'cursor:' + (it.disabled ? 'default' : 'pointer') + ';' + (it.disabled ? 'opacity:0.45;' : '');
    row.innerHTML =
      `<span style="width:16px;text-align:center;flex-shrink:0;">${it.icon || ''}</span>` +
      `<span style="flex:1;">${it.label}</span>` +
      (it.keys ? `<span style="opacity:0.5;font-size:11px;">${it.keys}</span>` : '') +
      (it.submenu ? '<span style="opacity:0.6;">▸</span>' : '');
    if (!it.disabled) {
      row.addEventListener('mouseenter', () => {
        row.style.background = 'var(--accent-color,#5470ff)';
        if (openSub) { openSub.remove(); openSub = null; }
        if (it.submenu) {
          const r = row.getBoundingClientRect();
          openSub = makeMenu(it.submenu, r.right - 4, r.top - 6);
          document.body.appendChild(openSub);
        }
      });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      if (it.run) row.addEventListener('click', (e) => { e.stopPropagation(); it.run(); });
    }
    menu.appendChild(row);
  });
  // Keep submenu cleanup tied to this menu's removal.
  menu._cleanupSub = () => { if (openSub) { openSub.remove(); openSub = null; } };
  return menu;
}

function openMenu(clientX, clientY) {
  closeMenu();
  menuEl = makeMenu(buildItems(), clientX, clientY);
  document.body.appendChild(menuEl);
  // Nudge back on-screen if it overflows the viewport.
  const r = menuEl.getBoundingClientRect();
  if (r.right > window.innerWidth) menuEl.style.left = Math.max(8, window.innerWidth - r.width - 8) + 'px';
  if (r.bottom > window.innerHeight) menuEl.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px';
  setTimeout(() => {
    document.addEventListener('pointerdown', onDocDown, true);
    window.addEventListener('blur', closeMenu);
    document.addEventListener('scroll', closeMenu, true);
  }, 0);
}

// v35 — the floating toolbar's "More" button opens the same menu for the
// current selection.
export function openContextMenuAt(clientX, clientY) {
  openMenu(clientX, clientY);
}

function closeMenu() {
  document.removeEventListener('pointerdown', onDocDown, true);
  window.removeEventListener('blur', closeMenu);
  document.removeEventListener('scroll', closeMenu, true);
  document.querySelectorAll('.ctx-menu').forEach((m) => { if (m._cleanupSub) m._cleanupSub(); m.remove(); });
  menuEl = null;
}

function onDocDown(e) {
  if (!e.target.closest || !e.target.closest('.ctx-menu')) closeMenu();
}

export function bindContextMenu() {
  const canvas = el.previewCanvas;
  if (!canvas) return;

  canvas.addEventListener('contextmenu', (e) => {
    if (!state.image) return;          // nothing to act on — let the browser menu show
    e.preventDefault();
    const { x, y } = getCanvasCoords(e, canvas);
    const ref = hitTopRef(x, y);
    // Right-clicking an unselected object selects just it; clicking inside an
    // existing (multi) selection keeps it so the menu acts on the whole group.
    if (ref) { if (!isRefSelected(ref)) selectOnly(ref); }
    else clearSelection();
    render();
    openMenu(e.clientX, e.clientY);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
}
