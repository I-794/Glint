import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { isTypingTarget } from '../utils/dom.js';
import { activePointers, gesture } from './gesture.js';
import { isDeviceMockup } from '../render/mockups.js';

function clampZoom(z) { return Math.max(0.1, Math.min(4, z)); }

// User preference: show the minimap at all. When off, it never appears (even
// zoomed in). When on (default), it appears only when the canvas overflows.
let minimapEnabled = (() => {
  try { return localStorage.getItem('glint_minimap') !== 'off'; } catch (e) { return true; }
})();
function setMinimapEnabled(on) {
  minimapEnabled = on;
  try { localStorage.setItem('glint_minimap', on ? 'on' : 'off'); } catch (e) {}
  const btn = document.getElementById('minimap-toggle');
  if (btn) btn.classList.toggle('active', on);
  renderMinimap();
}

export function applyTransform() {
  const w = el.canvasWrapper;
  if (!w) return;
  const { rx, ry, rz, perspective } = state.tilt3d;
  const base = `translate(${state.view.panX}px, ${state.view.panY}px) scale(${state.view.zoom})`;
  // Device mockups bake tilt into the canvas itself (so it exports), so don't
  // also tilt the wrapper in CSS — that would double-apply the perspective.
  const tilt = (rx || ry || rz) && !isDeviceMockup(state.deviceFrame.type)
    ? ` perspective(${perspective}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`
    : '';
  w.style.transform = base + tilt;
  if (el.zoomLabel) el.zoomLabel.textContent = Math.round(state.view.zoom * 100) + '%';
  // v25 — keep the Tour hotspot overlay glued to the canvas through zoom/pan/tilt
  // (it positions via getBoundingClientRect, so it must re-sync on any transform).
  if (typeof window.__syncTourOverlay === 'function') window.__syncTourOverlay();
}

export function setZoom(z, anchorXFrac, anchorYFrac) {
  const oldZ = state.view.zoom;
  const newZ = clampZoom(z);
  const vp = el.canvasViewport.getBoundingClientRect();
  const ax = (anchorXFrac == null ? 0.5 : anchorXFrac) * vp.width;
  const ay = (anchorYFrac == null ? 0.5 : anchorYFrac) * vp.height;
  state.view.panX = ax - (ax - state.view.panX) * (newZ / oldZ);
  state.view.panY = ay - (ay - state.view.panY) * (newZ / oldZ);
  state.view.zoom = newZ;
  applyTransform();
  renderMinimap();
}

export function fitZoom() {
  state.view.zoom = 1; state.view.panX = 0; state.view.panY = 0;
  applyTransform(); renderMinimap();
}

let _panActive = false, _panStartX = 0, _panStartY = 0, _panOrigX = 0, _panOrigY = 0;

export function bindZoomPan() {
  const vp = el.canvasViewport;
  if (!vp) return;
  vp.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const ax = (e.clientX - rect.left) / rect.width;
      const ay = (e.clientY - rect.top) / rect.height;
      const delta = -e.deltaY * 0.0015;
      setZoom(state.view.zoom * (1 + delta), ax, ay);
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !isTypingTarget(e.target)) {
      e.preventDefault();
      vp.classList.add('panning');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') vp.classList.remove('panning', 'active');
  });
  vp.addEventListener('mousedown', (e) => {
    if (!vp.classList.contains('panning')) return;
    _panActive = true; _panStartX = e.clientX; _panStartY = e.clientY;
    _panOrigX = state.view.panX; _panOrigY = state.view.panY;
    vp.classList.add('active');
  });
  window.addEventListener('mousemove', (e) => {
    if (!_panActive) return;
    state.view.panX = _panOrigX + (e.clientX - _panStartX);
    state.view.panY = _panOrigY + (e.clientY - _panStartY);
    applyTransform(); renderMinimap();
  });
  window.addEventListener('mouseup', () => { _panActive = false; vp.classList.remove('active'); });

  if (el.zoomIn) el.zoomIn.addEventListener('click', () => setZoom(state.view.zoom * 1.2));
  if (el.zoomOut) el.zoomOut.addEventListener('click', () => setZoom(state.view.zoom / 1.2));
  if (el.zoomFit) el.zoomFit.addEventListener('click', fitZoom);

  const mt = document.getElementById('minimap-toggle');
  if (mt) {
    mt.classList.toggle('active', minimapEnabled);
    mt.addEventListener('click', () => setMinimapEnabled(!minimapEnabled));
  }
  const mh = document.getElementById('minimap-hide');
  if (mh) mh.addEventListener('click', () => setMinimapEnabled(false));

  bindTouchPanZoom(vp);
}

// ---- Touch: one-finger pan (Select tool) + two-finger pinch-zoom/pan ----
// Mouse is excluded here — desktop keeps the Space+drag path above. Coexists
// with the Ctrl/Cmd+wheel zoom. Pointer-events for touch are implicitly
// captured to the canvas target, so the moves still bubble up to window.
let _pinch = null;     // { startDist, startZoom }
let _pinchMid = null;  // last midpoint, for two-finger pan delta
let _tpan = null;      // { startX, startY, origX, origY }

const _dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const _mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function bindTouchPanZoom(vp) {
  vp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      const [p, q] = [...activePointers.values()];
      _pinch = { startDist: _dist(p, q) || 1, startZoom: state.view.zoom };
      _pinchMid = _mid(p, q);
      _tpan = null;
    } else if (activePointers.size === 1) {
      // One finger on empty canvas with Select tool → pan the viewport.
      if (state.tool === 'select' && !gesture.canvasBusy) {
        _tpan = { startX: e.clientX, startY: e.clientY, origX: state.view.panX, origY: state.view.panY };
      }
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2 && _pinch) {
      const [p, q] = [...activePointers.values()];
      const d = _dist(p, q);
      const m = _mid(p, q);
      const rect = vp.getBoundingClientRect();
      // Anchor the zoom at the pinch midpoint (keeps the world point under the
      // fingers fixed), then add the midpoint travel as a two-finger pan.
      setZoom(_pinch.startZoom * (d / _pinch.startDist), (m.x - rect.left) / rect.width, (m.y - rect.top) / rect.height);
      if (_pinchMid) { state.view.panX += m.x - _pinchMid.x; state.view.panY += m.y - _pinchMid.y; }
      _pinchMid = m;
      applyTransform(); renderMinimap();
    } else if (_tpan) {
      state.view.panX = _tpan.origX + (e.clientX - _tpan.startX);
      state.view.panY = _tpan.origY + (e.clientY - _tpan.startY);
      applyTransform(); renderMinimap();
    }
  });

  const onUp = (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) { _pinch = null; _pinchMid = null; }
    if (activePointers.size === 0) {
      _tpan = null;
    } else if (activePointers.size === 1) {
      // Dropped from two fingers to one — rebase the pan on the survivor so it
      // doesn't jump.
      const [p] = [...activePointers.values()];
      _tpan = (state.tool === 'select' && !gesture.canvasBusy)
        ? { startX: p.x, startY: p.y, origX: state.view.panX, origY: state.view.panY }
        : null;
    }
  };
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

export function renderMinimap() {
  if (!el.minimap || !el.minimapCanvas) return;
  if (!state.image || !minimapEnabled) { el.minimap.classList.remove('visible'); return; }

  const cw = el.previewCanvas.width, ch = el.previewCanvas.height;
  const vp = el.canvasViewport.getBoundingClientRect();
  const z = state.view.zoom;
  const visW = vp.width / z, visH = vp.height / z;

  // The minimap only earns its place when part of the canvas is off-screen
  // (i.e. you're zoomed in). At Fit/100% the whole canvas is visible, so the
  // minimap is just clutter floating over the artwork — hide it.
  if (visW >= cw - 1 && visH >= ch - 1) { el.minimap.classList.remove('visible'); return; }
  el.minimap.classList.add('visible');

  const mctx = el.minimapCanvas.getContext('2d');
  const mw = el.minimapCanvas.width, mh = el.minimapCanvas.height;
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, mw, mh);
  const r = Math.min(mw / cw, mh / ch);
  const dw = cw * r, dh = ch * r;
  mctx.drawImage(el.previewCanvas, (mw - dw) / 2, (mh - dh) / 2, dw, dh);
  const offsetX = -state.view.panX / z, offsetY = -state.view.panY / z;
  const vx = (offsetX / cw) * dw + (mw - dw) / 2;
  const vy = (offsetY / ch) * dh + (mh - dh) / 2;
  const vw = (visW / cw) * dw;
  const vh = (visH / ch) * dh;
  const mv = el.minimapViewport;
  mv.style.left = Math.max(0, vx) + 'px';
  mv.style.top = Math.max(0, vy) + 'px';
  mv.style.width = Math.min(mw, vw) + 'px';
  mv.style.height = Math.min(mh, vh) + 'px';
}
