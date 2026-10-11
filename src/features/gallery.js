// v11.3 — Community template & Brand Kit gallery.
//
// Publish the current design (or Brand Kit) to a public Supabase `gallery`
// table with a rendered thumbnail in Storage; browse everyone's submissions and
// apply one in a click. Built entirely on the existing cloud layer:
//   - serialize.js snapshotProject() for template payloads
//   - brand-kit.js captureKitObject()/applyKitObject() for brand-kit payloads
//   - share.js-style Storage upload for thumbnails
//   - the loadProject() apply path (Object.assign → render → __updateUIFromState)
//
// Public read is open (RLS: select using true); insert/delete are restricted to
// the author (auth.uid() = author_id), so signed-out users can browse but not
// publish — enforced in the DB and gated in the UI.

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { saveStateToHistory } from '../state/history.js';
import { getClient, getUser } from './auth.js';
import { snapshotProject } from '../state/serialize.js';
import { applyKitObject, captureKitObject } from './brand-kit.js';
import { escapeHTML } from '../utils/dom.js';
import { revealSection } from './studio-nav.js';

const GALLERY_BUCKET = 'gallery';

async function ensureBucket(client) {
  const { data } = await client.storage.getBucket(GALLERY_BUCKET);
  if (!data) {
    await client.storage.createBucket(GALLERY_BUCKET, { public: true, fileSizeLimit: 5242880 });
  }
}

function thumbnailBlob() {
  // Reuse the export render so the thumbnail matches what ships.
  render(true);
  return new Promise((resolve) => el.previewCanvas.toBlob(resolve, 'image/png'));
}

// ---- publish --------------------------------------------------------------

async function publish(kind) {
  const client = await getClient();
  const user = getUser();
  if (!client || !user) { showNotification('Sign in to publish to the gallery.', 'error'); return; }

  const nameInput = document.getElementById('gallery-name');
  const name = (nameInput?.value || '').trim();
  if (!name) { showNotification('Name your submission first.', 'error'); return; }
  if (kind === 'template' && !state.image) { showNotification('Load a screenshot first.', 'error'); return; }

  setGalleryStatus('Publishing…');
  try {
    await ensureBucket(client);
    const blob = await thumbnailBlob();
    const path = `${user.id}/${Date.now()}.png`;
    const { error: upErr } = await client.storage
      .from(GALLERY_BUCKET)
      .upload(path, blob, { contentType: 'image/png', upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = client.storage.from(GALLERY_BUCKET).getPublicUrl(path);

    const payload = kind === 'brandkit' ? captureKitObject() : snapshotProject();
    const { error: insErr } = await client.from('gallery').insert({
      author_id: user.id,
      kind,
      name,
      payload,
      preview_url: urlData.publicUrl
    });
    if (insErr) throw insErr;

    if (nameInput) nameInput.value = '';
    setGalleryStatus('Published!');
    showNotification('Published to the community gallery.', 'success');
    await browse();
  } catch (e) {
    console.error(e);
    setGalleryStatus('Failed.');
    showNotification('Publish failed: ' + (e.message || e), 'error');
  }
}

// ---- browse + apply -------------------------------------------------------

let lastItems = [];

async function browse() {
  const client = await getClient();
  const listEl = document.getElementById('gallery-list');
  if (!listEl) return;
  if (!client) { listEl.innerHTML = '<p class="info-text">Connect Supabase to browse the gallery.</p>'; return; }

  setGalleryStatus('Loading…');
  const search = (document.getElementById('gallery-search')?.value || '').trim();
  let query = client.from('gallery').select('id, kind, name, preview_url, author_id, created_at')
    .order('created_at', { ascending: false }).limit(60);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) { setGalleryStatus('Failed.'); listEl.innerHTML = `<p class="info-text">${escapeHTML(error.message)}</p>`; return; }

  lastItems = data || [];
  setGalleryStatus('');
  if (!lastItems.length) { listEl.innerHTML = '<p class="info-text">Nothing published yet. Be the first!</p>'; return; }

  listEl.innerHTML = lastItems.map((it) => `
    <div class="gallery-card" data-id="${it.id}" style="cursor:pointer;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:8px;">
      <div style="aspect-ratio:16/10;background:var(--bg-tertiary);">${it.preview_url ? `<img src="${escapeHTML(it.preview_url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">` : ''}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;gap:8px;">
        <span style="font-size:12px;font-weight:500;">${escapeHTML(it.name)}</span>
        <span style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;">${it.kind === 'brandkit' ? 'Brand Kit' : 'Template'}</span>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('.gallery-card').forEach((card) => {
    card.addEventListener('click', () => applyItem(card.dataset.id));
  });
}

async function applyItem(id) {
  const client = await getClient();
  if (!client) return;
  const meta = lastItems.find((x) => String(x.id) === String(id));
  const { data, error } = await client.from('gallery').select('kind, payload').eq('id', id).single();
  if (error) { showNotification('Could not load that item.', 'error'); return; }

  if ((data.kind || meta?.kind) === 'brandkit') {
    applyKitObject(data.payload);
  } else {
    saveStateToHistory();
    Object.assign(state, data.payload);
    render();
    if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
  }
  showNotification(`Applied "${meta?.name || 'item'}". Undo if needed.`, 'success');
}

function setGalleryStatus(msg) {
  const s = document.getElementById('gallery-status');
  if (s) s.textContent = msg || '';
}

// ---- bind -----------------------------------------------------------------

export function openGalleryBrowse() {
  const panel = document.getElementById('gallery-panel');
  if (panel) {
    revealSection(panel);     // v35 — switches to the Project tab, even in Simple mode
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  browse();
}

export function bindGallery() {
  document.getElementById('gallery-publish-template')?.addEventListener('click', () => publish('template'));
  document.getElementById('gallery-publish-brandkit')?.addEventListener('click', () => publish('brandkit'));
  document.getElementById('gallery-browse-btn')?.addEventListener('click', browse);
  const search = document.getElementById('gallery-search');
  if (search) search.addEventListener('input', () => { clearTimeout(search._t); search._t = setTimeout(browse, 300); });
}
