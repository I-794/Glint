// v39 — Glossifier: the Light / Dark section (Adjust group, shown in Simple
// mode too). Flip turns state.modeFlip on with an explicit target (so in the
// Roll, a shot that is already dark is left alone) and, when asked, flips the
// scene around the screenshot and keeps the original as Compare's Before, all
// in one undo step. The AI engine replaces the image instead, like the other
// AI edits. The pixels are render/mode-flip.js; the math is mode-flip-core.js.
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { revealSection } from './studio-nav.js';
import { adoptCurrentAsBefore, refreshCompareUI } from './compare-ui.js';
import { detectImageMode, modeFlipActive } from '../render/mode-flip.js';
import { normalizeModeFlip, matchScene, restoreScene } from '../render/mode-flip-core.js';
import { compareDefaults } from '../render/compare-core.js';
import { canvasToBlob, loadImage, nearestGptImageSize } from './ai-shared.js';

const PREFS_KEY = 'glint_light_dark_prefs';
const NAMES = { light: 'Light', dark: 'Dark' };
let busy = false;
// The scene before and after the last Match the scene lives in mode-flip-core
// (matchScene / restoreScene), shared with the Design Agent, so turning the
// flip off restores it exactly (a flip back would only be close).
const flipScene = (target, surface) => matchScene(state, target, surface);

// ---- per-viewer choices (engine, Match the scene, Keep the original) -------------

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      engine: el.ldEngine?.value || 'free', scene: !!el.ldScene?.checked, pair: !!el.ldPair?.checked,
    }));
  } catch (e) { /* private mode: choices just are not remembered */ }
}
function options() {
  return { engine: el.ldEngine?.value === 'ai' ? 'ai' : 'free', scene: el.ldScene ? el.ldScene.checked : true, pair: !!el.ldPair?.checked };
}

// ---- helpers ------------------------------------------------------------------------

const other = (mode) => (mode === 'dark' ? 'light' : 'dark');

function videoLoaded() {
  return !!(state.video && state.video.loaded);
}

// Was the current Before put in by a Light / Dark pair? (Its labels say so.)
function isOwnPair() {
  const c = state.compare;
  if (!c || !c.beforeSrc || !c.labels) return false;
  const pair = [c.labels.before, c.labels.after].sort().join('/');
  return pair === 'Dark/Light';
}

function syncSidebar() {
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
}

function pairToast(target) {
  showNotification(`${NAMES[target]} mode on, with the original as Before.`, 'success', {
    action: { label: 'Export slider page', run: exportPair },
  });
}

export function exportPair() {
  import('./compare-export.js').then((m) => m.exportCompareHTML());
}

// ---- the flip ----------------------------------------------------------------------

// Flip the current screenshot with the chosen engine. Options default to the
// section's controls; Cmd-K passes its own.
export async function flipLightDark(opts = options()) {
  if (busy) return;
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return; }
  if (videoLoaded()) { showNotification('Light / Dark works on still images, not video clips.', 'error'); return; }
  if (state.modeFlip?.enabled) { turnOffLightDark(); return; }
  const from = detectImageMode(state.image);
  if (!from) { showNotification('Light / Dark cannot read this image (it comes from another site).', 'error'); return; }
  const target = other(from);
  if (opts.engine === 'ai') { await flipWithAi(from, target, opts); return; }

  saveStateToHistory(`Flipped to ${target}`);
  if (opts.pair) adoptCurrentAsBefore({ before: NAMES[from], after: NAMES[target], enabled: true });
  state.modeFlip = { ...normalizeModeFlip(state.modeFlip), enabled: true, target };
  if (opts.scene) flipScene(target, state.modeFlip.surface);
  syncSidebar();
  refreshModeFlipUI();
  render();
  if (opts.pair) pairToast(target);
  else showNotification(`${NAMES[target]} mode on.`, 'success');
}

// Turn the flip off. The scene the last flip matched comes back exactly, unless
// it was edited since (then it stays as it is), and a Before that came from a
// Light / Dark pair is removed (it would match After).
export function turnOffLightDark() {
  const mf = normalizeModeFlip(state.modeFlip);
  if (!mf.enabled) return;
  saveStateToHistory('Light / Dark off');
  state.modeFlip = { ...mf, enabled: false };
  restoreScene(state);
  if (isOwnPair()) state.compare = { ...state.compare, beforeSrc: null, enabled: false, wipe: false, labels: compareDefaults().labels };
  syncSidebar();
  refreshModeFlipUI();
  refreshCompareUI();
  render();
  showNotification('Light / Dark is off.', 'success');
}

// One step: keep the original as Before, flip After with the free engine,
// match the scene. Cmd-K "Light / Dark: Make a pair".
export function makeLightDarkPair() {
  return flipLightDark({ engine: 'free', scene: true, pair: true });
}

// ---- AI engine ---------------------------------------------------------------------

function aiPrompt(target) {
  return target === 'dark'
    ? 'Convert this user interface screenshot from light mode to dark mode. Keep the exact layout, text, icons, spacing, images and brand accent colors. Change only the background, surface, border and text colors the way a real dark theme would. Do not add, remove or move anything.'
    : 'Convert this user interface screenshot from dark mode to light mode. Keep the exact layout, text, icons, spacing, images and brand accent colors. Change only the background, surface, border and text colors the way a real light theme would. Do not add, remove or move anything.';
}

function setBusy(on, msg = '') {
  busy = on;
  if (el.ldFlipBtn) el.ldFlipBtn.disabled = on;
  if (el.ldStatus) el.ldStatus.textContent = msg;
}

async function flipWithAi(from, target, opts) {
  const img = state.image;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  setBusy(true, `Asking the AI for ${target} mode…`);
  try {
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    src.getContext('2d').drawImage(img, 0, 0, w, h);
    const { edit } = await import('./ai-image-edit.js');
    const b64 = await edit(await canvasToBlob(src), null, aiPrompt(target), nearestGptImageSize(w, h));
    if (state.image !== img) { showNotification('The screenshot changed while the AI worked. Try again.', 'error'); return; }
    // The model answers at one of its own sizes: scale back to the original.
    const raw = await loadImage('data:image/png;base64,' + b64);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(raw, 0, 0, w, h);
    const result = await loadImage(out.toDataURL('image/png'));

    saveStateToHistory(`Flipped to ${target} with AI`);
    // AI may redraw text, so its result always comes with the original as Before.
    adoptCurrentAsBefore({ before: NAMES[from], after: NAMES[target], enabled: true });
    state.image = result;
    state.modeFlip = { ...normalizeModeFlip(state.modeFlip), enabled: false };   // never flip it twice
    if (opts.scene) flipScene(target, state.modeFlip.surface);
    syncSidebar();
    render();
    pairToast(target);
  } catch (e) {
    console.error('[light-dark] AI flip failed:', e);
    showNotification(`AI flip failed: ${e?.message || e}`, 'error');
  } finally {
    setBusy(false);
    refreshModeFlipUI();
  }
}

// ---- section UI --------------------------------------------------------------------

function statusText(mf, from) {
  if (!state.image) return '';
  if (videoLoaded()) return 'Works on still images, not video clips.';
  if (!mf.enabled) return '';
  if (from && from === mf.target) return `This screenshot is already ${mf.target}.`;
  return `${NAMES[mf.target] || 'Flipped'} mode on. Adjust it below or turn it off.`;
}

export function refreshModeFlipUI() {
  if (!el.ldFlipBtn) return;
  const mf = normalizeModeFlip(state.modeFlip);
  const from = state.image ? detectImageMode(state.image) : null;
  if (mf.enabled && (mf.target === 'dark' || mf.target === 'light')) el.ldFlipBtn.textContent = `Back to ${other(mf.target)}`;
  else el.ldFlipBtn.textContent = from === 'dark' ? 'Flip to light' : 'Flip to dark';
  if (!busy) el.ldFlipBtn.disabled = !state.image || videoLoaded();
  if (el.ldControls) el.ldControls.style.display = mf.enabled ? 'block' : 'none';
  if (el.ldSurface) el.ldSurface.value = mf.surface;
  if (el.ldSurfaceValue) el.ldSurfaceValue.textContent = String(mf.surface);
  if (el.ldProtect) el.ldProtect.value = mf.protect;
  if (el.ldProtectValue) el.ldProtectValue.textContent = mf.protect + '%';
  if (el.ldExportPair) el.ldExportPair.style.display = state.compare?.beforeSrc ? '' : 'none';
  if (el.ldAiNote) el.ldAiNote.style.display = el.ldEngine?.value === 'ai' ? 'block' : 'none';
  if (el.ldStatus && !busy) el.ldStatus.textContent = statusText(mf, from);
}

export function openLightDark() {
  if (!el.lightDarkSection) return;
  revealSection(el.lightDarkSection);
  el.lightDarkSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Label updates live; the flip is a per-pixel pass, so it recomputes on release.
function slider(input, label, fmt, apply) {
  if (!input) return;
  input.addEventListener('input', () => { if (label) label.textContent = fmt(+input.value); });
  input.addEventListener('change', () => {
    saveStateToHistory();
    state.modeFlip = normalizeModeFlip(state.modeFlip);
    apply(+input.value);
    render();
  });
}

export function bindModeFlip() {
  state.modeFlip = normalizeModeFlip(state.modeFlip);
  const prefs = loadPrefs();
  if (el.ldEngine && (prefs.engine === 'ai' || prefs.engine === 'free')) el.ldEngine.value = prefs.engine;
  if (el.ldScene && typeof prefs.scene === 'boolean') el.ldScene.checked = prefs.scene;
  if (el.ldPair && typeof prefs.pair === 'boolean') el.ldPair.checked = prefs.pair;

  el.ldFlipBtn?.addEventListener('click', () => flipLightDark());
  el.ldOffBtn?.addEventListener('click', turnOffLightDark);
  el.ldExportPair?.addEventListener('click', exportPair);
  el.ldEngine?.addEventListener('change', () => {
    if (el.ldEngine.value === 'ai' && el.ldPair) el.ldPair.checked = true;
    savePrefs();
    refreshModeFlipUI();
  });
  el.ldScene?.addEventListener('change', savePrefs);
  el.ldPair?.addEventListener('change', savePrefs);
  slider(el.ldSurface, el.ldSurfaceValue, (v) => String(v), (v) => { state.modeFlip.surface = v; });
  slider(el.ldProtect, el.ldProtectValue, (v) => v + '%', (v) => { state.modeFlip.protect = v; });

  onHistoryChange(() => queueMicrotask(refreshModeFlipUI));
  // render() pokes this each preview frame; only a new image (or a change in
  // whether the flip is on) refreshes the label, and detection waits for idle.
  let lastImage = null, lastOn = null;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
  window.__modeFlipImageCheck = () => {
    const on = modeFlipActive();
    if (state.image === lastImage && on === lastOn) return;
    lastImage = state.image;
    lastOn = on;
    idle(() => refreshModeFlipUI());
  };
  refreshModeFlipUI();
}
