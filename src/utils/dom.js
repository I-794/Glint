export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// v38 — text boxes only: a focused slider, checkbox or color input is not
// typing, so app-level undo/redo can act on it.
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file', 'image']);
export function isTextEntry(el) {
  if (!el) return false;
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((el.type || 'text').toLowerCase());
  return el.tagName === 'TEXTAREA' || !!el.isContentEditable;
}

export function isTypingTarget(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable;
}
