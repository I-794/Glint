// v30 — AI Screenshot Editor. Semantic edits to the screenshot's own pixels:
// fix/replace text, recolor an element, redact PII, remove clutter. Locates
// regions with runVisionJson()/OCR boxes, masks them (opaque=keep, transparent=
// regenerate — the gpt-image-2 convention), and regenerates via the existing
// edit() inpaint. Redaction short-circuits the AI (local blur/box). Every edit
// replaces state.image via applyResultAsImage() → bakes into export + undoable.

import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { canvasToBlob, nearestGptImageSize } from './ai-shared.js';
import { edit, applyResultAsImage } from './ai-image-edit.js';
import { runVisionJsonOnDataUrl } from './ai-cloud.js';
import { recognizeWords } from './ocr.js';

// Draw the current screenshot onto a full-resolution canvas.
export function sourceCanvas() {
  const img = state.image;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

// Build an inpaint mask: starts opaque white (keep everything), then clears the
// given boxes to transparent (the regions gpt-image-2 will regenerate). Boxes
// are padded slightly so the model has room to blend edges.
export function maskFromBoxes(iw, ih, boxes) {
  const mask = document.createElement('canvas');
  mask.width = iw; mask.height = ih;
  const m = mask.getContext('2d');
  m.fillStyle = '#ffffff';
  m.fillRect(0, 0, iw, ih);
  m.globalCompositeOperation = 'destination-out';
  const pad = Math.round(Math.min(iw, ih) * 0.01);
  for (const b of boxes) {
    m.fillRect(Math.max(0, b.x - pad), Math.max(0, b.y - pad), b.w + pad * 2, b.h + pad * 2);
  }
  return mask;
}

// Ask vision for the bounding box of a described target, in source pixels.
// Returns {x,y,w,h} or null. The prompt pins the coordinate space explicitly.
async function locateRegion(description) {
  const canvas = sourceCanvas();
  const dataUrl = canvas.toDataURL('image/png');
  const prompt =
    `The image is ${canvas.width}px wide and ${canvas.height}px tall (top-left origin). ` +
    `Find: ${description}. Return JSON {"found":true|false,"x":<int>,"y":<int>,"w":<int>,"h":<int>} ` +
    `where x,y,w,h is the tight pixel bounding box of that element. If not present, found=false.`;
  const v = await runVisionJsonOnDataUrl(prompt, dataUrl);
  if (!v || !v.found) return null;
  const x = Math.max(0, Math.min(canvas.width, v.x | 0));
  const y = Math.max(0, Math.min(canvas.height, v.y | 0));
  const w = Math.max(1, Math.min(canvas.width - x, v.w | 0));
  const h = Math.max(1, Math.min(canvas.height - y, v.h | 0));
  return { x, y, w, h };
}

// Run an inpaint over the given boxes with an op-specific prompt, then commit.
async function inpaintBoxes(boxes, prompt) {
  const canvas = sourceCanvas();
  const mask = maskFromBoxes(canvas.width, canvas.height, boxes);
  const size = nearestGptImageSize(canvas.width, canvas.height);
  const b64 = await edit(await canvasToBlob(canvas), await canvasToBlob(mask), prompt, size);
  await applyResultAsImage(b64);
}

// Replace on-screen text. Prefer OCR word boxes (exact glyph positions) for the
// matched phrase; fall back to a vision-located region. The inpaint prompt asks
// the model to render the replacement text in the same style.
export async function fixText(find, replace) {
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return false; }
  if (!find) { showNotification('Enter the text to find.', 'error'); return false; }
  let boxes = [];
  try {
    const words = await recognizeWords(state.image);
    const needle = find.trim().toLowerCase();
    const hits = words.filter(w => w.text && needle.includes(w.text.toLowerCase()) && w.text.length > 1);
    boxes = hits.map(w => ({ x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 }))
                .filter(b => b.w > 0 && b.h > 0);
  } catch (_) { /* OCR optional */ }
  if (!boxes.length) {
    const r = await locateRegion(`the text that reads "${find}"`);
    if (!r) { showNotification(`Couldn't find "${find}" in the screenshot.`, 'error'); return false; }
    boxes = [r];
  }
  try {
    await inpaintBoxes(boxes, `Replace the text in the masked area with "${replace}", matching the original font, size, weight, color, and alignment. Keep the surrounding UI pixel-identical.`);
    showNotification('Text updated.', 'success');
    return true;
  } catch (e) { showNotification(`Edit failed: ${e.message || e}`, 'error'); return false; }
}

// Recolor a described UI element to a target hex.
export async function recolorElement(description, hex) {
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return false; }
  const r = await locateRegion(description);
  if (!r) { showNotification(`Couldn't find "${description}".`, 'error'); return false; }
  try {
    await inpaintBoxes([r], `Recolor the masked UI element to ${hex}. Preserve its exact shape, text, icon, shadow, and position — only change its fill color. Keep everything else identical.`);
    showNotification('Element recolored.', 'success');
    return true;
  } catch (e) { showNotification(`Edit failed: ${e.message || e}`, 'error'); return false; }
}

// Remove a described distraction (stray cursor, OS notification, debug banner)
// and fill the area to match the surrounding UI.
export async function removeClutter(description) {
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return false; }
  const r = await locateRegion(description);
  if (!r) { showNotification(`Couldn't find "${description}".`, 'error'); return false; }
  try {
    await inpaintBoxes([r], `Remove the masked element and realistically fill the area to match the surrounding UI background. No text, no artifacts.`);
    showNotification('Removed.', 'success');
    return true;
  } catch (e) { showNotification(`Edit failed: ${e.message || e}`, 'error'); return false; }
}

// Pixelate a region in-place (mosaic) — privacy-grade, irreversible in the
// output. Used for redaction; no AI involved.
function pixelate(ctx, x, y, w, h, block = 12) {
  const sx = Math.max(1, Math.floor(w / block));
  const sy = Math.max(1, Math.floor(h / block));
  const tmp = document.createElement('canvas');
  tmp.width = sx; tmp.height = sy;
  const t = tmp.getContext('2d');
  t.drawImage(ctx.canvas, x, y, w, h, 0, 0, sx, sy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, sx, sy, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

// Redact PII. Auto-detection uses OCR (email-like tokens) plus an optional
// vision pass for names/cards; manualBoxes are always redacted. Commits the
// pixelated image as the new state.image (one undo step). No model regeneration.
export async function redact({ autoPII = true, manualBoxes = [] } = {}) {
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return false; }
  const canvas = sourceCanvas();
  const ctx = canvas.getContext('2d');
  let boxes = [...manualBoxes];

  if (autoPII) {
    // OCR: email-like tokens.
    try {
      const words = await recognizeWords(state.image);
      for (const w of words) {
        if (/@|\d{4,}/.test(w.text) && w.bbox) {
          boxes.push({ x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 });
        }
      }
    } catch (_) {}
    // Vision: names / card numbers / addresses (best-effort; tolerated on fail).
    let v = null;
    try {
      v = await runVisionJsonOnDataUrl(
        `The image is ${canvas.width}px wide and ${canvas.height}px tall (top-left origin). ` +
        `Return JSON {"regions":[{"x":int,"y":int,"w":int,"h":int}]} for every region containing personally identifiable information (full names, emails, phone numbers, card numbers, street addresses). Empty array if none.`,
        canvas.toDataURL('image/png')
      );
    } catch (_) {}
    if (v && Array.isArray(v.regions)) {
      for (const r of v.regions) boxes.push({ x: r.x | 0, y: r.y | 0, w: r.w | 0, h: r.h | 0 });
    }
  }

  boxes = boxes.filter(b => b.w > 1 && b.h > 1);
  if (!boxes.length) { showNotification('No PII detected to redact.', 'success'); return false; }
  for (const b of boxes) pixelate(ctx, Math.max(0, b.x), Math.max(0, b.y), b.w, b.h);

  // Commit via the shared image-replace path (bare b64).
  await applyResultAsImage(canvas.toDataURL('image/png').split(',')[1]);
  showNotification(`Redacted ${boxes.length} region${boxes.length === 1 ? '' : 's'}.`, 'success');
  return true;
}

// v30 — Sidebar panel wiring. Connects the Magic Edit DOM controls to the ops above.
const $ = (id) => document.getElementById(id);

export function bindScreenshotEditor() {
  $('medit-fixtext')?.addEventListener('click', () => {
    fixText($('medit-find')?.value?.trim(), $('medit-replace')?.value ?? '');
  });
  $('medit-recolor')?.addEventListener('click', () => {
    recolorElement($('medit-recolor-desc')?.value?.trim(), $('medit-recolor-hex')?.value || '#4f46e5');
  });
  $('medit-remove')?.addEventListener('click', () => {
    removeClutter($('medit-remove-desc')?.value?.trim());
  });
  $('medit-redact')?.addEventListener('click', () => redact({ autoPII: true }));
}
