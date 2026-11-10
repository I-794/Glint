// v34 — Bokeh sidebar section (Adjust group). Detect subject runs the existing
// in-browser background remover, keeps only its alpha as a white mask, and
// turns Bokeh on; the blur itself is render/bokeh.js.
// v42 — a second mode, tilt-shift (a sharp band, no subject needed), and a
// focus pull that Motion Studio plays as its own lane.
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { isStaleBuildError, showStaleBuildNotice } from '../ui/stale-build.js';
import { cutSubject } from './bg-remove.js';
import { setBokehMaskListener, aspectSig, bindMaskOwner, maskMatches } from '../render/bokeh.js';

const MASK_EDGE = 768;   // mask long edge; it is softened anyway, so this stays small

// White-on-transparent PNG of the cut-out's alpha channel.
function makeMaskDataUrl(cut) {
  const s = Math.min(1, MASK_EDGE / Math.max(cut.width, cut.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cut.width * s));
  c.height = Math.max(1, Math.round(cut.height * s));
  const x = c.getContext('2d');
  x.drawImage(cut, 0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function statusText() {
  const b = state.bokeh;
  if (b && b.mode === 'tilt') return '';
  if (!b || !b.maskDataUrl) return 'The first run downloads a ~40MB model, then it is cached.';
  if (state.image && !maskMatches(state.image)) return 'The image changed. Detect the subject again.';
  return 'Subject found.';
}

export function refreshBokehUI() {
  const b = state.bokeh;
  if (!b) return;
  if (el.bokehEnabled) el.bokehEnabled.checked = !!b.enabled;
  if (el.bokehControls) el.bokehControls.style.display = b.enabled ? 'block' : 'none';
  if (el.bokehAmount) el.bokehAmount.value = b.amount;
  if (el.bokehAmountValue) el.bokehAmountValue.textContent = String(b.amount);
  const hl = Math.round((b.highlights ?? 0.4) * 100);
  if (el.bokehHighlights) el.bokehHighlights.value = hl;
  if (el.bokehHighlightsValue) el.bokehHighlightsValue.textContent = hl + '%';
  if (el.bokehShape) el.bokehShape.value = b.shape || 'circle';
  if (el.bokehStatus) el.bokehStatus.textContent = statusText();

  // v42 — mode, the tilt band and the focus pull.
  const tilt = b.mode === 'tilt';
  const pct = (v) => Math.round(v * 100);
  if (el.bokehMode) el.bokehMode.value = tilt ? 'tilt' : 'subject';
  if (el.bokehDetectBtn) el.bokehDetectBtn.style.display = tilt ? 'none' : '';
  if (el.bokehStatus) el.bokehStatus.style.display = tilt ? 'none' : '';
  if (el.bokehTiltControls) el.bokehTiltControls.style.display = tilt ? 'block' : 'none';
  const set = (input, label, value, text) => { if (input) input.value = value; if (label) label.textContent = text; };
  set(el.bokehTiltPos, el.bokehTiltPosValue, pct(b.tilt.pos), pct(b.tilt.pos) + '%');
  set(el.bokehTiltWidth, el.bokehTiltWidthValue, pct(b.tilt.width), pct(b.tilt.width) + '%');
  set(el.bokehTiltFeather, el.bokehTiltFeatherValue, pct(b.tilt.feather), pct(b.tilt.feather) + '%');
  set(el.bokehTiltAngle, el.bokehTiltAngleValue, Math.round(b.tilt.angle), Math.round(b.tilt.angle) + '°');
  if (el.bokehPullEnabled) el.bokehPullEnabled.checked = !!b.pull.enabled;
  if (el.bokehPullControls) el.bokehPullControls.style.display = b.pull.enabled ? 'block' : 'none';
  if (el.bokehPullNote) el.bokehPullNote.textContent = tilt
    ? 'Moves the sharp band across the image. Play it in Motion Studio.'
    : 'Fades the background blur in or out. Play it in Motion Studio.';
  if (el.bokehPullFromLabel) el.bokehPullFromLabel.textContent = tilt ? 'Band starts at' : 'Blur starts at';
  if (el.bokehPullToLabel) el.bokehPullToLabel.textContent = tilt ? 'Band ends at' : 'Blur ends at';
  set(el.bokehPullFrom, el.bokehPullFromValue, pct(b.pull.from), pct(b.pull.from) + '%');
  set(el.bokehPullTo, el.bokehPullToValue, pct(b.pull.to), pct(b.pull.to) + '%');
}

// v42 — turn tilt-shift on or off (Cmd-K). Turning it on switches the mode.
export function toggleTiltShift() {
  saveStateToHistory('Tilt-shift');
  const b = state.bokeh;
  const on = !(b.enabled && b.mode === 'tilt');
  state.bokeh = { ...b, mode: on ? 'tilt' : b.mode, enabled: on };
  refreshBokehUI();
  window.__motionStudioRefresh?.();
  render();
}

// v42 — turn the focus pull on or off (Cmd-K). It needs Bokeh to be on.
export function toggleFocusPull() {
  const b = state.bokeh;
  if (!b.enabled) { showNotification('Turn Bokeh on first.', 'error'); return; }
  saveStateToHistory('Focus pull');
  b.pull.enabled = !b.pull.enabled;
  refreshBokehUI();
  window.__motionStudioRefresh?.();
  render();
}

export async function detectSubject() {
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  if (state.video && state.video.loaded) { showNotification('Bokeh works on still images, not video clips.', 'error'); return; }
  if (el.bokehDetectBtn) el.bokehDetectBtn.disabled = true;
  try {
    const img = state.image;
    const cut = await cutSubject({ progressId: 'bokeh-progress' });
    if (!cut) { showNotification('Another background task is running. Try again in a moment.', 'error'); return; }
    if (state.image !== img) { showNotification('The image changed during detection. Try again.', 'error'); return; }
    saveStateToHistory();
    state.bokeh = {
      ...state.bokeh,
      maskDataUrl: makeMaskDataUrl(cut),
      maskSig: aspectSig(img),
      enabled: true,
    };
    bindMaskOwner(img);
    render();
    showNotification('Subject found. Background blur is on.', 'success');
  } catch (e) {
    console.error('[bokeh] detect failed:', e);
    if (isStaleBuildError(e)) showStaleBuildNotice();
    else showNotification('Subject detection failed: ' + (e?.message || String(e)), 'error');
  } finally {
    if (el.bokehDetectBtn) el.bokehDetectBtn.disabled = false;
    refreshBokehUI();
  }
}

// v42 — the band and the pull only composite cached blur layers, so these
// sliders apply while you drag. history.js snapshots at the first `input`, so
// the save on `change` records the value from before the drag.
function liveSlider(input, label, fmt, apply) {
  if (!input) return;
  input.addEventListener('input', () => {
    if (label) label.textContent = fmt(+input.value);
    apply(+input.value);
    render();
  });
  input.addEventListener('change', () => saveStateToHistory());
}

// Label updates live; the blur is a per-pixel pass, so it recomputes once on release.
function slider(input, label, fmt, apply) {
  if (!input) return;
  input.addEventListener('input', () => { if (label) label.textContent = fmt(+input.value); });
  input.addEventListener('change', () => { saveStateToHistory(); apply(+input.value); render(); });
}

export function bindBokeh() {
  setBokehMaskListener(() => render());
  if (el.bokehDetectBtn) el.bokehDetectBtn.addEventListener('click', detectSubject);
  if (el.bokehMode) el.bokehMode.addEventListener('change', (e) => {
    const mode = e.target.value === 'tilt' ? 'tilt' : 'subject';
    saveStateToHistory('Bokeh mode');
    // The subject mode needs a mask; without one it waits for Detect subject.
    const enabled = mode === 'tilt' ? state.bokeh.enabled : state.bokeh.enabled && !!state.bokeh.maskDataUrl;
    state.bokeh = { ...state.bokeh, mode, enabled };
    refreshBokehUI();
    window.__motionStudioRefresh?.();
    render();
  });
  if (el.bokehEnabled) el.bokehEnabled.addEventListener('change', (e) => {
    if (e.target.checked && state.bokeh.mode !== 'tilt' && !state.bokeh.maskDataUrl) {
      e.target.checked = false;
      showNotification('Detect the subject first.', 'error');
      return;
    }
    const on = e.target.checked;
    saveStateToHistory();
    state.bokeh.enabled = on;
    refreshBokehUI();
    window.__motionStudioRefresh?.();
    render();
  });
  const pct = (v) => v + '%';
  liveSlider(el.bokehTiltPos, el.bokehTiltPosValue, pct, (v) => { state.bokeh.tilt.pos = v / 100; });
  liveSlider(el.bokehTiltWidth, el.bokehTiltWidthValue, pct, (v) => { state.bokeh.tilt.width = v / 100; });
  liveSlider(el.bokehTiltFeather, el.bokehTiltFeatherValue, pct, (v) => { state.bokeh.tilt.feather = v / 100; });
  liveSlider(el.bokehTiltAngle, el.bokehTiltAngleValue, (v) => v + '°', (v) => { state.bokeh.tilt.angle = v; });
  if (el.bokehPullEnabled) el.bokehPullEnabled.addEventListener('change', (e) => {
    const on = e.target.checked;
    saveStateToHistory('Focus pull');
    state.bokeh.pull.enabled = on;
    refreshBokehUI();
    window.__motionStudioRefresh?.();
    render();
  });
  liveSlider(el.bokehPullFrom, el.bokehPullFromValue, pct, (v) => { state.bokeh.pull.from = v / 100; });
  liveSlider(el.bokehPullTo, el.bokehPullToValue, pct, (v) => { state.bokeh.pull.to = v / 100; });
  slider(el.bokehAmount, el.bokehAmountValue, (v) => String(v), (v) => { state.bokeh.amount = v; });
  slider(el.bokehHighlights, el.bokehHighlightsValue, (v) => v + '%', (v) => { state.bokeh.highlights = v / 100; });
  if (el.bokehShape) el.bokehShape.addEventListener('change', (e) => {
    saveStateToHistory();
    state.bokeh.shape = e.target.value;
    render();
  });
  // Undo/redo restore state without touching the sidebar. History also emits on
  // every save, which runs before the caller's mutation, so sync after it.
  onHistoryChange(() => queueMicrotask(() => { refreshBokehUI(); window.__refreshSpotlightUI?.(); }));
  refreshBokehUI();
}
