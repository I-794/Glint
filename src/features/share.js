// Share helpers. v41: links are made by share-links.js (Vercel Blob, no
// account); this module keeps the embed snippets, the QR code and the social
// size presets.
import { state } from '../state/state.js';
import { escapeHTML } from '../utils/dom.js';

// rec: a share-links.js record ({ url, kind, title, imageUrl, posterUrl, w, h }).
export function generateEmbedCode(rec, format) {
  if (!rec || !rec.url) return '';
  const title = rec.title || 'Made with Glint';
  const picture = rec.imageUrl || rec.posterUrl;
  switch (format) {
    case 'iframe':
      return `<iframe src="${escapeHTML(rec.url)}?embed=1" width="100%" height="560" style="border:0;border-radius:6px" loading="lazy" title="${escapeHTML(title)}" allowfullscreen></iframe>`;
    case 'html':
      return picture
        ? `<a href="${escapeHTML(rec.url)}"><img src="${escapeHTML(picture)}" alt="${escapeHTML(title)}" style="max-width:100%;height:auto;border-radius:6px"></a>`
        : rec.url;
    case 'markdown':
      return picture ? `[![${title.replace(/[[\]]/g, '')}](${picture})](${rec.url})` : rec.url;
    default:
      return rec.url;
  }
}

export async function generateQR(url) {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { width: 256, margin: 1, color: { dark: '#141416', light: '#f2f2f0' } });
}

export function bindShare() {
  document.querySelectorAll('.size-preset-btn[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sizes = {
        twitter: [1200, 675],
        instagram: [1080, 1080],
        facebook: [1200, 630],
        linkedin: [1200, 627],
        'ig-story': [1080, 1920],
        youtube: [1280, 720],
        pinterest: [1000, 1500],
        tiktok: [1080, 1920]
      };
      const size = sizes[btn.dataset.size];
      if (size) {
        state.canvas.width = size[0];
        state.canvas.height = size[1];
        const wInp = document.getElementById('canvas-width');
        const hInp = document.getElementById('canvas-height');
        if (wInp) wInp.value = size[0];
        if (hInp) hInp.value = size[1];
      }
    });
  });
}
