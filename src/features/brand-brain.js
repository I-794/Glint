// v30 — Brand Brain. Extract a brand system once (from a URL or an uploaded
// asset) into state.brand, then apply/enforce it app-wide via applyBrand()
// (Task 7). Extraction reuses extractPalette() (k-means) + generateHarmony()
// and, when available, structured vision over the page's OG image/icon.

import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { extractPalette } from './palette-extract.js';
import { generateHarmony } from '../utils/color.js';
import { runVisionJsonOnDataUrl } from './ai-cloud.js';
import { applySpec } from '../state/spec.js';
import { saveSwatchesAsPalette } from './palettes.js';
import { loadLogoImage } from './brand-kit.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';

// Load an http(s) image into an HTMLImageElement (CORS-anonymous so we can read
// pixels for palette extraction). Resolves null on failure rather than throwing.
function loadCrossOrigin(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function imgToDataUrl(img) {
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch (_) { return null; }
}

// Ensure at least `min` palette colors by completing with a tetradic harmony off
// the first color, so downstream gradients always have ≥2 stops.
function ensurePalette(colors, min = 4) {
  let out = (colors || []).filter(Boolean);
  if (out.length === 0) out = ['#4f46e5'];
  if (out.length < min) {
    const extra = generateHarmony(out[0], 'tetradic');
    for (const c of extra) { if (out.length >= min) break; if (!out.includes(c)) out.push(c); }
  }
  return out.slice(0, 6);
}

// Map a normalized palette + signals into the state.brand schema fields. Does
// NOT apply to the design — that's applyBrand() in Task 7.
function writeBrand({ name, sourceUrl, palette, logoDataUrl, headlineFont }) {
  const pal = ensurePalette(palette);
  state.brand.enabled = true;
  state.brand.name = name || state.brand.name || 'Brand';
  state.brand.sourceUrl = sourceUrl || '';
  state.brand.palette = pal;
  state.brand.background = {
    mode: 'gradient',
    gradient: { colors: pal.slice(0, 3), type: 'linear', angle: 135 }
  };
  state.brand.colorMap = { mode: 'off', intensity: 100, steps: 6 };
  state.brand.filter = 'none';
  if (headlineFont) state.brand.typography.headlineFont = headlineFont;
  if (logoDataUrl) {
    state.brand.logo = { dataUrl: logoDataUrl, position: 'bottom-right', scale: 0.12, opacity: 90 };
    state.brand.watermark = { ...state.brand.watermark, color: pal[0] };
  }
}

// Extract from an uploaded asset (logo/screenshot/brand image).
export async function extractBrandFromImage(img, name) {
  if (!img || !img.width) { showNotification('Could not read that image.', 'error'); return false; }
  const palette = extractPalette(img, 5);
  const logoDataUrl = imgToDataUrl(img);
  writeBrand({ name, sourceUrl: '', palette, logoDataUrl });
  showNotification('Brand system extracted from asset.', 'success');
  return true;
}

// Extract from a URL: fetch page signals server-side, run vision on the OG image
// when available, and refine the palette with extractPalette over that image.
// Degrades gracefully (theme-color / vision-only / nothing) on partial failure.
export async function extractBrandFromUrl(url) {
  if (!/^https?:\/\//i.test(url || '')) { showNotification('Enter a full http(s) URL.', 'error'); return false; }
  let signals = {};
  try {
    const r = await fetch('/api/brand-extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (r.ok) signals = await r.json();
  } catch (_) { /* network/501 → degrade below */ }

  // Gather candidate colors: theme-color + palette from the OG/icon image.
  let palette = [];
  let headlineFont = null;
  const imageUrl = signals.ogImage || signals.iconUrl;
  const brandImg = await loadCrossOrigin(imageUrl);
  if (brandImg) palette = extractPalette(brandImg, 5);
  if (signals.themeColor) palette = [signals.themeColor, ...palette];

  // Optional vision pass to read type feel + a clean accent, when an image and a
  // key are available. Failure is silently tolerated.
  if (brandImg) {
    const dataUrl = imgToDataUrl(brandImg);
    if (dataUrl) {
      const v = await runVisionJsonOnDataUrl(
        'You are a brand analyst. From this brand image, return JSON {"accent":"#hex primary brand color","fontFeel":"sans|serif|mono|display"}.',
        dataUrl
      );
      if (v && typeof v.accent === 'string') palette = [v.accent, ...palette];
      if (v && v.fontFeel) headlineFont = { sans: 'Arial', serif: 'Georgia', mono: 'monospace', display: 'Georgia' }[v.fontFeel] || null;
    }
  }

  if (!palette.length) {
    showNotification('Could not extract brand colors from that URL. Try uploading a logo instead.', 'error');
    return false;
  }
  writeBrand({ name: signals.title || new URL(url).hostname, sourceUrl: url, palette, logoDataUrl: null, headlineFont });
  showNotification('Brand system extracted from URL.', 'success');
  return true;
}

// Apply the active brand system onto the current design. One undo step. Routes
// presentation through the validated applySpec(), then sets the brand-specific
// extras (font, logo, watermark) the spec doesn't cover — mirroring how
// brand-kit.js applyKitObject() works, but driven by the extracted system.
export function applyBrand() {
  const b = state.brand;
  if (!b || !b.enabled) { showNotification('Extract a brand first.', 'error'); return; }
  saveStateToHistory('Applied brand');

  // 1) Register the brand palette so the color-map can reference it by id.
  let paletteId = null;
  if (b.palette && b.palette.length >= 2) {
    paletteId = saveSwatchesAsPalette(b.palette.slice(), (b.name || 'Brand') + ' palette');
  }

  // 2) Presentation via the validated spec applier (bg / frame / filter / color).
  applySpec({
    bg: b.background,
    frame: b.frame,
    filter: b.filter,
    color: paletteId ? { mode: b.colorMap.mode, paletteId, intensity: b.colorMap.intensity, steps: b.colorMap.steps } : null
  });

  // 3) Brand extras the spec deliberately doesn't touch.
  if (b.typography?.headlineFont) state.textOverlay.font = b.typography.headlineFont;
  if (b.logo?.dataUrl) {
    state.logo = {
      enabled: true, src: b.logo.dataUrl,
      position: b.logo.position || 'bottom-right',
      scale: b.logo.scale ?? 0.12, opacity: b.logo.opacity ?? 90
    };
    loadLogoImage();
  }
  if (b.watermark?.text) {
    state.watermark = { ...state.watermark, ...b.watermark, enabled: true };
  }

  render();
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
  showNotification('Brand applied to design.', 'success');
}

// ── Sidebar UI (v30) ──────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function fileToImage(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = r.result; };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

// Reflect state.brand into the panel preview (swatches + name + enforce check).
export function refreshBrandBrainUI() {
  const wrap = $('brand-brain-preview');
  const sw = $('brand-brain-swatches');
  const nm = $('brand-brain-name');
  const enf = $('brand-brain-enforce');
  if (enf) enf.checked = !!state.brand.enforce;
  if (!state.brand.enabled) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = 'block';
  if (sw) sw.innerHTML = (state.brand.palette || [])
    .map(c => `<div class="palette-swatch" style="background:${c};" title="${c}"></div>`).join('');
  if (nm) nm.textContent = state.brand.name ? `"${state.brand.name}"` : '';
}

export function bindBrandBrain() {
  $('brand-brain-extract-url')?.addEventListener('click', async () => {
    const url = $('brand-brain-url')?.value?.trim();
    const ok = await extractBrandFromUrl(url);
    if (ok) refreshBrandBrainUI();
  });

  const assetInput = $('brand-brain-asset-input');
  $('brand-brain-asset-btn')?.addEventListener('click', () => assetInput?.click());
  assetInput?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) { const img = await fileToImage(f); if (img) { await extractBrandFromImage(img, f.name.replace(/\.[^.]+$/, '')); refreshBrandBrainUI(); } }
    assetInput.value = '';
  });

  $('brand-brain-apply')?.addEventListener('click', () => applyBrand());

  $('brand-brain-enforce')?.addEventListener('change', (e) => {
    state.brand.enforce = e.target.checked;
  });

  refreshBrandBrainUI();
}
