// v38 — Focus: Curves & Levels sidebar section (Adjust group, Pro only). A
// curve editor per channel (RGB, R, G, B) over the image's histogram, plus
// black / gamma / white levels. The pixels are render/curves.js.
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import { render } from '../render/render.js';
import { showUndoToast } from '../ui/notification.js';
import { colorToolsDefaults, normalizeColorTools, normalizeCurve, normalizeLevels, curveLut } from '../render/curves-core.js';
import { histogramOf } from '../render/curves.js';
import { revealSection } from './studio-nav.js';

let channel = 'rgb';             // UI-only: which channel the editor shows
let drag = null;                 // { index, saved, pointerId }
let frame = 0;

const CHANNEL_COLOR = { r: '#f87171', g: '#34d399', b: '#60a5fa' };
const HIT = 10;                  // CSS px around a point that grabs it

function ct() {
  if (!state.colorTools) state.colorTools = colorToolsDefaults();
  return state.colorTools;
}

function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; render(); drawCurve(); });
}

// Gamma slider runs -100..100 and maps to 0.25..4 on a log scale, so 1 sits in the middle.
const gammaFromSlider = (v) => Math.round(Math.pow(2, v / 50) * 100) / 100;
const sliderFromGamma = (g) => Math.round(50 * Math.log2(g));

function drawCurve() {
  const c = el.ctCurve;
  if (!c || !c.clientWidth) return;   // hidden panel: the ResizeObserver redraws it when shown
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const css = getComputedStyle(document.documentElement);
  const line = css.getPropertyValue('--text-tertiary').trim() || '#888';
  const accent = css.getPropertyValue('--accent-primary').trim() || '#f2a93b';
  ctx.clearRect(0, 0, W, H);

  const hist = histogramOf(state.image);
  if (hist) {
    const bins = hist[channel];
    const max = Math.max(1, ...bins);
    ctx.fillStyle = line;
    ctx.globalAlpha = 0.12;
    const bw = W / bins.length;
    bins.forEach((v, i) => {
      const h = Math.sqrt(v / max) * H;
      ctx.fillRect(i * bw, H - h, bw + 0.5, h);
    });
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const p = Math.round(i * W / 4) + 0.5;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
  ctx.globalAlpha = 1;

  const pts = ct().curves[channel];
  const lut = curveLut(pts);
  const color = CHANNEL_COLOR[channel] || accent;
  ctx.strokeStyle = color;
  const dpr = W / c.clientWidth;
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  for (let x = 0; x < 256; x++) {
    const px = x / 255 * W, py = H - lut[x] / 255 * H;
    if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  const r = 5 * dpr;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x / 255 * W, H - y / 255 * H, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function refreshLevelLabels() {
  const lv = ct().levels[channel];
  if (el.ctBlackValue) el.ctBlackValue.textContent = String(lv.black);
  if (el.ctWhiteValue) el.ctWhiteValue.textContent = String(lv.white);
  if (el.ctGammaValue) el.ctGammaValue.textContent = lv.gamma.toFixed(2);
}

export function refreshCurvesUI() {
  const t = ct();
  if (el.ctTabs) for (const b of el.ctTabs.querySelectorAll('[data-ct-channel]')) {
    const on = b.dataset.ctChannel === channel;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const lv = t.levels[channel];
  if (el.ctBlack) el.ctBlack.value = lv.black;
  if (el.ctWhite) el.ctWhite.value = lv.white;
  if (el.ctGamma) el.ctGamma.value = sliderFromGamma(lv.gamma);
  refreshLevelLabels();
  drawCurve();
}

// ---- curve editor pointer input --------------------------------------------

function toCurve(e) {
  const rect = el.ctCurve.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * 255,
    y: (1 - (e.clientY - rect.top) / rect.height) * 255,
    outside: e.clientX < rect.left - 16 || e.clientX > rect.right + 16 || e.clientY < rect.top - 16 || e.clientY > rect.bottom + 16,
    scale: 255 / rect.width,
  };
}

function hitPoint(p) {
  const pts = ct().curves[channel];
  let best = -1, bestD = HIT * p.scale;
  pts.forEach(([x, y], i) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function onPointerDown(e) {
  if (e.button !== 0) return;
  const p = toCurve(e);
  let index = hitPoint(p);
  let saved = false;
  if (index < 0) {
    const pts = ct().curves[channel];
    if (pts.length >= 16) return;
    const x = Math.round(clamp(p.x, 1, 254));
    if (pts.some(q => q[0] === x)) return;
    saveStateToHistory();
    saved = true;
    pts.push([x, Math.round(clamp(p.y, 0, 255))]);
    pts.sort((a, b) => a[0] - b[0]);
    index = pts.findIndex(q => q[0] === x);
    scheduleRender();
  }
  drag = { index, saved, pointerId: e.pointerId };
  el.ctCurve.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const p = toCurve(e);
  const pts = ct().curves[channel];
  const i = drag.index;
  if (!drag.saved) { saveStateToHistory(); drag.saved = true; }
  const last = pts.length - 1;
  // End points move up and down only; inner points stay between their neighbours.
  const x = i === 0 ? 0 : i === last ? 255 : Math.round(clamp(p.x, pts[i - 1][0] + 1, pts[i + 1][0] - 1));
  pts[i] = [x, Math.round(clamp(p.y, 0, 255))];
  scheduleRender();
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const pts = ct().curves[channel];
  const i = drag.index;
  // Dragging an inner point off the editor removes it.
  if (drag.saved && i > 0 && i < pts.length - 1 && toCurve(e).outside) pts.splice(i, 1);
  ct().curves[channel] = normalizeCurve(pts);
  drag = null;
  scheduleRender();
}

function onDoubleClick(e) {
  const i = hitPoint(toCurve(e));
  const pts = ct().curves[channel];
  if (i <= 0 || i >= pts.length - 1) return;
  saveStateToHistory();
  pts.splice(i, 1);
  scheduleRender();
}

// ---- levels ------------------------------------------------------------------

// Applies live while dragging (the base pixels are cached, so only the LUT
// reruns); the undo entry comes from history's first-input snapshot on change.
function levelSlider(input, apply) {
  if (!input) return;
  input.addEventListener('input', () => {
    const lv = { ...ct().levels[channel] };
    apply(lv, +input.value);
    ct().levels[channel] = normalizeLevels(lv);
    refreshLevelLabels();   // leave the slider being dragged alone, so its thumb never snaps
    scheduleRender();
  });
  input.addEventListener('change', () => { saveStateToHistory(); refreshCurvesUI(); render(); });
}

export function resetChannel() {
  saveStateToHistory();
  const d = colorToolsDefaults();
  ct().curves[channel] = d.curves[channel];
  ct().levels[channel] = d.levels[channel];
  refreshCurvesUI();
  render();
}

export function resetCurves() {
  saveStateToHistory();
  state.colorTools = colorToolsDefaults();
  refreshCurvesUI();
  render();
  showUndoToast('Curves and levels reset.', render);
}

export function openCurves() {
  const section = document.getElementById('color-tools-section');
  if (!section) return;
  revealSection(section);
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function bindCurves() {
  state.colorTools = normalizeColorTools(state.colorTools);
  if (el.ctTabs) el.ctTabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct-channel]');
    if (!b) return;
    channel = b.dataset.ctChannel;
    refreshCurvesUI();
  });
  if (el.ctCurve) {
    el.ctCurve.addEventListener('pointerdown', onPointerDown);
    el.ctCurve.addEventListener('pointermove', onPointerMove);
    el.ctCurve.addEventListener('pointerup', onPointerUp);
    el.ctCurve.addEventListener('pointercancel', onPointerUp);
    el.ctCurve.addEventListener('dblclick', onDoubleClick);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawCurve()).observe(el.ctCurve);
  }
  levelSlider(el.ctBlack, (lv, v) => { lv.black = Math.min(v, lv.white - 2); });
  levelSlider(el.ctWhite, (lv, v) => { lv.white = Math.max(v, lv.black + 2); });
  levelSlider(el.ctGamma, (lv, v) => { lv.gamma = gammaFromSlider(v); });
  if (el.ctResetChannel) el.ctResetChannel.addEventListener('click', resetChannel);
  if (el.ctResetAll) el.ctResetAll.addEventListener('click', resetCurves);
  // Undo/redo restore state without touching the sidebar. History also emits on
  // every save, which runs before the caller's mutation, so sync after it.
  onHistoryChange(() => queueMicrotask(refreshCurvesUI));
  // render() pokes this each preview frame; only a new image redraws.
  let lastImage = null;
  window.__colorToolsImageCheck = () => {
    if (state.image === lastImage) return;
    lastImage = state.image;
    drawCurve();
  };
  refreshCurvesUI();
}
