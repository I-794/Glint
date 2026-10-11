import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { showUndoToast } from '../ui/notification.js';
import { render } from '../render/render.js';
import { spotlightDefaults } from '../render/spotlight-geom.js';
import { bokehDefaults } from '../render/bokeh-core.js';
import { compareDefaults } from '../render/compare-core.js';

export function resetToDefaults() {
  saveStateToHistory();

  state.imageTransform = { rotation: 0, flipH: false, flipV: false };
  state.imageFilters = { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0 };
  state.textOverlay = { enabled: false, content: '', size: 48, font: 'Arial', color: '#ffffff', bold: false, italic: false, x: 0.5, y: 0.5 };
  state.watermark = { enabled: false, text: '', position: 'bottom-right', size: 16, opacity: 50, color: '#ffffff' };
  state.gradient = { type: 'linear', angle: 135, colors: ['#667eea', '#764ba2'], positions: [0, 100] };
  state.padding = 60;
  state.scale = 100;
  state.borderRadius = 12;
  state.showBorder = false;
  state.borderWidth = 2;
  state.borderColor = '#ffffff';
  state.shadow = { blur: 40, spread: 10, opacity: 30, x: 0, y: 10, color: '#000000' };
  state.canvas = { width: 1200, height: 675 };
  state.bgMode = 'gradient';
  state.bgColor = '#1a1a2e';
  state.deviceFrame = { type: null, color: 'dark', url: 'https://example.com', title: 'Screenshot' };
  state.annotations = [];
  state.redactions = [];
  state.spotlight = spotlightDefaults();
  state.bokeh = bokehDefaults();
  state.compare = compareDefaults();
  state.annotationColor = '#ff3b30';
  state.annotationStrokeWidth = 4;
  state.tool = 'select';
  state.selectedAnnotation = null;
  state.selectedRedaction = null;
  state.nextNumber = 1;
  state.redactType = 'pixelate';
  state.redactIntensity = 12;
  state.extraImages = [];
  state.selectedExtraImage = null;
  state.canvasSelection = [];   // v28 — clear multi-select
  state.autoLayout = { pattern: 'free', gap: 40, align: 'center' };
  state.tilt3d = { rx: 0, ry: 0, rz: 0, perspective: 1200 };
  state.scene = { id: '' };

  // v33.2 — imageRegistry is deliberately left alone: undo restores the
  // extraImages records, which need their decoded images (keyed by id) to still
  // be there. Set panels and batch images live in the same registry too.

  render();
  if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
  showUndoToast('Reset to defaults', render);
}

export function bindResetButton() {
  if (el.resetBtn) el.resetBtn.addEventListener('click', resetToDefaults);
}
