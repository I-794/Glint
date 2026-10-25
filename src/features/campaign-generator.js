// v30 — Campaign Generator. One design → a coordinated asset set saved as a
// Campaign folder. Reuses the current framed screenshot as the base, applies the
// active brand, optionally runs an art-director prompt pass, then renders every
// target (renderTargetsToFiles), the App Store set (renderSetPanels), and a
// teaser (renderTimelineBlob). Full bytes are cached for this session; the saved
// record stores the design payload + thumbnails so assets regenerate later.

import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { serializeFull } from '../state/serialize.js';
import { renderTargetsToFiles, CAMPAIGN_TARGETS } from './campaign-targets.js';
import { renderSetPanels } from './screenshot-set.js';
import { renderTimelineBlob } from './timeline-export.js';
import { applyBrand } from './brand-brain.js';
import { saveCampaign } from './campaigns.js';

const sessionAssets = new Map(); // id -> { name: Uint8Array }

export function getSessionAssets(id) {
  return sessionAssets.get(id) || null;
}

function uid() { return 'cmp_' + Math.random().toString(36).slice(2, 10); }

async function blobToU8(blob) { return new Uint8Array(await blob.arrayBuffer()); }

// Run the AI Art Director on a prompt. The real module (ai-art-director.js)
// exposes `runArtDirector` (alias of an internal `generate`) which reads the
// brief from the `#art-director-prompt` DOM input rather than from an argument,
// and shows its own notifications. So we feed the prompt through that input and
// invoke it. We tolerate any future programmatic entry (applyFromPrompt /
// a prompt-taking generate) first, and degrade gracefully if none applies —
// the brand + current design still render either way.
async function runArtDirectorPass(prompt) {
  const ad = await import('./ai-art-director.js');
  if (typeof ad.applyFromPrompt === 'function') {
    await ad.applyFromPrompt(prompt);
    return;
  }
  if (typeof ad.generate === 'function' && ad.generate.length >= 1) {
    await ad.generate(prompt);
    return;
  }
  if (typeof ad.runArtDirector === 'function') {
    // runArtDirector reads from the DOM input — stage the prompt there, run it,
    // then restore the field so we don't clobber the user's authored brief.
    const inp = document.getElementById('art-director-prompt');
    if (!inp) return; // no input available → nothing to drive; skip cleanly
    const prev = inp.value;
    inp.value = prompt;
    try { await ad.runArtDirector(); }
    finally { inp.value = prev; }
  }
}

export async function generateCampaign({ name, prompt, includeAppStore = true, includeTeaser = false }) {
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return null; }
  saveStateToHistory(); // the base-design mutation is one undo step

  // 1) Base design: apply the active brand, then an optional art-director pass.
  //    applyBrand() and the art-director both push their own history snapshots;
  //    that's harmless (extra undo steps), and we've already snapshotted so the
  //    pre-generation state is recoverable in one undo from the user's view.
  if (state.brand && state.brand.enabled) {
    try { applyBrand(); } catch (e) { console.warn('Brand pass skipped:', e); }
  }
  if (prompt && prompt.trim()) {
    try { await runArtDirectorPass(prompt.trim()); }
    catch (e) { console.warn('Art-director pass skipped:', e); }
  }
  render();

  const id = uid();
  const files = {};
  const thumbs = [];

  // 2) Hero + social targets. If this throws there is nothing to save, so let
  //    it surface as a failed generation (caught below).
  let appStore = false;
  let hasTeaser = false;
  try {
    showNotification('Rendering social & hero…', 'success');
    const t = await renderTargetsToFiles();
    Object.assign(files, t.files);
    thumbs.push(...t.thumbs);

    // 3) App Store set (each panel already device-framed + captioned). A failure
    //    here shouldn't lose the hero/social work, so degrade to appStore=false.
    if (includeAppStore && state.screenshotSet && state.screenshotSet.panels && state.screenshotSet.panels.length) {
      try {
        showNotification('Rendering App Store set…', 'success');
        const panels = await renderSetPanels();
        for (const p of panels) files[`appstore/${p.name}`] = await blobToU8(p.blob);
        appStore = panels.length > 0;
      } catch (e) {
        console.warn('App Store render failed; campaign keeps hero+social:', e);
        showNotification('App Store set failed — saved hero & social only.', 'error');
      }
    }

    // 4) Teaser video (only when requested AND the timeline produces a blob).
    if (includeTeaser) {
      try {
        showNotification('Rendering teaser…', 'success');
        const blob = await renderTimelineBlob('mp4');
        if (blob) { files['teaser/teaser.mp4'] = await blobToU8(blob); hasTeaser = true; }
      } catch (e) {
        console.warn('Teaser render failed; campaign keeps stills:', e);
        showNotification('Teaser failed — saved still assets only.', 'error');
      }
    }
  } catch (e) {
    console.error('Campaign render failed:', e);
    showNotification('Could not render the campaign assets.', 'error');
    return null;
  }

  // 5) Cache full bytes for this session; persist the recipe + thumbnails.
  sessionAssets.set(id, files);
  const payload = serializeFull();
  // v40 — pins (with their thumbnails) belong to the project, not a campaign record.
  if (payload.design) delete payload.design.versions;
  const ok = saveCampaign({
    id, name: name || 'Campaign', createdAt: Date.now(),
    brandName: (state.brand && state.brand.name) || '',
    payload,
    targets: CAMPAIGN_TARGETS.slice(),
    appStore, hasTeaser, thumbs
  });
  if (!ok) { sessionAssets.delete(id); return null; }

  showNotification(`Campaign “${name || 'Campaign'}” ready.`, 'success');
  if (typeof window.__refreshCampaigns === 'function') window.__refreshCampaigns();
  return { id };
}
