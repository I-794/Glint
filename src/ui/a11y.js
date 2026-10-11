// v32.1 — accessibility pass for the editor chrome.
//
// 1. Icon-only buttons (✕, ↶, 🗑, ‹ ›, …) get an accessible name: their `title`
//    if present, else "Close" for close glyphs. `title` alone is not reliably
//    announced by screen readers. Runs once at startup and on DOM additions,
//    so dynamically built buttons are covered too.
// 2. The existing overlays become real modal dialogs without touching each
//    feature: role="dialog" + aria-modal + aria-labelledby, focus moves into the
//    dialog when it opens, Tab/Shift+Tab stay inside it, and focus returns to
//    whatever opened it when it closes. Open/close is detected by watching each
//    overlay's class/style, so the features keep toggling `.visible` /
//    `style.display` exactly as before.
// 3. (v33.1) Form controls get a name from their visible caption. The sidebar's
//    `<label class="control-label">` captions were never linked to their input
//    (no `for`), so screen readers announced a bare "slider". Each caption is
//    linked to the first unnamed control after it in the same parent; controls
//    still unnamed fall back to their title or placeholder.
// 4. (v33.1) Click-only `<div>` tiles (background/size/shadow presets, scenes,
//    3D demos, the upload drop zone) become focusable buttons: role="button",
//    tabindex=0, and Enter/Space fire the same click the mouse would.
// 5. (v33.1) Escape closes the Welcome and cloud/auth/versions dialogs by
//    clicking their own ✕, so each feature's close logic still runs.

const DIALOGS = '.auth-modal-overlay, .welcome-overlay, .present-overlay, .shortcuts-overlay, .palette-overlay';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CLOSE_GLYPHS = new Set(['✕', '×', '✖', 'x', 'X']);
const CONTROLS = 'input:not([type="hidden"]), select, textarea';
const TILES = '.preset-button, .size-preset-btn, .shadow-preset-btn, .scene-tile, #upload-zone';
const NATIVE = 'button, a[href], input, select, textarea, summary';
// Dialogs that only close via their ✕ (the palette/shortcuts overlays already handle Esc).
const ESC_DIALOGS = '.welcome-overlay, .auth-modal-overlay';

// Text with no letters or digits (emoji, arrows, symbols) is not a usable name.
function isIconOnly(btn) {
  const text = (btn.textContent || '').trim();
  return !text || !/[\p{L}\p{N}]{2,}/u.test(text);
}

function labelButton(btn) {
  if (btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')) return;
  if (!isIconOnly(btn)) return;
  const title = btn.getAttribute('title');
  if (title) { btn.setAttribute('aria-label', title); return; }
  if (CLOSE_GLYPHS.has((btn.textContent || '').trim())) btn.setAttribute('aria-label', 'Close');
}

// A wrapping <label> only names the control if it has text (the toggle
// switches wrap their checkbox in an empty <label class="switch">).
function hasName(c) {
  return c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby') ||
    [...(c.labels || [])].some(l => l.textContent.trim());
}

let ctlSeq = 0;
function linkCaption(label) {
  if (label.htmlFor || label.querySelector(CONTROLS)) return;
  const scope = label.parentElement;
  if (!scope) return;
  const ctrl = [...scope.querySelectorAll(CONTROLS)].find(c =>
    (label.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) && !hasName(c));
  if (!ctrl) return;
  if (!ctrl.id) ctrl.id = 'a11y-ctl-' + (++ctlSeq);
  label.htmlFor = ctrl.id;
}

function captionText(c) {
  const lbl = c.labels && c.labels[0];
  return lbl ? lbl.textContent.trim() : (c.getAttribute('aria-label') || '');
}

function nameControl(c) {
  if (hasName(c)) return;
  let name = c.getAttribute('title') || c.getAttribute('placeholder');
  // The hex text box beside a color swatch shares the swatch's caption.
  const wrap = !name && c.closest('.color-picker-wrapper');
  const swatch = wrap && wrap.querySelector('input[type="color"]');
  if (swatch && swatch !== c && captionText(swatch)) name = captionText(swatch) + ' hex';
  if (!name) name = c.closest('.toggle-switch')?.querySelector('.toggle-label')?.textContent.trim();
  if (!name) {
    const cap = c.closest('.control-group')?.querySelector('.control-label');
    if (cap) name = cap.textContent.trim();
  }
  if (name) c.setAttribute('aria-label', name);
}

function makeKeyable(tile) {
  if (tile.matches(NATIVE) || tile.hasAttribute('tabindex')) return;
  tile.setAttribute('role', 'button');
  tile.tabIndex = 0;
  tile.dataset.a11yKey = '';
  if (tile.id === 'upload-zone' && !tile.hasAttribute('aria-label')) tile.setAttribute('aria-label', 'Choose an image to upload');
}

function each(root, sel, fn) {
  if (root.matches && root.matches(sel)) fn(root);
  if (root.querySelectorAll) root.querySelectorAll(sel).forEach(fn);
}

function labelAll(root) {
  each(root, 'button', labelButton);
  each(root, 'label.control-label', linkCaption);
  each(root, CONTROLS, nameControl);
  each(root, TILES, makeKeyable);
}

function isOpen(overlay) {
  return getComputedStyle(overlay).display !== 'none';
}

function focusables(overlay) {
  return [...overlay.querySelectorAll(FOCUSABLE)].filter(n => n.getClientRects().length);
}

const openState = new WeakMap();   // overlay -> { returnTo }

function onOpen(overlay) {
  openState.set(overlay, { returnTo: document.activeElement });
  // Features that focus their own field (e.g. the palette input) already did so.
  if (overlay.contains(document.activeElement)) return;
  const first = focusables(overlay)[0];
  if (first) first.focus();
  else { overlay.setAttribute('tabindex', '-1'); overlay.focus(); }
}

function onClose(overlay) {
  const s = openState.get(overlay);
  openState.delete(overlay);
  const back = s && s.returnTo;
  if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
}

function setupDialog(overlay) {
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const heading = overlay.querySelector('h1, h2, h3');
  if (heading && !overlay.hasAttribute('aria-labelledby') && !overlay.hasAttribute('aria-label')) {
    if (!heading.id) heading.id = (overlay.id || 'dialog') + '-title';
    overlay.setAttribute('aria-labelledby', heading.id);
  } else if (!heading && !overlay.hasAttribute('aria-label')) {
    const names = { 'palette-overlay': 'Command palette', 'present-overlay': 'Presentation', 'welcome-overlay': 'Welcome' };
    if (names[overlay.id]) overlay.setAttribute('aria-label', names[overlay.id]);
  }

  let wasOpen = isOpen(overlay);
  if (wasOpen) openState.set(overlay, { returnTo: null });
  new MutationObserver(() => {
    const now = isOpen(overlay);
    if (now === wasOpen) return;
    wasOpen = now;
    if (now) onOpen(overlay); else onClose(overlay);
  }).observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });

  // Keep Tab inside the open dialog.
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !isOpen(overlay)) return;
    const f = focusables(overlay);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

export function bindA11y() {
  labelAll(document.body);
  document.querySelectorAll(DIALOGS).forEach(setupDialog);

  // Capture phase so these run before keyboard.js's document-level shortcuts.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t instanceof Element && t.hasAttribute('data-a11y-key')) {
      e.preventDefault();
      e.stopPropagation();
      t.click();
      return;
    }
    if (e.key === 'Escape') {
      const open = [...document.querySelectorAll(ESC_DIALOGS)].filter(isOpen);
      const top = open[open.length - 1];
      const close = top && top.querySelector('.welcome-close, [id$="-close"]');
      if (close) { e.preventDefault(); e.stopPropagation(); close.click(); }
    }
  }, true);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) labelAll(n); });
  }).observe(document.body, { childList: true, subtree: true });
}
