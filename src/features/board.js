// v32 — Open Canvas board surface.
// v32.1 — polish: board edits persist + undo (board-only stack), pointer events
// (touch drag, pinch zoom, double-tap), hi-res export with progress, keyboard
// shortcuts, inline text editing, a real empty state, rAF-batched drag renders.
//
// An infinite canvas laid over the pages.js engine: every page is a card you
// can arrange, connect, and group. The board is a DOM layer (a camera-
// transformed surface + absolutely-positioned cards + an SVG overlay) mounted
// inside #canvas-viewport; per-card scene pixels come from the existing
// page.thumb. renderInto and the four composition paths are untouched — board
// mode is one branch in render(), like 'set' mode.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { screenToBoard, clampZoom } from './board-tools.js';
import { resolveBoardRef, clearBoardSelection, selectBoardOnly, toggleBoardRef, hitTopBoardRef, groupBounds } from './board-tools.js';
import { pageCount, getPageMeta, indexOfPage, onDocumentChange, notifyDocumentChange, switchTo, syncActivePage, deletePage, addPageWithImage, clearPageTrash, hasPageTrash, restoreDeletedPages } from './pages.js';
import { syncCanvasUI } from './document.js';
import { isTypingTarget } from '../utils/dom.js';
import { showNotification } from '../ui/notification.js';

let surface = null;     // .board-surface (camera-transformed)
let viewport = null;    // #canvas-viewport
let toolbar = null;     // .board-toolbar
let emptyEl = null;     // .board-empty (viewport-level, not camera-transformed)
let fileInput = null;   // hidden <input type=file> behind the empty state's Upload
let spaceDown = false;   // true while Space is held (board pan). Hoisted to module scope so the card/empty-surface pointerdown handlers can early-return and let the pan handler run.

export function nextId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }

// Board object ids are numbers (nextId), but boards migrated by the first v32
// build carry uid() strings. DOM dataset ids are always strings, so resolve a
// node back to its object by string compare instead of Number()-coercing.
function objOfNode(node) {
  const sid = node && node.dataset.id;
  return sid == null ? null : state.board.objects.find(o => String(o.id) === sid) || null;
}

// ── v32.1 — board undo + persistence ────────────────────────────────────────
// Board spatial edits are document ops (not in history.snapshot()), so the board
// keeps its own small undo stack of JSON snapshots of state.board.objects.
// Every mutation calls commitBoard() once it is finished (pointerup, not every
// pointermove); that pushes the previous snapshot and schedules a debounced
// document save through pages.js (projects.js autosaves on document change).
const UNDO_CAP = 50;
let undoStack = [], redoStack = [];
let baseline = null;        // JSON of the last committed objects
let baselineBoard = null;   // the state.board the stacks belong to (a project load replaces it)
let saveTimer = null;

function snapBoard() { return JSON.stringify(state.board.objects); }
function ensureBaseline() {
  if (baselineBoard === state.board && baseline != null) return;
  baselineBoard = state.board; baseline = snapBoard(); undoStack = []; redoStack = [];
}
// Accept the current objects as the new baseline without an undo entry (used for
// automatic changes such as cards appearing for new pages).
function rebaseline() { ensureBaseline(); baseline = snapBoard(); }
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => notifyDocumentChange(), 400);
}
export function commitBoard() {
  ensureBaseline();
  const cur = snapBoard();
  if (cur === baseline) return;
  undoStack.push(baseline);
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack = [];
  baseline = cur;
  scheduleSave();
}
function restoreBoard(json) {
  // Cards whose page was deleted since can't come back (the page is gone); new
  // pages that lacked a card in the snapshot get one from ensureCards().
  const live = new Set(getPageMeta().map(m => m.id));
  state.board.objects = JSON.parse(json).filter(o => o.kind !== 'card' || live.has(o.pageId));
  ensureCards();
  const ids = new Set(state.board.objects.map(o => o.id));
  state.boardSelection = state.boardSelection.filter(r => ids.has(r.id));
  baseline = snapBoard();
  renderBoard();
  scheduleSave();
}
export function undoBoard() {
  ensureBaseline();
  if (!undoStack.length) return false;
  redoStack.push(baseline);
  restoreBoard(undoStack.pop());
  return true;
}
export function redoBoard() {
  ensureBaseline();
  if (!redoStack.length) return false;
  undoStack.push(baseline);
  restoreBoard(redoStack.pop());
  return true;
}

function ensureCards() {
  // Only seed when the board has no card objects yet. (Existing cards survive
  // page add/delete via the sync in Step 4, which adds/removes by id.)
  const existing = new Set(state.board.objects.filter(o => o.kind === 'card').map(o => o.pageId));
  const meta = getPageMeta();
  const colW = 280, gap = 24, cols = 4;
  let row = 0, col = 0;
  for (const p of meta) {
    if (existing.has(p.id)) { col = (col + 1) % cols; if (col === 0) row++; continue; }
    const ar = p.w && p.h ? p.h / p.w : 0.625;
    const w = colW, h = Math.round(colW * ar);
    state.board.objects.push({
      id: nextId(), kind: 'card', pageId: p.id,
      x: 60 + col * (colW + gap), y: 60 + row * (h + gap + 28),
      w, h, z: state.board.objects.length
    });
    col = (col + 1) % cols; if (col === 0) row++;
  }
}

export function enterBoardMode() {
  // Refresh the active page's thumb if entering from single mode (where edits
  // happen), so the card isn't stale. Skipped for set/batch origins.
  if (state.mode === 'single') syncActivePage();
  state.mode = 'board';
  ensureSurface();
  ensureCards();
  rebaseline();
  showBoardChrome(true);
  if (_returnPill) _returnPill.style.display = 'none';
  // Hide the single-canvas wrapper + upload zone while on the board.
  if (el.canvasWrapper) el.canvasWrapper.style.display = 'none';
  if (el.uploadZone) el.uploadZone.style.display = 'none';
  renderBoard();
  // First open (camera never moved): frame the cards below the toolbar.
  if (isDefaultCamera()) fitBoard({ maxZoom: 1 });
}

export function exitBoardMode() {
  finishTextEdit();
  cancelConnectMode();
  state.mode = 'single';
  showBoardChrome(false);
  syncCanvasUI();   // canvas if the page has an image, else the upload zone
  // Re-render the single-canvas scene.
  import('../render/render.js').then(({ render }) => render());
}

// v32 — visual teardown of the board surface/toolbar/pill + restore the hidden
// single-canvas wrapper/upload-zone, WITHOUT changing state.mode (the caller —
// set-ui.js setMode — sets the new mode). Mirrors the v25 tour teardown.
export function teardownBoardChrome() {
  finishTextEdit();
  cancelConnectMode();
  showBoardChrome(false);
  if (el.canvasWrapper) el.canvasWrapper.style.display = '';
  if (el.uploadZone) el.uploadZone.style.display = '';
  if (_returnPill) _returnPill.style.display = 'none';
}

export function toggleBoardMode() {
  if (state.mode === 'board') exitBoardMode();
  else enterBoardMode();
}

let _returnPill = null;

export function returnToBoard() {
  // Coming back from editing a card: force-refresh the active page's thumb now
  // (the onHistoryChange->renderFilmstrip->makeThumb chain is debounced 600ms,
  // so without this a fast edit-then-return would show a stale card thumb).
  if (state.mode === 'board') return;
  syncActivePage();
  state.mode = 'board';
  ensureCards();
  rebaseline();
  showBoardChrome(true);
  if (el.canvasWrapper) el.canvasWrapper.style.display = 'none';
  if (el.uploadZone) el.uploadZone.style.display = 'none';
  if (_returnPill) _returnPill.style.display = 'none';
  renderBoard();
}

function showBoardChrome(on) {
  if (surface) surface.style.display = on ? 'block' : 'none';
  if (toolbar) toolbar.style.display = on ? 'flex' : 'none';
  if (emptyEl && !on) emptyEl.style.display = 'none';
  if (viewport) viewport.classList.toggle('board-mode', on);
}

// Build the board DOM once (surface + SVG overlay + toolbar). Mounted inside
// #canvas-viewport as a sibling of #canvas-wrapper.
function ensureSurface() {
  if (surface) return;
  viewport = el.canvasViewport;
  if (!viewport) return;

  toolbar = document.createElement('div');
  toolbar.className = 'board-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Board tools');
  toolbar.innerHTML = `
    <button class="board-back" title="Back to editor (Esc)" aria-label="Back to editor">← Editor</button>
    <button class="board-text-add" title="Add text (T)">Text</button>
    <button class="board-connect" title="Connect two cards: click from, then to (C)">Connect</button>
    <button class="board-group" title="Group selected (Cmd/Ctrl+G)">Group</button>
    <button class="board-ungroup" title="Ungroup selected group (Cmd/Ctrl+Shift+G)">Ungroup</button>
    <select class="board-arrange" title="Arrange cards" aria-label="Arrange cards">
      <option value="">Arrange…</option>
      <option value="grid">Grid</option>
      <option value="row">Row</option>
      <option value="hero">Hero</option>
      <option value="bento">Bento</option>
    </select>
    <button class="board-fit" title="Fit board to screen (0)">Fit</button>
    <button class="board-reset" title="Reset zoom to 100% (1)">100%</button>
    <button class="board-export" title="Export the board as a PNG">Export</button>
    <span class="board-zoom-label" aria-label="Zoom level">100%</span>
    <span class="board-hint" aria-live="polite"></span>`;
  toolbar.querySelector('.board-back').addEventListener('click', exitBoardMode);
  toolbar.querySelector('.board-fit').addEventListener('click', () => fitBoard());
  toolbar.querySelector('.board-reset').addEventListener('click', resetBoard);
  toolbar.querySelector('.board-text-add').addEventListener('click', addBoardText);
  toolbar.querySelector('.board-connect').addEventListener('click', () => (connectMode ? cancelConnectMode() : startConnectMode()));
  toolbar.querySelector('.board-group').addEventListener('click', groupSelected);
  toolbar.querySelector('.board-ungroup').addEventListener('click', ungroupSelected);
  toolbar.querySelector('.board-export').addEventListener('click', () => exportBoard());
  const arrange = toolbar.querySelector('.board-arrange');
  arrange.addEventListener('change', () => {
    const v = arrange.value;
    arrange.value = '';
    if (v) { arrangeCards(v); fitBoard(); }
  });

  surface = document.createElement('div');
  surface.className = 'board-surface';
  surface.style.display = 'none';

  viewport.appendChild(toolbar);
  viewport.appendChild(surface);

  if (!_returnPill) {
    _returnPill = document.createElement('button');
    _returnPill.className = 'board-return-pill';
    _returnPill.textContent = '← Back to board';
    _returnPill.style.display = 'none';
    _returnPill.addEventListener('click', returnToBoard);
    viewport.appendChild(_returnPill);
  }

  // v32 Task 4 — expose the freshly built toolbar so seed.js can append its
  // "Add from URL" bar. Handshake works in either init order: if bindSeed ran
  // first it left window.__seedAttach; if not, seed.js reads window.__boardToolbar.
  window.__boardToolbar = toolbar;
  if (typeof window.__seedAttach === 'function') window.__seedAttach(toolbar);
}

function setHint(msg) {
  const hint = toolbar && toolbar.querySelector('.board-hint');
  if (hint) hint.textContent = msg || '';
}

function applyCamera() {
  if (!surface) return;
  const { x, y, zoom } = state.board.camera;
  surface.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  const label = toolbar && toolbar.querySelector('.board-zoom-label');
  if (label) label.textContent = Math.round(zoom * 100) + '%';
}

// Zoom keeping the world point under the cursor fixed.
function zoomAt(clientX, clientY, factor) {
  const vp = el.canvasViewport.getBoundingClientRect();
  const { x, y, zoom } = state.board.camera;
  const newZoom = clampZoom(zoom * factor);
  const ax = clientX - vp.left, ay = clientY - vp.top;
  // World point under cursor: (ax - x)/zoom. Keep it fixed after zoom.
  const wx = (ax - x) / zoom, wy = (ay - y) / zoom;
  state.board.camera.zoom = newZoom;
  state.board.camera.x = ax - wx * newZoom;
  state.board.camera.y = ay - wy * newZoom;
  applyCamera();
}
function zoomAtCenter(factor) {
  const vp = el.canvasViewport.getBoundingClientRect();
  zoomAt(vp.left + vp.width / 2, vp.top + vp.height / 2, factor);
}

// fitBoard() fits to content bounds (the card/text bbox from contentBounds()).
// When there are no cards/text yet, fall back to origin/100%.
function contentBounds() {
  const objs = state.board.objects.filter(o => o.kind === 'card' || o.kind === 'text');
  if (!objs.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objs) {
    minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.w); maxY = Math.max(maxY, o.y + o.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// v32.1 — the fit area starts below the toolbar (which wraps to several rows on
// narrow viewports), so fitted cards are never hidden under it. `maxZoom` lets
// the automatic first-open fit avoid blowing a couple of cards up past 100%.
export function fitBoard({ maxZoom = 4 } = {}) {
  const vp = el.canvasViewport.getBoundingClientRect();
  const b = contentBounds();
  if (!b || !b.w || !b.h) { state.board.camera = { x: 0, y: 0, zoom: 1 }; applyCamera(); return; }
  const pad = 40;
  const top = Math.max(pad, (toolbar && toolbar.offsetHeight ? toolbar.offsetTop + toolbar.offsetHeight : 0) + 16);
  const availW = vp.width - pad * 2, availH = vp.height - top - pad;
  const zoom = clampZoom(Math.min(maxZoom, availW / b.w, availH / b.h));
  state.board.camera.zoom = zoom;
  // Center inside the available area (below the toolbar).
  state.board.camera.x = pad + (availW - b.w * zoom) / 2 - b.x * zoom;
  state.board.camera.y = top + (availH - b.h * zoom) / 2 - b.y * zoom;
  applyCamera();
}
const isDefaultCamera = () => { const c = state.board.camera; return !c.x && !c.y && c.zoom === 1; };
export function resetBoard() { state.board.camera = { x: 0, y: 0, zoom: 1 }; applyCamera(); }

// v32 Task 7 — add a text node, selected ready to drag/edit.
export function addBoardText() {
  const vp = el.canvasViewport.getBoundingClientRect();
  const center = screenToBoard(vp.left + vp.width / 2, vp.top + vp.height / 2);
  const o = { id: nextId(), kind: 'text',
    x: Math.round(center.x - 120), y: Math.round(center.y - 20), w: 240, h: 40,
    text: 'Label', fontSize: 24, color: '#ffffff', z: state.board.objects.length };
  state.board.objects.push(o);
  selectBoardOnly({ kind: 'boardObject', id: o.id });
  commitBoard();
  renderBoard();
  // Start editing right away so the user can type over the placeholder.
  const n = surface && surface.querySelector(`.board-text[data-id="${o.id}"]`);
  if (n) startTextEdit(n, true);
}

// v32 Task 7 — two-click connect mode. Click a card or text (from), then another
// (to); an arrow is pushed. Esc, the Connect button, or an empty-surface click
// cancels. The hint span (aria-live) announces the mode.
let connectMode = false;
let connectFrom = null;
function startConnectMode() {
  connectMode = true;
  connectFrom = null;
  if (toolbar) toolbar.querySelector('.board-connect')?.classList.add('active');
  setHint('Connect: click the first item (Esc to cancel)');
}
function cancelConnectMode() {
  if (!connectMode) return false;
  connectMode = false; connectFrom = null;
  if (toolbar) toolbar.querySelector('.board-connect')?.classList.remove('active');
  setHint('');
  return true;
}
// Two-click connect: triggered from the card/text pointerdown handlers.
function maybeConnect(id) {
  if (!connectMode) return false;
  if (connectFrom == null) { connectFrom = id; setHint('Connect: now click the second item'); return true; }
  if (connectFrom !== id) {
    state.board.objects.push({ id: nextId(), kind: 'arrow', from: connectFrom, to: id, color: '#f2a93b', z: state.board.objects.length });
    commitBoard();
  }
  cancelConnectMode();
  renderBoard();
  return true;
}

// v32 Task 7 — group the current selection into one group object. The group's
// children keep their own ids/positions; the group is just a membership record
// (its box is derived in board-tools.groupBounds).
export function groupSelected() {
  if (state.boardSelection.length < 2) { showNotification('Select two or more items to group (Shift-click or drag a box).', 'error'); return; }
  const childIds = state.boardSelection.map(r => r.id);
  const g = { id: nextId(), kind: 'group', children: childIds, x: 0, y: 0, w: 0, h: 0, z: state.board.objects.length };
  state.board.objects.push(g);
  selectBoardOnly({ kind: 'boardObject', id: g.id });
  commitBoard();
  renderBoard();
}

// v32.1 — ungroup every selected group (children stay, selected).
export function ungroupSelected() {
  const groups = state.boardSelection
    .map(r => state.board.objects.find(o => o.id === r.id))
    .filter(o => o && o.kind === 'group');
  if (!groups.length) { showNotification('Select a group to ungroup.', 'error'); return; }
  const children = groups.flatMap(g => g.children);
  state.board.objects = state.board.objects.filter(o => !groups.includes(o));
  state.boardSelection = children.map(id => ({ kind: 'boardObject', id }));
  commitBoard();
  renderBoard();
}

export function selectAllBoard() {
  state.boardSelection = state.board.objects
    .filter(o => o.kind === 'card' || o.kind === 'text')
    .map(o => ({ kind: 'boardObject', id: o.id }));
  updateSelectionChrome();
}

// v32 — board helpers shared by the toolbar and the conversational agent. Each
// mutates state.board and re-renders.

// Group an explicit set of cards by their PAGE ids. Returns the group id, or
// null if fewer than 2 cards resolve. (Internally resolves page ids -> board
// object ids, since the group logic keys children by object id.)
export function groupCards(ids) {
  // `ids` are PAGE ids (the ids surfaced to the agent/user). The board's group
  // logic keys children by board OBJECT id (a card's own id from nextId()), so
  // resolve page ids -> object ids here. Cards that aren't found are dropped.
  const pageIds = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (pageIds.length < 2) return null;
  const objIds = [];
  for (const pid of pageIds) {
    const card = state.board.objects.find(o => o.kind === 'card' && o.pageId === pid);
    if (card) objIds.push(card.id);
  }
  if (objIds.length < 2) return null;
  const g = { id: nextId(), kind: 'group', children: objIds, x: 0, y: 0, w: 0, h: 0, z: state.board.objects.length };
  state.board.objects.push(g);
  commitBoard();
  renderBoard();
  return g.id;
}

// Remove the group object with this id (children stay). Returns true if removed.
export function ungroupCards(id) {
  const i = state.board.objects.findIndex(o => o.id === id && o.kind === 'group');
  if (i < 0) return false;
  state.board.objects.splice(i, 1);
  commitBoard();
  renderBoard();
  return true;
}

// Re-lay out cards into a taste-curated arrangement. layout is one of
// 'grid'|'row'|'hero'|'bento'. If ids is omitted, lay out ALL cards. Non-card
// objects (text/arrows/groups) are left in place.
export function arrangeCards(layout, ids) {
  const cards = state.board.objects.filter(o => o.kind === 'card' && (!ids || ids.includes(o.pageId)));
  if (!cards.length) return;
  const colW = 280, gap = 24;
  const place = (o, x, y, w, h) => { o.x = x; o.y = y; o.w = w; o.h = h; };
  if (layout === 'row') {
    let x = 60;
    for (const o of cards) { const ar = o.h / o.w || 0.625; const w = colW, h = Math.round(w * ar); place(o, x, 60, w, h); x += w + gap; }
  } else if (layout === 'hero') {
    const [hero, ...rest] = cards;
    if (hero) { const ar = hero.h / hero.w || 0.625; const w = colW * 1.6, h = Math.round(w * ar); place(hero, 60, 60, w, h); }
    let y = 60;
    for (const o of rest) { const ar = o.h / o.w || 0.625; const w = colW, h = Math.round(w * ar); place(o, 60 + colW * 1.6 + gap, y, w, h); y += h + gap; }
  } else if (layout === 'bento') {
    const big = cards[0];
    let bigBottom = 60;
    if (big) { const ar = big.h / big.w || 0.625; const w = colW * 2 + gap, h = Math.round(w * ar); place(big, 60, 60, w, h); bigBottom = 60 + h + gap; }
    const rest = cards.slice(1);
    let x = 60 + colW * 2 + gap * 2, y = 60;
    for (const o of rest) {
      const ar = o.h / o.w || 0.625; const w = colW, h = Math.round(w * ar);
      if (y + h > bigBottom) { y = 60; x = 60; } // wrap to a new row under the big card
      place(o, x, y, w, h); y += h + gap;
    }
  } else {
    // 'grid' (default): 4-column grid.
    let row = 0, col = 0; const cols = 4;
    for (const o of cards) {
      const ar = o.h / o.w || 0.625; const w = colW, h = Math.round(w * ar);
      place(o, 60 + col * (colW + gap), 60 + row * (h + gap + 28), w, h);
      col = (col + 1) % cols; if (col === 0) row++;
    }
  }
  commitBoard();
  renderBoard();
}

// v32.1 — move the selection by (dx, dy) board px (arrow-key nudge).
function nudgeBoardSelection(dx, dy) {
  const refs = topLevelSelection();
  if (!refs.length) return false;
  for (const r of refs) resolveBoardRef(r)?.moveBy(dx, dy);
  commitBoard();
  renderBoard();
  return true;
}

// Selection minus refs that are children of a selected group — the group's
// moveBy already translates them, so including them would double-move the child.
function topLevelSelection() {
  const groupIds = new Set(state.boardSelection.map(r => r.id));
  const childOfSelectedGroup = (id) => state.board.objects.some(
    o => o.kind === 'group' && groupIds.has(o.id) && o.children.includes(id)
  );
  return state.boardSelection.filter(r => !childOfSelectedGroup(r.id));
}

// ── v32.1 — pointer gestures ────────────────────────────────────────────────
// All board input uses pointer events so mouse, pen, and touch share one path.
// `pointers` tracks every active pointer on the viewport (a capture-phase
// listener adds them before the card/surface handlers run); a second pointer
// cancels the in-flight single-pointer gesture and starts a pinch.
const pointers = new Map();   // pointerId -> { x, y }
let activeGesture = null;     // { cancel() } for the current single-pointer drag
let pinch = null;             // { d0, mx, my, cam } while two fingers are down

function beginGesture(onMove, onEnd) {
  const move = (ev) => { if (pinch) return; onMove(ev); };
  const up = () => { end(); onEnd(false); };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    activeGesture = null;
  };
  activeGesture = { cancel() { end(); onEnd(true); } };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Coalesce renders to one per frame while dragging.
let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderBoard(); });
}

// Touch has no reliable dblclick, so detect a double-tap by hand.
let lastTap = { id: null, t: 0 };
function isDoubleTap(e, id) {
  if (e.pointerType !== 'touch') return false;
  const now = performance.now();
  const dbl = lastTap.id === id && now - lastTap.t < 320;
  lastTap = dbl ? { id: null, t: 0 } : { id, t: now };
  return dbl;
}

// v32 Task 7 — reusable drag-move of the whole selection via the uniform
// resolveBoardRef(...).moveBy handle, so cards, text, AND groups all drag (a
// group's moveBy translates its children).
function dragSelection(e) {
  const start = screenToBoard(e.clientX, e.clientY);
  const origs = topLevelSelection().map(r => {
    const h = resolveBoardRef(r);
    return { ref: r, box: h ? { ...h.box } : null };
  });
  let moved = false;
  beginGesture((ev) => {
    const cur = screenToBoard(ev.clientX, ev.clientY);
    const dx = cur.x - start.x, dy = cur.y - start.y;
    if (!dx && !dy) return;
    moved = true;
    for (const or of origs) {
      if (!or.box) continue;
      const h = resolveBoardRef(or.ref);          // live handle (re-read each move)
      if (!h) continue;
      h.moveBy((or.box.x + dx) - h.box.x, (or.box.y + dy) - h.box.y);
    }
    scheduleRender();
  }, () => {
    if (moved) { raiseLatestToTop(); commitBoard(); }
  });
}

// v32 Task 7 — the SVG connector overlay (one <svg> over the surface; arrows
// are redrawn from state.board.objects on every renderBoard).
function ensureOverlay() {
  if (!surface) return null;
  let svg = surface.querySelector('.board-connectors');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'board-connectors');
    surface.appendChild(svg);
  }
  return svg;
}

// v32 — render cards, text, arrows, and group boxes from state.board.objects.
// v32.1 — one querySelectorAll + id maps instead of a query/find per object.
export function renderBoard() {
  if (state.mode !== 'board') return;
  ensureSurface();
  if (!surface) return;
  applyCamera();

  const objs = state.board.objects;
  const byId = new Map(objs.map(o => [o.id, o]));
  const nodes = new Map();
  surface.querySelectorAll('.board-card, .board-text').forEach(n => nodes.set(n.className.includes('board-card') ? 'c' + n.dataset.id : 't' + n.dataset.id, n));

  // Build/reconcile card nodes by id.
  const cards = objs.filter(o => o.kind === 'card');
  const allMeta = getPageMeta();
  const metaById = new Map(allMeta.map((m, i) => [m.id, { ...m, index: i }]));
  const seen = new Set();
  for (const o of cards) {
    const key = 'c' + o.id;
    seen.add(key);
    let node = nodes.get(key);
    const meta = metaById.get(o.pageId);
    const imgSrc = (meta && meta.thumb) || '';
    if (!node) {
      node = document.createElement('div');
      node.className = 'board-card';
      node.dataset.id = String(o.id);
      node.dataset.pageId = String(o.pageId);
      node.innerHTML = `<img class="board-card-img" alt="" draggable="false">` +
        `<div class="board-card-label"></div>`;
      surface.appendChild(node);
      bindCardEvents(node);
    }
    node.style.left = o.x + 'px';
    node.style.top = o.y + 'px';
    node.style.width = o.w + 'px';
    node.style.height = o.h + 'px';
    node.style.zIndex = o.z;
    const img = node.querySelector('.board-card-img');
    if (imgSrc && img.getAttribute('src') !== imgSrc) img.src = imgSrc;
    const label = meta ? `Page ${meta.index + 1}` : 'Page';
    const labelEl = node.querySelector('.board-card-label');
    if (labelEl.textContent !== label) { labelEl.textContent = label; img.alt = label; }
  }

  // Text nodes.
  const texts = objs.filter(o => o.kind === 'text');
  for (const o of texts) {
    const key = 't' + o.id;
    seen.add(key);
    let n = nodes.get(key);
    if (!n) {
      n = document.createElement('div');
      n.className = 'board-text';
      n.dataset.id = String(o.id);
      surface.appendChild(n);
    }
    n.style.left = o.x + 'px'; n.style.top = o.y + 'px';
    n.style.width = o.w + 'px'; n.style.fontSize = (o.fontSize || 24) + 'px';
    n.style.color = o.color || '#fff';
    // Don't clobber the text while the user is typing into it.
    if (!n.isContentEditable && n.textContent !== (o.text || '')) n.textContent = o.text || '';
    n.style.zIndex = o.z;
    // Keep the stored height in sync with the wrapped layout so hit-testing,
    // marquee, fit, and export use the real box (offsetHeight is in board px).
    const mh = n.offsetHeight;
    if (mh && Math.abs(mh - o.h) > 0.5) o.h = mh;
  }
  // Remove DOM nodes whose object was deleted.
  nodes.forEach((n, key) => { if (!seen.has(key)) n.remove(); });

  // Arrows (SVG overlay).
  const svg = ensureOverlay();
  if (svg) {
    const arrows = objs.filter(o => o.kind === 'arrow');
    svg.innerHTML = '';
    for (const a of arrows) {
      const f = byId.get(a.from);
      const t = byId.get(a.to);
      if (!f || !t) continue;
      const x1 = f.x + f.w / 2, y1 = f.y + f.h / 2, x2 = t.x + t.w / 2, y2 = t.y + t.h / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', a.color || '#f2a93b');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#board-arrowhead)');
      svg.appendChild(line);
    }
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    m.id = 'board-arrowhead'; m.setAttribute('markerWidth', '8'); m.setAttribute('markerHeight', '8');
    m.setAttribute('refX', '6'); m.setAttribute('refY', '4'); m.setAttribute('orient', 'auto');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M0,0 L8,4 L0,8 z'); p.setAttribute('fill', '#f2a93b');
    m.appendChild(p); svg.appendChild(m);
    // Group bounding boxes (drawn always so groups are findable; brighter when selected).
    const selIds = new Set(state.boardSelection.map(r => r.id));
    const groups = objs.filter(o => o.kind === 'group');
    for (const g of groups) {
      const b = groupBounds(g);
      if (!b.w || !b.h) continue;
      const isSel = selIds.has(g.id);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', b.x); rect.setAttribute('y', b.y);
      rect.setAttribute('width', b.w); rect.setAttribute('height', b.h);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', isSel ? 'var(--accent-primary, #f2a93b)' : 'rgba(154,156,168,0.5)');
      rect.setAttribute('stroke-width', isSel ? '2' : '1.5');
      rect.setAttribute('stroke-dasharray', '6 4');
      rect.setAttribute('rx', '8');
      svg.appendChild(rect);
    }
  }

  renderEmptyState(allMeta);
  updateSelectionChrome();
}

// v32.1 — empty state: when no page has a screenshot yet, show an overlay with
// real actions (upload images as cards / add from a URL) instead of one line of
// text. It lives on the viewport (not the zoomed surface) so it stays readable.
function renderEmptyState(allMeta) {
  const anyImage = !!state.image || allMeta.some(m => m.payload && m.payload.image);
  if (anyImage) { if (emptyEl) emptyEl.style.display = 'none'; return; }
  if (!emptyEl) {
    emptyEl = document.createElement('div');
    emptyEl.className = 'board-empty';
    emptyEl.innerHTML = `
      <div class="board-empty-title">Your board is empty</div>
      <div class="board-empty-sub">Every page becomes a card here. Start with some screenshots.</div>
      <div class="board-empty-actions">
        <button type="button" class="board-empty-upload">Upload images</button>
        <button type="button" class="board-empty-url">Add from URL</button>
      </div>
      <div class="board-empty-hint">Scroll or pinch to zoom · Space + drag to pan · ? for shortcuts</div>`;
    emptyEl.querySelector('.board-empty-upload').addEventListener('click', () => ensureFileInput().click());
    emptyEl.querySelector('.board-empty-url').addEventListener('click', () => {
      const input = toolbar && toolbar.querySelector('.board-seed-input');
      if (input) input.focus();
    });
    viewport.appendChild(emptyEl);
  }
  emptyEl.style.display = '';
}

function ensureFileInput() {
  if (fileInput) return fileInput;
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    addFilesAsCards(files);
  });
  document.body.appendChild(fileInput);
  return fileInput;
}

// v32.1 — add each image file as a new page (and so a card). If the document was
// a single blank page, that placeholder is dropped once real cards exist.
export async function addFilesAsCards(files) {
  const list = [...(files || [])].filter(f => f && f.type && f.type.startsWith('image/'));
  if (!list.length) return 0;
  const loneBlank = pageCount() === 1 && !state.image ? getPageMeta()[0].id : null;
  let added = 0;
  for (const f of list) {
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      if (addPageWithImage(img)) added++;
    } catch (_) { /* skip an unreadable file */ }
    finally { URL.revokeObjectURL(url); }
  }
  if (added && loneBlank) dropPage(loneBlank);
  if (added) showNotification(`Added ${added} card${added === 1 ? '' : 's'}.`, 'success');
  else showNotification('Could not read those images.', 'error');
  return added;
}

// Delete a page by id (used to drop the blank placeholder page after seeding).
export function dropPage(pageId) {
  const i = indexOfPage(pageId);
  if (i < 0 || pageCount() <= 1) return;
  state.board.objects = state.board.objects.filter(o => !(o.kind === 'card' && o.pageId === pageId));
  deletePage(i, { recordTrash: false });
  rebaseline();
  renderBoard();
  // The board just went from empty to real cards: frame them once the
  // onDocumentChange sync (200ms) has laid out cards for the new pages.
  setTimeout(() => { if (state.mode === 'board') fitBoard({ maxZoom: 1 }); }, 260);
}

function bindCardEvents(node) {
  node.addEventListener('pointerdown', (e) => { onCardPointerDown(e, node); });
  node.addEventListener('dblclick', (e) => { onCardDoubleClick(e, node); });
}
function onCardPointerDown(e, node) {
  // Space is held: defer entirely to the viewport camera-pan handler (don't
  // select/drag the card; don't stopPropagation, so the event bubbles up).
  if (spaceDown || pinch) return;
  if (e.button !== 0) return;
  if (e.target.closest('.board-resize')) return;   // the handle has its own listener
  const o = objOfNode(node);
  if (!o) return;
  const id = o.id;
  e.stopPropagation();
  // v32 Task 7 — two-click connect mode: this click just records from/to.
  if (connectMode) { maybeConnect(id); return; }
  if (isDoubleTap(e, id)) { onCardDoubleClick(e, node); return; }
  const ref = { kind: 'boardObject', id };
  if (e.shiftKey) toggleBoardRef(ref);
  else if (!state.boardSelection.some(r => r.id === id)) selectBoardOnly(ref);
  updateSelectionChrome();
  // If this card isn't in the (possibly shift-toggled) selection, don't move.
  if (!state.boardSelection.some(r => r.id === id)) return;
  dragSelection(e);
}

function raiseLatestToTop() {
  const sel = state.boardSelection;
  if (!sel.length) return;
  resolveBoardRef(sel[sel.length - 1])?.raiseToFront();
  renderBoard();
}

function onResizeStart(e, node) {
  if (e.button !== 0 || pinch) return;
  e.stopPropagation(); e.preventDefault();
  const o = objOfNode(node);
  if (!o) return;
  const start = screenToBoard(e.clientX, e.clientY);
  const ow = o.w, oh = o.h, oar = ow / oh;
  beginGesture((ev) => {
    const cur = screenToBoard(ev.clientX, ev.clientY);
    // Bottom-right handle: width follows cursor, height preserves aspect.
    o.w = Math.max(80, ow + (cur.x - start.x));
    o.h = Math.round(o.w / oar);
    scheduleRender();
  }, () => commitBoard());
}
function onCardDoubleClick(e, node) {
  const pageId = node.dataset.pageId;   // a uid() UUID string — do NOT Number()-coerce
  const idx = indexOfPage(pageId);
  if (idx < 0) return;
  cancelConnectMode();
  switchTo(idx);
  state.mode = 'single';
  showBoardChrome(false);
  syncCanvasUI();   // switchTo's async applyPayload re-syncs once the image decodes
  if (_returnPill) _returnPill.style.display = '';
  import('../render/render.js').then(({ render }) => render());
}
function updateSelectionChrome() {
  if (!surface) return;
  const selIds = new Set(state.boardSelection.map(r => String(r.id)));
  const sole = state.boardSelection.length === 1;
  surface.querySelectorAll('.board-card, .board-text').forEach(n => {
    n.classList.toggle('selected', selIds.has(n.dataset.id));
  });
  // Resize handle only on the SOLE-selected CARD (text wraps to width; no handle in v1).
  surface.querySelectorAll('.board-card').forEach(n => {
    const want = sole && selIds.has(n.dataset.id);
    let h = n.querySelector('.board-resize');
    if (want && !h) {
      h = document.createElement('div'); h.className = 'board-resize'; n.appendChild(h);
      h.addEventListener('pointerdown', (e) => onResizeStart(e, n));
    } else if (!want && h) { h.remove(); }
  });
  // Toolbar state: Group needs 2+, Ungroup needs a selected group.
  if (toolbar) {
    const hasGroup = state.boardSelection.some(r => state.board.objects.some(o => o.id === r.id && o.kind === 'group'));
    const g = toolbar.querySelector('.board-group');
    const u = toolbar.querySelector('.board-ungroup');
    if (g) g.disabled = state.boardSelection.length < 2;
    if (u) u.disabled = !hasGroup;
  }
}

// v32 Task 6 — marquee rubber-band multi-select. The marquee box lives inside
// the camera-transformed surface, so its left/top/width/height are in BOARD px;
// we read them back with parseFloat (no getBoundingClientRect needed).
function startMarquee(e) {
  const start = screenToBoard(e.clientX, e.clientY);
  const box = document.createElement('div');
  box.className = 'board-marquee';
  surface.appendChild(box);
  beginGesture((ev) => {
    const cur = screenToBoard(ev.clientX, ev.clientY);
    const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y);
    const w = Math.abs(cur.x - start.x), h = Math.abs(cur.y - start.y);
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.width = w + 'px'; box.style.height = h + 'px';
  }, (cancelled) => {
    // Compute the marquee rect in board px from the DOM box (already in board
    // coords because .board-marquee lives inside the camera-transformed surface).
    const bx = parseFloat(box.style.left) || 0;
    const by = parseFloat(box.style.top) || 0;
    const bw = parseFloat(box.style.width) || 0;
    const bh = parseFloat(box.style.height) || 0;
    box.remove();
    if (cancelled || (bw < 3 && bh < 3)) { return; }   // a click, not a drag — keep the clear from the handler
    const hits = state.board.objects.filter(o =>
      (o.kind === 'card' || o.kind === 'text') &&
      o.x < bx + bw && o.x + o.w > bx && o.y < by + bh && o.y + o.h > by
    ).map(o => ({ kind: 'boardObject', id: o.id }));
    state.boardSelection = hits;
    updateSelectionChrome();
  });
}

// Camera pan (Space+drag, middle mouse, or one finger on empty board).
function startPan(e) {
  const sx = e.clientX, sy = e.clientY;
  const ox = state.board.camera.x, oy = state.board.camera.y;
  beginGesture((ev) => {
    state.board.camera.x = ox + (ev.clientX - sx);
    state.board.camera.y = oy + (ev.clientY - sy);
    applyCamera();
  }, () => {});
}

// Two-finger pinch: zoom around the finger midpoint and pan with it.
function pinchPoints() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
function startPinch() {
  if (activeGesture) activeGesture.cancel();
  const p = pinchPoints();
  pinch = { d0: p.d, mx: p.mx, my: p.my, cam: { ...state.board.camera } };
}
function updatePinch() {
  if (!pinch || pointers.size < 2) return;
  const vp = el.canvasViewport.getBoundingClientRect();
  const p = pinchPoints();
  const c0 = pinch.cam;
  const zoom = clampZoom(c0.zoom * (p.d / pinch.d0));
  const wx = (pinch.mx - vp.left - c0.x) / c0.zoom, wy = (pinch.my - vp.top - c0.y) / c0.zoom;
  state.board.camera.zoom = zoom;
  state.board.camera.x = p.mx - vp.left - wx * zoom;
  state.board.camera.y = p.my - vp.top - wy * zoom;
  applyCamera();
}

// v32 Task 6 — delete the current board selection. Cards remove their board
// object now (instant) AND delete the underlying page; the onDocumentChange sync
// would drop the card too, but resolving+removing first avoids the 200ms wait.
function deleteBoardSelection() {
  const count = state.boardSelection.length;
  const before = snapBoard();
  clearPageTrash();
  for (const ref of [...state.boardSelection]) {
    const o = state.board.objects.find(x => x.id === ref.id);
    if (!o) continue;
    if (o.kind === 'card') {
      const idx = indexOfPage(o.pageId);
      // Remove the board object now (instant) ONLY if the page is actually
      // deletable (pages.js keeps >= 1 page). Otherwise deletePage no-ops and
      // the card must stay, else it would vanish then pop back 200ms later.
      if (pageCount() > 1) resolveBoardRef(ref)?.remove();
      if (idx >= 0) deletePage(idx);
    } else {
      resolveBoardRef(ref)?.remove();
    }
  }
  // Prune stale ids left in groups' children and arrows' from/to by the deletions above.
  const liveIds = new Set(state.board.objects.map(o => o.id));
  for (const o of state.board.objects) {
    if (o.kind === 'group') o.children = o.children.filter(cid => liveIds.has(cid));
  }
  state.board.objects = state.board.objects.filter(o =>
    o.kind !== 'arrow' || (liveIds.has(o.from) && liveIds.has(o.to))
  );
  state.boardSelection = [];
  commitBoard();
  renderBoard();
  // v33 — Undo toast: bring the pages back first, then the board layout (cards
  // only restore when their page exists). Skipped if the board was edited since.
  if (snapBoard() === before && !hasPageTrash()) return;   // nothing was deletable
  const depth = undoStack.length;
  showNotification(count === 1 ? 'Deleted' : `Deleted ${count} items`, 'success', { action: { label: 'Undo', run: () => {
    restoreDeletedPages();
    if (undoStack.length === depth) undoBoard();
    rebaseline();
    renderBoard();
  } } });
}

// ── v32.1 — inline text editing ─────────────────────────────────────────────
// Double-click (or double-tap) a text node to edit it in place. Enter commits,
// Shift+Enter adds a line, Esc reverts.
let editing = null;   // { node, obj, original }
function startTextEdit(node, selectAllText) {
  const o = objOfNode(node);
  if (!o || o.kind !== 'text') return;
  finishTextEdit();
  editing = { node, obj: o, original: o.text || '' };
  try { node.contentEditable = 'plaintext-only'; } catch (_) { node.contentEditable = 'true'; }
  if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true';
  node.classList.add('editing');
  node.focus();
  const range = document.createRange();
  range.selectNodeContents(node);
  if (!selectAllText) range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(range);
}
function finishTextEdit(revert = false) {
  if (!editing) return;
  const { node, obj, original } = editing;
  editing = null;
  node.contentEditable = 'false';
  node.classList.remove('editing');
  obj.text = revert ? original : node.innerText.replace(/\n$/, '');
  node.textContent = obj.text;
  commitBoard();
  renderBoard();
}

// ── v32.1 — hi-res export ───────────────────────────────────────────────────
// Browsers cap canvases at roughly 16384px per side and ~268M px total.
const MAX_SIDE = 16384, MAX_AREA = 16384 * 16384;
let exporting = false;

// Word-wrap `text` to `maxW` (honouring explicit newlines), like the live
// pre-wrap .board-text node.
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && ctx.measureText(test).width > maxW && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = test;
    }
    out.push(line);
  }
  return out;
}

// v32 Task 8 — composite board export to PNG. Re-renders every card's page
// offscreen (applyDesignToState + renderInto, exactly as pages.js renderAllPages
// does) at its board rect, plus text and arrows (NOT group bboxes — those are
// editor chrome), onto one canvas, then downloads board.png. The live editor
// state is saved (serializeFull) and restored (applyDesignToState, NOT
// applyPayload — that calls showCanvasUI and would un-hide #canvas-wrapper in
// board mode) so the board is unchanged after export. Dynamic imports avoid a
// static cycle with render.js; board/mode are not in PROJECT_FIELDS, so the
// per-card applyDesignToState leaves state.board/mode untouched while the
// captured objs/cards refs stay valid.
//
// v32.1 — the composite is drawn at `scale` (up to 3x, chosen from the pages'
// native widths and clamped to the browser canvas limit) so cards come out
// sharp; progress shows on the Export button. Returns { ok, error? } so the
// agent tool can report failures honestly.
export async function exportBoard() {
  if (state.mode !== 'board') return { ok: false, error: 'Not in board mode.' };
  if (exporting) return { ok: false, error: 'An export is already running.' };
  finishTextEdit();
  const objs = state.board.objects;
  const cards = objs.filter(o => o.kind === 'card');
  if (!cards.length) {
    showNotification('Nothing on the board to export.', 'error');
    return { ok: false, error: 'The board has no cards.' };
  }
  // Composite bounds in board px.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objs) {
    if (o.kind === 'card' || o.kind === 'text') {
      minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.w); maxY = Math.max(maxY, o.y + o.h);
    }
  }
  const pad = 32;
  const W0 = Math.ceil(maxX - minX) + pad * 2, H0 = Math.ceil(maxY - minY) + pad * 2;
  const meta = getPageMeta();
  const metaById = new Map(meta.map(m => [m.id, m]));
  let want = 1;
  for (const c of cards) {
    const m = metaById.get(c.pageId);
    if (m && m.w && c.w) want = Math.max(want, m.w / c.w);
  }
  const limit = Math.min(MAX_SIDE / W0, MAX_SIDE / H0, Math.sqrt(MAX_AREA / (W0 * H0)));
  const scale = Math.max(0.25, Math.min(3, want, limit));
  if (limit < Math.min(3, want)) showNotification('Board is very large — exporting at reduced resolution.', 'info');

  const out = document.createElement('canvas');
  out.width = Math.round(W0 * scale); out.height = Math.round(H0 * scale);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);   // draw everything below in board px
  ctx.imageSmoothingQuality = 'high';

  const btn = toolbar && toolbar.querySelector('.board-export');
  const setBtn = (txt, busy) => { if (btn) { btn.textContent = txt; btn.disabled = busy; } };
  exporting = true;
  setBtn('Rendering…', true);

  const { renderInto } = await import('../render/render.js');
  const { applyDesignToState } = await import('./document.js');
  const { serializeFull } = await import('../state/serialize.js');
  const saved = serializeFull();
  const savedMode = state.mode;
  let result;
  try {
    let done = 0;
    for (const c of cards) {
      setBtn(`Rendering ${++done}/${cards.length}…`, true);
      const m = metaById.get(c.pageId);
      if (!m || !m.payload) continue;
      await applyDesignToState(m.payload);
      if (!state.image) continue;
      const scene = document.createElement('canvas');
      renderInto(scene, true);                 // renders at state.canvas size
      ctx.drawImage(scene, c.x - minX + pad, c.y - minY + pad, c.w, c.h);
      await new Promise(r => setTimeout(r, 0)); // yield so large boards don't freeze
    }
    for (const o of objs) {                     // text overlays, wrapped like the live node
      if (o.kind !== 'text') continue;
      const fs = o.fontSize || 24;
      ctx.fillStyle = o.color || '#fff';
      ctx.font = `${fs}px Geist, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const lines = wrapLines(ctx, o.text || '', o.w);
      lines.forEach((ln, i) => ctx.fillText(ln, o.x - minX + pad, o.y - minY + pad + i * fs * 1.2));
    }
    for (const a of objs) {                     // arrows
      if (a.kind !== 'arrow') continue;
      const f = objs.find(o => o.id === a.from), t = objs.find(o => o.id === a.to);
      if (!f || !t) continue;
      const fx = f.x + f.w / 2 - minX + pad, fy = f.y + f.h / 2 - minY + pad;
      const tx = t.x + t.w / 2 - minX + pad, ty = t.y + t.h / 2 - minY + pad;
      const color = a.color || '#f2a93b';
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
      // Filled arrowhead at the 'to' end (matches the live SVG marker).
      const ang = Math.atan2(ty - fy, tx - fx);
      const head = 9;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - head * Math.cos(ang - Math.PI / 6), ty - head * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(tx - head * Math.cos(ang + Math.PI / 6), ty - head * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    }
    setBtn('Encoding…', true);
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Export produced no image (canvas too large).');
    const url = URL.createObjectURL(blob);
    const dl = document.createElement('a'); dl.href = url; dl.download = 'board.png';
    document.body.appendChild(dl); dl.click(); dl.remove(); URL.revokeObjectURL(url);
    showNotification(`Board exported as PNG (${out.width}×${out.height}).`, 'success');
    result = { ok: true, width: out.width, height: out.height };
  } catch (e) {
    console.error(e);
    showNotification(`Board export failed: ${e.message || e}`, 'error');
    result = { ok: false, error: e.message || String(e) };
  } finally {
    state.mode = savedMode;
    // Restore with applyDesignToState (NOT applyPayload): applyPayload calls
    // showCanvasUI()/showUploadUI(), which would un-hide #canvas-wrapper in
    // board mode and let the stale preview canvas show through the board.
    // applyDesignToState only restores state design + image (no DOM toggle);
    // renderBoard() then repaints the board surface.
    await applyDesignToState(saved);
    exporting = false;
    setBtn('Export', false);
    if (state.mode === 'board') renderBoard();
  }
  return result;
}

// v32.1 — Esc cascade for the board: finish text edit → cancel connect →
// clear selection → exit to the editor. Returns true when it handled the key.
export function boardEscape() {
  if (editing) { finishTextEdit(true); return true; }
  if (cancelConnectMode()) return true;
  if (state.boardSelection.length) { clearBoardSelection(); updateSelectionChrome(); return true; }
  exitBoardMode();
  return true;
}

// v32.1 — board-only keys (the global Cmd+Z/Cmd+S/Cmd+A are routed here from
// keyboard.js). Returns true when the key was handled.
function onBoardKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key;
  if (mod && k.toLowerCase() === 'g') { if (e.shiftKey) ungroupSelected(); else groupSelected(); return true; }
  if (mod) return false;
  if (k === 'Delete' || k === 'Backspace') {
    if (!state.boardSelection.length) return false;
    deleteBoardSelection(); return true;
  }
  if (k.startsWith('Arrow')) {
    const step = e.shiftKey ? 10 : 1;
    const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
    const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
    return nudgeBoardSelection(dx, dy);
  }
  if (e.altKey) return false;
  switch (k) {
    case '0': fitBoard(); return true;
    case '1': resetBoard(); return true;
    case '+': case '=': zoomAtCenter(1.2); return true;
    case '-': case '_': zoomAtCenter(1 / 1.2); return true;
    case 't': case 'T': addBoardText(); return true;
    case 'c': case 'C': if (connectMode) cancelConnectMode(); else startConnectMode(); return true;
  }
  return false;
}

export function bindBoard() {
  ensureSurface();
  if (!viewport) return;

  // Wheel: pinch-zoom on trackpads arrives as ctrl+wheel with small deltas, so
  // scale smoothly by delta there; a notched mouse wheel zooms in fixed steps;
  // a two-finger trackpad scroll pans the camera.
  // Board-mode only: in single mode, defer to zoom-pan.js (Ctrl/Cmd+wheel) and
  // leave plain wheel/page-scroll untouched.
  viewport.addEventListener('wheel', (e) => {
    if (state.mode !== 'board') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      return;
    }
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (mouseWheel) {
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    } else {
      state.board.camera.x -= e.deltaX;
      state.board.camera.y -= e.deltaY;
      applyCamera();
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state.mode === 'board' && !e.repeat && !isTypingTarget(e.target)) { spaceDown = true; viewport.classList.add('board-panning'); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; viewport.classList.remove('board-panning'); }
  });

  // Track every pointer (capture phase, so this runs before card/surface
  // handlers); two pointers down = pinch.
  viewport.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'board') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) startPinch();
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) updatePinch();
  });
  const dropPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  window.addEventListener('pointerup', dropPointer);
  window.addEventListener('pointercancel', dropPointer);

  // Space + drag, or middle-mouse, to pan.
  viewport.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'board' || pinch) return;
    const pan = spaceDown || e.button === 1;
    if (!pan) return;
    e.preventDefault();
    startPan(e);
  });

  // Empty-surface press: clear selection + cancel connect, then marquee (mouse/
  // pen) or pan (touch). Cards/toolbar/empty-state are excluded so their own
  // handlers keep working.
  viewport.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'board' || e.button !== 0 || pinch) return;
    if (spaceDown) return;   // space-pan: don't clear selection, let the camera pan
    if (e.target.closest('.board-card') || e.target.closest('.board-toolbar') || e.target.closest('.board-empty') || e.target.closest('.board-text')) return;
    if (editing) finishTextEdit();
    cancelConnectMode();
    clearBoardSelection(); updateSelectionChrome();
    if (e.pointerType === 'touch') startPan(e);
    else startMarquee(e);
  });

  // v32 Task 7 — text nodes are created dynamically, so drag them via
  // delegation on the surface. Also hit-tests GROUPS (which have no DOM node):
  // a click inside a group's bbox but outside every child selects the group.
  // stopPropagation keeps the viewport marquee/clear handler from also firing.
  surface.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'board') return;
    if (spaceDown || pinch) return;   // defer to the viewport camera-pan handler
    if (e.button !== 0) return;       // only left button selects/drags
    const textNode = e.target.closest('.board-text');
    if (textNode) {
      e.stopPropagation();
      if (textNode.isContentEditable) return;   // let the caret move while editing
      const o = objOfNode(textNode);
      if (!o) return;
      if (connectMode) { maybeConnect(o.id); return; }
      if (isDoubleTap(e, o.id)) { startTextEdit(textNode, true); return; }
      const ref = { kind: 'boardObject', id: o.id };
      if (e.shiftKey) toggleBoardRef(ref);
      else if (!state.boardSelection.some(r => r.id === o.id)) selectBoardOnly(ref);
      updateSelectionChrome();
      if (state.boardSelection.some(r => r.id === o.id)) dragSelection(e);
      return;
    }
    // No card/text DOM node under the cursor (their own handlers stopPropagation
    // on a normal left-click). Use the point hit-test to find a group whose bbox
    // contains the click but no child does — select + drag it.
    const gref = hitTopBoardRef(e.clientX, e.clientY);
    if (gref) {
      const obj = state.board.objects.find(o => o.id === gref.id);
      if (obj && obj.kind === 'group') {
        e.stopPropagation();
        if (e.shiftKey) toggleBoardRef(gref); else selectBoardOnly(gref);
        updateSelectionChrome();
        dragSelection(e);
      }
    }
    // else: truly empty surface — let it bubble to the viewport marquee/clear handler.
  });

  // Double-click a text node to edit its content in place.
  surface.addEventListener('dblclick', (e) => {
    if (state.mode !== 'board') return;
    const textNode = e.target.closest('.board-text');
    if (textNode && !textNode.isContentEditable) startTextEdit(textNode, true);
  });
  surface.addEventListener('keydown', (e) => {
    if (!editing || e.target !== editing.node) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishTextEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishTextEdit(true); }
  });
  surface.addEventListener('focusout', (e) => {
    if (editing && e.target === editing.node) finishTextEdit();
  });

  // Add/remove board cards when pages are added/deleted (keep cards whose page
  // still exists; drop cards whose page is gone; new pages get a card on next
  // board entry or here). These are automatic, so they rebaseline undo rather
  // than pushing an entry.
  let syncTimer = null;
  onDocumentChange(() => {
    if (state.mode !== 'board') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const liveIds = new Set(getPageMeta().map(m => m.id));
      // Remove cards whose page was deleted.
      state.board.objects = state.board.objects.filter(o => o.kind !== 'card' || liveIds.has(o.pageId));
      // Add a card for any new page that lacks one. ensureCards() skips pages
      // that already have a card (advancing the grid cursor) and places new
      // cards at the next free cell, instead of stacking them on (60,60).
      ensureCards();
      if (!activeGesture && !editing) rebaseline();
      renderBoard();
    }, 200);
  });

  // Board-only keys (Delete, arrows, zoom, T/C, Cmd+G).
  window.addEventListener('keydown', (e) => {
    if (state.mode !== 'board' || state.ui.paletteOpen) return;
    if (isTypingTarget(e.target)) return;
    if (onBoardKey(e)) e.preventDefault();
  });

  // v32 — expose board teardown/exit to set-ui.js (setMode) and keyboard.js (Esc)
  // via globals, mirroring the v25 window.__exitTourMode pattern, to avoid import
  // cycles (board.js dynamic-imports render.js).
  window.__teardownBoardChrome = teardownBoardChrome;
  window.__exitBoardMode = exitBoardMode;
  window.__boardEscape = boardEscape;
  window.__boardUndo = undoBoard;
  window.__boardRedo = redoBoard;
  window.__boardSelectAll = selectAllBoard;
  window.__boardExport = exportBoard;
}
