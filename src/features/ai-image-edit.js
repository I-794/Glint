// v9.1 — Generative AI: background replace, canvas extend (outpaint), magic eraser.
//
// Backend: prefers the Vercel serverless proxy (/api/image-*, key server-side);
// falls back to bring-your-own-key via the OpenAI SDK when the proxy is absent
// (e.g. local `vite dev`) or returns 501 (no server key configured). All edits
// use gpt-image-2, which supports mask-based inpaint/outpaint.

import { state } from '../state/state.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { getKey } from './api-keys.js';
import { imageToDataUrl, loadImage, canvasToBlob, blobToBase64, nearestGptImageSize } from './ai-shared.js';
import { revealSection } from './studio-nav.js';

function setStatus(msg) {
  const s = document.getElementById('ai-edit-status');
  if (s) s.textContent = msg || '';
}

function needKeyHint() {
  const details = document.getElementById('api-keys-details');
  if (details) { revealSection(details); details.open = true; details.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

// ---- backend calls (proxy → BYOK fallback) --------------------------------

async function tryProxy(path, body) {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 501 || r.status === 404) return { fell_through: true };
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Proxy error ${r.status}`);
    return { b64: data.b64 };
  } catch (e) {
    // Network failure (no proxy in dev) → fall back to BYOK.
    if (e.message && /Proxy error/.test(e.message)) throw e;
    return { fell_through: true };
  }
}

async function openaiClient() {
  const key = getKey('openai');
  if (!key) return null;
  const OpenAI = (await import('openai')).default;
  return new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
}

async function generate(prompt, size) {
  const viaProxy = await tryProxy('/api/image-generate', { prompt, size });
  if (!viaProxy.fell_through) return viaProxy.b64;
  const client = await openaiClient();
  if (!client) { needKeyHint(); throw new Error('Add an OpenAI key (or deploy the server proxy) to generate images.'); }
  const res = await client.images.generate({ model: 'gpt-image-2', prompt, size: size || '1024x1024', n: 1 });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned.');
  return b64;
}

export async function edit(imageBlob, maskBlob, prompt, size) {
  const imageB64 = await blobToBase64(imageBlob);
  const maskB64 = maskBlob ? await blobToBase64(maskBlob) : null;
  const viaProxy = await tryProxy('/api/image-edit', { image: imageB64, mask: maskB64, prompt, size });
  if (!viaProxy.fell_through) return viaProxy.b64;
  const client = await openaiClient();
  if (!client) { needKeyHint(); throw new Error('Add an OpenAI key (or deploy the server proxy) to edit images.'); }
  const { toFile } = await import('openai');
  const params = {
    model: 'gpt-image-2',
    prompt,
    size: size || '1024x1024',
    image: await toFile(imageBlob, 'image.png', { type: 'image/png' })
  };
  if (maskBlob) params.mask = await toFile(maskBlob, 'mask.png', { type: 'image/png' });
  const res = await client.images.edit(params);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned.');
  return b64;
}

export async function applyResultAsImage(b64) {
  const img = await loadImage('data:image/png;base64,' + b64);
  saveStateToHistory();
  state.image = img;
  render();
}

// ---- 1. Background replace (subject-aware) --------------------------------

async function removeBgToImage(srcImg) {
  const mod = await import('@imgly/background-removal');
  const imglyRemove = mod.removeBackground || mod.default;
  const srcUrl = imageToDataUrl(srcImg);
  const srcBlob = await (await fetch(srcUrl)).blob();
  const cut = await imglyRemove(srcBlob, { output: { format: 'image/png', quality: 0.95 } });
  return await loadImage(URL.createObjectURL(cut));
}

export async function replaceBackground() {
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  const promptInp = document.getElementById('ai-edit-bg-prompt');
  const prompt = promptInp ? promptInp.value.trim() : '';
  if (!prompt) { showNotification('Describe the new background.', 'error'); return; }
  setStatus('Cutting out the subject…');
  try {
    const cutout = await removeBgToImage(state.image);
    setStatus('Generating new background…');
    const size = nearestGptImageSize(state.image.width, state.image.height);
    const sceneB64 = await generate(`${prompt}. Clean background scene, no people, no text, no subject.`, size);
    const scene = await loadImage('data:image/png;base64,' + sceneB64);

    // Composite the subject (cover-fit) over the generated scene at the
    // subject's own resolution so detail is preserved.
    const c = document.createElement('canvas');
    c.width = cutout.naturalWidth || cutout.width;
    c.height = cutout.naturalHeight || cutout.height;
    const ctx = c.getContext('2d');
    const sr = scene.width / scene.height, cr = c.width / c.height;
    let dw, dh;
    if (sr > cr) { dh = c.height; dw = dh * sr; } else { dw = c.width; dh = dw / sr; }
    ctx.drawImage(scene, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    ctx.drawImage(cutout, 0, 0, c.width, c.height);

    const blob = await canvasToBlob(c);
    await applyResultAsImage(await blobToBase64(blob));
    setStatus('Background replaced.');
    showNotification('AI background replaced.', 'success');
  } catch (e) {
    console.error(e);
    setStatus('Failed.');
    showNotification(`Background replace failed: ${e.message || e}`, 'error');
  }
}

// ---- 2. Canvas extend (outpaint) ------------------------------------------

const EXTEND_RATIOS = {
  '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16
};

export async function extendCanvas() {
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  const sel = document.getElementById('ai-edit-extend-ratio');
  const ratioKey = sel ? sel.value : '16:9';
  const targetAr = EXTEND_RATIOS[ratioKey] || 16 / 9;
  setStatus('Extending the scene…');
  try {
    const iw = state.image.naturalWidth || state.image.width;
    const ih = state.image.naturalHeight || state.image.height;
    const curAr = iw / ih;
    // Grow the smaller dimension to reach the target aspect (never crop).
    let cw = iw, ch = ih;
    if (targetAr > curAr) cw = Math.round(ih * targetAr);
    else ch = Math.round(iw / targetAr);

    // Extended image: original centered on transparent margins.
    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = cw; imgCanvas.height = ch;
    const ix = Math.round((cw - iw) / 2), iy = Math.round((ch - ih) / 2);
    imgCanvas.getContext('2d').drawImage(state.image, ix, iy, iw, ih);

    // Mask: opaque over the original (keep), transparent in margins (fill).
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = cw; maskCanvas.height = ch;
    const mctx = maskCanvas.getContext('2d');
    mctx.fillStyle = 'rgba(0,0,0,0)';
    mctx.fillRect(0, 0, cw, ch);
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(ix, iy, iw, ih);

    const size = nearestGptImageSize(cw, ch);
    const b64 = await edit(await canvasToBlob(imgCanvas), await canvasToBlob(maskCanvas),
      'Extend and continue the existing scene outward to fill the empty margins seamlessly, matching style, lighting and content. Do not add text or borders.', size);
    await applyResultAsImage(b64);
    setStatus('Canvas extended.');
    showNotification('Canvas extended with AI.', 'success');
  } catch (e) {
    console.error(e);
    setStatus('Failed.');
    showNotification(`Extend failed: ${e.message || e}`, 'error');
  }
}

// ---- 3. Magic eraser (mask brush modal) -----------------------------------

let eraserState = null;

function buildEraserModal() {
  const overlay = document.createElement('div');
  overlay.className = 'eraser-overlay';
  overlay.innerHTML = `
    <div class="eraser-modal">
      <div class="eraser-head">
        <strong>Magic Eraser</strong>
        <span class="info-text">Brush over what to remove, then Erase.</span>
      </div>
      <div class="eraser-canvas-wrap"><canvas id="eraser-canvas"></canvas></div>
      <div class="eraser-controls">
        <label class="control-label" style="margin:0;">Brush</label>
        <input type="range" id="eraser-brush" min="10" max="120" value="40" style="flex:1;">
        <button class="btn btn-secondary" id="eraser-clear">Clear</button>
        <button class="btn btn-secondary" id="eraser-cancel">Cancel</button>
        <button class="btn btn-primary" id="eraser-apply">🪄 Erase</button>
      </div>
      <p class="info-text" id="eraser-status" style="margin-top:6px;"></p>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function openEraser() {
  if (!state.image) { showNotification('Load an image first.', 'error'); return; }
  const overlay = buildEraserModal();
  const display = overlay.querySelector('#eraser-canvas');
  const iw = state.image.naturalWidth || state.image.width;
  const ih = state.image.naturalHeight || state.image.height;
  const maxEdge = 560;
  const scale = Math.min(1, maxEdge / Math.max(iw, ih));
  const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
  display.width = dw; display.height = dh;

  // Mask at full image resolution: starts opaque white (keep); brushing clears
  // to transparent (the region OpenAI will regenerate).
  const mask = document.createElement('canvas');
  mask.width = iw; mask.height = ih;
  const mctx = mask.getContext('2d');
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, iw, ih);

  eraserState = { overlay, display, mask, mctx, scale, iw, ih, brush: 40, painting: false, hasMask: false };
  redrawEraser();

  let brush = 40;
  overlay.querySelector('#eraser-brush').addEventListener('input', (e) => { brush = parseInt(e.target.value, 10); eraserState.brush = brush; });

  const paint = (e) => {
    const rect = display.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * display.width;
    const y = (e.clientY - rect.top) / rect.height * display.height;
    const r = brush / 2;
    // Clear (to transparent) on the image-res mask.
    mctx.save();
    mctx.globalCompositeOperation = 'destination-out';
    mctx.beginPath();
    mctx.arc(x / scale, y / scale, r / scale, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
    eraserState.hasMask = true;
    redrawEraser(x, y, r);
  };
  display.addEventListener('pointerdown', (e) => { eraserState.painting = true; display.setPointerCapture(e.pointerId); paint(e); });
  display.addEventListener('pointermove', (e) => { if (eraserState.painting) paint(e); });
  display.addEventListener('pointerup', () => { eraserState.painting = false; });

  overlay.querySelector('#eraser-clear').addEventListener('click', () => {
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(0, 0, iw, ih);
    eraserState.hasMask = false;
    redrawEraser();
  });
  overlay.querySelector('#eraser-cancel').addEventListener('click', closeEraser);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEraser(); });
  overlay.querySelector('#eraser-apply').addEventListener('click', applyEraser);
}

function redrawEraser() {
  const { display, mask } = eraserState;
  const ctx = display.getContext('2d');
  ctx.clearRect(0, 0, display.width, display.height);
  ctx.drawImage(state.image, 0, 0, display.width, display.height);

  // Red wash over the to-be-erased region. The mask is opaque white where the
  // image is kept and transparent where it will be regenerated, so: fill a
  // scratch canvas solid red, then 'destination-out' the mask — red survives
  // only where the mask is transparent (i.e. the brushed/erase region).
  const scratch = document.createElement('canvas');
  scratch.width = display.width; scratch.height = display.height;
  const sctx = scratch.getContext('2d');
  sctx.fillStyle = '#ff3b30';
  sctx.fillRect(0, 0, scratch.width, scratch.height);
  sctx.globalCompositeOperation = 'destination-out';
  sctx.drawImage(mask, 0, 0, display.width, display.height);

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function closeEraser() {
  if (eraserState && eraserState.overlay) eraserState.overlay.remove();
  eraserState = null;
}

async function applyEraser() {
  if (!eraserState) return;
  if (!eraserState.hasMask) { showNotification('Brush over something to erase first.', 'error'); return; }
  const statusEl = eraserState.overlay.querySelector('#eraser-status');
  if (statusEl) statusEl.textContent = 'Erasing…';
  try {
    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = state.image.naturalWidth || state.image.width;
    imgCanvas.height = state.image.naturalHeight || state.image.height;
    imgCanvas.getContext('2d').drawImage(state.image, 0, 0);
    const size = nearestGptImageSize(imgCanvas.width, imgCanvas.height);
    const b64 = await edit(await canvasToBlob(imgCanvas), await canvasToBlob(eraserState.mask),
      'Remove the masked object(s) and realistically fill the area to match the surrounding background. No text, no watermark.', size);
    await applyResultAsImage(b64);
    closeEraser();
    showNotification('Object erased.', 'success');
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = 'Failed: ' + (e.message || e);
    showNotification(`Erase failed: ${e.message || e}`, 'error');
  }
}

// ---- binding --------------------------------------------------------------

export function bindAiImageEdit() {
  const bg = document.getElementById('ai-edit-bg-btn');
  if (bg) bg.addEventListener('click', replaceBackground);
  const ext = document.getElementById('ai-edit-extend-btn');
  if (ext) ext.addEventListener('click', extendCanvas);
  const er = document.getElementById('ai-edit-eraser-btn');
  if (er) er.addEventListener('click', openEraser);
}
