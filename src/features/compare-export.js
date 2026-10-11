// v35 — Before / After Compare: interactive slider export.
//
// Renders the whole design twice offscreen through the normal pipeline (all
// Before, then all After, both without the divider and labels), then writes a
// self-contained HTML page with a draggable, keyboard-accessible divider over
// the screenshot area. The page has no dependencies, so it can be embedded in
// a changelog, a docs page, or an email-linked landing page.

import { state } from '../state/state.js';
import { render, renderAtSize } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { ensureCompareImage } from '../render/compare.js';
import { isDeviceMockup3d } from '../render/mockups-3d.js';
import { isSurfaceMockup } from '../render/surfaces.js';
import { escapeHTML } from '../utils/dom.js';

const MAX_EDGE = 2400;

function encode(canvas) {
  const webp = canvas.toDataURL('image/webp', 0.92);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

// The screenshot's rect as fractions of the design, when the divider can be
// limited to it (flat / 2D device paths). Otherwise the whole design.
function imageRectFrac(w, h) {
  const r = state.lastImageRect;
  const warped = (state.mockup3d?.enabled && isDeviceMockup3d(state.mockup3d.device)) ||
    (state.surface?.enabled && isSurfaceMockup(state.surface.type)) ||
    (state.autoLayout && state.autoLayout.pattern !== 'free');
  if (!r || warped || !w || !h) return { x: 0, y: 0, w: 1, h: 1 };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return { x: clamp(r.x / w), y: clamp(r.y / h), w: clamp(r.w / w), h: clamp(r.h / h) };
}

function buildPage({ beforeUrl, afterUrl, w, h, rect, c }) {
  const vertical = c.orientation !== 'horizontal';
  const pct = (v) => (v * 100).toFixed(3) + '%';
  const labels = c.labels.enabled ? {
    before: escapeHTML((c.labels.before || '').trim()),
    after: escapeHTML((c.labels.after || '').trim()),
    bottom: c.labels.position === 'bottom',
  } : null;
  const title = labels && labels.before && labels.after ? `${labels.before} / ${labels.after}` : 'Before / After';
  const color = /^#[0-9a-f]{6}$/i.test(c.divider.color) ? c.divider.color : '#ffffff';
  const lineW = Math.max(0, Math.min(12, c.divider.width));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; background: #0e0f13; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  .cmp { position: relative; width: min(100%, ${w}px); aspect-ratio: ${w} / ${h}; user-select: none; -webkit-user-select: none; touch-action: ${vertical ? 'pan-y' : 'pan-x'}; }
  .cmp img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
  .cmp .before { clip-path: var(--clip); }
  .zone { position: absolute; left: ${pct(rect.x)}; top: ${pct(rect.y)}; width: ${pct(rect.w)}; height: ${pct(rect.h)}; cursor: ${vertical ? 'ew-resize' : 'ns-resize'}; outline: none; }
  .bar { position: absolute; background: ${color}; box-shadow: 0 0 8px rgba(0,0,0,.35); ${vertical
    ? `top: 0; bottom: 0; width: ${lineW}px; transform: translateX(-50%);`
    : `left: 0; right: 0; height: ${lineW}px; transform: translateY(-50%);`} }
  .knob { position: absolute; width: 38px; height: 38px; border-radius: 50%; background: ${color}; box-shadow: 0 2px 10px rgba(0,0,0,.35); transform: translate(-50%, -50%); display: ${c.divider.handle ? 'flex' : 'none'}; align-items: center; justify-content: center; }
  .knob svg { width: 22px; height: 22px; stroke: #16171d; stroke-width: 2.2; fill: none; stroke-linecap: round; stroke-linejoin: round; ${vertical ? '' : 'transform: rotate(90deg);'} }
  .zone:focus-visible .knob { outline: 3px solid #7d92ff; outline-offset: 3px; }
  .tag { position: absolute; padding: 6px 11px; border-radius: 999px; background: rgba(12,13,18,.62); color: #fff; font-size: 14px; font-weight: 600; pointer-events: none; transition: opacity .15s; }
</style>
</head>
<body>
<div class="cmp" id="cmp">
  <img class="after" src="${afterUrl}" alt="${labels && labels.after ? labels.after : 'After'}">
  <img class="before" src="${beforeUrl}" alt="${labels && labels.before ? labels.before : 'Before'}">
  <div class="zone" id="zone" role="slider" tabindex="0" aria-label="Comparison divider" aria-valuemin="0" aria-valuemax="100">
    <div class="bar" id="bar"></div>
    <div class="knob" id="knob"><svg viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg></div>
    ${labels && labels.before ? `<span class="tag" id="tb">${labels.before}</span>` : ''}
    ${labels && labels.after ? `<span class="tag" id="ta">${labels.after}</span>` : ''}
  </div>
</div>
<script>
(function () {
  var V = ${vertical}, R = ${JSON.stringify(rect)}, BOTTOM = ${!!(labels && labels.bottom)};
  var cmp = document.getElementById('cmp'), zone = document.getElementById('zone');
  var bar = document.getElementById('bar'), knob = document.getElementById('knob');
  var tb = document.getElementById('tb'), ta = document.getElementById('ta');
  var split = ${Number(c.split.toFixed(4))};
  function place() {
    var p = (split * 100).toFixed(3) + '%';
    var cut = V ? (R.x + R.w * split) : (R.y + R.h * split);
    cmp.style.setProperty('--clip', V
      ? 'inset(' + (R.y * 100) + '% ' + ((1 - cut) * 100) + '% ' + ((1 - R.y - R.h) * 100) + '% ' + (R.x * 100) + '%)'
      : 'inset(' + (R.y * 100) + '% ' + ((1 - R.x - R.w) * 100) + '% ' + ((1 - cut) * 100) + '% ' + (R.x * 100) + '%)');
    if (V) { bar.style.left = p; knob.style.left = p; knob.style.top = '50%'; }
    else { bar.style.top = p; knob.style.top = p; knob.style.left = '50%'; }
    zone.setAttribute('aria-valuenow', Math.round(split * 100));
    var zr = zone.getBoundingClientRect(), pad = 14;
    if (tb) {
      var bw = tb.offsetWidth, bh = tb.offsetHeight;
      if (V) { tb.style.left = pad + 'px'; tb.style.top = BOTTOM ? '' : pad + 'px'; tb.style.bottom = BOTTOM ? pad + 'px' : ''; tb.style.opacity = split * zr.width > bw + pad * 2 ? 1 : 0; }
      else { tb.style.top = pad + 'px'; tb.style[BOTTOM ? 'right' : 'left'] = pad + 'px'; tb.style.opacity = split * zr.height > bh + pad * 2 ? 1 : 0; }
    }
    if (ta) {
      var aw = ta.offsetWidth, ah = ta.offsetHeight;
      if (V) { ta.style.right = pad + 'px'; ta.style.top = BOTTOM ? '' : pad + 'px'; ta.style.bottom = BOTTOM ? pad + 'px' : ''; ta.style.opacity = (1 - split) * zr.width > aw + pad * 2 ? 1 : 0; }
      else { ta.style.bottom = pad + 'px'; ta.style[BOTTOM ? 'right' : 'left'] = pad + 'px'; ta.style.opacity = (1 - split) * zr.height > ah + pad * 2 ? 1 : 0; }
    }
  }
  function fromEvent(e) {
    var r = zone.getBoundingClientRect();
    var v = V ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    split = Math.max(0, Math.min(1, v)); place();
  }
  var dragging = false;
  zone.addEventListener('pointerdown', function (e) { dragging = true; zone.setPointerCapture(e.pointerId); fromEvent(e); });
  zone.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
  zone.addEventListener('pointerup', function () { dragging = false; });
  zone.addEventListener('pointercancel', function () { dragging = false; });
  zone.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 0.1 : 0.02, k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowUp') split = Math.max(0, split - step);
    else if (k === 'ArrowRight' || k === 'ArrowDown') split = Math.min(1, split + step);
    else if (k === 'Home') split = 0;
    else if (k === 'End') split = 1;
    else return;
    e.preventDefault(); place();
  });
  window.addEventListener('resize', place);
  place();
})();
</script>
</body>
</html>`;
}

export async function exportCompareHTML() {
  const c = state.compare;
  if (!state.image || !c || !c.beforeSrc) {
    showNotification('Add a Before image and load an After screenshot first.', 'error');
    return false;
  }
  if (state.video && state.video.loaded) { showNotification('Compare works with still images, not video.', 'error'); return false; }
  await ensureCompareImage(c.beforeSrc);

  // Hi-DPI-ish output, capped so the page stays a sensible size.
  const cw = state.canvas.width, ch = state.canvas.height;
  const scale = Math.min(2, MAX_EDGE / Math.max(cw, ch));
  const w = Math.round(cw * scale), h = Math.round(ch * scale);
  const saved = state.compare;
  const off = document.createElement('canvas');
  let beforeUrl, afterUrl, rect;
  try {
    const plain = { ...saved, enabled: true, wipe: false, labels: { ...saved.labels, enabled: false }, divider: { ...saved.divider, width: 0, handle: false } };
    state.compare = { ...plain, split: 1 };
    renderAtSize(off, { width: w, height: h });
    // The layout at export size can differ from the preview (padding is in
    // pixels), so take the screenshot's rect from this render.
    rect = imageRectFrac(w, h);
    beforeUrl = encode(off);
    state.compare = { ...plain, enabled: false };
    renderAtSize(off, { width: w, height: h });
    afterUrl = encode(off);
  } catch (e) {
    console.error('[compare] export failed:', e);
    showNotification('Export failed: ' + (e?.message || String(e)), 'error');
    return false;
  } finally {
    state.compare = saved;
    render();
  }

  const html = buildPage({ beforeUrl, afterUrl, w, h, rect, c: saved });
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'before-after.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  showNotification('Interactive before / after page downloaded.', 'success');
  return true;
}
