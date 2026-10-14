// Glint Capture — studio bridge content script.
//
// Runs at document_start on the editor page so it can read ?ext=<nonce> BEFORE
// the SPA strips it. Pulls the stashed capture from the background, then relays
// it into the page with window.postMessage, retrying until the page's
// ext-receiver acknowledges (handles either-order load timing). Cross-origin
// transport: the extension can't touch the site's Cache Storage, but a content
// script shares the page window, so postMessage is the clean handoff.

(function () {
  let nonce = null;
  try { nonce = new URLSearchParams(location.search).get('ext'); } catch (e) {}
  if (!nonce) return;

  let acked = false;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (d && d.source === 'glint-capture-ack' && d.nonce === nonce) acked = true;
  });

  // Fetch (and clear) the one-time capture for this nonce, then relay it.
  chrome.runtime.sendMessage({ cmd: 'consume', nonce }, (resp) => {
    if (chrome.runtime.lastError) return;
    const dataUrl = resp && resp.dataUrl;
    if (!dataUrl) return;
    let tries = 0;
    const post = () => {
      if (acked || tries++ > 40) return;   // ~10s of retries, then give up
      window.postMessage({ source: 'glint-capture', nonce, dataUrl }, location.origin);
      setTimeout(post, 250);
    };
    post();
  });
})();
