import { state } from '../state/state.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';

let selectedStop = 0;
let dragIdx = -1;

function gradientCSS() {
  const g = state.gradient;
  const stops = g.colors.map((c, i) => `${c} ${g.positions[i]}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

function ensureSorted() {
  // Sort by position while keeping selectedStop pointing to same color/pos.
  const pairs = state.gradient.colors.map((c, i) => ({ c, p: state.gradient.positions[i], wasSel: i === selectedStop }));
  pairs.sort((a, b) => a.p - b.p);
  state.gradient.colors = pairs.map(x => x.c);
  state.gradient.positions = pairs.map(x => x.p);
  const newSel = pairs.findIndex(x => x.wasSel);
  if (newSel >= 0) selectedStop = newSel;
}

export function renderGradientEditor() {
  const strip = document.getElementById('gradient-strip');
  const stopCtrls = document.getElementById('gradient-stop-controls');
  if (!strip) return;

  strip.style.background = gradientCSS();
  // Clear existing stop markers
  strip.querySelectorAll('.grad-stop-marker').forEach(n => n.remove());

  state.gradient.colors.forEach((color, i) => {
    const marker = document.createElement('div');
    marker.className = 'grad-stop-marker' + (i === selectedStop ? ' selected' : '');
    marker.style.left = state.gradient.positions[i] + '%';
    marker.style.background = color;
    marker.dataset.idx = i;
    marker.title = `${color} @ ${state.gradient.positions[i]}%`;
    strip.appendChild(marker);
  });

  if (stopCtrls) {
    const cur = state.gradient.colors[selectedStop];
    const pos = state.gradient.positions[selectedStop];
    const canDelete = state.gradient.colors.length > 2;
    stopCtrls.innerHTML = `
      <div class="control-group" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="color" id="grad-stop-color" value="${cur}" style="width:44px;height:32px;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;">
        <input type="range" class="range-input" id="grad-stop-pos" aria-label="Stop position" min="0" max="100" value="${pos}" style="flex:1;">
        <span class="range-value" id="grad-stop-pos-value" style="min-width:42px;">${pos}%</span>
        <button class="btn btn-secondary" id="grad-stop-delete" ${canDelete ? '' : 'disabled'} style="padding:4px 8px;" title="Delete color stop" aria-label="Delete color stop">🗑</button>
      </div>
      <p class="info-text">Click the strip to add a stop. Drag markers to move. ${state.gradient.colors.length} stop${state.gradient.colors.length === 1 ? '' : 's'}.</p>
    `;

    const colorInp = document.getElementById('grad-stop-color');
    const posInp = document.getElementById('grad-stop-pos');
    const posVal = document.getElementById('grad-stop-pos-value');
    const delBtn = document.getElementById('grad-stop-delete');

    colorInp.addEventListener('input', (e) => {
      state.gradient.colors[selectedStop] = e.target.value;
      renderGradientEditor();
      render();
    });
    colorInp.addEventListener('change', () => saveStateToHistory());

    posInp.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      state.gradient.positions[selectedStop] = v;
      posVal.textContent = v + '%';
      renderGradientEditor();
      render();
    });
    posInp.addEventListener('change', () => {
      ensureSorted();
      renderGradientEditor();
      saveStateToHistory();
    });

    delBtn.addEventListener('click', () => {
      if (state.gradient.colors.length <= 2) return;
      saveStateToHistory();
      state.gradient.colors.splice(selectedStop, 1);
      state.gradient.positions.splice(selectedStop, 1);
      if (selectedStop >= state.gradient.colors.length) selectedStop = state.gradient.colors.length - 1;
      renderGradientEditor();
      render();
    });
  }
}

function getPctFromEvent(e, strip) {
  const rect = strip.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function onStripMouseDown(e) {
  const strip = e.currentTarget;
  if (e.target.classList && e.target.classList.contains('grad-stop-marker')) {
    selectedStop = parseInt(e.target.dataset.idx, 10);
    dragIdx = selectedStop;
    renderGradientEditor();
    e.preventDefault();
    return;
  }
  // Click on empty strip → add new stop with interpolated color
  const pct = getPctFromEvent(e, strip);
  saveStateToHistory();
  // Pick color from current gradient at pct: just clone nearest stop for simplicity
  let nearest = 0;
  let nearestDist = Infinity;
  state.gradient.positions.forEach((p, i) => {
    const d = Math.abs(p - pct);
    if (d < nearestDist) { nearestDist = d; nearest = i; }
  });
  state.gradient.colors.push(state.gradient.colors[nearest]);
  state.gradient.positions.push(pct);
  selectedStop = state.gradient.colors.length - 1;
  ensureSorted();
  renderGradientEditor();
  render();
}

function onDocMouseMove(e) {
  if (dragIdx < 0) return;
  const strip = document.getElementById('gradient-strip');
  if (!strip) return;
  const pct = getPctFromEvent(e, strip);
  state.gradient.positions[dragIdx] = pct;
  selectedStop = dragIdx;
  renderGradientEditor();
  render();
}

function onDocMouseUp() {
  if (dragIdx < 0) return;
  dragIdx = -1;
  ensureSorted();
  renderGradientEditor();
  saveStateToHistory();
}

export function bindGradientEditor() {
  const strip = document.getElementById('gradient-strip');
  if (!strip) return;
  strip.addEventListener('mousedown', onStripMouseDown);
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
  renderGradientEditor();
}

export function syncFromGradientState() {
  selectedStop = Math.min(selectedStop, Math.max(0, state.gradient.colors.length - 1));
  renderGradientEditor();
}
