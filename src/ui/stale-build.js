// v34 — recover when a new deploy lands under an open tab.
//
// Each deploy renames the hashed chunks. A tab (or the PWA's cached shell)
// still running the previous build then fails to lazy-load code such as the
// subject-detection chunk, with errors like Safari's "Importing a module
// script failed". The fix is to load the new build, which the user
// triggers from the notice so nothing unsaved is lost.

import { showNotification } from './notification.js';

// Does this error mean "a lazily loaded chunk of an older build is gone"?
export function isStaleBuildError(e) {
  const m = String((e && e.message) || e || '');
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i.test(m);
}

// Explain the error and offer a one-tap reload.
export function showStaleBuildNotice() {
  showNotification('SnapShotPro was just updated. Reload to finish, then try again.', 'error', {
    duration: 10000,
    action: { label: 'Reload', run: () => location.reload() }
  });
}

// Vite fires `vite:preloadError` when a dynamic import's chunk fails to load.
// We do not reload automatically: an unsaved photo would be lost. Instead the
// notice offers a Reload button so the user picks the moment.
export function bindStaleBuildReload() {
  // The error is not suppressed: callers' own catch blocks still run and use
  // isStaleBuildError() to show the same notice instead of a raw message.
  window.addEventListener('vite:preloadError', () => showStaleBuildNotice());
}
