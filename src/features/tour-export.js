// v25 — Interactive Tour: export + self-contained HTML player.
//
// A Tour is the page sequence (each page = a step) plus per-step hotspots/callouts
// (state.tour, which rides the page payload). exportTour() renders every step
// offscreen — exactly like pages.js renderAllPages() — and emits ONE self-contained
// .html file: the frames are inlined as data URLs and a tiny vanilla player (no
// deps, no network) lets a viewer click through hotspots/Next. The same builder
// powers the in-app Preview (rendered into an <iframe srcdoc> overlay).

import { state } from '../state/state.js';
import { renderInto } from '../render/render.js';
import { applyDesignToState, applyPayload } from './document.js';
import { serializeDocument } from './pages.js';
import { normalizeProject } from '../state/serialize.js';
import { showNotification } from '../ui/notification.js';
import tourPlayerSrc from '../share/tour-player.js?raw';
import tourCss from '../share/tour-player.css?raw';

// ── Render every step offscreen, pairing each frame with its hotspots ─────────
export async function collectTourSteps(onProgress) {
  const doc = serializeDocument();          // {docVersion, active, pages:[{id,payload,thumb}]}
  const steps = [];
  const off = document.createElement('canvas');
  for (let i = 0; i < doc.pages.length; i++) {
    const payload = doc.pages[i].payload;
    const norm = normalizeProject(payload);
    await applyDesignToState(payload);
    if (!state.image) continue;             // skip blank steps
    renderInto(off, true);
    const tour = norm.design.tour || { hotspots: [], autoAdvanceMs: 0 };
    steps.push({
      img: off.toDataURL('image/jpeg', 0.92),
      w: off.width, h: off.height,
      hotspots: Array.isArray(tour.hotspots) ? tour.hotspots : [],
      autoAdvanceMs: tour.autoAdvanceMs | 0
    });
    if (onProgress) onProgress(i + 1, doc.pages.length);
    await new Promise(r => setTimeout(r, 0));
  }
  // Restore the live editor to the step the user was on (mirrors renderAllPages).
  applyPayload(doc.pages[doc.active].payload);
  return steps;
}

// ── Self-contained player document ────────────────────────────────────────────
// v41: the player lives in src/share/tour-player.js (shared with the /s/<id>
// viewer). Its raw text is inlined here, so the file still works offline.
// STEPS is inlined as JSON; `<` is escaped so a callout containing "</script>"
// can never break out of the data island.
const inlineModule = (src) => src.replace(/^export /m, '');

export function buildTourHTML(steps, title) {
  const safeTitle = String(title || 'Interactive Tour').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const data = JSON.stringify(steps).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  html, body { margin: 0; height: 100%; }
  body { background: #0a0a0f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
${tourCss}
</style>
</head>
<body>
<div id="app"></div>
<script id="tour-data" type="application/json">${data}</script>
<script>
${inlineModule(tourPlayerSrc)}
mountTour(document.getElementById('app'), JSON.parse(document.getElementById('tour-data').textContent || '[]'));
</script>
</body>
</html>`;
}

function blobDownload(html, filename) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function tourTitle() {
  return (state.watermark && state.watermark.text) || 'Interactive Tour';
}

function setStatus(msg) {
  const s = document.getElementById('tour-status');
  if (s) s.textContent = msg || '';
}

// ── Public actions ────────────────────────────────────────────────────────────
export async function exportTour() {
  setStatus('Rendering tour…');
  try {
    const steps = await collectTourSteps((d, n) => setStatus(`Rendering ${d}/${n}…`));
    if (!steps.length) { setStatus('Add a screenshot to a step first.'); showNotification('Add a screenshot to a step first.', 'error'); return; }
    const html = buildTourHTML(steps, tourTitle());
    blobDownload(html, `tour-${Date.now()}.html`);
    setStatus(`Exported ${steps.length} step${steps.length === 1 ? '' : 's'}.`);
    showNotification(`Tour exported (${steps.length} step${steps.length === 1 ? '' : 's'}). Open the .html anywhere — it works offline.`, 'success');
  } catch (e) {
    console.error(e); setStatus('Failed.');
    showNotification(`Tour export failed: ${e.message || e}`, 'error');
  }
}

export async function previewTour() {
  setStatus('Preparing preview…');
  try {
    const steps = await collectTourSteps((d, n) => setStatus(`Preparing ${d}/${n}…`));
    setStatus('');
    if (!steps.length) { showNotification('Add a screenshot to a step first.', 'error'); return; }
    const html = buildTourHTML(steps, tourTitle());
    openPreviewOverlay(html);
  } catch (e) {
    console.error(e); setStatus('Failed.');
    showNotification(`Tour preview failed: ${e.message || e}`, 'error');
  }
}

// Lightweight fullscreen overlay holding the player in an <iframe srcdoc>, so the
// preview is the exact artifact that ships — built on demand to keep the editor
// HTML lean.
function openPreviewOverlay(html) {
  let ov = document.getElementById('tour-preview-overlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'tour-preview-overlay';
  ov.className = 'tour-preview-overlay';
  const close = document.createElement('button');
  close.className = 'tour-preview-close'; close.title = 'Close (Esc)'; close.textContent = '✕';
  const frame = document.createElement('iframe');
  frame.className = 'tour-preview-frame';
  frame.setAttribute('title', 'Tour preview');
  frame.srcdoc = html;
  const done = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') done(); };
  close.onclick = done;
  ov.appendChild(frame); ov.appendChild(close);
  document.body.appendChild(ov);
  document.addEventListener('keydown', onKey);
}

// Self-contained tours are a single file, so the honest embed is an <iframe> that
// references the exported file (host it anywhere). Returns the snippet string.
export function tourEmbedCode(filename) {
  const name = filename || 'tour.html';
  return `<iframe src="${name}" width="100%" height="640" style="border:0;border-radius:14px;overflow:hidden" loading="lazy" title="Interactive Tour"></iframe>`;
}
