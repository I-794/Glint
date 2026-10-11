import { history, undo, redo, onHistoryChange } from '../state/history.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';

export function renderHistoryTimeline() {
  const past = history.past || [];
  const future = history.future || [];
  // Header Undo/Redo state first: the editor has no #history-track today, and
  // returning before this left both buttons permanently disabled.
  if (el.undoBtn) el.undoBtn.disabled = past.length === 0;
  if (el.redoBtn) el.redoBtn.disabled = future.length === 0;
  const track = el.historyTrack;
  if (!track) return;
  const total = past.length + 1 + future.length;
  const currentIdx = past.length;
  let html = '';
  for (let i = 0; i < total; i++) {
    const cls = i === currentIdx ? 'current' : (i > currentIdx ? 'future' : '');
    html += `<div class="history-dot ${cls}" data-idx="${i}" title="Step ${i + 1}"></div>`;
  }
  track.innerHTML = html;
  if (el.historyPosition) el.historyPosition.textContent = (currentIdx + 1) + ' / ' + total;
  if (el.historyUndoBtn) el.historyUndoBtn.disabled = past.length === 0;
  if (el.historyRedoBtn) el.historyRedoBtn.disabled = future.length === 0;

  track.querySelectorAll('.history-dot').forEach(d => {
    d.addEventListener('click', () => jumpHistory(parseInt(d.dataset.idx, 10)));
  });
}

function jumpHistory(targetIdx) {
  const currentIdx = history.past.length;
  if (targetIdx === currentIdx) return;
  if (targetIdx < currentIdx) {
    for (let i = 0; i < currentIdx - targetIdx; i++) undo(render);
  } else {
    for (let i = 0; i < targetIdx - currentIdx; i++) redo(render);
  }
}

export function bindHistoryTimeline() {
  if (el.historyUndoBtn) el.historyUndoBtn.addEventListener('click', () => undo(render));
  if (el.historyRedoBtn) el.historyRedoBtn.addEventListener('click', () => redo(render));
  onHistoryChange(renderHistoryTimeline);
}
