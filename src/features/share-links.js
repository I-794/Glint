// v41 — Share links (Iris). Turns the current design, the Interactive Tour, or
// the Before / After compare into a public /s/<id> link: renders the frames,
// reserves an id and file plan with /api/share-create, uploads each file
// straight to Vercel Blob through a presigned URL from /api/share-upload,
// publishes the manifest with /api/share-commit, and keeps a "Your links" list
// (with each link's owner key) in glint_shares.

import { state } from '../state/state.js';
import { renderInto } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { askConfirm } from '../ui/dialog.js';
import { revealSection } from './studio-nav.js';
import { collectTourSteps } from './tour-export.js';
import { collectCompareFrames, comparePlayerSettings } from './compare-export.js';
import { activeProjectName } from './projects.js';
import { pageCount } from './pages.js';
import { generateEmbedCode, generateQR } from './share.js';
import { makePoster } from '../share/share-poster.js';
import { LIMITS, EXPIRY } from '../share/share-core.js';
import { renderRollShots } from './roll.js';
import { renderSnapshotFull } from '../render/history-thumbs.js';
import { ensureCompareImage } from '../render/compare.js';
import { escapeHTML } from '../utils/dom.js';
import { track } from './analytics.js';

const STORE_KEY = 'glint_shares';
const MAX_RECORDS = 50;
const MAX_EDGE = 4096;
const STALL_MS = 20000;
// v42 — `roll` and `pins` are what the panel offers; both publish a `gallery`.
const KIND_NAME = { image: 'Design', tour: 'Tour', compare: 'Before / after', roll: 'Roll', pins: 'Pins' };
const KIND_ORDER = ['image', 'tour', 'compare', 'roll', 'pins'];
const EXPIRY_KEY = 'glint_share_expiry';

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

// A small copy of a frame, for the gallery poster.
function tileOf(canvas) {
  const s = Math.min(1, 640 / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

const baseName = (name) => String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, LIMITS.label);

// v42 — the Roll's shots or this page's Pins, as a gallery.
async function collectGallery(source, onStage, signal) {
  if (state.mode !== 'single') throw new Error(source === 'roll' ? 'The Roll works in Single mode.' : 'Pins work in Single mode.');
  const items = [];
  const tiles = [];
  const add = async (canvas, label) => {
    const frame = capped(canvas);
    if (tiles.length < 4) tiles.push(tileOf(frame));
    items.push({ blob: await encodeBlob(frame), w: frame.width, h: frame.height, label });
  };
  let note = '';
  if (source === 'roll') {
    const { rendered, total } = await renderRollShots(async (canvas, shot, i, n) => {
      onStage && onStage(`Rendering shot ${i + 1} of ${n}…`);
      await add(canvas, baseName(shot.name));
    }, { signal, limit: LIMITS.items });
    if (!rendered) throw new Error('Add screenshots to the roll first.');
    if (total > rendered) note = `A link holds up to ${LIMITS.items} images, so it has the first ${rendered} of ${total} shots.`;
  } else {
    if (!state.image) throw new Error('Load a screenshot first.');
    const pins = (Array.isArray(state.versions) ? state.versions : []).slice(0, LIMITS.items);
    if (!pins.length) throw new Error('Pin a step in History first.');
    for (let i = 0; i < pins.length; i++) {
      if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      onStage && onStage(`Rendering pin ${i + 1} of ${pins.length}…`);
      const snap = pins[i].snap;
      await ensureCompareImage(snap && snap.compare && snap.compare.beforeSrc);
      const canvas = renderSnapshotFull(snap);
      if (canvas) await add(canvas, String(pins[i].name || '').slice(0, LIMITS.label));
      await new Promise((r) => setTimeout(r, 0));
    }
    // A pin's own Before image was loaded for its render; put the design's back.
    await ensureCompareImage(state.compare && state.compare.beforeSrc);
    if (!items.length) throw new Error('The pins could not be rendered.');
  }
  return {
    kind: 'gallery',
    note,
    files: items.map((it) => it.blob),
    poster: makePoster('gallery', tiles, { count: items.length }),
    build: (names) => ({ gallery: { source, items: items.map((it, i) => ({ src: names[i], w: it.w, h: it.h, label: it.label })) } }),
  };
}

// Renders what `kind` shares. Returns { files: [Blob], poster: canvas, build(names) -> manifest body }.
// v42 — a job may name the manifest `kind` it publishes (roll and pins both
// publish a gallery) and carry a `note` for the person.
async function collect(kind, onStage, signal) {
  if (kind === 'roll' || kind === 'pins') return collectGallery(kind, onStage, signal);
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
              ...(Number.isInteger(h.goto) ? { goto: h.goto } : {}),
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

export async function createShareLink(kind, { title = '', expiresIn = 'never', onProgress, onStage, signal } = {}) {
  if (!(await shareStatus())) throw new Error('Links are not set up on this site.');
  onStage && onStage('Rendering…');
  const job = await collect(kind, onStage, signal);
  const manifestKind = job.kind || kind;
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
    kind: manifestKind,
    files: job.files.map((f) => ({ type: f.type, size: f.size })),
    poster: { type: posterBlob.type, size: posterBlob.size },
  }, signal);

  const { uploadPresigned } = await import('@vercel/blob/client');
  // The Blob client retries a failing request ten times with growing waits
  // (minutes in all). If no bytes move for STALL_MS, stop and say so instead.
  const uploadCtl = new AbortController();
  const onUserAbort = () => uploadCtl.abort();
  if (signal) signal.addEventListener('abort', onUserAbort);
  let lastMove = Date.now(), stalled = false;
  const watchdog = setInterval(() => {
    if (Date.now() - lastMove > STALL_MS) { stalled = true; uploadCtl.abort(); }
  }, 1000);
  const loaded = new Array(all.length).fill(0);
  const report = () => { lastMove = Date.now(); onProgress && onProgress(Math.min(1, loaded.reduce((s, n) => s + n, 0) / total)); };
  const urls = new Array(all.length);
  // Three at a time keeps a long tour quick without flooding the connection.
  let next = 0;
  async function worker() {
    while (next < all.length) {
      const i = next++;
      const u = created.uploads[i];
      // The Blob client asks /api/share-upload for a presigned PUT bound to
      // this path, type and size, then sends the bytes straight to Blob.
      const res = await uploadPresigned(u.pathname, all[i], {
        access: 'public',
        handleUploadUrl: '/api/share-upload',
        clientPayload: JSON.stringify({ id: created.id, key: created.key }),
        contentType: u.contentType,
        abortSignal: uploadCtl.signal,
        onUploadProgress: (p) => { loaded[i] = p.loaded; report(); },
      });
      loaded[i] = all[i].size;
      urls[i] = res.url;
      report();
    }
  }
  try {
    await Promise.all([worker(), worker(), worker()]);
  } catch (e) {
    if (stalled) {
      const err = new Error('The upload stalled. Check your connection and try again.');
      err.name = 'UploadStalled';
      throw err;
    }
    throw e;
  } finally {
    clearInterval(watchdog);
    if (signal) signal.removeEventListener('abort', onUserAbort);
  }

  onStage && onStage('Publishing…');
  const names = created.uploads.map((u) => u.name);
  const fileNames = names.slice(0, job.files.length);
  const manifest = { kind: manifestKind, title, poster: names[names.length - 1], ...job.build(fileNames) };
  const committed = await postJson('/api/share-commit', {
    id: created.id, key: created.key, manifest,
    expiresIn: Object.prototype.hasOwnProperty.call(EXPIRY, expiresIn) ? expiresIn : 'never',
  }, signal);

  const rec = {
    id: created.id,
    kind,
    title,
    url: committed.url,
    key: created.key,
    createdAt: new Date().toISOString(),
    expiresAt: committed.expiresAt || null,   // v42
    note: job.note || '',
    imageUrl: kind === 'image' ? urls[0] : null,
    posterUrl: urls[urls.length - 1],
    w: job.poster.width,
    h: job.poster.height,
    thumb: thumbOf(job.poster),
  };
  writeShares([rec, ...readShares().filter((r) => r.id !== rec.id)]);
  track('share_link', { kind });
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
    roll: state.mode === 'single' && !!(window.__rollCommands && window.__rollCommands.hasShots()),
    pins: state.mode === 'single' && !!state.image && Array.isArray(state.versions) && state.versions.length > 0,
  };
  // Called from render(), so only touch the DOM when something changed.
  const key = `${can.image}${can.tour}${can.compare}${can.roll}${can.pins}${!!running}`;
  if (key === lastKindsKey && force !== true) return;
  lastKindsKey = key;
  const why = {
    image: 'Load a screenshot first',
    tour: 'Add a second page to make a tour',
    compare: 'Set a Before image in Before / After first',
    roll: 'Add screenshots to the Roll first',
    pins: 'Pin a step in History first',
  };
  const what = { image: 'Share this design', tour: 'Share the tour', compare: 'Share the before / after', roll: 'Share every shot in the Roll', pins: "Share this page's pins" };
  document.querySelectorAll('.share-kind-btn').forEach((btn) => {
    const k = btn.dataset.kind;
    btn.disabled = !can[k];
    btn.title = can[k] ? what[k] : why[k];
  });
  if (!can[currentKind]) {
    const first = KIND_ORDER.find((k) => can[k]);
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

// v42 — "Expires in 6 days", "Expires today", "Expired", or '' for no expiry.
function expiryText(rec) {
  const t = rec && rec.expiresAt ? Date.parse(rec.expiresAt) : NaN;
  if (!Number.isFinite(t)) return '';
  const left = t - Date.now();
  if (left <= 0) return 'Expired';
  const days = Math.round(left / (24 * 60 * 60 * 1000));
  if (days < 1) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
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
    const exp = expiryText(rec);
    meta.textContent = `${KIND_NAME[rec.kind] || ''}, ${relTime(rec.createdAt)}${exp ? `. ${exp}` : ''}`;
    if (exp === 'Expired') row.classList.add('expired');
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
        if (!await askConfirm('Delete this link?', { message: 'Anyone who has it will see that it is gone. This cannot be undone.', okLabel: 'Delete', danger: true })) return;
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

// Turns network, server and Blob client errors into one plain sentence.
function friendlyError(e) {
  if (!e) return 'Something went wrong.';
  if (e.status === 501) return 'Links are not set up on this site.';
  if (e.status === 409) return 'That link was already published. Try again for a new one.';
  if (e.status === 429) return 'Too many links in a short time. Wait a minute and try again.';
  if (e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'Could not reach Glint. Check your connection and try again.';
  if (e.name === 'UploadStalled') return e.message;
  if (e.name === 'BlobClientTokenExpiredError') return 'The upload took too long. Try again.';
  if (e.name === 'BlobFileTooLargeError') return 'One of the images is too large. Make the canvas smaller and try again.';
  if (/private access|private store/i.test(String(e.message))) return 'Link storage is set to private. Share links need a public Blob store.';
  if (typeof e.name === 'string' && e.name.startsWith('Blob')) return 'The upload failed. Try again.';
  return e.message || 'Something went wrong.';
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
  const expiryInput = $('share-expiry');
  const expiresIn = (expiryInput && expiryInput.value) || 'never';
  const controller = new AbortController();
  running = controller;
  setBusy(true, 'Rendering…');
  try {
    const rec = await createShareLink(kind, {
      title,
      expiresIn,
      signal: controller.signal,
      onStage: setStatus,
      onProgress: setProgress,
    });
    setBusy(false, rec.note || '');
    showResult(rec);
    renderList();
    // Storage full or blocked: the link works, but this browser cannot keep
    // its delete key, so the manage link is the only way to remove it later.
    if (!readShares().some((r) => r.id === rec.id)) {
      setStatus('This browser could not save the link to Your links. Copy the manage link now if you may want to delete it later.');
    }
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
    const msg = friendlyError(e);
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

  // v42 — the expiry choice is remembered for the next link.
  const expiry = $('share-expiry');
  if (expiry) {
    try { const saved = localStorage.getItem(EXPIRY_KEY); if (saved && Object.prototype.hasOwnProperty.call(EXPIRY, saved)) expiry.value = saved; } catch (_) { /* private mode */ }
    expiry.addEventListener('change', () => { try { localStorage.setItem(EXPIRY_KEY, expiry.value); } catch (_) { /* private mode */ } });
  }

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
