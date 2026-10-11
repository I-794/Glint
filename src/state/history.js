import { state } from './state.js';

export const history = { past: [], future: [], maxSize: 50 };

// Subscribers (e.g. layers panel, history timeline) call onChange after every snapshot/undo/redo.
const listeners = [];
export function onHistoryChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach(fn => fn()); }

function snapshot() {
  return JSON.parse(JSON.stringify({
    imageTransform: state.imageTransform,
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
    // v35 — Before / After Compare (carries the Before dataURL).
    compare: state.compare
  }));
}

function restore(snap) {
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

export function saveStateToHistory() {
  const usePending = pendingEdit && changeTarget && pendingEdit.target === changeTarget;
  history.past.push(usePending ? pendingEdit.snap : snapshot());
  pendingEdit = null;
  if (history.past.length > history.maxSize) history.past.shift();
  history.future = [];
  emit();
}

export function undo(rerender) {
  pendingEdit = null;
  if (history.past.length === 0) return;
  history.future.push(snapshot());
  restore(history.past.pop());
  rerender && rerender();
  emit();
}

export function redo(rerender) {
  pendingEdit = null;
  if (history.future.length === 0) return;
  history.past.push(snapshot());
  restore(history.future.pop());
  rerender && rerender();
  emit();
}
