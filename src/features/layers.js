import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { escapeHTML } from '../utils/dom.js';
import { BLEND_MODES } from '../render/blend.js';
import { EASING_OPTIONS } from '../render/easing.js';
import { pruneSelection } from './selection.js';
import { animationPresetIds, trackForTarget, addAnimationTrack, removeAnimationTrack } from './animation.js';

function buildLayerList() {
  const layers = [];
  if (state.image) layers.push({ id: 'L:image', kind: 'image', name: 'Main image', icon: '🖼', visible: true, locked: false, ref: null });
  (state.extraImages || []).forEach((ex, i) => {
    layers.push({ id: 'L:extra:' + ex.id, kind: 'extraImage', name: ex.name || ('Image ' + (i + 2)), icon: '🖼', visible: ex.visible !== false, locked: !!ex.locked, ref: ex });
  });
  (state.redactions || []).forEach((r, i) => {
    layers.push({ id: 'L:redact:' + r.id, kind: 'redaction', name: r.name || ('Redaction ' + (i + 1)), icon: '▓', visible: r.visible !== false, locked: !!r.locked, ref: r });
  });
  (state.annotations || []).forEach((a, i) => {
    const iconMap = { arrow: '→', rect: '▭', circle: '○', number: '①', sticker: '✨' };
    const nameMap = { arrow: 'Arrow', rect: 'Rectangle', circle: 'Ellipse', number: 'Number', sticker: 'Sticker' };
    layers.push({
      id: 'L:ann:' + a.id, kind: 'annotation',
      name: a.name || (a.type === 'sticker' && a.glyph ? 'Sticker ' + a.glyph : nameMap[a.type] || a.type),
      icon: iconMap[a.type] || '◆',
      visible: a.visible !== false, locked: !!a.locked, ref: a
    });
  });
  if (state.spotlight && state.spotlight.enabled) {
    layers.push({ id: 'L:spotlight', kind: 'spotlight', name: 'Spotlight', icon: '◎', visible: true, locked: false, ref: state.spotlight });
  }
  if (state.textOverlay && state.textOverlay.enabled) {
    layers.push({ id: 'L:text', kind: 'text', name: 'Text: ' + (state.textOverlay.content || 'Untitled').slice(0, 18), icon: 'T', visible: true, locked: false, ref: state.textOverlay });
  }
  if (state.watermark && state.watermark.enabled) {
    layers.push({ id: 'L:watermark', kind: 'watermark', name: 'Watermark', icon: '©', visible: true, locked: false, ref: state.watermark });
  }
  return layers;
}

let _draggedLayerId = null;

export function renderLayersPanel() {
  const list = el.layersList;
  if (!list) return;
  const layers = buildLayerList();
  if (layers.length === 0) {
    list.innerHTML = '<div class="layers-empty">Load an image to see layers</div>';
    updateLayerStyleControls();
    return;
  }
  const reversed = layers.slice().reverse();
  list.innerHTML = reversed.map(l => {
    const isSelected = state.selection.layerIds.includes(l.id);
    const eye = l.visible ? '👁' : '⊘';
    const lock = l.locked ? '🔒' : '';
    return `<div class="layer-row${isSelected ? ' selected' : ''}" data-layer-id="${escapeHTML(l.id)}" draggable="true">
      <button class="layer-action-btn${l.visible ? ' active' : ''}" data-act="vis" title="Visibility">${eye}</button>
      <span class="layer-icon">${escapeHTML(l.icon)}</span>
      <span class="layer-name" data-name="${escapeHTML(l.id)}">${escapeHTML(l.name)}</span>
      <button class="layer-action-btn${l.locked ? ' locked' : ''}" data-act="lock" title="Lock">${lock || '🔓'}</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.layer-row').forEach(row => {
    const id = row.dataset.layerId;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.layer-action-btn')) return;
      if (e.shiftKey) {
        const i = state.selection.layerIds.indexOf(id);
        if (i >= 0) state.selection.layerIds.splice(i, 1);
        else state.selection.layerIds.push(id);
      } else {
        state.selection.layerIds = [id];
      }
      renderLayersPanel();
    });
    row.addEventListener('dblclick', () => beginRenameLayer(id));
    row.addEventListener('dragstart', () => { _draggedLayerId = id; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.layer-row').forEach(r => r.classList.remove('drop-target'));
      _draggedLayerId = null;
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      list.querySelectorAll('.layer-row').forEach(r => r.classList.remove('drop-target'));
      row.classList.add('drop-target');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drop-target');
      if (_draggedLayerId && _draggedLayerId !== id) reorderLayer(_draggedLayerId, id);
    });
  });
  list.querySelectorAll('.layer-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.layer-row');
      const id = row.dataset.layerId;
      const act = btn.dataset.act;
      if (act === 'vis') toggleLayerVisibility(id);
      if (act === 'lock') toggleLayerLock(id);
    });
  });
  updateLayerStyleControls();
}

// ── v15.0 — per-layer blend mode + opacity (layers panel footer) ──────────────
// Map a layer id to the object that actually carries the `blend`/`opacity`
// fields. The main image keeps them on a dedicated `state.imageLayer`; text /
// extra images / annotations carry them on the layer object itself. Other
// layer kinds (redaction, spotlight, watermark) don't support layer styles.
function styleTargetFor(id) {
  if (id === 'L:image') return state.imageLayer;
  if (id === 'L:text') return state.textOverlay;
  const f = findLayerRef(id);
  if (f && (f.kind === 'extra' || f.kind === 'ann')) return f.ref;
  return null;
}

function currentStyleTarget() {
  const ids = state.selection.layerIds;
  if (ids.length !== 1) return null;
  return styleTargetFor(ids[0]);
}

// v15.2 — map a selected layer id to its animation target ('image' for the main
// screenshot, else the layer id which the per-element draws key off).
function animTargetForId(id) {
  if (id === 'L:image') return 'image';
  if (id === 'L:text' || /^L:(ann|extra):/.test(id)) return id;
  return null;
}

// Show the footer only for a single selection that supports layer styles, and
// sync the controls to that layer's current values.
function updateLayerStyleControls() {
  const footer = el.layersFooter;
  if (!footer) return;
  const ids = state.selection.layerIds;
  const single = ids.length === 1 ? ids[0] : null;
  const tgt = currentStyleTarget();
  if (!tgt) { footer.hidden = true; return; }
  footer.hidden = false;
  const opacity = tgt.opacity != null ? tgt.opacity : 100;
  if (el.layerBlend) el.layerBlend.value = tgt.blend || 'source-over';
  if (el.layerOpacity) el.layerOpacity.value = opacity;
  if (el.layerOpacityValue) el.layerOpacityValue.textContent = opacity + '%';

  // Entrance animation controls: reflect the track targeting this layer.
  const target = animTargetForId(single);
  const track = target ? trackForTarget(target) : null;
  if (el.layerEntrancePreset) el.layerEntrancePreset.value = track ? track.preset : '';
  if (el.layerEntranceEasing) el.layerEntranceEasing.value = track ? (track.easing || 'easeInOut') : 'easeInOut';
  if (el.layerEntranceEasingRow) el.layerEntranceEasingRow.hidden = !track;
}

function bindLayerStyleControls() {
  if (el.layerBlend) {
    el.layerBlend.innerHTML = BLEND_MODES.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    el.layerBlend.addEventListener('change', (e) => {
      const tgt = currentStyleTarget();
      if (!tgt) return;
      saveStateToHistory();
      tgt.blend = e.target.value;
      render();
    });
  }
  if (el.layerOpacity) {
    // Live preview on drag; commit one history entry on release (matches the
    // linkSlider convention used by the rest of the editor's sliders).
    el.layerOpacity.addEventListener('input', (e) => {
      const tgt = currentStyleTarget();
      if (!tgt) return;
      const v = parseInt(e.target.value, 10);
      tgt.opacity = v;
      if (el.layerOpacityValue) el.layerOpacityValue.textContent = v + '%';
      render();
    });
    el.layerOpacity.addEventListener('change', () => {
      if (currentStyleTarget()) saveStateToHistory();
    });
  }

  // v15.2 — per-element entrance preset + easing for the single selection.
  if (el.layerEntrancePreset) {
    el.layerEntrancePreset.innerHTML = '<option value="">None</option>' +
      animationPresetIds().map(p => `<option value="${p}">${p}</option>`).join('');
    el.layerEntrancePreset.addEventListener('change', (e) => {
      const ids = state.selection.layerIds;
      if (ids.length !== 1) return;
      if (e.target.value) addAnimationTrack(e.target.value);   // targets the selection
      else removeAnimationTrack(animTargetForId(ids[0]));
      updateLayerStyleControls();
    });
  }
  if (el.layerEntranceEasing) {
    el.layerEntranceEasing.innerHTML = EASING_OPTIONS.map(o =>
      `<option value="${o.id}">${o.name}</option>`).join('');
    el.layerEntranceEasing.addEventListener('change', (e) => {
      const ids = state.selection.layerIds;
      if (ids.length !== 1) return;
      const track = trackForTarget(animTargetForId(ids[0]));
      if (!track) return;
      saveStateToHistory();
      track.easing = e.target.value;
      render();
    });
  }
}

function findLayerRef(id) {
  if (id === 'L:image') return { kind: 'image', ref: state.image };
  if (id === 'L:spotlight') return { kind: 'spotlight', ref: state.spotlight };
  if (id === 'L:text') return { kind: 'text', ref: state.textOverlay };
  if (id === 'L:watermark') return { kind: 'watermark', ref: state.watermark };
  const m = /^L:(extra|redact|ann):(.+)$/.exec(id);
  if (!m) return null;
  const map = { extra: state.extraImages, redact: state.redactions, ann: state.annotations };
  const arr = map[m[1]] || [];
  const item = arr.find(x => String(x.id) === m[2]);
  return item ? { kind: m[1], ref: item, arr } : null;
}

function toggleLayerVisibility(id) {
  const f = findLayerRef(id);
  if (!f || !f.ref) return;
  if (f.kind === 'spotlight') state.spotlight.enabled = !state.spotlight.enabled;
  else if (f.kind === 'text') state.textOverlay.enabled = !state.textOverlay.enabled;
  else if (f.kind === 'watermark') state.watermark.enabled = !state.watermark.enabled;
  else f.ref.visible = f.ref.visible === false ? true : false;
  pruneSelection();
  render(); renderLayersPanel();
}

function toggleLayerLock(id) {
  const f = findLayerRef(id);
  if (!f || !f.ref) return;
  f.ref.locked = !f.ref.locked;
  pruneSelection();
  render(); renderLayersPanel();
}

function beginRenameLayer(id) {
  const f = findLayerRef(id);
  if (!f || !f.ref || f.kind === 'image' || f.kind === 'spotlight' || f.kind === 'text' || f.kind === 'watermark') return;
  // Ids can come from gallery / collab JSON, so match on dataset (unescaped)
  // instead of building a selector from them.
  const span = [...el.layersList.querySelectorAll('.layer-name')].find(n => n.dataset.name === id);
  if (!span) return;
  span.setAttribute('contenteditable', 'true');
  span.focus();
  const range = document.createRange(); range.selectNodeContents(span);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const commit = () => {
    span.removeAttribute('contenteditable');
    f.ref.name = span.textContent.trim() || f.ref.name;
    renderLayersPanel();
  };
  span.addEventListener('blur', commit, { once: true });
  span.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
    if (e.key === 'Escape') { span.textContent = f.ref.name || ''; span.blur(); }
  });
}

function reorderLayer(fromId, toId) {
  const fa = findLayerRef(fromId), ta = findLayerRef(toId);
  if (!fa || !ta || fa.kind !== ta.kind || !fa.arr) return;
  saveStateToHistory();
  const arr = fa.arr;
  const fi = arr.findIndex(x => x === fa.ref);
  const ti = arr.findIndex(x => x === ta.ref);
  if (fi < 0 || ti < 0) return;
  arr.splice(fi, 1);
  arr.splice(ti, 0, fa.ref);
  render(); renderLayersPanel();
}

export function toggleLayersPanel() {
  state.ui.layersCollapsed = !state.ui.layersCollapsed;
  el.layersPanel.classList.toggle('collapsed', state.ui.layersCollapsed);
  document.querySelector('.main-content').classList.toggle('layers-collapsed', state.ui.layersCollapsed);
}

export function bindLayersEvents() {
  if (el.layersToggleBtn) el.layersToggleBtn.addEventListener('click', toggleLayersPanel);
  bindLayerStyleControls();
}

export function altSelectAt(e) {
  const canvas = el.previewCanvas;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const layers = buildLayerList();
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (!L.visible) continue;
    if (L.kind === 'annotation' || L.kind === 'redaction') {
      const r = L.ref;
      let bx, by, bw, bh;
      if (L.kind === 'redaction') { bx = r.x; by = r.y; bw = r.w; bh = r.h; }
      else {
        bx = Math.min(r.x1, r.x2); by = Math.min(r.y1, r.y2);
        bw = Math.abs(r.x2 - r.x1); bh = Math.abs(r.y2 - r.y1);
        if (r.type === 'number') { bx = r.x1 - 24; by = r.y1 - 24; bw = 48; bh = 48; }
      }
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        state.selection.layerIds = [L.id];
        renderLayersPanel();
        return true;
      }
    }
  }
  return false;
}
