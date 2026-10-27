// v35 — Before / After Compare: interactive slider export (v41: shared player).
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
import comparePlayerSrc from '../share/compare-player.js?raw';
import compareCss from '../share/compare-player.css?raw';

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

// v41: the slider lives in src/share/compare-player.js (shared with the
// /s/<id> viewer). Its raw text is inlined here, so the page still works with
// no network and no dependencies.
const inlineModule = (src) => src.replace(/^export /m, '');

function playerData({ beforeUrl, afterUrl, w, h, rect, c }) {
  return {
    beforeUrl, afterUrl, w, h, rect,
    orientation: c.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    split: Number(c.split.toFixed(4)),
    labels: {
      enabled: !!c.labels.enabled,
      before: String(c.labels.before || '').trim(),
      after: String(c.labels.after || '').trim(),
      position: c.labels.position === 'bottom' ? 'bottom' : 'top',
    },
    divider: { color: c.divider.color, width: c.divider.width, handle: c.divider.handle !== false },
  };
}

function buildPage(frames) {
  const d = playerData(frames);
  const l = d.labels;
  const title = l.enabled && l.before && l.after ? `${escapeHTML(l.before)} / ${escapeHTML(l.after)}` : 'Before / After';
  const data = JSON.stringify(d).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; background: #0e0f13; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
${compareCss}
</style>
</head>
<body>
<div id="cmp"></div>
<script id="cmp-data" type="application/json">${data}</script>
<script>
${inlineModule(comparePlayerSrc)}
mountCompare(document.getElementById('cmp'), JSON.parse(document.getElementById('cmp-data').textContent));
</script>
</body>
</html>`;
}

// Renders the design twice offscreen (all Before, then all After, both without
// the divider and labels). Returns the two canvases plus the geometry the
// player needs, or null (with a toast) when Compare cannot export.
export async function collectCompareFrames() {
  const c = state.compare;
  if (!state.image || !c || !c.beforeSrc) {
    showNotification('Add a Before image and load an After screenshot first.', 'error');
    return null;
  }
  if (state.video && state.video.loaded) { showNotification('Compare works with still images, not video.', 'error'); return null; }
  await ensureCompareImage(c.beforeSrc);

  // Hi-DPI-ish output, capped so the page stays a sensible size.
  const cw = state.canvas.width, ch = state.canvas.height;
  const scale = Math.min(2, MAX_EDGE / Math.max(cw, ch));
  const w = Math.round(cw * scale), h = Math.round(ch * scale);
  const saved = state.compare;
  const beforeCanvas = document.createElement('canvas');
  const afterCanvas = document.createElement('canvas');
  let rect;
  try {
    const plain = { ...saved, enabled: true, wipe: false, labels: { ...saved.labels, enabled: false }, divider: { ...saved.divider, width: 0, handle: false } };
    state.compare = { ...plain, split: 1 };
    renderAtSize(beforeCanvas, { width: w, height: h });
    // The layout at export size can differ from the preview (padding is in
    // pixels), so take the screenshot's rect from this render.
    rect = imageRectFrac(w, h);
    state.compare = { ...plain, enabled: false };
    renderAtSize(afterCanvas, { width: w, height: h });
  } catch (e) {
    console.error('[compare] export failed:', e);
    showNotification('Export failed: ' + (e?.message || String(e)), 'error');
    return null;
  } finally {
    state.compare = saved;
    render();
  }
  return { beforeCanvas, afterCanvas, w, h, rect, c: saved };
}

// The player settings for a set of frames (used by share links).
export function comparePlayerSettings(frames) {
  const { beforeUrl: _b, afterUrl: _a, ...rest } = playerData({ ...frames, beforeUrl: '', afterUrl: '' });
  return rest;
}

export async function exportCompareHTML() {
  const frames = await collectCompareFrames();
  if (!frames) return false;
  const html = buildPage({ ...frames, beforeUrl: encode(frames.beforeCanvas), afterUrl: encode(frames.afterCanvas) });
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
