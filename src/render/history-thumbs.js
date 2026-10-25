// v40 — Hindsight: a small picture of one history state. The state is swapped
// in (history.js withSnapshot), the full composition renders offscreen with the
// export passes (no selection chrome, graded even while backslash is held),
// then it is scaled down. Uses the current screenshot, like undo does.
import { state } from '../state/state.js';
import { withSnapshot } from '../state/history.js';
import { renderInto } from './render.js';

let full = null;

export function renderStepThumb(snap, width = 72) {
  if (!state.image || !snap) return null;
  if (!full) full = document.createElement('canvas');
  return withSnapshot(snap, () => {
    renderInto(full, true);
    if (!full.width || !full.height) return null;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.max(1, Math.round(full.height * width / full.width));
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, out.width, out.height);
    return out;
  });
}
