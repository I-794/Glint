// v26 — Browser-extension capture receiver.
//
// The Glint Capture extension (Chrome MV3) screenshots a page and opens
// the studio at /editor/?ext=<nonce>. The extension and the site are different
// origins, so the capture can't ride Cache Storage like the PWA share-target
// (caches.js is origin-scoped). Instead the extension's *bridge* content script
// — which runs in this page's window — relays the capture via window.postMessage,
// retrying until we acknowledge. We validate origin + source + nonce, then feed
// the image through the same loadImage() entry point as upload/drop/paste.

import { loadImage } from './upload.js';
import { showNotification } from '../ui/notification.js';

// v36: Glint Capture sends 'glint-capture'; SnapShotPro Capture builds still in
// users' browsers send 'snapshotpro-capture'. Ack with the matching type so the
// sender stops retrying.
const SOURCES = { 'glint-capture': 'glint-capture-ack', 'snapshotpro-capture': 'snapshotpro-capture-ack' };
const TIMEOUT_MS = 15000;   // stop listening if no capture arrives

async function dataUrlToBlob(dataUrl) {
  // fetch() resolves data: URLs to a Blob without a network round-trip.
  const res = await fetch(dataUrl);
  return res.blob();
}

export function bindExtReceiver() {
  let nonce = null;
  try { nonce = new URLSearchParams(location.search).get('ext'); } catch (e) {}
  if (!nonce) return;

  // Strip ?ext so a refresh doesn't re-arm the listener and the URL stays clean.
  try { history.replaceState(null, '', location.pathname); } catch (e) {}

  let done = false;
  const onMessage = async (e) => {
    if (done) return;
    // Only trust a same-origin message from our bridge carrying the exact nonce.
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || !Object.prototype.hasOwnProperty.call(SOURCES, d.source) || d.nonce !== nonce || typeof d.dataUrl !== 'string') return;
    if (!d.dataUrl.startsWith('data:image/')) return;

    done = true;
    window.removeEventListener('message', onMessage);
    // Tell the bridge to stop retrying.
    try { (e.source || window).postMessage({ source: SOURCES[d.source], nonce }, e.origin); } catch (_) {}

    try {
      const blob = await dataUrlToBlob(d.dataUrl);
      if (blob && blob.size) loadImage(blob);   // same path as upload/drop/paste
      else showNotification('The captured image was empty.', 'error');
    } catch (err) {
      showNotification('Could not open the captured screenshot.', 'error');
    }
  };

  window.addEventListener('message', onMessage);
  // Give up quietly if the capture never arrives (e.g. user opened the URL by hand).
  setTimeout(() => {
    if (done) return;
    done = true;
    window.removeEventListener('message', onMessage);
  }, TIMEOUT_MS);
}
