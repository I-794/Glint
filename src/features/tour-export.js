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
// STEPS is inlined as JSON; `<` is escaped so a callout containing "</script>"
// can never break out of the data island.
function buildTourHTML(steps, title) {
  const safeTitle = String(title || 'Interactive Tour').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const data = JSON.stringify(steps).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  :root { --accent: #f2a93b; --ink: #0b0b0f; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { background: #0a0a0f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 16px; padding: 20px; }
  /* #stage is the positioning context for hotspots/callouts and does NOT clip,
     so a callout can extend past a frame edge and still show. The rounded corners
     + shadow live on the inner #screen, which clips only the frame image. */
  #stage { position: relative; line-height: 0; }
  #screen { position: relative; max-width: min(94vw, 1100px); max-height: 82vh;
            border-radius: 14px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.55); }
  #frame { display: block; max-width: 100%; max-height: 82vh; width: auto; height: auto; }
  .hs { position: absolute; border: 2px solid #fff; border-radius: 8px; cursor: pointer;
        background: rgba(242,169,59,0.16); box-shadow: 0 0 0 2px rgba(242,169,59,0.6);
        animation: pulse 1.8s ease-in-out infinite; }
  .hs:focus { outline: none; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 2px rgba(242,169,59,0.7), 0 0 0 0 rgba(242,169,59,0.5); }
    50%     { box-shadow: 0 0 0 2px rgba(242,169,59,0.7), 0 0 0 14px rgba(242,169,59,0); }
  }
  .callout { position: absolute; z-index: 5; width: max-content; max-width: 260px; pointer-events: none;
             background: #fff; color: var(--ink); border-radius: 12px; padding: 12px 14px; line-height: 1.4;
             box-shadow: 0 14px 40px rgba(0,0,0,0.4); }
  .callout b { display: block; font-size: 14px; font-weight: 700; margin-bottom: 3px; }
  .callout span { display: block; font-size: 12.5px; color: #50505a; }
  .callout::after { content: ''; position: absolute; width: 12px; height: 12px; background: #fff; transform: rotate(45deg); }
  .callout.top::after    { bottom: -5px; left: 50%; margin-left: -6px; }
  .callout.bottom::after { top: -5px; left: 50%; margin-left: -6px; }
  .callout.left::after   { right: -5px; top: 50%; margin-top: -6px; }
  .callout.right::after  { left: -5px; top: 50%; margin-top: -6px; }
  #bar { display: flex; align-items: center; gap: 14px; }
  #bar button { border: 0; cursor: pointer; font: inherit; font-weight: 600; border-radius: 999px; padding: 9px 18px;
                background: #fff; color: var(--ink); transition: transform .12s, opacity .12s; }
  #bar button:hover:not(:disabled) { transform: translateY(-1px); }
  #bar button:disabled { opacity: .35; cursor: default; }
  #prev { background: rgba(255,255,255,0.12); color: #fff; }
  #dots { display: flex; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.28); cursor: pointer; border: 0; padding: 0; }
  .dot.on { background: var(--accent); box-shadow: 0 0 0 3px rgba(242,169,59,0.25); }
  #count { font-size: 13px; color: rgba(255,255,255,0.6); min-width: 46px; text-align: center; }
  #empty { color: rgba(255,255,255,0.6); font-size: 15px; }
  #auto { position: absolute; left: 0; bottom: 0; height: 3px; width: 0; background: var(--accent); }
</style>
</head>
<body>
  <div id="stage"><div id="screen"><img id="frame" alt="Tour step"><div id="auto"></div></div></div>
  <div id="bar">
    <button id="prev" aria-label="Previous">‹ Back</button>
    <div id="dots"></div>
    <span id="count"></span>
    <button id="next" aria-label="Next">Next ›</button>
  </div>
<script id="tour-data" type="application/json">${data}</script>
<script>
(function () {
  var STEPS = JSON.parse(document.getElementById('tour-data').textContent || '[]');
  var stage = document.getElementById('stage'), frame = document.getElementById('frame');
  var dots = document.getElementById('dots'), count = document.getElementById('count');
  var prev = document.getElementById('prev'), next = document.getElementById('next');
  var auto = document.getElementById('auto'), i = 0, timer = null, rafId = 0;

  if (!STEPS.length) { document.body.innerHTML = '<p id="empty">This tour has no steps yet.</p>'; return; }

  STEPS.forEach(function (s, n) {
    var d = document.createElement('button'); d.className = 'dot'; d.title = 'Step ' + (n + 1);
    d.onclick = function () { go(n); }; dots.appendChild(d);
  });

  function clearOverlays() {
    [].slice.call(stage.querySelectorAll('.hs,.callout')).forEach(function (e) { e.remove(); });
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    auto.style.width = '0';
  }

  function place(callout, hs) {
    // Pin the callout to the chosen side of the hotspot, in % of the stage.
    var cx = hs.x + hs.w / 2, cy = hs.y + hs.h / 2, side = (hs.callout && hs.callout.side) || 'bottom';
    // Auto-flip toward the interior so a callout never points off the frame edge
    // (e.g. a 'bottom' callout on a hotspot near the bottom flips to 'top').
    if (side === 'bottom' && hs.y + hs.h > 0.74) side = 'top';
    else if (side === 'top' && hs.y < 0.26) side = 'bottom';
    else if (side === 'right' && hs.x + hs.w > 0.7) side = 'left';
    else if (side === 'left' && hs.x < 0.3) side = 'right';
    callout.className = 'callout ' + side;
    if (side === 'top')    { callout.style.left = (cx * 100) + '%'; callout.style.top = (hs.y * 100) + '%'; callout.style.transform = 'translate(-50%,calc(-100% - 12px))'; }
    else if (side === 'bottom') { callout.style.left = (cx * 100) + '%'; callout.style.top = ((hs.y + hs.h) * 100) + '%'; callout.style.transform = 'translate(-50%,12px)'; }
    else if (side === 'left')   { callout.style.left = (hs.x * 100) + '%'; callout.style.top = (cy * 100) + '%'; callout.style.transform = 'translate(calc(-100% - 12px),-50%)'; }
    else { callout.style.left = ((hs.x + hs.w) * 100) + '%'; callout.style.top = (cy * 100) + '%'; callout.style.transform = 'translate(12px,-50%)'; }
  }

  function go(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    var s = STEPS[i];
    clearOverlays();
    frame.src = s.img;
    (s.hotspots || []).forEach(function (hs) {
      var b = document.createElement('button'); b.className = 'hs';
      b.style.left = (hs.x * 100) + '%'; b.style.top = (hs.y * 100) + '%';
      b.style.width = (hs.w * 100) + '%'; b.style.height = (hs.h * 100) + '%';
      if (hs.label) b.title = hs.label;
      b.onclick = function () { advance(); };
      stage.appendChild(b);
      if (hs.callout && (hs.callout.title || hs.callout.body)) {
        var c = document.createElement('div');
        c.innerHTML = (hs.callout.title ? '<b></b>' : '') + (hs.callout.body ? '<span></span>' : '');
        if (hs.callout.title) c.querySelector('b').textContent = hs.callout.title;
        if (hs.callout.body) c.querySelector('span').textContent = hs.callout.body;
        stage.appendChild(c); place(c, hs);
      }
    });
    [].slice.call(dots.children).forEach(function (d, n2) { d.className = 'dot' + (n2 === i ? ' on' : ''); });
    count.textContent = (i + 1) + ' / ' + STEPS.length;
    prev.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? '↺ Replay' : 'Next ›';
    if (s.autoAdvanceMs > 0 && i < STEPS.length - 1) startAuto(s.autoAdvanceMs);
  }

  function startAuto(ms) {
    var t0 = null;
    function tick(t) { if (t0 === null) t0 = t; var p = Math.min(1, (t - t0) / ms); auto.style.width = (p * 100) + '%'; if (p < 1) rafId = requestAnimationFrame(tick); }
    rafId = requestAnimationFrame(tick);
    timer = setTimeout(advance, ms);
  }

  function advance() { if (i >= STEPS.length - 1) go(0); else go(i + 1); }

  prev.onclick = function () { go(i - 1); };
  next.onclick = function () { advance(); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
  });
  go(0);
})();
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
