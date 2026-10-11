// v9.2 — Video / clip support.
//
// A loaded clip drives the existing render pipeline by funneling the current
// video frame through a single offscreen "frame canvas" that we assign to
// state.image. Because a canvas has .width/.height and is a valid drawImage
// source, every downstream consumer (device mockups, background, shadow,
// export) works unchanged — the screenshot is simply a live frame.
//
// This module owns import, trim (in/out), and playback; video-export.js handles
// MP4/GIF encoding and reads the shared element via getVideoContext().

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { fitZoom } from './zoom-pan.js';
import { sampleZoom } from './auto-zoom.js';
import { refreshBokehUI } from './bokeh-ui.js';

let videoEl = null;
let frameCanvas = null;
let frameCtx = null;
let rafId = null;

const MAX_DURATION = 30; // seconds — warn beyond this

// v15.1 — one-way hooks the timeline registers so video.js stays unaware of it:
// `loaded` fires when a clip's metadata is ready; `time` fires each playback
// frame so the timeline can move its playhead.
const vhooks = { loaded: null, time: null };
export function setVideoHooks(h) { Object.assign(vhooks, h); }

export function getVideoContext() {
  return { videoEl, frameCanvas, drawFrame, seekTo };
}

function ensureFrameCanvas(w, h) {
  if (!frameCanvas) frameCanvas = document.createElement('canvas');
  if (frameCanvas.width !== w) frameCanvas.width = w;
  if (frameCanvas.height !== h) frameCanvas.height = h;
  frameCtx = frameCanvas.getContext('2d');
}

// Copy the video's current frame into the frame canvas (which is state.image).
// When auto-zoom is enabled, draw a cropped source sub-rectangle scaled to fill
// the frame canvas — a zoom toward the interpolated focal point for this
// timestamp. Both live playback (tick) and export (seekTo) call drawFrame, so
// the effect appears identically in preview, MP4, and GIF with no render change.
export function drawFrame() {
  if (!videoEl || !frameCtx) return;
  const W = frameCanvas.width, H = frameCanvas.height;
  if (state.autoZoom.enabled && state.autoZoom.keyframes.length) {
    const { cx, cy, scale } = sampleZoom(state.autoZoom.keyframes, videoEl.currentTime || 0);
    const s = Math.max(1, scale);
    const sw = W / s, sh = H / s;
    // Clamp the crop window so it stays inside the source frame.
    let sx = cx * W - sw / 2, sy = cy * H - sh / 2;
    sx = Math.max(0, Math.min(W - sw, sx));
    sy = Math.max(0, Math.min(H - sh, sy));
    frameCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    frameCtx.drawImage(videoEl, 0, 0, W, H);
  }
}

export function seekTo(t) {
  return new Promise((resolve) => {
    if (!videoEl) { resolve(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; videoEl.removeEventListener('seeked', onSeeked); drawFrame(); resolve(); };
    const onSeeked = () => finish();
    videoEl.addEventListener('seeked', onSeeked);
    const target = Math.max(0, Math.min(videoEl.duration || 0, t));
    // If the time doesn't actually change, 'seeked' may not fire — guard with a
    // short fallback so frame export never hangs on a real clip.
    if (Math.abs(videoEl.currentTime - target) < 1e-3) { setTimeout(finish, 0); return; }
    videoEl.currentTime = target;
    setTimeout(finish, 1500);
  });
}

export function loadVideoFile(file) {
  if (videoEl) { try { URL.revokeObjectURL(videoEl.src); } catch (_) {} videoEl.remove(); }
  videoEl = document.createElement('video');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  videoEl.src = URL.createObjectURL(file);

  videoEl.addEventListener('loadedmetadata', () => {
    const w = videoEl.videoWidth, h = videoEl.videoHeight;
    ensureFrameCanvas(w, h);
    state.video.loaded = true;
    // v34 — Bokeh is still-image only; drop any mask from the previous image.
    if (state.bokeh) state.bokeh = { ...state.bokeh, enabled: false, maskDataUrl: null, maskSig: null };
    refreshBokehUI();
    state.video.duration = videoEl.duration || 0;
    state.video.in = 0;
    state.video.out = videoEl.duration || 0;
    state.video.w = w;
    state.video.h = h;
    state.video.playing = false;
    state.image = frameCanvas;
    state.mode = 'single';

    // Reveal the editor surface (mirrors upload.js).
    if (el.uploadZone) el.uploadZone.style.display = 'none';
    if (el.canvasWrapper) el.canvasWrapper.style.display = 'block';
    if (el.annotationToolbar) el.annotationToolbar.style.display = 'flex';
    if (el.zoomControls) el.zoomControls.style.display = 'flex';

    // Draw the first frame reliably: setting currentTime to 0 when it is
    // already 0 may not fire 'seeked', so paint once on loadeddata too.
    videoEl.addEventListener('loadeddata', () => { drawFrame(); render(); fitZoom(); }, { once: true });
    seekTo(0).then(() => { render(); fitZoom(); });
    showVideoControls(true);
    if (vhooks.loaded) vhooks.loaded();
    if (window.__motionStudioRefresh) window.__motionStudioRefresh();
    if (state.video.duration > MAX_DURATION) {
      showNotification(`Clip is ${Math.round(state.video.duration)}s — exports are capped to ${MAX_DURATION}s for performance.`, 'info');
    } else {
      showNotification('Clip loaded. Trim it, then drop it in a device frame.', 'success');
    }
  });
  videoEl.addEventListener('error', () => showNotification('Could not load that video.', 'error'));
}

export function clearVideo() {
  pause();
  if (videoEl) { try { URL.revokeObjectURL(videoEl.src); } catch (_) {} videoEl.remove(); videoEl = null; }
  state.video.loaded = false;
  state.video.playing = false;
  showVideoControls(false);
  if (window.__motionStudioRefresh) window.__motionStudioRefresh();
}

// ---- playback -------------------------------------------------------------

function tick() {
  if (!videoEl || !state.video.playing) return;
  if (videoEl.currentTime >= state.video.out) videoEl.currentTime = state.video.in;
  drawFrame();
  render();
  if (vhooks.time) vhooks.time(videoEl.currentTime);
  rafId = requestAnimationFrame(tick);
}

export function play() {
  if (!videoEl || !state.video.loaded) return;
  if (videoEl.currentTime < state.video.in || videoEl.currentTime >= state.video.out) {
    videoEl.currentTime = state.video.in;
  }
  // v29 — legacy clip playback drives its own clock; release the unified one.
  state.timeline._driving = false;
  state.video.playing = true;
  videoEl.play().catch(() => {});
  rafId = requestAnimationFrame(tick);
  updatePlayBtn();
}

export function pause() {
  state.video.playing = false;
  if (videoEl) videoEl.pause();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  updatePlayBtn();
}

export function togglePlay() { state.video.playing ? pause() : play(); }

// ---- UI -------------------------------------------------------------------

function showVideoControls(show) {
  const box = document.getElementById('video-controls');
  if (box) box.style.display = show ? 'block' : 'none';
  const hint = document.getElementById('video-empty-hint');
  if (hint) hint.style.display = show ? 'none' : 'block';
}

function updatePlayBtn() {
  const btn = document.getElementById('video-play-btn');
  if (btn) btn.textContent = state.video.playing ? '⏸ Pause' : '▶ Play';
}

export function bindVideo() {
  const input = document.getElementById('video-file-input');
  const addBtn = document.getElementById('video-add-btn');
  if (addBtn && input) addBtn.addEventListener('click', () => input.click());
  if (input) input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file && file.type.startsWith('video/')) loadVideoFile(file);
    input.value = '';
  });

  const playBtn = document.getElementById('video-play-btn');
  if (playBtn) playBtn.addEventListener('click', togglePlay);

  // Trim is owned by the timeline scrubber (timeline.js); it writes the same
  // state.video.{in,out} the old #video-in / #video-out sliders did.

  const fpsSel = document.getElementById('video-fps');
  if (fpsSel) fpsSel.addEventListener('change', () => { state.video.fps = parseInt(fpsSel.value, 10); });

  const removeBtn = document.getElementById('video-remove-btn');
  if (removeBtn) removeBtn.addEventListener('click', () => {
    clearVideo();
    state.image = null;
    if (el.uploadZone) el.uploadZone.style.display = '';
    if (el.canvasWrapper) el.canvasWrapper.style.display = 'none';
    showNotification('Clip removed.', 'success');
  });

  showVideoControls(false);
}
