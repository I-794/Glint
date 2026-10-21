// v9.0 — App Store screenshot-set composer.
//
// Renders one screenshot into a store-sized panel: background (reusing the
// existing background engine) + a caption band (headline/subhead) + the device
// mockup holding the screenshot in the remaining region. The same composer
// draws both the live preview (onto the preview canvas) and each exported panel
// (onto an offscreen canvas), so what you see is what ships.
//
// Division of responsibility: the *look* (background, device colorway, glare,
// image filters) comes from the normal global controls/state; the Set section
// only adds per-panel image + captions + the store size. So every existing
// background/device control already works here for free.

import { state, imageRegistry } from '../state/state.js';
import { el } from '../ui/elements.js';
import { drawBackground } from '../render/background.js';
import { isDeviceMockup, drawDeviceMockup, drawScreenImage } from '../render/mockups.js';
import { drawLogo } from '../render/overlays.js';
import { getStorePreset } from '../state/store-presets.js';
import { getGradedImage, cssFilterFor } from '../render/color-grade.js';

// Resolve the device used to frame set panels: prefer the globally-selected
// device mockup; otherwise fall back to the preset's natural device.
function setDevice(preset) {
  return isDeviceMockup(state.deviceFrame.type) ? state.deviceFrame.type : preset.device;
}

// The image a panel should show: its own (imageId → registry) or the global one.
function panelImage(panel) {
  if (panel.imageId && imageRegistry[panel.imageId]) return imageRegistry[panel.imageId];
  return state.image;
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCaption(ctx, W, bandTop, bandH, panel, shared) {
  const cx = W / 2;
  const headSize = Math.round(W * shared.headlineSize);
  const subSize = Math.round(W * shared.subheadSize);
  const hasSub = !!panel.subhead;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Vertically center the headline (+ optional subhead) within the band.
  const gap = Math.round(headSize * 0.35);
  const blockH = headSize + (hasSub ? gap + subSize : 0);
  let y = bandTop + (bandH - blockH) / 2 + headSize / 2;

  if (panel.headline) {
    ctx.font = `700 ${headSize}px ${shared.font}, system-ui, sans-serif`;
    ctx.fillStyle = shared.headlineColor;
    const lines = wrapLines(ctx, panel.headline, W * 0.86);
    // If the headline wraps, only the first line is centered in the slot; extra
    // lines stack downward (kept simple — captions are short by design).
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, y + i * headSize * 1.1);
    }
    y += (lines.length - 1) * headSize * 1.1;
  }
  if (hasSub) {
    ctx.font = `400 ${subSize}px ${shared.font}, system-ui, sans-serif`;
    ctx.fillStyle = shared.subheadColor;
    ctx.fillText(panel.subhead, cx, y + gap + subSize / 2);
  }
  ctx.restore();
}

// Fallback when no device frame is selected: draw the screenshot fit into the
// region with rounded corners + a soft drop shadow.
function drawPlainScreenshot(ctx, regionY, regionW, regionH) {
  const img = state.image;
  if (!img) return;
  const pad = Math.round(regionW * 0.08);
  const maxW = regionW - pad * 2;
  const maxH = regionH - pad * 2;
  const ir = img.width / img.height;
  let w = maxW, h = w / ir;
  if (h > maxH) { h = maxH; w = h * ir; }
  const x = (regionW - w) / 2;
  const y = regionY + (regionH - h) / 2;
  const r = Math.round(Math.min(w, h) * 0.04);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = regionW * 0.05;
  ctx.shadowOffsetY = regionW * 0.02;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.clip();
  ctx.shadowColor = 'transparent';
  // v38 — same look as the device path: filters, grade, curves and Bokeh.
  ctx.filter = cssFilterFor();
  ctx.drawImage(getGradedImage(img), x, y, w, h);
  ctx.restore();
}

// Compose a single panel onto `canvas`. Reads device colorway/glare/filters and
// background settings from global state; the caller sets `state.image` to the
// panel's image and `state.canvas` to the preset size before calling.
export function composePanel(canvas, panel, shared) {
  const ctx = canvas.getContext('2d');
  canvas.width = shared.width;
  canvas.height = shared.height;
  const W = canvas.width, H = canvas.height;

  drawBackground(ctx, canvas, true);

  const hasCaption = !!(panel.headline || panel.subhead);
  const bandH = hasCaption ? Math.round(H * 0.18) : 0;
  const captionTop = panel.position === 'bottom' ? H - bandH : 0;
  const regionY = panel.position === 'bottom' ? 0 : bandH;
  const regionH = H - bandH;

  // Draw the device/screenshot into the region below/above the caption band by
  // translating the context and handing the mockup engine a region-sized canvas.
  const device = shared.device;
  ctx.save();
  ctx.translate(0, regionY);
  const region = { width: W, height: regionH };
  if (device && isDeviceMockup(device)) {
    const out = drawDeviceMockup(ctx, region, device);
    if (out && out.rect) {
      drawScreenImage(ctx, out.rect, out.radius);
      if (out.overlay) out.overlay(ctx);
    }
  } else {
    drawPlainScreenshot(ctx, 0, W, regionH);
  }
  ctx.restore();

  if (hasCaption) drawCaption(ctx, W, captionTop, bandH, panel, shared);

  // v10 — brand logo watermark on each store panel (reads state.logo).
  drawLogo(ctx, canvas);
}

function sharedFrom(preset) {
  const s = state.screenshotSet.shared;
  return {
    width: preset.w,
    height: preset.h,
    device: setDevice(preset),
    font: s.font,
    headlineColor: s.headlineColor,
    subheadColor: s.subheadColor,
    headlineSize: s.headlineSize,
    subheadSize: s.subheadSize
  };
}

// Live preview of the active panel on the on-screen canvas.
export function renderSetPreview() {
  const ss = state.screenshotSet;
  if (!ss || !ss.panels.length) return;
  const preset = getStorePreset(ss.preset);
  const panel = ss.panels[ss.active] || ss.panels[0];
  const savedImg = state.image;
  const img = panelImage(panel);
  if (img) state.image = img;
  // Keep state.canvas in sync with the preset so zoom/fit + minimap read the
  // right size; the Set section owns the canvas dimensions while in set mode.
  state.canvas = { width: preset.w, height: preset.h };
  composePanel(el.previewCanvas, panel, sharedFrom(preset));
  state.image = savedImg;
}

// ---- export ---------------------------------------------------------------

// Render every panel to an offscreen canvas and return [{ name, blob }].
// Sequential + yields to the event loop between panels so large canvases
// (e.g. 2868px tall) don't spike memory or freeze the UI.
//
// `overrides` (optional) is an array aligned to panels; when present, each
// panel's headline/subhead are replaced by overrides[i] — used by localized
// export (v11.2) to render translated captions without mutating the set.
export async function renderSetPanels(onProgress, overrides) {
  const ss = state.screenshotSet;
  const preset = getStorePreset(ss.preset);
  const shared = sharedFrom(preset);
  const off = document.createElement('canvas');
  const savedImg = state.image;
  const savedCanvas = state.canvas;
  const out = [];
  for (let i = 0; i < ss.panels.length; i++) {
    const base = ss.panels[i];
    const ov = overrides && overrides[i];
    const panel = ov ? { ...base, headline: ov.headline ?? base.headline, subhead: ov.subhead ?? base.subhead } : base;
    const img = panelImage(panel);
    if (img) state.image = img;
    state.canvas = { width: preset.w, height: preset.h };
    composePanel(off, panel, shared);
    const blob = await new Promise((res) => off.toBlob(res, 'image/png'));
    out.push({ name: `panel-${String(i + 1).padStart(2, '0')}.png`, blob });
    if (onProgress) onProgress(i + 1, ss.panels.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  state.image = savedImg;
  state.canvas = savedCanvas;
  return out;
}
