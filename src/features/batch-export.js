// v9.0 — ZIP export for screenshot sets, plus the shared downloadZip().
//
// Set export: renders every panel of the active set (via screenshot-set.js)
// and bundles the PNGs into a ZIP using fflate (tiny, no worker), rendered
// sequentially to keep memory bounded. (v37 — the old Batch export became the
// Roll's Develop, features/roll.js.)

import { state } from '../state/state.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { renderSetPanels } from './screenshot-set.js';
import { runTextPrompt, parseJsonLoose } from './ai-cloud.js';

async function blobToU8(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function downloadZip(files, filename) {
  // Lazy-load fflate so it never weighs on the still-image path.
  const { zipSync } = await import('fflate');
  const entries = {};
  for (const [name, u8] of Object.entries(files)) entries[name] = u8;
  // PNGs are already compressed — store them (level 0) so zipping is instant.
  const zipped = zipSync(entries, { level: 0 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setProgress(elId, msg) {
  const node = document.getElementById(elId);
  if (node) node.textContent = msg || '';
}

// Translate every panel's captions into `locale` via the BYOK chat call.
// Returns an overrides array aligned to panels: [{ headline, subhead }]. On any
// failure returns null so the caller can skip the locale (and warn) rather than
// shipping a half-translated set.
async function translateCaptions(panels, locale) {
  const items = panels.map((p, i) => ({ i, headline: p.headline || '', subhead: p.subhead || '' }));
  const prompt = [
    `Translate the "headline" and "subhead" of each item into ${locale}.`,
    'Keep them concise and natural for App Store marketing — do not translate brand/product names.',
    'Return ONLY a JSON object of the form {"items":[{"i":0,"headline":"...","subhead":"..."}, ...]},',
    'preserving each item\'s "i" index and leaving empty strings empty.',
    '',
    JSON.stringify({ items })
  ].join('\n');

  const raw = await runTextPrompt(prompt, { json: true });
  if (!raw) return null;
  const parsed = parseJsonLoose(raw);
  const arr = parsed && Array.isArray(parsed.items) ? parsed.items : null;
  if (!arr) return null;

  const overrides = panels.map((p) => ({ headline: p.headline, subhead: p.subhead }));
  for (const it of arr) {
    const idx = Number(it.i);
    if (Number.isInteger(idx) && idx >= 0 && idx < overrides.length) {
      if (typeof it.headline === 'string') overrides[idx].headline = it.headline;
      if (typeof it.subhead === 'string') overrides[idx].subhead = it.subhead;
    }
  }
  return overrides;
}

export async function exportSet() {
  const ss = state.screenshotSet;
  if (!ss.panels.length) { showNotification('Add at least one panel first.', 'error'); return; }
  if (!state.image && !ss.panels.some(p => p.imageId)) {
    showNotification('Load a screenshot first.', 'error');
    return;
  }

  // Locales: 'en' (or none) → flat panel-NN.png (today's behavior). Multiple
  // locales → one subfolder per locale with translated captions.
  const locales = Array.isArray(ss.locales) && ss.locales.length ? ss.locales : ['en'];
  const localized = locales.length > 1 || (locales.length === 1 && locales[0] !== 'en');

  setProgress('set-progress', 'Rendering…');
  try {
    const files = {};
    let total = 0;
    for (const locale of locales) {
      let overrides = null;
      if (locale !== 'en') {
        setProgress('set-progress', `Translating captions → ${locale}…`);
        overrides = await translateCaptions(ss.panels, locale);
        if (!overrides) {
          showNotification(`Skipped ${locale}: translation unavailable (check your AI key).`, 'error');
          continue;
        }
      }
      const panels = await renderSetPanels(
        (done, n) => setProgress('set-progress', `Rendering ${locale} ${done}/${n}…`),
        overrides
      );
      for (const p of panels) {
        const key = localized ? `${locale}/${p.name}` : p.name;
        files[key] = await blobToU8(p.blob);
        total++;
      }
    }
    if (total === 0) { setProgress('set-progress', 'Nothing exported.'); return; }
    await downloadZip(files, `appstore-set-${Date.now()}.zip`);
    setProgress('set-progress', `Exported ${total} panel${total === 1 ? '' : 's'}.`);
    showNotification(`Exported ${total} screenshot${total === 1 ? '' : 's'} as ZIP.`, 'success');
  } catch (e) {
    console.error(e);
    setProgress('set-progress', 'Failed.');
    showNotification(`Set export failed: ${e.message || e}`, 'error');
  } finally {
    render();
  }
}
