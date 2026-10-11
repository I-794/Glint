// v34.1 — "Install app" button.
//
// SnapShotPro is already an installable PWA (vite-plugin-pwa), but the browser
// hides the option in a menu. This surfaces it as a header button:
// - Chrome / Edge / Android fire `beforeinstallprompt`; we keep that event and
//   replay it when the button is clicked.
// - iOS Safari has no install API, so the button explains Share -> Add to Home
//   Screen instead.
// - Already installed (standalone window) or no support (e.g. Firefox desktop):
//   the button stays hidden.

import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';

let deferredPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function canInstallApp() {
  if (typeof window === 'undefined' || isStandalone()) return false;
  return !!deferredPrompt || isIOS();
}

function refreshButton() {
  if (el.installAppBtn) el.installAppBtn.style.display = canInstallApp() ? '' : 'none';
}

export async function installApp() {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    try { await prompt.userChoice; } catch { /* dismissed */ }
    refreshButton();
    return;
  }
  if (isIOS()) {
    showNotification('To install: tap the Share button, then "Add to Home Screen".', 'success', { duration: 8000 });
  }
}

// Listen at load: the browser can fire this before init() runs.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's mini-infobar away; we show our own button
    deferredPrompt = e;
    refreshButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshButton();
    showNotification('SnapShotPro is installed. Open it from your desktop or home screen.');
  });
}

export function bindInstallApp() {
  el.installAppBtn?.addEventListener('click', installApp);
  refreshButton();
}
