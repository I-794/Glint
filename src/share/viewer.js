// v41 — Share viewer (/s/<id>). Reads the manifest the page was served with
// (api/share-page.js fills #share-data), or fetches it, checks it again with
// the same normalizer the server uses, and mounts the matching player. Every
// string reaches the page through textContent; every image is a file name
// resolved under this share's own folder.
import './viewer.css';
import './tour-player.css';
import './compare-player.css';
import { mountTour } from './tour-player.js';
import { mountCompare } from './compare-player.js';
import { normalizeManifest, isShareId } from './share-core.js';

const $ = (id) => document.getElementById(id);
const app = $('share-app');
const params = new URLSearchParams(location.search);
const embed = params.get('embed') === '1';
if (embed) document.documentElement.classList.add('is-embed');

// The owner key rides in the hash (never sent to the server by the browser).
// Read it once, then take it out of the address bar.
let ownerKey = null;
const keyMatch = location.hash.match(/(?:^#|&)key=([A-Za-z0-9_-]{20,})/);
if (keyMatch) {
  ownerKey = keyMatch[1];
  history.replaceState(null, '', location.pathname + location.search);
}

function shareIdFromUrl() {
  const m = location.pathname.match(/^\/s\/([A-Za-z0-9]{12})\/?$/);
  const id = m ? m[1] : params.get('id');
  return isShareId(id) ? id : null;
}

const KIND_LABEL = { image: 'A design', tour: 'An interactive tour', compare: 'A before and after' };

function setTitle(text) {
  $('sv-title').textContent = text || '';
  document.title = text ? `${text} · Glint` : 'Shared from Glint';
}

function clear() {
  app.innerHTML = '';
  $('sv-kind').textContent = '';
  $('sv-links').innerHTML = '';
}

function stateBlock({ heading, body, action }) {
  clear();
  const box = document.createElement('div');
  box.className = 'sv-state sv-enter';
  const h = document.createElement('h2');
  h.textContent = heading;
  const p = document.createElement('p');
  p.textContent = body;
  box.append(h, p);
  if (action) box.append(action);
  app.append(box);
}

function showGone(heading = 'This link is gone.') {
  setTitle('');
  document.title = 'Link not found · Glint';
  $('sv-owner').hidden = true;
  document.body.classList.remove('has-owner');
  stateBlock({ heading, body: 'It was removed, or it never existed. You can still make your own in the editor.' });
}

function showError(retry) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sv-btn-line';
  btn.textContent = 'Try again';
  btn.onclick = retry;
  stateBlock({ heading: 'This link did not load.', body: 'Check your connection and try again.', action: btn });
}

function link(text, href, extra = {}) {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  Object.assign(a, extra);
  return a;
}

// The folder URL must be https and end with this share's own prefix.
function checkedBase(base, id) {
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:' || !u.pathname.endsWith(`/shares/${id}/`)) return null;
    return u.href;
  } catch (_) {
    return null;
  }
}

function render(manifest, base, report) {
  clear();
  const url = (name) => new URL(name, base).href;
  setTitle(manifest.title);
  $('sv-kind').textContent = manifest.kind === 'tour'
    ? `Interactive tour, ${manifest.tour.steps.length} step${manifest.tour.steps.length === 1 ? '' : 's'}`
    : manifest.kind === 'compare' ? 'Before and after. Drag the divider.' : KIND_LABEL.image;

  const stage = document.createElement('div');
  stage.className = 'sv-enter';
  stage.style.display = 'flex';
  stage.style.justifyContent = 'center';
  stage.style.width = '100%';

  if (manifest.kind === 'image') {
    const fig = document.createElement('figure');
    fig.className = 'sv-figure';
    const img = document.createElement('img');
    img.className = 'sv-image';
    img.src = url(manifest.image.src);
    img.width = manifest.image.w;
    img.height = manifest.image.h;
    img.alt = manifest.image.alt || manifest.title || 'Shared design';
    img.decoding = 'async';
    fig.append(img);
    stage.append(fig);
    $('sv-links').append(link('Open full size', img.src, { target: '_blank', rel: 'noopener' }));
  } else if (manifest.kind === 'tour') {
    const root = document.createElement('div');
    stage.append(root);
    app.append(stage);
    mountTour(root, manifest.tour.steps.map((s) => ({ ...s, img: url(s.src) })));
  } else {
    const c = manifest.compare;
    const root = document.createElement('div');
    stage.append(root);
    app.append(stage);
    mountCompare(root, { ...c, beforeUrl: url(c.before), afterUrl: url(c.after) });
  }
  if (!stage.isConnected) app.append(stage);

  if (report) {
    const subject = encodeURIComponent(`Report a Glint link: ${manifest.id}`);
    const body = encodeURIComponent(`${location.origin}/s/${manifest.id}\n\nWhat is wrong with it:\n`);
    $('sv-links').append(link('Report this link', `mailto:${report}?subject=${subject}&body=${body}`));
  }
}

function bindOwner(id) {
  if (!ownerKey || embed) return;
  $('sv-owner').hidden = false;
  document.body.classList.add('has-owner');
  const btn = $('sv-delete');
  const dlg = $('sv-confirm');
  // A native <dialog>; focus starts on "Keep it", so Enter alone never deletes.
  const askDelete = () => new Promise((resolve) => {
    if (!dlg || typeof dlg.showModal !== 'function') { resolve(confirm('Delete this link? This cannot be undone.')); return; }
    const done = (ok) => { dlg.close(); resolve(ok); };
    $('sv-confirm-cancel').onclick = () => done(false);
    dlg.querySelector('form').onsubmit = (e) => { e.preventDefault(); done(true); };
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };
    dlg.onclick = (e) => { if (e.target === dlg) done(false); };
    dlg.showModal();
  });
  btn.onclick = async () => {
    if (!await askDelete()) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
      const r = await fetch('/api/share-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, key: ownerKey }),
      });
      if (r.status === 204 || r.status === 404) { showGone('Link deleted.'); return; }
      const msg = r.status === 403 ? 'That delete key does not match this link.' : 'Could not delete the link. Try again.';
      btn.textContent = 'Delete link';
      btn.disabled = false;
      alert(msg);
    } catch (_) {
      btn.textContent = 'Delete link';
      btn.disabled = false;
      alert('Could not reach Glint. Check your connection and try again.');
    }
  };
}

function inlineData() {
  const raw = ($('share-data').textContent || '').trim();
  if (!raw || raw.startsWith('<!--')) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function accept(data, id) {
  try {
    const manifest = normalizeManifest(data.manifest, { id });
    const base = checkedBase(data.base, id);
    if (!base) throw new Error('bad base');
    render(manifest, base, typeof data.report === 'string' && data.report.includes('@') ? data.report : null);
    bindOwner(id);
  } catch (e) {
    console.error('[share] bad manifest', e);
    showGone();
  }
}

async function load() {
  const id = shareIdFromUrl();
  if (!id) { showGone(); return; }
  const inline = inlineData();
  if (inline) {
    if (inline.missing) showGone(); else accept(inline, id);
    return;
  }
  try {
    const r = await fetch(`/api/share-manifest?id=${encodeURIComponent(id)}`);
    if (r.status === 404 || r.status === 400) { showGone(); return; }
    if (r.status === 501) {
      stateBlock({ heading: 'Links are not set up here.', body: 'This copy of Glint is not connected to link storage.' });
      return;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    accept(await r.json(), id);
  } catch (e) {
    console.error('[share] load failed', e);
    showError(() => { app.innerHTML = '<div class="sv-skeleton" aria-hidden="true"></div>'; load(); });
  }
}

load();
