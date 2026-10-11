// v13 — shared document helpers.
//
// A "page" is a single design payload (the v12 serializeFull envelope). These
// helpers apply one page payload onto the live editor, or onto state only (for
// offscreen deck rendering), and produce thumbnails. Kept DOM-aware but free of
// the pages/projects models so both pages.js and projects.js can import it
// without a cycle.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { normalizeProject } from '../state/serialize.js';
import { releaseMaskOwner, ensureBokehMask } from '../render/bokeh.js';
import { ensureCompareImage } from '../render/compare.js';

// Assign a page payload's design + image into global state WITHOUT touching the
// DOM or re-rendering. Returns a promise that resolves once the image (if any)
// has decoded. Used by the deck render loop, which renders to offscreen canvases.
export function applyDesignToState(payload) {
  const norm = normalizeProject(payload);
  Object.assign(state, norm.design);
  state.svgCode = norm.svgCode || null;
  // v34 — once this page's own image is in place, it may claim its Bokeh mask
  // (releaseMaskOwner opens a one-shot claim; not before the decode, or a render
  // in between would hand the mask to the previous image). The page's mask is
  // decoded before resolving, so an offscreen render right after draws Bokeh.
  const maskReady = Promise.all([
    ensureBokehMask(norm.design && norm.design.bokeh && norm.design.bokeh.maskDataUrl),
    // v35 — and its Before image, so an offscreen render draws the comparison.
    ensureCompareImage(norm.design && norm.design.compare && norm.design.compare.beforeSrc),
  ]);
  return new Promise((resolve) => {
    const done = () => { maskReady.then(() => resolve()); };
    if (norm.image) {
      const img = new Image();
      img.onload = () => { state.image = img; releaseMaskOwner(); done(); };
      img.onerror = () => { state.image = null; releaseMaskOwner(); done(); };
      img.src = norm.image;
    } else {
      state.image = null;
      releaseMaskOwner();
      done();
    }
  });
}

function showCanvasUI() {
  if (el.uploadZone) el.uploadZone.style.display = 'none';
  if (el.canvasWrapper) el.canvasWrapper.style.display = 'block';
  if (el.annotationToolbar) el.annotationToolbar.style.display = 'flex';
  if (el.zoomControls) el.zoomControls.style.display = 'flex';
}

function showUploadUI() {
  if (el.uploadZone) el.uploadZone.style.display = '';
  if (el.canvasWrapper) el.canvasWrapper.style.display = 'none';
  if (el.annotationToolbar) el.annotationToolbar.style.display = 'none';
}

// Apply a page payload to the live editor: assign state, decode the image, then
// render + sync the sidebar controls. Toggles the upload zone for blank pages.
export function applyPayload(payload) {
  applyDesignToState(payload).then(() => {
    // v32.1 — on the board, the single-canvas UI stays hidden (a page switch or
    // delete from the board must not un-hide #canvas-wrapper over the cards).
    if (state.mode !== 'board') { if (state.image) showCanvasUI(); else showUploadUI(); }
    render();
    if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
    // v24 — if this design is a code snippet, re-rasterize crisply from its
    // settings (the baked JPEG in the envelope is only a fallback).
    if (typeof window.__reapplyCodeSnippet === 'function') window.__reapplyCodeSnippet();
    // v25 — once state.tour reflects the applied step, refresh the Tour overlay +
    // sidebar (this .then runs AFTER Object.assign, unlike pages.js emitChange()).
    if (typeof window.__refreshTourUi === 'function') window.__refreshTourUi();
  });
}

// v32.1 — show the canvas or the upload zone to match the live page (used when
// leaving the board, where applyPayload deliberately left them hidden).
export function syncCanvasUI() {
  if (state.image) showCanvasUI(); else showUploadUI();
}

// Downscale the live preview canvas to a small JPEG thumbnail (page/project cards).
export function makeThumb() {
  // v32.1 — on the board the preview canvas isn't redrawn (render() routes to
  // renderBoard), so it holds a stale frame; callers keep the existing thumb.
  if (state.mode === 'board') return null;
  const src = el.previewCanvas;
  if (!src || !src.width) return null;
  try {
    const W = 320;
    const scale = W / src.width;
    const H = Math.max(1, Math.round(src.height * scale));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(src, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.6);
  } catch (e) { return null; }
}

export function uid() {
  try { return crypto.randomUUID(); }
  catch (e) { return 'x-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
}
