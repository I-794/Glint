// v39.5 Amplified — open the editor with a Gallery look applied.
//
// The site's Gallery links each card to /editor/?look=<name>. On load we apply
// that look (state/site-looks.js) on top of the fresh editor state, as one undo
// step, and strip the parameter so a refresh starts clean. Unknown names are
// ignored. Runs last in init() so its toast replaces the "Glint loaded" one.

import { state } from '../state/state.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { LOOKS, mergeLook } from '../state/site-looks.js';

export function bindLookLink() {
  let name = null;
  try { name = new URLSearchParams(location.search).get('look'); } catch (e) {}
  if (!name) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  const look = Object.prototype.hasOwnProperty.call(LOOKS, name) ? LOOKS[name] : null;
  if (!look) return;

  saveStateToHistory();
  mergeLook(state, look.state);
  window.__updateUIFromState && window.__updateUIFromState();
  render();
  showNotification(`${look.label} is ready. Drop in a screenshot to use it.`, 'success');
}
