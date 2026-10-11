import { state } from '../state/state.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { isStaleBuildError, showStaleBuildNotice } from '../ui/stale-build.js';

const MAX_EDGE = 2048;

let modelLoaded = false;
let busy = false;
let heartbeatId = null;
let heartbeatStart = 0;
let lastProgressLabel = '';
let progressId = 'bg-remove-progress';   // v34 — Bokeh shows progress in its own section

function setProgress(pct, label, indeterminate = false) {
  const wrap = document.getElementById(progressId);
  if (!wrap) return;
  if (pct === null) { wrap.style.display = 'none'; wrap.classList.remove('indeterminate'); return; }
  wrap.style.display = 'flex';
  wrap.classList.toggle('indeterminate', indeterminate);
  const fill = wrap.querySelector('.ai-progress-fill');
  const lab = wrap.querySelector('.ai-progress-label');
  if (fill) fill.style.width = (indeterminate ? 100 : pct) + '%';
  if (lab) lab.textContent = label || `${Math.round(pct)}%`;
  if (label) lastProgressLabel = label;
}

function startHeartbeat(initialLabel) {
  stopHeartbeat();
  heartbeatStart = Date.now();
  setProgress(0, initialLabel, true);
  heartbeatId = setInterval(() => {
    const secs = Math.round((Date.now() - heartbeatStart) / 1000);
    const wrap = document.getElementById(progressId);
    if (!wrap) return;
    const lab = wrap.querySelector('.ai-progress-label');
    if (lab) lab.textContent = `${lastProgressLabel} (${secs}s)`;
  }, 500);
}

function stopHeartbeat() {
  if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
}

function downscaleIfHuge(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const longest = Math.max(iw, ih);
  if (longest <= MAX_EDGE) return null;
  const scale = MAX_EDGE / longest;
  const c = document.createElement('canvas');
  c.width = Math.round(iw * scale);
  c.height = Math.round(ih * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function imageToBlob(img) {
  const downscaled = downscaleIfHuge(img);
  if (downscaled) {
    return await new Promise(res => downscaled.toBlob(res, 'image/png'));
  }
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return await new Promise(res => c.toBlob(res, 'image/png'));
}

function progressLabel(key, current, total) {
  // key format examples: 'fetch:/path/to/model.onnx', 'compute:inference'
  if (key && key.startsWith('fetch')) {
    const pct = total ? Math.round((current / total) * 100) : 0;
    const mb = total ? (total / 1024 / 1024).toFixed(1) : '?';
    return { pct, label: `Downloading model… ${pct}% of ${mb}MB`, indeterminate: false };
  }
  if (key && key.startsWith('compute')) {
    return { pct: Math.max(50, total ? Math.round((current / total) * 100) : 0), label: 'Running AI model on your image…', indeterminate: false };
  }
  return { pct: 0, label: `${key || 'Working'}…`, indeterminate: true };
}

// v19 — core subject cut, reusable by AI Assets. Runs @imgly removal on
// state.image and returns the cut Image. Does NOT mutate state (caller decides
// what to do with the result). Returns null if no image / already busy.
export async function cutSubject(opts = {}) {
  if (busy) return null;
  if (!state.image) return null;
  busy = true;
  try {
    progressId = opts.progressId || 'bg-remove-progress';
    startHeartbeat(modelLoaded ? 'Preparing your image…' : 'Loading AI model (first run downloads ~40MB)…');
    await new Promise(r => setTimeout(r, 30));

    const mod = await import('@imgly/background-removal');
    const imglyRemove = mod.removeBackground || mod.default;

    const blob = await imageToBlob(state.image);

    const resultBlob = await imglyRemove(blob, {
      progress: (key, current, total) => {
        const { pct, label, indeterminate } = progressLabel(key, current, total);
        setProgress(pct, label, indeterminate);
      },
      output: { format: 'image/png', quality: 0.95 }
    });

    modelLoaded = true;
    stopHeartbeat();
    setProgress(95, 'Finalizing…', false);

    const url = URL.createObjectURL(resultBlob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    setProgress(null);
    return img;
  } catch (e) {
    stopHeartbeat();
    setProgress(null);
    throw e;
  } finally {
    busy = false;
  }
}

async function removeBackground() {
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  try {
    const img = await cutSubject();
    if (!img) return;
    saveStateToHistory();
    state.image = img;
    state.bgMode = 'transparent';
    render();
    showNotification('Background removed.', 'success');
  } catch (e) {
    console.error('[bg-remove] failed:', e);
    if (isStaleBuildError(e)) { showStaleBuildNotice(); return; }
    const msg = e?.message || String(e);
    showNotification('Background removal failed: ' + msg, 'error');
  }
}

export function bindBgRemove() {
  const btn = document.getElementById('bg-remove-btn');
  if (btn) btn.addEventListener('click', removeBackground);
}
