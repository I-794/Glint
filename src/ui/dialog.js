// v41.0.1 — in-app replacements for window.prompt() and window.confirm().
//
// One native <dialog> opened with showModal(), so the browser handles the top
// layer, the focus trap, Escape and putting focus back. Both helpers return a
// promise: askText() resolves to the trimmed text or null (cancelled), and
// askConfirm() to true or false. Keys pressed inside the dialog stop there, so
// the editor's own shortcuts (Delete, Escape, arrows) never act behind it.

let dlg = null;
let settle = null;   // resolver of the dialog that is open now

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'glint-dialog';
  dlg.innerHTML = `
    <form method="dialog" class="glint-dialog-form">
      <h3 class="glint-dialog-title"></h3>
      <p class="glint-dialog-message"></p>
      <input class="control-input glint-dialog-input" type="text" autocomplete="off" />
      <div class="glint-dialog-actions">
        <button type="button" class="btn btn-secondary glint-dialog-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary glint-dialog-ok">OK</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('keydown', (e) => e.stopPropagation());
  dlg.querySelector('.glint-dialog-cancel').addEventListener('click', () => finish(false));
  dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(true); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });   // Escape
  // A click on the backdrop (outside the form) cancels, like the other overlays.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); });
}

function finish(ok) {
  if (!settle) return;
  const done = settle;
  settle = null;
  const input = dlg.querySelector('.glint-dialog-input');
  const value = input.hidden ? null : input.value.trim();
  dlg.close();
  done(ok, value);
}

function open({ title, message = '', okLabel = 'OK', danger = false, input = null }) {
  if (!dlg) build();
  if (settle) finish(false);   // a second ask replaces the first
  dlg.querySelector('.glint-dialog-title').textContent = title;
  const msg = dlg.querySelector('.glint-dialog-message');
  msg.textContent = message;
  msg.hidden = !message;
  const field = dlg.querySelector('.glint-dialog-input');
  field.hidden = !input;
  if (input) {
    field.value = input.value || '';
    field.placeholder = input.placeholder || '';
    field.type = input.type || 'text';
    field.setAttribute('aria-label', title);
  }
  const ok = dlg.querySelector('.glint-dialog-ok');
  ok.textContent = okLabel;
  ok.classList.toggle('btn-danger', danger);
  ok.classList.toggle('btn-primary', !danger);
  return new Promise((resolve) => {
    settle = (accepted, value) => resolve({ accepted, value });
    dlg.showModal();
    if (input) { field.focus(); field.select(); }
    else dlg.querySelector(danger ? '.glint-dialog-cancel' : '.glint-dialog-ok').focus();
  });
}

// Resolves to the trimmed text (possibly '') or null when cancelled.
export async function askText(title, { value = '', placeholder = '', okLabel = 'Save', message = '', type = 'text' } = {}) {
  const { accepted, value: text } = await open({ title, message, okLabel, input: { value, placeholder, type } });
  return accepted ? text : null;
}

// Resolves to true when confirmed. `danger` styles the button red and puts
// the starting focus on Cancel, so Enter alone never deletes.
export async function askConfirm(title, { message = '', okLabel = 'OK', danger = false } = {}) {
  const { accepted } = await open({ title, message, okLabel, danger });
  return accepted;
}
