// v34 — Bokeh sidebar section (Adjust group). Detect subject runs the existing
// in-browser background remover, keeps only its alpha as a white mask, and
// turns Bokeh on; the blur itself is render/bokeh.js.
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

// Label updates live; the blur is a per-pixel pass, so it recomputes once on release.
function slider(input, label, fmt, apply) {
  if (!input) return;
  input.addEventListener('input', () => { if (label) label.textContent = fmt(+input.value); });
  input.addEventListener('change', () => { saveStateToHistory(); apply(+input.value); render(); });
}

export function bindBokeh() {
  setBokehMaskListener(() => render());
  if (el.bokehDetectBtn) el.bokehDetectBtn.addEventListener('click', detectSubject);
  if (el.bokehEnabled) el.bokehEnabled.addEventListener('change', (e) => {
    if (e.target.checked && !state.bokeh.maskDataUrl) {
      e.target.checked = false;
      showNotification('Detect the subject first.', 'error');
      return;
    }
    saveStateToHistory();
    state.bokeh.enabled = e.target.checked;
    refreshBokehUI();
    render();
  });
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
