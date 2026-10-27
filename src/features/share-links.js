// v41 — Share links (Iris). Turns the current design, the Interactive Tour, or
// the Before / After compare into a public /s/<id> link: renders the frames,
// uploads them straight to Vercel Blob with per-file tokens from
// /api/share-create, publishes the manifest with /api/share-commit, and keeps a
// "Your links" list (with each link's owner key) in glint_shares.

import { state } from '../state/state.js';
import { renderInto } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { revealSection } from './studio-nav.js';
import { collectTourSteps } from './tour-export.js';
import { collectCompareFrames, comparePlayerSettings } from './compare-export.js';
import { activeProjectName } from './projects.js';
import { pageCount } from './pages.js';
import { generateEmbedCode, generateQR } from './share.js';
import { makePoster } from '../share/share-poster.js';
import { LIMITS } from '../share/share-core.js';
import { escapeHTML } from '../utils/dom.js';

const STORE_KEY = 'glint_shares';
const MAX_RECORDS = 50;
const MAX_EDGE = 4096;
const KIND_NAME = { image: 'Design', tour: 'Tour', compare: 'Before / after' };

// ── status ───────────────────────────────────────────────────────────────────

let statusPromise = null;
export function shareStatus() {
  if (!statusPromise) {
    statusPromise = fetch('/api/share-status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => !!(j && j.enabled))
      .catch(() => false);
  }
  return statusPromise;
}

// ── records (glint_shares) ───────────────────────────────────────────────────

export function readShares() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string' && typeof r.url === 'string') : [];
  } catch (_) {
    return [];
  }
}

function writeShares(list) {
  let next = list.slice(0, MAX_RECORDS);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      return true;
    } catch (_) {
      // Quota: drop thumbnails from the oldest half, then all of them.
      next = next.map((r, i) => (attempt > 0 || i >= next.length / 2 ? { ...r, thumb: null } : r));
    }
  }
  return false;
}

export const manageUrl = (rec) => `${rec.url}#key=${rec.key}`;

// ── rendering ────────────────────────────────────────────────────────────────

function capped(canvas) {
  const long = Math.max(canvas.width, canvas.height);
  if (long <= MAX_EDGE) return canvas;
  const s = MAX_EDGE / long;
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * s);
  out.height = Math.round(canvas.height * s);
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function copyCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// WebP where the browser can write it (alpha survives), PNG otherwise.
function encodeBlob(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp && webp.type === 'image/webp') { resolve(webp); return; }
      canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('Could not encode the image.'))), 'image/png');
    }, 'image/webp', quality);
  });
}

function thumbOf(canvas) {
  const w = 96, h = Math.max(1, Math.round(96 * canvas.height / canvas.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, 0, 0, w, h);
  try { return c.toDataURL('image/jpeg', 0.7); } catch (_) { return null; }
}

// Renders what `kind` shares. Returns { files: [Blob], poster: canvas, build(names) -> manifest body }.
async function collect(kind, onStage) {
  if (kind === 'image') {
    if (!state.image) throw new Error('Load a screenshot first.');
    const off = document.createElement('canvas');
    renderInto(off, true);
    const frame = capped(off);
    const blob = await encodeBlob(frame);
    return {
      files: [blob],
      poster: makePoster('image', [frame]),
      build: (names) => ({ image: { src: names[0], w: frame.width, h: frame.height, alt: '' } }),
    };
  }

  if (kind === 'tour') {
    if (state.mode === 'board') throw new Error('Leave the board to share the tour.');
    let first = null;
    const steps = await collectTourSteps(
      (d, n) => onStage && onStage(`Rendering step ${d} of ${n}…`),
      async (canvas, i) => {
        const frame = capped(canvas);
        if (i === 0) first = copyCanvas(frame);
        return encodeBlob(frame);
      }
    );
    if (steps.length < 2) throw new Error('A tour needs at least two pages with screenshots.');
    if (steps.length > LIMITS.steps) throw new Error(`A shared tour can have up to ${LIMITS.steps} steps.`);
    return {
      files: steps.map((s) => s.img),
      poster: makePoster('tour', [first], { steps: steps.length }),
      build: (names) => ({
        tour: {
          steps: steps.map((s, i) => ({
            src: names[i], w: s.w, h: s.h, autoAdvanceMs: s.autoAdvanceMs,
            hotspots: (s.hotspots || []).slice(0, LIMITS.hotspots).map((h) => ({
              x: h.x, y: h.y, w: h.w, h: h.h, label: h.label || '',
              callout: h.callout ? { title: h.callout.title || '', body: h.callout.body || '', side: h.callout.side || 'bottom' } : null,
            })),
          })),
        },
      }),
    };
  }

  if (kind === 'compare') {
    const frames = await collectCompareFrames();
    if (!frames) throw new Error('quiet');
    const before = capped(frames.beforeCanvas);
    const after = capped(frames.afterCanvas);
    const [b, a] = await Promise.all([encodeBlob(before), encodeBlob(after)]);
    const settings = comparePlayerSettings(frames);
    return {
      files: [b, a],
      poster: makePoster('compare', [before, after]),
      build: (names) => ({ compare: { ...settings, before: names[0], after: names[1] } }),
    };
  }
  throw new Error('Unknown kind');
}

async function postJson(path, body, signal) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  let data = null;
  try { data = await r.json(); } catch (_) { /* 204 or non-JSON */ }
  if (!r.ok) {
    const err = new Error((data && data.error) || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return data;
}

// ── create / delete ──────────────────────────────────────────────────────────

export async function createShareLink(kind, { title = '', onProgress, onStage, signal } = {}) {
  if (!(await shareStatus())) throw new Error('Links are not set up on this site.');
  onStage && onStage('Rendering…');
  const job = await collect(kind, onStage);
  const posterBlob = await encodeBlob(job.poster, 0.86);
  const all = [...job.files, posterBlob];
  for (const f of all) {
    if (f.size > LIMITS.fileBytes) throw new Error('One of the images is over 8 MB. Make the canvas smaller and try again.');
  }
  const total = all.reduce((s, f) => s + f.size, 0);
  if (total > LIMITS.shareBytes) throw new Error('This share is over 40 MB. Try fewer steps or a smaller canvas.');
  if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');

  onStage && onStage('Uploading…');
  const created = await postJson('/api/share-create', {
    kind,
    files: job.files.map((f) => ({ type: f.type, size: f.size })),
    poster: { type: posterBlob.type, size: posterBlob.size },
  }, signal);

  const { put } = await import('@vercel/blob/client');
  const loaded = new Array(all.length).fill(0);
  const report = () => onProgress && onProgress(Math.min(1, loaded.reduce((s, n) => s + n, 0) / total));
  const urls = new Array(all.length);
  // Three at a time keeps a long tour quick without flooding the connection.
  let next = 0;
  async function worker() {
    while (next < all.length) {
      const i = next++;
      const u = created.uploads[i];
      const res = await put(u.pathname, all[i], {
        access: 'public',
        token: u.token,
        contentType: u.contentType,
        abortSignal: signal,
        onUploadProgress: (p) => { loaded[i] = p.loaded; report(); },
      });
      loaded[i] = all[i].size;
      urls[i] = res.url;
      report();
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  onStage && onStage('Publishing…');
  const names = created.uploads.map((u) => u.name);
  const fileNames = names.slice(0, job.files.length);
  const manifest = { kind, title, poster: names[names.length - 1], ...job.build(fileNames) };
  const committed = await postJson('/api/share-commit', { id: created.id, key: created.key, manifest }, signal);

  const rec = {
    id: created.id,
    kind,
    title,
    url: committed.url,
    key: created.key,
    createdAt: new Date().toISOString(),
    imageUrl: kind === 'image' ? urls[0] : null,
    posterUrl: urls[urls.length - 1],
    w: job.poster.width,
    h: job.poster.height,
    thumb: thumbOf(job.poster),
  };
  writeShares([rec, ...readShares().filter((r) => r.id !== rec.id)]);
  return rec;
}

export async function deleteShareLink(id) {
  const rec = readShares().find((r) => r.id === id);
  if (!rec) return false;
  try {
    await postJson('/api/share-delete', { id: rec.id, key: rec.key });
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  writeShares(readShares().filter((r) => r.id !== id));
  return true;
}

// ── panel ────────────────────────────────────────────────────────────────────

let currentKind = 'image';
let current = null;        // the record shown in the result card
let running = null;        // AbortController of the upload in flight

const $ = (id) => document.getElementById(id);

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    if (okMsg) showNotification(okMsg, 'success');
    return true;
  } catch (_) {
    showNotification('Could not copy. Select the link and copy it yourself.', 'error');
    return false;
  }
}

let lastKindsKey = '';
function refreshKinds(force) {
  const can = {
    image: !!state.image,
    tour: pageCount() >= 2,
    compare: !!(state.image && state.compare && state.compare.beforeSrc && !(state.video && state.video.loaded)),
  };
  // Called from render(), so only touch the DOM when something changed.
  const key = `${can.image}${can.tour}${can.compare}${!!running}`;
  if (key === lastKindsKey && force !== true) return;
  lastKindsKey = key;
  const why = {
    image: 'Load a screenshot first',
    tour: 'Add a second page to make a tour',
    compare: 'Set a Before image in Before / After first',
  };
  document.querySelectorAll('.share-kind-btn').forEach((btn) => {
    const k = btn.dataset.kind;
    btn.disabled = !can[k];
    btn.title = can[k] ? `Share the ${KIND_NAME[k].toLowerCase()}` : why[k];
  });
  if (!can[currentKind]) {
    const first = ['image', 'tour', 'compare'].find((k) => can[k]);
    if (first) setKind(first);
  }
  const btn = $('share-create-btn');
  if (btn && !running) btn.disabled = !can[currentKind];
}

function setKind(kind) {
  currentKind = kind;
  document.querySelectorAll('.share-kind-btn').forEach((btn) => {
    const on = btn.dataset.kind === kind;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
  });
}

function setBusy(on, msg) {
  const btn = $('share-create-btn');
  const prog = $('share-progress');
  if (btn) { btn.disabled = on; btn.textContent = on ? 'Creating…' : 'Create link'; }
  if (prog) prog.hidden = !on;
  if (on) setProgress(0);
  setStatus(msg || '');
}

function setProgress(p) {
  const fill = $('share-progress-fill');
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  const bar = $('share-progress');
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
}

function setStatus(msg) {
  const s = $('share-status');
  if (s) s.textContent = msg || '';
}

function showResult(rec) {
  current = rec;
  const box = $('share-result');
  if (!box) return;
  box.hidden = false;
  $('share-url').value = rec.url;
  const codes = $('embed-codes');
  if (codes) {
    codes.innerHTML = ['iframe', 'html', 'markdown'].map((f) =>
      `<div class="share-embed"><label class="control-label">${f === 'iframe' ? 'Embed' : f === 'html' ? 'HTML image' : 'Markdown'}</label>` +
      `<code>${escapeHTML(generateEmbedCode(rec, f))}</code></div>`).join('');
  }
  const qr = $('qr-container');
  if (qr) { qr.hidden = true; qr.innerHTML = ''; }
}

function relTime(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function renderList() {
  const list = $('share-list');
  if (!list) return;
  const recs = readShares();
  if (!recs.length) {
    list.innerHTML = '<p class="info-text share-empty">Links you make show up here.</p>';
    return;
  }
  list.innerHTML = '';
  recs.forEach((rec) => {
    const row = document.createElement('div');
    row.className = 'share-row';
    const thumb = document.createElement(rec.thumb ? 'img' : 'div');
    thumb.className = 'share-row-thumb';
    if (rec.thumb && /^data:image\/jpeg;base64,/.test(rec.thumb)) { thumb.src = rec.thumb; thumb.alt = ''; }
    const text = document.createElement('div');
    text.className = 'share-row-text';
    const t = document.createElement('div');
    t.className = 'share-row-title';
    t.textContent = rec.title || KIND_NAME[rec.kind] || 'Link';
    const meta = document.createElement('div');
    meta.className = 'share-row-meta';
    meta.textContent = `${KIND_NAME[rec.kind] || ''}, ${relTime(rec.createdAt)}`;
    text.append(t, meta);
    const actions = document.createElement('div');
    actions.className = 'share-row-actions';
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-row-btn';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', `${title}: ${t.textContent}`);
      b.onclick = fn;
      return b;
    };
    actions.append(
      mk('Copy', 'Copy link', () => copyText(rec.url, 'Link copied.')),
      mk('Open', 'Open link', () => window.open(rec.url, '_blank', 'noopener')),
      mk('Delete', 'Delete link', async (e) => {
        if (!confirm('Delete this link? Anyone who has it will see that it is gone. This cannot be undone.')) return;
        e.target.disabled = true;
        try {
          await deleteShareLink(rec.id);
          if (current && current.id === rec.id) { current = null; const box = $('share-result'); if (box) box.hidden = true; }
          renderList();
          showNotification('Link deleted. It may take up to an hour to clear from caches.', 'success');
        } catch (err) {
          e.target.disabled = false;
          showNotification(`Could not delete the link: ${err.message}`, 'error');
        }
      }),
    );
    row.append(thumb, text, actions);
    list.append(row);
  });
}

export async function startShare(kind = currentKind) {
  const section = $('share-section');
  if (section) revealSection(section);
  if (!(await shareStatus())) {
    showNotification('Links are not set up on this site. Downloads still work.', 'error');
    return null;
  }
  if (running) return null;
  setKind(kind);
  const titleInput = $('share-title');
  const title = (titleInput && titleInput.value.trim()) || '';
  const controller = new AbortController();
  running = controller;
  setBusy(true, 'Rendering…');
  try {
    const rec = await createShareLink(kind, {
      title,
      signal: controller.signal,
      onStage: setStatus,
      onProgress: setProgress,
    });
    setBusy(false, '');
    showResult(rec);
    renderList();
    const copied = await navigator.clipboard.writeText(rec.url).then(() => true, () => false);
    showNotification(copied ? 'Link copied.' : 'Link ready.', 'success', {
      action: { label: 'Open', run: () => window.open(rec.url, '_blank', 'noopener') },
    });
    return rec;
  } catch (e) {
    setBusy(false, '');
    // The Blob client reports a cancel with its own error type, so go by the signal.
    if (controller.signal.aborted || (e && e.name === 'AbortError')) { setStatus('Cancelled.'); return null; }
    if (e && e.message === 'quiet') return null;   // the collector already said why
    console.error('[share] create failed', e);
    const msg = e && e.status === 501 ? 'Links are not set up on this site.' : (e && e.message) || 'Something went wrong.';
    setStatus(msg);
    showNotification(`Could not create the link. ${msg}`, 'error');
    return null;
  } finally {
    running = null;
    refreshKinds(true);
  }
}

export function bindShareLinks() {
  const section = $('share-section');
  if (!section) return;

  document.querySelectorAll('.share-kind-btn').forEach((btn) => {
    btn.addEventListener('click', () => { if (!btn.disabled) setKind(btn.dataset.kind); });
  });
  // Arrow keys move between the kind options, like a radio group.
  const group = section.querySelector('.share-kind');
  if (group) {
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const btns = [...group.querySelectorAll('.share-kind-btn:not(:disabled)')];
      const i = btns.findIndex((b) => b.dataset.kind === currentKind);
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const nextBtn = btns[(i + d + btns.length) % btns.length];
      if (nextBtn) { e.preventDefault(); setKind(nextBtn.dataset.kind); nextBtn.focus(); }
    });
  }

  $('share-create-btn')?.addEventListener('click', () => startShare(currentKind));
  $('tour-share-btn')?.addEventListener('click', () => startShare('tour'));
  $('compare-share-btn')?.addEventListener('click', () => startShare('compare'));
  $('share-cancel-btn')?.addEventListener('click', () => { if (running) running.abort(); });
  $('share-copy-btn')?.addEventListener('click', () => current && copyText(current.url, 'Link copied.'));
  $('share-open-btn')?.addEventListener('click', () => current && window.open(current.url, '_blank', 'noopener'));
  $('share-manage-btn')?.addEventListener('click', () => current && copyText(manageUrl(current), 'Manage link copied. Anyone with it can delete the link.'));
  $('qr-btn')?.addEventListener('click', async () => {
    if (!current) return;
    const box = $('qr-container');
    try {
      const dataUrl = await generateQR(current.url);
      box.innerHTML = '';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'QR code for the link';
      img.className = 'share-qr';
      box.append(img);
      box.hidden = false;
    } catch (_) {
      showNotification('Could not make a QR code.', 'error');
    }
  });
  section.querySelectorAll('[data-copy-embed]').forEach((btn) => {
    btn.addEventListener('click', () => current && copyText(generateEmbedCode(current, btn.dataset.copyEmbed), 'Embed code copied.'));
  });
  $('share-url')?.addEventListener('focus', (e) => e.target.select());

  const titleInput = $('share-title');
  if (titleInput) {
    // Default to the project name until the person types their own title.
    let touched = false;
    titleInput.addEventListener('input', () => { touched = true; });
    const fill = () => { if (!touched) titleInput.value = activeProjectName(); };
    fill();
    section.addEventListener('pointerenter', fill);
    titleInput.addEventListener('focus', fill);
  }

  shareStatus().then((on) => {
    $('share-links-on').hidden = !on;
    $('share-links-off').hidden = on;
  });
  setKind('image');
  refreshKinds(true);
  renderList();
  window.__shareRefresh = refreshKinds;
  // Another tab may have made or deleted a link.
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) renderList(); });
}
