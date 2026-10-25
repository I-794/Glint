import { state } from './state.js';

export const history = { past: [], future: [], maxSize: 50, trimmed: false };

// v40 — Hindsight: one small record per state, kept in step with history.past
// and history.future (same length, same order), so the History panel can name
// steps and cache their thumbnails across undo, redo and jumps. `current` is
// the live state's record. A label names the state its step leads to.
let stepSeq = 0;
const newStep = (label = null) => ({ id: ++stepSeq, label, at: Date.now() });
const steps = { past: [], current: newStep(), future: [] };

// Subscribers (e.g. layers panel, history timeline) call onChange after every snapshot/undo/redo.
const listeners = [];
export function onHistoryChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach(fn => fn()); }

function snapshot() {
  return JSON.parse(JSON.stringify({
    imageTransform: state.imageTransform,
    imageCrop: state.imageCrop,   // v37 — non-destructive crop
    imageFilters: state.imageFilters,
    imageLayer: state.imageLayer,
    textOverlay: state.textOverlay,
    windowOverlay: state.windowOverlay,
    watermark: state.watermark,
    gradient: state.gradient,
    padding: state.padding,
    scale: state.scale,
    borderRadius: state.borderRadius,
    showBorder: state.showBorder,
    borderWidth: state.borderWidth,
    borderColor: state.borderColor,
    shadow: state.shadow,
    reflection: state.reflection,
    canvas: state.canvas,
    bgMode: state.bgMode,
    bgColor: state.bgColor,
    deviceFrame: state.deviceFrame,
    annotations: state.annotations,
    redactions: state.redactions,
    spotlight: state.spotlight,
    annotationColor: state.annotationColor,
    annotationStrokeWidth: state.annotationStrokeWidth,
    annotationFill: state.annotationFill,
    polygonSides: state.polygonSides,
    starPoints: state.starPoints,
    nextNumber: state.nextNumber,
    redactType: state.redactType,
    redactIntensity: state.redactIntensity,
    extraImages: state.extraImages,
    autoLayout: state.autoLayout,
    meshGradient: state.meshGradient,
    tilt3d: state.tilt3d,
    scene: state.scene,
    // v21 — 3D mockup. Strip the runtime-only orbitProgress (set per export
    // frame for the turntable spin) so undo never restores mid-spin, mirroring
    // how animation playing/currentTime are stripped above.
    mockup3d: { ...state.mockup3d, orbitProgress: 0 },
    // v15.2 — animation edits (tracks, easing, duration) are now undoable.
    // Snapshot a runtime-stripped copy so undo never restores mid-playback.
    animation: { ...state.animation, playing: false, currentTime: 0 },
    kenBurns: state.kenBurns,
    // v29 — Motion Studio lane/clip config is undoable (drag a clip → undo). The
    // playback runtime (currentTime/playing/_driving) is stripped, mirroring how
    // animation playing/currentTime are stripped above.
    timeline: { ...state.timeline, currentTime: 0, playing: false, _driving: false },
    // v16.1 — Studio Effects overlays.
    glass: state.glass,
    grain: state.grain,
    // v16.2 — pattern background.
    pattern: state.pattern,
    // v17 — Color: active palette + edits and the color-map settings are
    // undoable. imageFilters (above) already carries temperature/tint. The
    // persisted palette library is localStorage-only, deliberately not snapshotted.
    colorPalettes: state.colorPalettes,
    colorMap: state.colorMap,
    // v24 — Code Snippet Studio settings are undoable. The raster (state.image)
    // is rebuilt from these by code-snippet.js's onHistoryChange listener, since
    // images are never snapshotted (same as the SVG/photo source).
    codeSnippet: state.codeSnippet,
    // v25 — Interactive Tour hotspots/callouts for the active step are undoable.
    tour: state.tour,
    // v27 — Surface Studio (physical & print mockup) settings are undoable.
    surface: state.surface,
    // v30 — Brand Brain system is undoable (Apply / Extract are one undo step).
    brand: state.brand,
    // v34 — Subject Bokeh (Detect subject / sliders are undoable).
    bokeh: state.bokeh,
    // v38 — curves + levels (a curve drag or a Look is one undo step).
    colorTools: state.colorTools,
    // v39 — light to dark mode flip (Flip, sliders, Turn off are undoable).
    modeFlip: state.modeFlip,
    // v35 — Before / After Compare (carries the Before dataURL).
    compare: state.compare,
    // v37 — the Roll (shot list, order, overrides, develop settings). Shot
    // image data lives in roll-core rollSources, so this clone stays small;
    // activeShot is runtime-only (features/roll.js puts it back after restore).
    roll: { ...state.roll, activeShot: null }
  }));
}

// v40 — the live state as an undo snapshot (Versions save one).
export function currentSnapshot() { return snapshot(); }

export function applySnapshot(snap) {
  Object.assign(state, snap);
  // Sidebar controls mirror state; without this, sliders kept showing the
  // undone value. window hook avoids an import cycle with ui/bindings.js.
  if (typeof window !== 'undefined' && typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
}

// v33.2 — Sliders, color pickers and text fields mutate state on every `input`
// event but call saveStateToHistory() on `change`, i.e. after the value has
// already moved, so the first Undo after a drag restored the new value. Rather
// than touch every handler, capture a snapshot at the gesture's first `input`
// (window capture phase, so it runs before any feature's own input listener)
// and hand that snapshot to a saveStateToHistory() made while the same
// control's `change` is dispatching. The save still happens on `change`, so
// history listeners (collab broadcast, autosave) fire exactly when they did.
let pendingEdit = null;   // { target, snap } from the first input of a gesture
let changeTarget = null;  // control whose `change` event is being dispatched

function isFormControl(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}

if (typeof window !== 'undefined') {
  window.addEventListener('input', (e) => {
    if (!isFormControl(e.target)) return;
    if (pendingEdit && pendingEdit.target === e.target) return;
    pendingEdit = { target: e.target, snap: snapshot() };
  }, true);
  window.addEventListener('change', (e) => { changeTarget = e.target; }, true);
  // Bubble phase on window runs after the control's own change handlers.
  window.addEventListener('change', (e) => {
    if (changeTarget === e.target) changeTarget = null;
    if (pendingEdit && pendingEdit.target === e.target) pendingEdit = null;
  });
}

function pushStep(label) {
  endPeek();
  const usePending = pendingEdit && changeTarget && pendingEdit.target === changeTarget;
  history.past.push(usePending ? pendingEdit.snap : snapshot());
  steps.past.push(steps.current);
  steps.current = newStep(typeof label === 'string' ? label : null);
  pendingEdit = null;
  if (history.past.length > history.maxSize) {
    history.past.shift();
    steps.past.shift();
    history.trimmed = true;
  }
  history.future = [];
  steps.future = [];
}

export function saveStateToHistory(label) {
  pushStep(label);
  emit();
}

// v40 — save a step whose change apply() makes, and tell listeners only after
// it ran, the way undo, redo and goToStep do. Listeners such as the code
// snippet raster, the layers panel and collab then read the new state.
export function commitStep(label, apply) {
  pushStep(label);
  try { if (apply) apply(); } finally { emit(); }
}

export function undo(rerender) {
  endPeek();
  pendingEdit = null;
  if (history.past.length === 0) return;
  history.future.push(snapshot());
  steps.future.push(steps.current);
  applySnapshot(history.past.pop());
  steps.current = steps.past.pop();
  rerender && rerender();
  emit();
}

export function redo(rerender) {
  endPeek();
  pendingEdit = null;
  if (history.future.length === 0) return;
  history.past.push(snapshot());
  steps.past.push(steps.current);
  applySnapshot(history.future.pop());
  steps.current = steps.future.pop();
  rerender && rerender();
  emit();
}

// v40 — every state, oldest first. The live state's snap is taken now; the
// future is a stack, so it is read backwards.
export function historyTimeline() {
  const out = history.past.map((snap, i) => ({ step: steps.past[i], snap, index: i, current: false }));
  out.push({ step: steps.current, snap: snapshot(), index: out.length, current: true });
  for (let i = history.future.length - 1; i >= 0; i--) {
    out.push({ step: steps.future[i], snap: history.future[i], index: out.length, current: false });
  }
  return out;
}

// v40 — go straight to a step (an index from historyTimeline). Walks the
// stacks one step at a time so snapshots and records stay paired, but applies
// state, re-renders and notifies listeners once.
export function goToStep(index, rerender) {
  endPeek();
  pendingEdit = null;
  const cur = history.past.length;
  const total = cur + 1 + history.future.length;
  if (!Number.isInteger(index) || index < 0 || index >= total || index === cur) return false;
  let snapNow = snapshot();
  while (history.past.length > index) {
    history.future.push(snapNow);
    steps.future.push(steps.current);
    snapNow = history.past.pop();
    steps.current = steps.past.pop();
  }
  while (history.past.length < index) {
    history.past.push(snapNow);
    steps.past.push(steps.current);
    snapNow = history.future.pop();
    steps.current = steps.future.pop();
  }
  applySnapshot(snapNow);
  rerender && rerender();
  emit();
  return true;
}

export function clearHistory() {
  endPeek();
  pendingEdit = null;
  history.past = [];
  history.future = [];
  history.trimmed = false;
  steps.past = [];
  steps.future = [];
  steps.current = newStep();
}

// v40 — run fn on a step's values. They are copied into state; the live
// objects are kept by reference and put back exactly, so runtime fields
// (roll.activeShot, timeline._driving) survive. state.image and
// state.lastImageRect ride along: a crop rebuild or a render can replace them.
// fn must be synchronous: nothing else may see the swapped-in values.
function swapIn(snap) {
  const saved = { image: state.image, lastImageRect: state.lastImageRect };
  for (const k of Object.keys(snap)) saved[k] = state[k];
  Object.assign(state, JSON.parse(JSON.stringify(snap)));
  return saved;
}

export function withSnapshot(snap, fn) {
  const saved = swapIn(snap);
  try { return fn(); } finally { Object.assign(state, saved); }
}

// v40 — look at a step without changing history. A peek only records which
// snapshot to show: state keeps the live values the whole time, and the
// preview render (render/render.js) draws the peeked snapshot inside one
// synchronous withSnapshot. So autosave, the Roll, collab, the Design Agent,
// page switches and playback never read or write the peeked design.
let peeking = null;

export function peekStep(index, rerender) {
  endPeek();
  const entry = historyTimeline()[index];
  if (!entry || entry.current) return false;
  peeking = entry.snap;
  rerender && rerender();
  return true;
}

export function endPeek(rerender) {
  if (!peeking) return false;
  peeking = null;
  rerender && rerender();
  return true;
}

export function isPeeking() { return !!peeking; }

// The snapshot being peeked at, or null.
export function peekSnapshot() { return peeking; }
