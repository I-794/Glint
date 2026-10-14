// Glint Capture — popup. Dispatches the chosen capture mode to the
// background and gets out of the way. Region/full-page need the page itself, so
// the popup closes immediately; the studio tab opens when the capture is ready.

const status = document.getElementById('status');

document.querySelectorAll('.mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    status.textContent = mode === 'region' ? 'Drag a region on the page…' : 'Capturing…';
    status.classList.add('busy');
    // Fire and close. Visible opens the studio tab right away; region/full-page
    // hand off to the in-page worker, which reports back to the background.
    chrome.runtime.sendMessage({ cmd: 'capture', mode });
    setTimeout(() => window.close(), mode === 'visible' ? 250 : 80);
  });
});
