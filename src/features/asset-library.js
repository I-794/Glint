// v28 — Studio Quality-of-Life: reusable asset library.
//
// Uploads used to be one-shot. This keeps a small, persistent gallery of images
// you've loaded (in localStorage), so a logo or screenshot is one click away to
// re-use — either dropped in as a new image layer or set as the main image.
//
// Storage is deliberately modest: images are downscaled to a max edge before
// being kept, the list is capped, and saves are quota-guarded (oldest entries
// are evicted if localStorage is full). It's a convenience cache, not a backup.

import { el } from '../ui/elements.js';
import { addExtraImageFromSrc } from './extra-images.js';
import { loadImageFromSrc } from './upload.js';

const LS_KEY = 'snapshotpro_assets';
const MAX_ITEMS = 18;
const MAX_EDGE = 800;       // downscale cap for stored images

function read() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; }
}

// Persist, evicting the oldest entries if we hit the storage quota.
function write(list) {
  let items = list.slice(0, MAX_ITEMS);
  while (items.length) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); return; }
    catch (e) { items = items.slice(0, items.length - 1); }   // drop oldest, retry
  }
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
}

export function listAssets() { return read(); }

export function removeAsset(id) {
  write(read().filter((a) => a.id !== id));
  refreshGrid();
}

// Add an image (any source dataURL) to the library. Downscales first, dedupes by
// a cheap signature, and prepends so the newest is first. Fire-and-forget.
export function captureAsset(src, name) {
  if (!src || typeof src !== 'string' || !src.startsWith('data:')) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    let dataUrl;
    try { dataUrl = c.toDataURL('image/png'); } catch (e) { return; }   // tainted → skip
    const sig = w + 'x' + h + ':' + dataUrl.length;
    const list = read();
    if (list.some((a) => a.sig === sig)) return;                        // already have it
    list.unshift({ id: 'a_' + Date.now(), name: name || 'Image', dataUrl, sig, addedAt: Date.now() });
    write(list);
    refreshGrid();
  };
  img.src = src;
}

function refreshGrid() {
  const grid = el.assetLibraryGrid || document.getElementById('asset-library-grid');
  if (!grid) return;
  const list = read();
  const empty = document.getElementById('asset-library-empty');
  if (empty) empty.style.display = list.length ? 'none' : 'block';
  grid.innerHTML = '';
  list.forEach((a) => {
    const cell = document.createElement('div');
    cell.style.cssText = 'position:relative;aspect-ratio:1;border-radius:7px;overflow:hidden;' +
      'border:1px solid var(--border-color);background:var(--bg-tertiary);cursor:pointer;';
    cell.title = a.name + '\nClick: add as layer · Double-click: set as main image';

    const thumb = document.createElement('img');
    thumb.src = a.dataUrl;
    thumb.alt = a.name;
    thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    cell.appendChild(thumb);

    const rm = document.createElement('button');
    rm.textContent = '✕';
    rm.title = 'Remove from library';
    rm.style.cssText = 'position:absolute;top:3px;right:3px;width:18px;height:18px;line-height:16px;' +
      'padding:0;border:none;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;font-size:11px;cursor:pointer;';
    rm.addEventListener('click', (e) => { e.stopPropagation(); removeAsset(a.id); });
    cell.appendChild(rm);

    cell.addEventListener('click', () => addExtraImageFromSrc(a.dataUrl));
    cell.addEventListener('dblclick', () => loadImageFromSrc(a.dataUrl));
    grid.appendChild(cell);
  });
}

export function bindAssetLibrary() {
  window.__refreshAssetLibrary = refreshGrid;
  refreshGrid();
}
