import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { loadVideoFile, clearVideo } from './video.js';
import { captureAsset } from './asset-library.js';
import { refreshBokehUI } from './bokeh-ui.js';

// v28 — load a still image from any source (dataURL / object URL). Shared by the
// file upload path and the reusable asset library ("set as main image").
export function loadImageFromSrc(src) {
  const img = new Image();
  img.onload = () => {
    clearVideo();          // a still image takes over from any loaded clip
    state.image = img;
    state.svgCode = null;
    // v34 — a new image needs its own subject mask.
    if (state.bokeh) state.bokeh = { ...state.bokeh, enabled: false, maskDataUrl: null, maskSig: null };
    refreshBokehUI();
    el.uploadZone.style.display = 'none';
    el.canvasWrapper.style.display = 'block';
    el.annotationToolbar.style.display = 'flex';
    if (el.zoomControls) el.zoomControls.style.display = 'flex';
    saveStateToHistory();
    render();
    showNotification('Image loaded successfully!', 'success');
  };
  img.src = src;
}

export function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    loadImageFromSrc(e.target.result);
    captureAsset(e.target.result, file && file.name);   // v28 — remember for re-use
  };
  reader.readAsDataURL(file);
}

export function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.type.startsWith('image/')) loadImage(file);
  else if (file.type.startsWith('video/')) loadVideoFile(file);
}

export function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  el.uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (file.type.startsWith('image/')) loadImage(file);
  else if (file.type.startsWith('video/')) loadVideoFile(file);
}

export function handlePaste(e) {
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      loadImage(item.getAsFile());
      break;
    }
  }
}

export function bindUploadEvents() {
  el.uploadBtn.addEventListener('click', () => el.fileInput.click());
  el.uploadZone.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', handleFileSelect);

  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.uploadZone.classList.add('drag-over');
  });
  el.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.uploadZone.classList.remove('drag-over');
  });
  el.dropZone.addEventListener('drop', handleDrop);
  document.addEventListener('paste', handlePaste);
}
