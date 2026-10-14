// SnapShotPro Capture — MV3 background service worker.
//
// Owns the capture flow. Visible-area capture is done here with
// chrome.tabs.captureVisibleTab. Full-page and region capture inject
// content/capture.js into the active tab (it scrolls/stitches or draws a region
// overlay, calling back here for each viewport grab), then report the finished
// PNG dataURL. Each result is stashed in chrome.storage.local under a one-time
// nonce and opens the extension's own quick editor (editor/editor.html). From
// there "Open in full studio" hands the (edited) image to snapshotpro.xyz via
// the bridge content script.

// Domain: when Glint moves to its own domain, update DEFAULT_EDITOR and add the new
// origin to manifest.json host_permissions + content_scripts.matches (keep
// snapshotpro.xyz while it still serves).
const DEFAULT_EDITOR = 'https://snapshotpro.xyz/editor/';

async function editorBase() {
  try {
    const { editorBase } = await chrome.storage.local.get('editorBase');
    return editorBase || DEFAULT_EDITOR;   // override for local dev via storage
  } catch (e) { return DEFAULT_EDITOR; }
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// captureVisibleTab is rate-limited (~2/sec). Retry once on the rate-limit error.
function captureVisible(windowId) {
  return new Promise((resolve, reject) => {
    const tryOnce = (retries) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (!err && dataUrl) return resolve(dataUrl);
        if (retries > 0 && err && /MAX_CAPTURE/i.test(err.message || '')) {
          return setTimeout(() => tryOnce(retries - 1), 600);
        }
        reject(new Error((err && err.message) || 'captureVisibleTab failed'));
      });
    };
    tryOnce(2);
  });
}

// Stash a capture under a one-time nonce; prune anything older than 2 minutes.
async function stash(dataUrl) {
  const nonce = uid();
  const store = await chrome.storage.local.get('pending');
  const pending = store.pending || {};
  for (const k of Object.keys(pending)) {
    if (Date.now() - (pending[k].ts || 0) > 120000) delete pending[k];
  }
  pending[nonce] = { dataUrl, ts: Date.now() };
  await chrome.storage.local.set({ pending });
  return nonce;
}

// Default: open the extension's own quick editor with the capture.
async function openLocalEditor(dataUrl) {
  const nonce = await stash(dataUrl);
  await chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') + '?n=' + nonce });
}

// "Open in full studio": hand the (edited) image to snapshotpro.xyz via the bridge.
async function openWebStudio(dataUrl) {
  const nonce = await stash(dataUrl);
  const base = await editorBase();
  await chrome.tabs.create({ url: base + (base.includes('?') ? '&' : '?') + 'ext=' + nonce });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab to capture.');
  return tab;
}

async function startCapture(mode) {
  const tab = await activeTab();
  if (mode === 'visible') {
    await openLocalEditor(await captureVisible(tab.windowId));
    return;
  }
  // full-page / region: inject the worker, then tell it to run.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/capture.js'] });
  await chrome.tabs.sendMessage(tab.id, { cmd: 'run', mode });
  // The finished dataURL comes back as a 'captureResult' message (below).
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // From the popup: kick off a capture.
  if (msg.cmd === 'capture') {
    startCapture(msg.mode).then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;   // async response
  }

  // From content/capture.js during full-page/region: grab the current viewport.
  if (msg.cmd === 'captureVisibleForContent') {
    captureVisible(sender.tab.windowId).then((dataUrl) => sendResponse({ dataUrl }))
      .catch((e) => sendResponse({ error: String(e && e.message || e) }));
    return true;
  }

  // From content/capture.js when stitching/region finishes → open the quick editor.
  if (msg.cmd === 'captureResult') {
    if (msg.dataUrl) openLocalEditor(msg.dataUrl);
    return;
  }

  // From the quick editor's "Open in full studio" button.
  if (msg.cmd === 'openStudio') {
    if (msg.dataUrl) openWebStudio(msg.dataUrl);
    return;
  }

  // From content/bridge.js: fetch + clear the pending capture for a nonce.
  if (msg.cmd === 'consume') {
    chrome.storage.local.get('pending').then(({ pending }) => {
      const rec = pending && pending[msg.nonce];
      if (!rec) return sendResponse({ dataUrl: null });
      delete pending[msg.nonce];
      chrome.storage.local.set({ pending }).then(() => sendResponse({ dataUrl: rec.dataUrl }));
    });
    return true;
  }
});
