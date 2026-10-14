// v23 — Mobile Studio. Canvas-first phone chrome (adaptive reflow).
//
// On phones (<=767px) the desktop three-panel shell doesn't fit, so we layer two
// new pieces of fixed chrome over the existing DOM without duplicating it:
//   • a bottom tab dock — the same 8 studio groups, cloned from #tool-rail so the
//     icons never drift, driving the existing setGroup() from studio-nav.js.
//   • a bottom sheet — the existing .sidebar, slid up from the bottom on a
//     translateY detent (peek / half / full) instead of the old translateX drawer.
// All section IDs and feature bindings stay put; only the chrome moves. Everything
// here is runtime-only DOM state, so it never touches `state` or the undo history.
// Desktop is untouched because the dock/handle/sheet rules live in @media <=767px.

import { setGroup, isPhone } from '../features/studio-nav.js';
import { snap, tab } from './haptics.js';

const TABS = ['import', 'adjust', 'background', 'frame', 'markup', 'ai', 'export', 'project'];
const DETENTS = { full: 0, half: 50, peek: 85 };   // translateY as % of sheet height
const ACTIVE_KEY = 'glint_studio_group';

let sheet = null;          // the .sidebar element, reused as the sheet surface
let dock = null;
let detent = 'peek';

function currentGroup() {
  try { return localStorage.getItem(ACTIVE_KEY) || 'import'; } catch (e) { return 'import'; }
}

function markActive(group) {
  if (!dock) return;
  dock.querySelectorAll('.mdock-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.group === group));
}

function setDetent(name, { haptic = true } = {}) {
  if (!(name in DETENTS) || !sheet) return;
  detent = name;
  sheet.style.setProperty('--sheet-y', DETENTS[name] + '%');
  sheet.dataset.detent = name;
  if (haptic) snap();
}

// Choose a group then raise the sheet so its controls are reachable.
function openGroup(group) {
  setGroup(group);
  markActive(group);
  if (detent === 'peek') setDetent('half', { haptic: false });
  tab();
}

function buildDock() {
  dock = document.createElement('nav');
  dock.className = 'mobile-dock';
  dock.setAttribute('aria-label', 'Studio sections');
  const railBtns = Array.from(document.querySelectorAll('#tool-rail .rail-btn'));
  const byGroup = Object.fromEntries(railBtns.map(b => [b.dataset.group, b]));

  TABS.forEach(group => {
    const src = byGroup[group];
    const btn = document.createElement('button');
    btn.className = 'mdock-btn';
    btn.dataset.group = group;
    // Clone the rail button's icon+label so the two never drift.
    btn.innerHTML = src ? src.innerHTML : `<span>${group}</span>`;
    btn.setAttribute('aria-label', group);
    btn.addEventListener('click', () => openGroup(group));
    dock.appendChild(btn);
  });
  document.querySelector('.app-container')?.appendChild(dock) ||
    document.body.appendChild(dock);
}

// A drag grip prepended to the top of the sheet; also the swipe-between-tools zone.
function buildHandle() {
  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', 'Resize panel');
  sheet.prepend(handle);
  bindGestures(handle);
}

function bindGestures(handle) {
  let startY = 0, startX = 0, startPct = 0, lastY = 0, lastT = 0, vel = 0;
  let dragging = false, axis = null;   // axis: 'y' | 'x' | null until locked
  const H = () => sheet.offsetHeight || 1;

  handle.addEventListener('pointerdown', (e) => {
    if (!isPhone()) return;
    dragging = true; axis = null;
    startY = lastY = e.clientY; startX = e.clientX;
    startPct = DETENTS[detent];
    lastT = performance.now(); vel = 0;
    sheet.dataset.dragging = '1';
    handle.setPointerCapture?.(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY, dx = e.clientX - startX;
    if (!axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      else return;
    }
    if (axis === 'x') return;   // horizontal handled on pointerup as a swipe
    const now = performance.now();
    if (now > lastT) { vel = (e.clientY - lastY) / (now - lastT); lastT = now; lastY = e.clientY; }
    let pct = startPct + (dy / H()) * 100;
    // Rubber-band past the open/closed bounds so it never flies off.
    if (pct < DETENTS.full) pct = DETENTS.full + (pct - DETENTS.full) * 0.35;
    if (pct > DETENTS.peek) pct = DETENTS.peek + (pct - DETENTS.peek) * 0.35;
    sheet.style.setProperty('--sheet-y', pct + '%');
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    delete sheet.dataset.dragging;
    if (axis === 'x') {
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40) cycleGroup(dx < 0 ? 1 : -1);
      else setDetent(detent, { haptic: false });
      return;
    }
    // Momentum: a firm flick biases toward the next detent in its direction.
    const cur = parseFloat(sheet.style.getPropertyValue('--sheet-y')) || DETENTS[detent];
    const biased = cur + vel * 120;
    setDetent(nearestDetent(biased));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function nearestDetent(pct) {
  let best = 'peek', dist = Infinity;
  for (const [name, val] of Object.entries(DETENTS)) {
    const d = Math.abs(pct - val);
    if (d < dist) { dist = d; best = name; }
  }
  return best;
}

function cycleGroup(dir) {
  const cur = currentGroup();
  const i = TABS.indexOf(cur);
  const next = TABS[(i + dir + TABS.length) % TABS.length];
  openGroup(next);
}

export function bindMobileStudio() {
  sheet = document.querySelector('.sidebar');
  if (!sheet) return;

  buildDock();
  buildHandle();

  // Start collapsed to a peek so the canvas is maximal and the handle is reachable.
  setDetent('peek', { haptic: false });
  markActive(currentGroup());
}
