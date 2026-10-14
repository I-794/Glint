// v23 — PWA share-target receiver.
//
// When an installed PWA is registered as a share target (see the manifest
// `share_target` in vite.config.js), the OS share sheet can send an image to
// Glint. The service worker (public/share-handler.js) intercepts that
// POST, stashes the image in the Cache Storage under 'shared-image', and
// redirects the editor to /editor/?shared=1. On load we pull the blob back out
// and feed it through the normal upload pipeline, then clean up.
//
// This is an Android-installed-PWA feature; iOS Safari has no Web Share Target,
// where it's simply a no-op (the ?shared=1 path is never reached).

import { loadImage } from './upload.js';
import { showNotification } from '../ui/notification.js';

const SHARE_CACHE = 'shared-image';

async function consumeSharedImage() {
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match('shared-image');
    if (!res) return;
    const blob = await res.blob();
    await cache.delete('shared-image');
    if (blob && blob.size) {
      loadImage(blob);   // same File/Blob entry point as upload/drop/paste
    }
  } catch (e) {
    showNotification('Could not open the shared image.', 'error');
  }
}

export function bindShareTarget() {
  let shared = false;
  try { shared = new URLSearchParams(location.search).get('shared') === '1'; } catch (e) {}
  if (!shared) return;

  // Strip ?shared=1 so a refresh doesn't re-trigger and the URL stays clean.
  try { history.replaceState(null, '', location.pathname); } catch (e) {}

  if (!('caches' in window)) return;
  consumeSharedImage();
}
