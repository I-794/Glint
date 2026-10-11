import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { render } from '../render/render.js';
import { saveStateToHistory } from '../state/history.js';

const KEY = 'snapshotpro_templates';

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function saveAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); }
  catch (e) {}
}

function snapshotState() {
  return JSON.parse(JSON.stringify({
    imageFilters: state.imageFilters,
    textOverlay: state.textOverlay,
    watermark: state.watermark,
    gradient: state.gradient,
    padding: state.padding,
    scale: state.scale,
    borderRadius: state.borderRadius,
    showBorder: state.showBorder,
    borderWidth: state.borderWidth,
    borderColor: state.borderColor,
    shadow: state.shadow,
    canvas: state.canvas,
    bgMode: state.bgMode,
    bgColor: state.bgColor,
    deviceFrame: state.deviceFrame,
    meshGradient: state.meshGradient,
    tilt3d: state.tilt3d,
    scene: state.scene
  }));
}

export function saveTemplate() {
  const name = el.templateName.value.trim();
  if (!name) { showNotification('Enter a template name first.', 'error'); return; }
  const all = loadAll();
  all[name] = snapshotState();
  saveAll(all);
  el.templateName.value = '';
  updateTemplateList();
  showNotification(`Saved template "${name}"`, 'success');
}

export function loadTemplate() {
  const name = el.templateList.value;
  if (!name) return;
  const all = loadAll();
  const snap = all[name];
  if (!snap) { showNotification('Template not found.', 'error'); return; }
  saveStateToHistory();   // so Undo restores the design the template replaced
  Object.assign(state, snap);
  render();
  showNotification(`Loaded "${name}"`, 'success');
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
}

export function clearTemplates() {
  if (!confirm('Delete all saved templates?')) return;
  localStorage.removeItem(KEY);
  updateTemplateList();
  showNotification('All templates cleared.', 'success');
}

export function updateTemplateList() {
  const all = loadAll();
  const names = Object.keys(all);
  if (el.templateList) {
    el.templateList.innerHTML = '<option value="">-- Select Template --</option>' +
      names.map(n => `<option value="${n}">${n}</option>`).join('');
  }
  if (el.templateInfo) {
    el.templateInfo.textContent = names.length ? `${names.length} template${names.length === 1 ? '' : 's'} saved` : 'No templates saved';
  }
}

export function bindTemplates() {
  if (el.saveTemplateBtn) el.saveTemplateBtn.addEventListener('click', saveTemplate);
  if (el.loadTemplateBtn) el.loadTemplateBtn.addEventListener('click', loadTemplate);
  if (el.clearTemplatesBtn) el.clearTemplatesBtn.addEventListener('click', clearTemplates);
  updateTemplateList();
  window.__refreshTemplateList = updateTemplateList;
}
