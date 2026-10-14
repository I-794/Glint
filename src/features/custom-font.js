import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { render } from '../render/render.js';

const KEY = 'glint_fonts';
const MAX_SIZE = 2 * 1024 * 1024; // 2MB cap per font

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function saveAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); }
  catch (e) { showNotification('Could not save font (storage full).', 'error'); }
}

async function registerFontFace(name, dataUrl) {
  try {
    const face = new FontFace(name, `url(${dataUrl})`);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (e) {
    console.error('Font load failed', e);
    return false;
  }
}

export async function loadStoredFonts() {
  const all = loadAll();
  const names = Object.keys(all);
  for (const name of names) {
    await registerFontFace(name, all[name]);
  }
  updateFontDropdown();
  renderFontPills();
}

function updateFontDropdown() {
  if (!el.textFont) return;
  const all = loadAll();
  const customNames = Object.keys(all);
  // Remove old custom <optgroup> if any
  const old = el.textFont.querySelector('optgroup[label="Custom"]');
  if (old) old.remove();
  if (customNames.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Custom';
    customNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      grp.appendChild(opt);
    });
    el.textFont.appendChild(grp);
  }
}

function renderFontPills() {
  const list = document.getElementById('custom-font-list');
  if (!list) return;
  const all = loadAll();
  const names = Object.keys(all);
  list.innerHTML = names.length
    ? names.map(n => `<span class="custom-font-pill" style="font-family:'${n}';">${n}<button data-font="${n}" title="Remove">✕</button></span>`).join('')
    : '<p class="info-text">No custom fonts loaded.</p>';
  list.querySelectorAll('button[data-font]').forEach(btn => {
    btn.addEventListener('click', () => removeFont(btn.dataset.font));
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFontFile(file) {
  if (file.size > MAX_SIZE) {
    showNotification(`Font too large (max ${Math.round(MAX_SIZE / 1024)}KB).`, 'error');
    return;
  }
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dataUrl = await fileToDataUrl(file);
  const ok = await registerFontFace(name, dataUrl);
  if (!ok) { showNotification(`Failed to load "${name}".`, 'error'); return; }
  const all = loadAll();
  all[name] = dataUrl;
  saveAll(all);
  updateFontDropdown();
  renderFontPills();
  // Apply immediately if text is enabled
  if (state.textOverlay.enabled && el.textFont) {
    state.textOverlay.font = name;
    el.textFont.value = name;
    render();
  }
  showNotification(`Loaded font "${name}".`, 'success');
}

function removeFont(name) {
  if (!confirm(`Remove custom font "${name}"?`)) return;
  const all = loadAll();
  delete all[name];
  saveAll(all);
  // Reset text overlay font if it was using this one
  if (state.textOverlay.font === name) {
    state.textOverlay.font = 'Arial';
    if (el.textFont) el.textFont.value = 'Arial';
    render();
  }
  updateFontDropdown();
  renderFontPills();
}

export function bindCustomFont() {
  const fileInput = document.getElementById('custom-font-input');
  const btn = document.getElementById('custom-font-btn');
  if (btn && fileInput) {
    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) handleFontFile(f);
      fileInput.value = '';
    });
  }
  loadStoredFonts();
}
