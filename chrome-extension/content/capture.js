// Glint Capture — in-page capture worker (injected on demand).
//
// Runs in the active tab's isolated content-script world (so it can call
// chrome.runtime) for the two modes the background can't do alone:
//   • full-page: scroll the viewport in steps, ask the background to grab each
//     viewport with captureVisibleTab, and stitch the slices onto a DPR-aware
//     canvas. Fixed/sticky elements are temporarily de-fixed so a sticky header
//     doesn't repeat in every slice.
//   • region: draw a drag-select overlay, then crop the visible capture to the
//     chosen rectangle.
// The finished PNG dataURL is sent back to the background as 'captureResult'.

if (!window.__sspCapture) {
  window.__sspCapture = true;

  const DPR = window.devicePixelRatio || 1;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const loadImg = (src) => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
  });

  function captureViewport() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ cmd: 'captureVisibleForContent' }, (resp) => {
        if (chrome.runtime.lastError || !resp || resp.error) {
          reject(new Error((resp && resp.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'capture failed'));
        } else resolve(resp.dataUrl);
      });
    });
  }

  async function fullPage() {
    const docEl = document.documentElement;
    const totalH = Math.max(docEl.scrollHeight, document.body ? document.body.scrollHeight : 0, docEl.clientHeight);
    const viewW = docEl.clientWidth;
    const viewH = window.innerHeight;
    const startScroll = window.scrollY;

    // De-fix sticky/fixed elements so they aren't stamped into every slice.
    const restored = [];
    document.querySelectorAll('*').forEach((node) => {
      const pos = getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'sticky') {
        restored.push([node, node.style.position, node.style.getPropertyPriority('position')]);
        node.style.setProperty('position', 'absolute', 'important');
      }
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewW * DPR);
    canvas.height = Math.round(totalH * DPR);
    const ctx = canvas.getContext('2d');

    try {
      let target = 0;
      while (true) {
        window.scrollTo(0, target);
        await delay(450);                       // let it paint + respect the capture rate limit
        const sy = window.scrollY;              // actual offset (clamped near the bottom)
        const img = await loadImg(await captureViewport());
        ctx.drawImage(img, 0, Math.round(sy * DPR));   // overlap on the last slice just overwrites identical pixels
        if (sy + viewH >= totalH - 1) break;
        target = sy + viewH;
      }
      return canvas.toDataURL('image/png');
    } finally {
      restored.forEach(([node, val, prio]) => node.style.setProperty('position', val, prio));
      window.scrollTo(0, startScroll);
    }
  }

  function region() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(10,12,20,0.18);';
      const rect = document.createElement('div');
      rect.style.cssText = 'position:fixed;display:none;border:2px solid #2348ff;background:rgba(35,72,255,0.14);box-shadow:0 0 0 9999px rgba(10,12,20,0.18);z-index:2147483647;';
      overlay.appendChild(rect);
      const hint = document.createElement('div');
      hint.textContent = 'Drag to select a region  ·  Esc to cancel';
      hint.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0b0e1a;color:#fff;font:600 12px/1.2 -apple-system,Segoe UI,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
      overlay.appendChild(hint);
      document.documentElement.appendChild(overlay);

      let sx = 0, sy = 0, dragging = false;
      const cleanup = () => { overlay.remove(); window.removeEventListener('keydown', onKey, true); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); resolve(null); } };
      window.addEventListener('keydown', onKey, true);

      overlay.addEventListener('mousedown', (e) => {
        dragging = true; sx = e.clientX; sy = e.clientY;
        rect.style.display = 'block'; overlay.style.background = 'transparent'; hint.style.display = 'none';
      });
      overlay.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
        rect.style.left = x + 'px'; rect.style.top = y + 'px';
        rect.style.width = Math.abs(e.clientX - sx) + 'px'; rect.style.height = Math.abs(e.clientY - sy) + 'px';
      });
      overlay.addEventListener('mouseup', async (e) => {
        if (!dragging) return;
        dragging = false;
        const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
        const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
        cleanup();                                   // remove overlay BEFORE capturing
        if (w < 5 || h < 5) { resolve(null); return; }
        await delay(60);
        const img = await loadImg(await captureViewport());
        const c = document.createElement('canvas');
        c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
        c.getContext('2d').drawImage(
          img, Math.round(x * DPR), Math.round(y * DPR), Math.round(w * DPR), Math.round(h * DPR),
          0, 0, Math.round(w * DPR), Math.round(h * DPR)
        );
        resolve(c.toDataURL('image/png'));
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.cmd !== 'run') return;
    const job = msg.mode === 'region' ? region() : fullPage();
    job
      .then((dataUrl) => { if (dataUrl) chrome.runtime.sendMessage({ cmd: 'captureResult', dataUrl }); })
      .catch((err) => chrome.runtime.sendMessage({ cmd: 'captureResult', error: String(err && err.message || err) }));
  });
}
