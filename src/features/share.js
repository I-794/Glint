import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { getClient, getUser } from './auth.js';

const SHARE_BUCKET = 'shares';

async function ensureBucket(client) {
  const { data } = await client.storage.getBucket(SHARE_BUCKET);
  if (!data) {
    await client.storage.createBucket(SHARE_BUCKET, { public: true, fileSizeLimit: 10485760 });
  }
}

function canvasToBlob() {
  return new Promise(resolve => {
    el.previewCanvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

export async function shareImage() {
  if (!state.image) { showNotification('Upload an image first.', 'error'); return null; }
  const client = await getClient();
  const user = getUser();
  if (!client || !user) {
    showNotification('Sign in and connect Supabase to share.', 'error');
    return null;
  }

  showNotification('Uploading...', 'success');

  try {
    await ensureBucket(client);
    const blob = await canvasToBlob();
    const filename = `${user.id}/${Date.now()}.png`;
    const { error: uploadError } = await client.storage
      .from(SHARE_BUCKET)
      .upload(filename, blob, { contentType: 'image/png', upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage
      .from(SHARE_BUCKET)
      .getPublicUrl(filename);

    const shareUrl = urlData.publicUrl;
    await navigator.clipboard.writeText(shareUrl);
    showNotification('Share link copied to clipboard!', 'success');
    return shareUrl;
  } catch (err) {
    showNotification('Share failed: ' + err.message, 'error');
    return null;
  }
}

export function generateEmbedCode(url, format) {
  if (!url) return '';
  switch (format) {
    case 'html': return `<img src="${url}" alt="SnapShotPro export" style="max-width:100%;border-radius:8px;">`;
    case 'iframe': return `<iframe src="${url}" width="800" height="450" style="border:none;border-radius:8px;" loading="lazy"></iframe>`;
    case 'markdown': return `![SnapShotPro export](${url})`;
    default: return url;
  }
}

async function generateQR(url) {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { width: 256, margin: 1, color: { dark: '#e8eaed', light: '#111318' } });
}

export function bindShare() {
  const shareBtn = document.getElementById('share-btn');
  const embedContainer = document.getElementById('embed-container');
  const qrBtn = document.getElementById('qr-btn');
  const qrContainer = document.getElementById('qr-container');

  let lastShareUrl = null;

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      lastShareUrl = await shareImage();
      if (lastShareUrl && embedContainer) {
        embedContainer.style.display = 'block';
        renderEmbedCodes(lastShareUrl);
      }
    });
  }

  if (qrBtn) {
    qrBtn.addEventListener('click', async () => {
      if (!lastShareUrl) {
        showNotification('Share your image first to generate a QR code.', 'error');
        return;
      }
      try {
        const dataUrl = await generateQR(lastShareUrl);
        if (qrContainer) {
          qrContainer.style.display = 'block';
          qrContainer.innerHTML = `<img src="${dataUrl}" alt="QR Code" style="width:128px;height:128px;border-radius:8px;image-rendering:pixelated;">`;
        }
      } catch (err) {
        showNotification('QR generation failed. Install qrcode package.', 'error');
      }
    });
  }

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

  const embedCopyBtns = document.querySelectorAll('[data-copy-embed]');
  embedCopyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.copyEmbed;
      if (!lastShareUrl) return;
      const code = generateEmbedCode(lastShareUrl, format);
      navigator.clipboard.writeText(code).then(() => {
        showNotification(`${format.toUpperCase()} embed copied!`, 'success');
      });
    });
  });
}

function renderEmbedCodes(url) {
  const container = document.getElementById('embed-codes');
  if (!container) return;
  container.innerHTML = `
    <div style="margin-bottom:6px;">
      <label class="control-label" style="font-size:10px;">IMG TAG</label>
      <code style="display:block;font-size:10px;color:var(--text-secondary);word-break:break-all;padding:6px;background:var(--bg-tertiary);border-radius:4px;margin-top:2px;">${generateEmbedCode(url, 'html').replace(/</g, '&lt;')}</code>
    </div>
    <div style="margin-bottom:6px;">
      <label class="control-label" style="font-size:10px;">MARKDOWN</label>
      <code style="display:block;font-size:10px;color:var(--text-secondary);word-break:break-all;padding:6px;background:var(--bg-tertiary);border-radius:4px;margin-top:2px;">${generateEmbedCode(url, 'markdown')}</code>
    </div>
  `;
}
