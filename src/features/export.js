import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { render } from '../render/render.js';
import { exportGif } from './gif-export.js';

export function exportImage() {
  if (!state.image) { showNotification('Please load an image first!', 'error'); return; }
  if (state.exportSettings.format === 'gif') { exportGif(); return; }
  let mimeType, extension;
  const quality = state.exportSettings.quality / 100;
  switch (state.exportSettings.format) {
    case 'jpeg': mimeType = 'image/jpeg'; extension = 'jpg'; break;
    case 'webp': mimeType = 'image/webp'; extension = 'webp'; break;
    default:     mimeType = 'image/png';  extension = 'png';  break;
  }
  // Re-render without preview-only chrome (selection outlines etc.) before reading
  // the canvas. Not in Set mode: render(true) would skip the Set panel preview,
  // and that preview draws no selection chrome anyway.
  const bracket = state.mode !== 'set';
  if (bracket) render(true);
  const blobCallback = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `screenshot-${Date.now()}.${extension}`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showNotification(`Image exported as ${extension.toUpperCase()}!`, 'success');
    if (bracket) render();
  };
  if (mimeType === 'image/png') el.previewCanvas.toBlob(blobCallback, mimeType);
  else el.previewCanvas.toBlob(blobCallback, mimeType, quality);
}

export function copyToClipboard() {
  if (!state.image) { showNotification('Please load an image first!', 'error'); return; }
  const bracket = state.mode !== 'set';   // see exportImage
  if (bracket) render(true);
  el.previewCanvas.toBlob((blob) => {
    if (bracket) render();
    const item = new ClipboardItem({ 'image/png': blob });
    navigator.clipboard.write([item])
      .then(() => showNotification('Image copied to clipboard!', 'success'))
      .catch(err => showNotification('Failed to copy: ' + err.message, 'error'));
  }, 'image/png');
}

export function exportAsHTML() {
  if (!state.image) { showNotification('Please load an image first!', 'error'); return; }
  const dataURL = el.previewCanvas.toDataURL('image/png');
  const title = state.watermark.text || 'SnapShotPro';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#111;font-family:sans-serif;}img{max-width:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.8);}</style></head><body><img src="${dataURL}"></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `snapshot-${Date.now()}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showNotification('Exported as HTML card!', 'success');
}
