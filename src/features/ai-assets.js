// v19 — AI Assets. On-brand text→background generation plus optional subject
// isolation, layered on the existing generation (ai-cloud) and removal
// (bg-remove) primitives. Sets state.bgImage + bgMode:'image' so it renders and
// exports through the normal background path.

import { state } from '../state/state.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { generateBackgroundImage } from './ai-cloud.js';
import { cutSubject } from './bg-remove.js';
import { revealSection } from './studio-nav.js';

const STYLE_PHRASES = {
  photographic: 'a high-quality photographic background',
  abstract: 'a clean abstract background',
  studio: 'a soft studio backdrop with subtle gradient lighting',
  gradient: 'a smooth modern gradient background'
};
let activeStyle = 'photographic';

function activePaletteHexes() {
  const cp = state.colorPalettes;
  if (cp && cp.active && cp.library && cp.library[cp.active]) {
    return cp.library[cp.active].swatches || [];
  }
  return [];
}

// Map the canvas aspect to a gpt-image-2 supported size.
function genSize() {
  const w = state.canvas.width, h = state.canvas.height;
  if (w > h * 1.15) return '1536x1024';
  if (h > w * 1.15) return '1024x1536';
  return '1024x1024';
}

function buildAssetPrompt(text) {
  const useBrand = document.getElementById('ai-asset-brand')?.checked;
  const style = STYLE_PHRASES[activeStyle] || STYLE_PHRASES.photographic;
  let p = `${style}. ${text}. No text, no logos, no watermarks. Designed to sit behind a product screenshot.`;
  const hexes = activePaletteHexes();
  if (useBrand && hexes.length) p += ` Use a color palette of ${hexes.join(', ')}.`;
  return p;
}

function setStatus(msg) {
  const s = document.getElementById('ai-asset-status');
  if (s) s.textContent = msg || '';
}

async function generate() {
  const inp = document.getElementById('ai-asset-prompt');
  const text = inp ? inp.value.trim() : '';
  if (!text) { showNotification('Describe the background you want.', 'error'); return; }
  const btn = document.getElementById('ai-asset-generate');
  if (btn) btn.disabled = true;
  setStatus('Generating background…');
  try {
    const img = await generateBackgroundImage(buildAssetPrompt(text), genSize());
    saveStateToHistory();
    state.bgImage = img;
    state.bgMode = 'image';
    const isolate = document.getElementById('ai-asset-isolate')?.checked;
    if (isolate && state.image) {
      setStatus('Isolating subject…');
      try {
        const cut = await cutSubject();
        if (cut) state.image = cut;
      } catch (e) {
        showNotification('Subject isolation could not run; background applied.', 'error');
      }
    }
    render();
    if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
    setStatus('Done.');
    showNotification('AI background generated.', 'success');
  } catch (e) {
    if (e && e.code === 'NO_KEY') {
      setStatus('');
      showNotification('Add an OpenAI key in AI settings (or deploy with OPENAI_API_KEY) to generate backgrounds.', 'error');
      const d = document.getElementById('api-keys-details');
      if (d) { revealSection(d); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } else {
      console.error(e);
      setStatus('Failed.');
      showNotification(`Background gen failed: ${e.message || e}`, 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function bindAiAssets() {
  document.getElementById('ai-asset-generate')?.addEventListener('click', generate);
  document.querySelectorAll('.tab-btn[data-asset-style]').forEach(b => {
    b.addEventListener('click', () => {
      activeStyle = b.dataset.assetStyle;
      document.querySelectorAll('.tab-btn[data-asset-style]').forEach(x => x.classList.toggle('active', x === b));
    });
  });
}
