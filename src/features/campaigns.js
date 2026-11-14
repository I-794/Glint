// v30 — Campaign folder store. Mirrors projects.js: a localStorage map keyed by
// id. Stores each campaign's RECIPE (design payload + target list) plus small
// thumbnails — NOT full-res bytes (quota-safe). Full assets are regenerated from
// `payload` on download (deterministic), and cached in-session by the generator.

import { showNotification } from '../ui/notification.js';
import { askConfirm } from '../ui/dialog.js';

const KEY = 'glint_campaigns_v1';

export function loadCampaigns() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}

function writeAll(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; }
  catch (e) {
    showNotification('Storage full — could not save the campaign.', 'error');
    return false;
  }
}

export function saveCampaign(record) {
  const store = loadCampaigns();
  store[record.id] = record;
  return writeAll(store);
}

export function getCampaign(id) {
  return loadCampaigns()[id] || null;
}

export function deleteCampaign(id) {
  const store = loadCampaigns();
  delete store[id];
  writeAll(store);
}

// ---------------------------------------------------------------------------
// v30 — Campaign folder UI: a card list with thumbnails, ZIP download, reopen,
// and delete. The generate button feeds the (separate) campaign-generator.
// ---------------------------------------------------------------------------

import { downloadZip } from './batch-export.js';

const $ = (id) => document.getElementById(id);

// Re-render every asset for a saved campaign from its stored design payload.
// Used when the in-session byte cache is gone (e.g. after a reload). The payload
// is exactly what serializeFull() returns, applied through document.js's
// applyPayload (the real page-payload applier; it decodes the image + renders).
async function regenerateFiles(record) {
  const { applyDesignToState } = await import('./document.js');
  const { renderTargetsToFiles } = await import('./campaign-targets.js');
  const { renderSetPanels } = await import('./screenshot-set.js');
  const { render } = await import('../render/render.js');
  const { state } = await import('../state/state.js');
  const { serializeFull } = await import('../state/serialize.js');

  // Capture the user's current design so we can restore it after regenerating —
  // downloading a campaign must not silently swap what the editor is showing.
  const prevPayload = serializeFull();

  // applyDesignToState returns a promise that resolves on image decode (img.onload),
  // so awaiting it avoids rendering targets against a stale/blank state.image.
  await applyDesignToState(record.payload);
  render();

  const files = {};
  const t = await renderTargetsToFiles();
  Object.assign(files, t.files);
  if (record.appStore && state.screenshotSet && state.screenshotSet.panels && state.screenshotSet.panels.length) {
    const panels = await renderSetPanels();
    for (const p of panels) files[`appstore/${p.name}`] = new Uint8Array(await p.blob.arrayBuffer());
  }

  // Restore the user's original design. A restore failure must not lose `files`.
  try {
    await applyDesignToState(prevPayload);
    render();
  } catch (e) { /* keep the generated files even if restore fails */ }

  return files;
}

async function downloadCampaign(id) {
  const { getSessionAssets } = await import('./campaign-generator.js');
  const record = getCampaign(id);
  if (!record) return;
  let files = getSessionAssets(id);
  if (!files) {
    showNotification('Regenerating assets from the saved design…', 'success');
    files = await regenerateFiles(record);
  }
  await downloadZip(files, `${(record.name || 'campaign').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.zip`);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function refreshCampaigns() {
  const list = $('campaign-list');
  if (!list) return;
  const all = Object.values(loadCampaigns()).sort((a, b) => b.createdAt - a.createdAt);
  if (!all.length) { list.innerHTML = '<p class="info-text">No campaigns yet.</p>'; return; }
  list.innerHTML = all.map(c => `
    <div class="campaign-card" data-id="${c.id}" style="border:1px solid var(--border,#2a2a2a);border-radius:8px;padding:8px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
        <strong style="font-size:13px;">${escapeHtml(c.name)}</strong>
        <span class="info-text">${(c.thumbs || []).length} assets${c.hasTeaser ? ' + video' : ''}</span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
        ${(c.thumbs || []).map(t => `<img src="${t.dataUrl}" title="${escapeHtml(t.role)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" />`).join('')}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary campaign-download" style="flex:1;">Download ZIP</button>
        <button class="btn btn-secondary campaign-delete" style="flex:1;">Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.campaign-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.campaign-download')?.addEventListener('click', () => downloadCampaign(id));
    card.querySelector('.campaign-delete')?.addEventListener('click', async () => {
      if (await askConfirm('Delete this campaign?', { okLabel: 'Delete', danger: true })) { deleteCampaign(id); refreshCampaigns(); }
    });
  });
}

export function bindCampaigns() {
  $('campaign-generate')?.addEventListener('click', async () => {
    const { generateCampaign } = await import('./campaign-generator.js');
    await generateCampaign({
      name: $('campaign-name')?.value?.trim() || 'Campaign',
      prompt: $('campaign-prompt')?.value?.trim() || '',
      includeAppStore: !!$('campaign-appstore')?.checked,
      includeTeaser: !!$('campaign-teaser')?.checked
    });
    refreshCampaigns();
  });
  window.__refreshCampaigns = refreshCampaigns;
  refreshCampaigns();
}
