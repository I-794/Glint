import { state } from '../state/state.js';
import { FRAME_INSETS } from '../state/presets.js';
import { el } from '../ui/elements.js';
import { drawBackground } from './background.js';
import { drawShadow, drawBorder } from './shadow.js';
import { drawDeviceFrame } from './frames.js';
import { drawAnnotations } from './annotations.js';
import { drawRedactions } from './redactions.js';
import { drawSpotlight, drawSpotlightChrome } from './spotlight.js';
import { drawTextOverlay, drawWatermark, drawLogo } from './overlays.js';
import { renderAutoLayout } from './autolayout.js';
import { drawSceneBackground } from './scenes.js';
import { renderExtraImages } from '../features/extra-images.js';
import { renderMinimap, applyTransform } from '../features/zoom-pan.js';
import { getAnimationState } from '../features/animation.js';
import { sampleKenBurns, getKenBurnsProgress } from '../features/ken-burns.js';
import { drawEffects } from './effects.js';
import { isDeviceMockup, drawDeviceMockup, drawScreenImage } from './mockups.js';
import { isDeviceMockup3d, render3dMockup } from './mockups-3d.js';
import { bakePerspective } from './perspective.js';
import { isSurfaceMockup, drawSurfaceMockup } from './surfaces.js';
import { renderSetPreview } from '../features/screenshot-set.js';
import { renderBoard } from '../features/board.js';
import { drawGuides } from '../features/snapping.js';
import { drawReflection } from './reflection.js';
import { withLayer } from './blend.js';
import { getGradedImage } from './color-grade.js';

function getFrameInsets() {
  const t = state.deviceFrame.type;
  if (!t || !FRAME_INSETS[t]) return { top: 0, bottom: 0, left: 0, right: 0 };
  return FRAME_INSETS[t];
}

export function render(forExport) {
  // v9 — Set mode owns the preview: it draws a captioned store panel instead of
  // the standard composition. Routed before the no-image guard so the layout
  // (background + caption band) previews even before a screenshot is loaded.
  if (!forExport && state.mode === 'set' && state.screenshotSet && state.screenshotSet.panels.length) {
    renderSetPreview();
    return;
  }
  // v32 — Board mode owns the preview: it lays out page cards on a pan/zoom
  // surface instead of rendering one scene. Routed before the no-image guard so
  // the board (and its empty state) previews even with no image loaded.
  if (!forExport && state.mode === 'board') {
    renderBoard();
    return;
  }
  renderInto(el.previewCanvas, forExport);
  // v34 — spotlight region selection chrome is preview-only.
  if (!forExport) drawSpotlightChrome(el.previewCanvas.getContext('2d'), el.previewCanvas);
  // v35 — the floating selection toolbar follows the selection (HTML, preview-only).
  if (!forExport) window.__syncFloatingToolbar?.();
}

// Render the current global state into an arbitrary canvas. `render()` targets
// the on-screen preview canvas; v9 batch/set export call this with offscreen
// canvases (forExport=true suppresses the minimap + CSS-transform sync, which
// are live-UI only).
export function renderInto(canvas, forExport) {
  if (!state.image) return;
  const ctx = canvas.getContext('2d');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;

  // Keep the wrapper's CSS transform in sync (it suppresses CSS tilt while a
  // device mockup is active, since tilt is baked into the canvas for those).
  if (!forExport) applyTransform();

  drawBackground(ctx, canvas, forExport);

  // Auto-layout takes over if active
  if (state.autoLayout.pattern !== 'free') {
    renderAutoLayout(ctx, canvas);
    drawTextOverlay(ctx, canvas);
    drawWatermark(ctx, canvas);
    drawLogo(ctx, canvas);
    if (!forExport) renderMinimap();
    return;
  }

  // v21 — true 3D / isometric device mockup. Renders a WebGL device with the
  // screenshot mapped onto its screen, composited over the (already-drawn) page
  // background. Reachable independent of deviceFrame.type. Annotations /
  // redactions / spotlight are BAKED onto the screen texture (see screenSource
  // below) so they track the 3D screen surface in both preview and export.
  if (state.mockup3d?.enabled && isDeviceMockup3d(state.mockup3d.device)) {
    const screenSource = buildScreenTexture();
    const gl = render3dMockup(state.mockup3d, canvas.width, canvas.height, screenSource);
    if (gl) {
      ctx.drawImage(gl, 0, 0);
    } else {
      // three.js still loading — show the graded screenshot as a placeholder so
      // the preview isn't blank; it will re-render once GL is ready.
      const img = getGradedImage(state.image);
      if (img && img.width) {
        const r = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.7;
        const dw = img.width * r, dh = img.height * r;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        ctx.globalAlpha = 1;
      }
    }
    if (!forExport) drawGuides(ctx);
    drawEffects(ctx, canvas);
    drawTextOverlay(ctx, canvas);
    drawWatermark(ctx, canvas);
    drawLogo(ctx, canvas);
    if (!forExport) renderMinimap();
    return;
  }

  // v27 — Surface Studio: wrap the artwork onto a physical/print surface
  // (t-shirt, mug, poster, framed print, business card, packaging box). Like the
  // device path it composites onto an offscreen, then runs the shared tail so it
  // bakes into export. Reachable independent of deviceFrame.type; the graded
  // image is the print source so color filters/grades carry through.
  if (state.surface?.enabled && isSurfaceMockup(state.surface.type)) {
    const art = getGradedImage(state.image);
    const out = drawSurfaceMockup(ctx, canvas, art, state.surface);
    if (out && out.rect) state.lastImageRect = out.rect;
    if (!forExport) drawGuides(ctx);
    drawEffects(ctx, canvas);
    drawTextOverlay(ctx, canvas);
    drawWatermark(ctx, canvas);
    drawLogo(ctx, canvas);
    if (!forExport) renderMinimap();
    return;
  }

  // v8 — realistic device mockups: draw the device behind, composite the
  // screenshot into its screen, then paint on-top accents (notch/glare). This
  // path replaces the legacy frames.js overlay for these types.
  // v8.1 — compose flat onto an offscreen canvas, then (if tilted) bake the 3D
  // perspective into the main canvas so the tilt exports. Text/watermark stay on
  // the main canvas (unwarped) so captions and branding remain crisp.
  if (isDeviceMockup(state.deviceFrame.type)) {
    const off = mockCanvas(canvas.width, canvas.height);
    const octx = off.getContext('2d');
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, off.width, off.height);
    const out = drawDeviceMockup(octx, canvas, state.deviceFrame.type);
    if (out && out.rect) {
      state.lastImageRect = out.rect;
      drawScreenImage(octx, out.rect, out.radius);
      if (out.overlay) out.overlay(octx);
      drawRedactions(octx, off);   // blur samples `off` (the composited mockup), not the bare bg
      drawSpotlight(octx, off);
      drawAnnotations(octx);
      renderExtraImages(octx, off);

      // v14 — reflection of the whole device, drawn into the offscreen so it
      // inherits the 3D tilt when the device is baked with perspective.
      if (state.reflection && state.reflection.enabled && out.bounds) {
        drawReflection(octx, off, out.bounds);
      }

      const t = state.tilt3d;
      if (t && (t.rx || t.ry || t.rz)) {
        bakePerspective(ctx, off, t, { fit: true, margin: Math.max(20, state.padding) });
      } else {
        ctx.drawImage(off, 0, 0);
      }

      if (!forExport) drawGuides(ctx);
      drawEffects(ctx, canvas);   // v16.1 — glass + grain over the composited mockup (samples the main canvas)
      drawTextOverlay(ctx, canvas);
      drawWatermark(ctx, canvas);
      drawLogo(ctx, canvas);
      if (!forExport) renderMinimap();
      return;
    }
  }

  const scaleFactor = state.scale / 100;
  const padding = state.padding * 2;
  const frameInsets = getFrameInsets();
  const titleBarHeight = frameInsets.top;
  const bottomPad = frameInsets.bottom;
  const sidePad = frameInsets.left;

  const availableWidth = canvas.width - padding - sidePad * 2;
  const availableHeight = canvas.height - padding - titleBarHeight - bottomPad;

  let imgWidth = state.image.width * scaleFactor;
  let imgHeight = state.image.height * scaleFactor;
  if (imgWidth <= 0 || imgHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) return;

  const imgRatio = imgWidth / imgHeight;
  const availableRatio = availableWidth / availableHeight;
  if (imgRatio > availableRatio) {
    if (imgWidth > availableWidth) { imgWidth = availableWidth; imgHeight = imgWidth / imgRatio; }
  } else {
    if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * imgRatio; }
  }

  let x = (canvas.width - imgWidth) / 2;
  let y = (canvas.height - imgHeight - titleBarHeight - bottomPad) / 2 + titleBarHeight;

  if (state.scene && state.scene.id) {
    const sceneOut = drawSceneBackground(ctx, canvas);
    if (sceneOut && sceneOut.rect) {
      x = sceneOut.rect.x; y = sceneOut.rect.y;
      imgWidth = sceneOut.rect.w; imgHeight = sceneOut.rect.h;
    }
  }

  state.lastImageRect = { x, y, w: imgWidth, h: imgHeight };

  if (state.shadow.opacity > 0) drawShadow(ctx, canvas, x, y, imgWidth, imgHeight);

  const animState = getAnimationState();
  if (animState) {
    ctx.save();
    const cx = x + imgWidth / 2;
    const cy = y + imgHeight / 2;
    if (animState.opacity !== undefined) ctx.globalAlpha = animState.opacity;
    if (animState.translateX || animState.translateY || animState.scale !== undefined || animState.rotate) {
      ctx.translate(cx, cy);
      if (animState.rotate) ctx.rotate((animState.rotate * Math.PI) / 180);
      if (animState.scale !== undefined) ctx.scale(animState.scale, animState.scale);
      ctx.translate(-cx + (animState.translateX || 0), -cy + (animState.translateY || 0));
    }
  }

  withLayer(ctx, state.imageLayer, () => drawImageContent(ctx, x, y, imgWidth, imgHeight));

  if (state.showBorder) drawBorder(ctx, x, y, imgWidth, imgHeight);

  if (state.deviceFrame.type) {
    drawDeviceFrame(ctx, x, y - titleBarHeight, imgWidth, imgHeight + titleBarHeight + bottomPad);
  }

  // v15.2 — close the main-image entrance transform here so it wraps only the
  // framed screenshot (image + border + frame), not the annotations / extra
  // images below, which carry their own per-element entrances (applyEntrance).
  if (animState) ctx.restore();

  drawRedactions(ctx, canvas);
  drawSpotlight(ctx, canvas);
  drawAnnotations(ctx);
  renderExtraImages(ctx, canvas);

  // v14 — mirrored reflection of the framed subject, below it.
  if (state.reflection && state.reflection.enabled && state.lastImageRect) {
    drawReflection(ctx, canvas, state.lastImageRect);
  }
  if (!forExport) drawGuides(ctx);

  drawEffects(ctx, canvas);   // v16.1 — glass + grain over the framed subject, under text/watermark/logo

  drawTextOverlay(ctx, canvas);
  drawWatermark(ctx, canvas);
  drawLogo(ctx, canvas);

  if (!forExport) renderMinimap();
}

// v30 — render the current design into an arbitrary canvas at an arbitrary
// pixel size, then restore the working canvas size. Used by the Campaign
// Generator and the Producer to emit the same design at many target sizes.
// forExport=true so preview-only chrome (minimap/CSS-transform sync) is skipped.
export function renderAtSize(canvas, { width, height }) {
  const prev = state.canvas;
  try {
    state.canvas = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    renderInto(canvas, true);
  } finally {
    state.canvas = prev;
  }
}

// Reusable offscreen canvas for compositing a device mockup before warping.
let _mockOff = null;
function mockCanvas(w, h) {
  if (!_mockOff) _mockOff = document.createElement('canvas');
  if (_mockOff.width !== w) _mockOff.width = w;
  if (_mockOff.height !== h) _mockOff.height = h;
  return _mockOff;
}

// v21 — bake the screen content for the 3D mockup onto an offscreen canvas sized
// to the graded screenshot. The screen-space passes (redactions, spotlight,
// annotations) are drawn relative to lastImageRect; we temporarily set that to
// this canvas's full rect so they land on the screenshot in texture space and
// thus track the 3D screen surface. Returns the texture canvas (or the bare
// graded image when nothing extra needs baking).
let _screenTex = null;
function buildScreenTexture() {
  const img = getGradedImage(state.image);
  if (!img || !img.width || !img.height) return img;

  const hasOverlays =
    (state.annotations && state.annotations.length) ||
    (state.redactions && state.redactions.length) ||
    (state.spotlight && state.spotlight.enabled);
  if (!hasOverlays) return img;

  if (!_screenTex) _screenTex = document.createElement('canvas');
  // Cap the long edge so the texture stays GPU-friendly.
  const MAX = 2048;
  let w = img.width, h = img.height;
  const longEdge = Math.max(w, h);
  if (longEdge > MAX) { const s = MAX / longEdge; w = Math.round(w * s); h = Math.round(h * s); }
  if (_screenTex.width !== w) _screenTex.width = w;
  if (_screenTex.height !== h) _screenTex.height = h;
  const tctx = _screenTex.getContext('2d');
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, w, h);
  tctx.drawImage(img, 0, 0, w, h);

  // Map the screen-space passes onto the texture by pretending the image rect is
  // the full texture canvas, then restore the real lastImageRect afterwards.
  const savedRect = state.lastImageRect;
  state.lastImageRect = { x: 0, y: 0, w, h };
  try {
    drawRedactions(tctx, _screenTex);
    drawSpotlight(tctx, _screenTex);
    drawAnnotations(tctx);
  } finally {
    state.lastImageRect = savedRect;
  }
  return _screenTex;
}

function drawImageContent(ctx, x, y, imgWidth, imgHeight) {
  ctx.save();
  const radius = state.borderRadius;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + imgWidth - radius, y);
  ctx.quadraticCurveTo(x + imgWidth, y, x + imgWidth, y + radius);
  ctx.lineTo(x + imgWidth, y + imgHeight - radius);
  ctx.quadraticCurveTo(x + imgWidth, y + imgHeight, x + imgWidth - radius, y + imgHeight);
  ctx.lineTo(x + radius, y + imgHeight);
  ctx.quadraticCurveTo(x, y + imgHeight, x, y + imgHeight - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();

  const centerX = x + imgWidth / 2;
  const centerY = y + imgHeight / 2;
  ctx.translate(centerX, centerY);
  if (state.imageTransform.rotation !== 0) {
    ctx.rotate((state.imageTransform.rotation * Math.PI) / 180);
  }
  ctx.scale(state.imageTransform.flipH ? -1 : 1, state.imageTransform.flipV ? -1 : 1);

  const filters = [];
  const f = state.imageFilters;
  if (f.brightness !== 100) filters.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100)   filters.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) filters.push(`saturate(${f.saturation}%)`);
  if (f.blur > 0)           filters.push(`blur(${f.blur}px)`);
  if (f.grayscale > 0)      filters.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0)          filters.push(`sepia(${f.sepia}%)`);
  if (filters.length) ctx.filter = filters.join(' ');

  let drawWidth = imgWidth, drawHeight = imgHeight;
  if (state.imageTransform.rotation === 90 || state.imageTransform.rotation === 270) {
    drawWidth = imgHeight; drawHeight = imgWidth;
  }

  // v15.2 — Ken Burns crops the source by the sampled window and maps it onto
  // the full destination rect, zooming/panning the still. Off while a clip is
  // loaded (auto-zoom owns the crop). Falls back to a plain full-image draw.
  const kb = state.kenBurns;
  // v17 — draw the color-graded image (temperature/tint + Color Map baked in).
  // Returns state.image unchanged when no per-pixel grade is active.
  const img = getGradedImage(state.image);
  if (kb && kb.enabled && !state.video.loaded && img && img.width && img.height) {
    // v29 — progress comes from getKenBurnsProgress(): the Motion Studio lane
    // clock when it's driving, else the legacy animation playhead.
    const p = getKenBurnsProgress();
    const s = sampleKenBurns(kb, p);
    const sw = img.width / s.scale;
    const sh = img.height / s.scale;
    let sx = s.cx * img.width - sw / 2;
    let sy = s.cy * img.height - sh / 2;
    sx = Math.max(0, Math.min(sx, img.width - sw));
    sy = Math.max(0, Math.min(sy, img.height - sh));
    ctx.drawImage(img, sx, sy, sw, sh, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  } else {
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  }
  ctx.restore();
}
