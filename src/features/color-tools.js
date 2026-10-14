// v33 — Aperture QoL: color tools for every sidebar color picker.
//
// Each `.color-picker-wrapper` (color input + hex text field) gains:
//  • an eyedropper button (native EyeDropper API; hidden where unsupported) that
//    samples any pixel on screen, including the canvas, and
//  • a swatch row under it: brand palette colors first (when a brand is set),
//    then the last 8 colors used anywhere in the editor.
// Picking a swatch or sampling a pixel sets the color input and dispatches
// input + change, so the existing linkColor() bindings, render, and history
// handle it exactly like a manual pick. Recents live in their own localStorage
// key and are never part of a project or undo.

import { state } from '../state/state.js';

const RECENTS_KEY = 'glint_recent_colors';
const MAX_RECENTS = 8;
const HEX = /^#[0-9a-f]{6}$/i;

function readRecents() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY));
    return Array.isArray(v) ? v.filter((c) => HEX.test(c)) : [];
  } catch (e) { return []; }
}

function pushRecent(hex) {
  if (!HEX.test(hex)) return;
  const c = hex.toLowerCase();
  const list = [c, ...readRecents().filter((x) => x !== c)].slice(0, MAX_RECENTS);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch (e) {}
}

function toHex(v) {
  if (HEX.test(v)) return v.toLowerCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(v || '');
  if (!m) return null;
  return '#' + m.slice(1, 4).map((n) => (+n).toString(16).padStart(2, '0')).join('');
}

function setColor(input, hex) {
  input.value = hex;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function brandColors() {
  const b = state.brand;
  return b && b.enabled ? (b.palette || []).map(toHex).filter(Boolean) : [];
}

function swatch(hex, input, title) {
  const s = document.createElement('button');
  s.type = 'button';
  s.className = 'color-swatch';
  s.style.background = hex;
  s.title = title + ' ' + hex;
  s.setAttribute('aria-label', title + ' ' + hex);
  s.addEventListener('click', () => setColor(input, hex));
  return s;
}

function fillRow(row, input) {
  const brand = brandColors();
  const recents = readRecents().filter((c) => !brand.includes(c));
  row.replaceChildren();
  brand.forEach((c) => row.appendChild(swatch(c, input, 'Brand')));
  if (brand.length && recents.length) {
    const sep = document.createElement('span');
    sep.className = 'color-swatch-sep';
    row.appendChild(sep);
  }
  recents.forEach((c) => row.appendChild(swatch(c, input, 'Recent')));
  row.hidden = !row.childElementCount;
}

function enhance(wrapper) {
  if (wrapper.dataset.colorTools) return;
  const input = wrapper.querySelector('input[type="color"]');
  if (!input) return;
  wrapper.dataset.colorTools = '1';

  if ('EyeDropper' in window) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-eyedropper-btn';
    btn.title = 'Pick a color from the screen';
    btn.textContent = '💧';
    btn.addEventListener('click', async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        const hex = toHex(sRGBHex);
        if (hex) setColor(input, hex);
      } catch (e) { /* user pressed Esc */ }
    });
    wrapper.appendChild(btn);
  }

  const row = document.createElement('div');
  row.className = 'color-swatch-row';
  row.hidden = true;
  wrapper.insertAdjacentElement('afterend', row);
  // Refresh lazily when the pointer arrives, so brand changes and recents made
  // in other pickers always show without global bookkeeping.
  const refresh = () => fillRow(row, input);
  wrapper.parentElement?.addEventListener('pointerenter', refresh);
  input.addEventListener('focus', refresh);
  refresh();
}

export function bindColorTools() {
  document.querySelectorAll('.color-picker-wrapper').forEach(enhance);
  // Every committed color pick anywhere (sidebar, mesh pad, palettes, gradient
  // stops) feeds recents.
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input[type="color"]')) pushRecent(t.value);
  }, true);
}
