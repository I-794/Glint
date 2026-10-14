// v11.1 — In-browser screen recording.
//
// Uses getDisplayMedia + MediaRecorder to capture the screen to a WebM blob,
// then hands it to the existing video pipeline via loadVideoFile() — so the
// recording is trimmable, framable in a device mockup, and exportable as MP4/GIF
// for free. While recording we sample the pointer over our own window into
// state.recording.events; auto-zoom.js turns clicks into zoom keyframes.
//
// Limitation (documented in the UI): the display stream carries no cursor data,
// so only the Glint tab's pointer is tracked. That's ideal for demos
// driven inside the app; for other captures, leave auto-zoom off.

import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { loadVideoFile } from './video.js';
import { rebuildAutoZoom } from './auto-zoom.js';

let recorder = null;
let chunks = [];
let displayStream = null;
let startedAt = 0;

export function isSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia &&
            typeof MediaRecorder !== 'undefined');
}

function recordPointer(e, type) {
  // Normalize against the viewport; clamp to 0..1 so a pointer leaving the
  // window still yields a sane focal point.
  const x = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
  const y = Math.max(0, Math.min(1, e.clientY / window.innerHeight));
  state.recording.events.push({ t: performance.now() - startedAt, xFrac: x, yFrac: y, type });
}

const onMove = (e) => recordPointer(e, 'pointermove');
const onDown = (e) => recordPointer(e, 'pointerdown');

function attachPointerTracking() {
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerdown', onDown, true);
}
function detachPointerTracking() {
  document.removeEventListener('pointermove', onMove, true);
  document.removeEventListener('pointerdown', onDown, true);
}

async function startRecording(btn) {
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (_) {
    showNotification('Screen recording was cancelled or blocked.', 'error');
    return;
  }

  chunks = [];
  state.recording.events = [];
  startedAt = performance.now();

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  recorder = new MediaRecorder(displayStream, { mimeType: mime });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    detachPointerTracking();
    if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
    const blob = new Blob(chunks, { type: 'video/webm' });
    chunks = [];
    if (blob.size === 0) { showNotification('Recording was empty.', 'error'); return; }
    loadVideoFile(blob);
    rebuildAutoZoom(state); // derive zoom keyframes from the captured clicks
    showNotification('Recording loaded. Toggle auto-zoom, then trim and export.', 'success');
  };

  // If the user stops sharing from the browser's own control, end cleanly.
  displayStream.getVideoTracks()[0].addEventListener('ended', () => stopRecording(btn));

  attachPointerTracking();
  recorder.start();
  if (btn) { btn.textContent = '⏹ Stop recording'; btn.classList.add('recording'); }
  showNotification('Recording… click "Stop recording" when done.', 'info');
}

function stopRecording(btn) {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  if (btn) { btn.textContent = '⏺ Record screen'; btn.classList.remove('recording'); }
}

export function bindScreenRecord() {
  const btn = document.getElementById('screen-record-btn');
  if (!btn) return;

  if (!isSupported()) {
    btn.style.display = 'none';
    const hint = document.getElementById('screen-record-hint');
    if (hint) hint.textContent = 'Screen recording needs a browser with getDisplayMedia (Chrome, Edge, or Firefox on desktop).';
    return;
  }

  btn.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') stopRecording(btn);
    else startRecording(btn);
  });

  const toggle = document.getElementById('auto-zoom-enabled');
  if (toggle) toggle.addEventListener('change', () => {
    state.autoZoom.enabled = toggle.checked;
    rebuildAutoZoom(state);
  });

  const intensity = document.getElementById('auto-zoom-intensity');
  const intensityVal = document.getElementById('auto-zoom-intensity-value');
  if (intensity) intensity.addEventListener('input', () => {
    state.autoZoom.intensity = parseFloat(intensity.value);
    if (intensityVal) intensityVal.textContent = `${state.autoZoom.intensity.toFixed(1)}×`;
    rebuildAutoZoom(state);
  });
}
