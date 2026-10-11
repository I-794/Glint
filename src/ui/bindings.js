import { state } from '../state/state.js';
import { el } from './elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { gradientPresets, shadowPresets, sizePresets, artFilterPresets } from '../state/presets.js';
import { isValidHex } from '../utils/color.js';
import { applyMeshPreset, renderMeshPad } from '../features/mesh-pad.js';
import { renderGradientEditor, syncFromGradientState } from '../features/gradient-editor.js';
import { syncMotionExportControls } from '../features/video-export.js';
import { refreshAnimationUI } from '../features/animation.js';
import { refreshKenBurnsUI } from '../features/ken-burns.js';
import { refreshEffectsUI } from '../features/effects-ui.js';
import { refreshPalettesUI } from '../features/palettes.js';
import { refreshColorMapUI } from '../features/color-map.js';
import { refreshMockup3dUI } from '../features/mockup-3d-ui.js';
import { upgradeSpotlight } from '../render/spotlight-geom.js';
import { refreshBokehUI } from '../features/bokeh-ui.js';
import { refreshCompareUI } from '../features/compare-ui.js';
import { setSelection } from '../features/selection.js';
import { clearAllRedactions } from '../features/canvas-tools.js';

// Helper: link a slider+display to a state value with optional onChange (for history).
function linkSlider(input, display, getStr, setVal, opts = {}) {
  if (!input) return;
  input.addEventListener('input', (e) => {
    const v = opts.float ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
    setVal(v);
    if (display) display.textContent = getStr(v);
    render();
  });
  input.addEventListener('change', () => saveStateToHistory());
}

// Hex color text input with validation
function linkColor(colorInput, textInput, setVal) {
  if (colorInput) {
    colorInput.addEventListener('input', (e) => {
      const v = e.target.value;
      if (textInput) textInput.value = v;
      setVal(v); render();
    });
    colorInput.addEventListener('change', () => saveStateToHistory());
  }
  if (textInput) {
    textInput.addEventListener('input', (e) => {
      const v = e.target.value;
      if (isValidHex(v)) {
        if (colorInput) colorInput.value = v;
        setVal(v); render();
      }
    });
    textInput.addEventListener('change', () => saveStateToHistory());
  }
}

function setBgMode(mode) {
  state.bgMode = mode;
  document.querySelectorAll('.tab-btn[data-bg]').forEach(b => b.classList.toggle('active', b.dataset.bg === mode));
  if (el.bgGradientPanel) el.bgGradientPanel.style.display = mode === 'gradient' ? 'block' : 'none';
  if (el.bgMeshPanel) el.bgMeshPanel.style.display = mode === 'mesh' ? 'block' : 'none';
  if (el.bgSolidPanel) el.bgSolidPanel.style.display = mode === 'solid' ? 'block' : 'none';
  if (el.bgPatternPanel) el.bgPatternPanel.style.display = mode === 'pattern' ? 'block' : 'none';
  if (el.bgTransparentPanel) el.bgTransparentPanel.style.display = mode === 'transparent' ? 'block' : 'none';
  if (mode === 'mesh') {
    renderMeshPad();
  }
  render();
}

function updateGradientPreview() {
  if (!el.gradientPreview) return;
  const g = state.gradient;
  const stops = g.colors.map((c, i) => `${c} ${g.positions[i]}%`).join(', ');
  if (g.type === 'linear') {
    el.gradientPreview.style.background = `linear-gradient(${g.angle}deg, ${stops})`;
  } else {
    el.gradientPreview.style.background = `radial-gradient(circle, ${stops})`;
  }
  if (el.angleIndicator) el.angleIndicator.style.transform = `translate(-50%, -100%) rotate(${g.angle}deg)`;
  renderGradientEditor();
}

function updateDeviceFrameSubcontrols() {
  if (!el.deviceFrameControls) return;
  const t = state.deviceFrame.type;
  el.deviceFrameControls.style.display = t ? 'block' : 'none';
  const isBrowser = (t === 'chrome' || t === 'safari' || t === 'firefox');
  const isWindow = (t === 'macos' || t === 'windows');
  if (el.frameUrlGroup) el.frameUrlGroup.style.display = isBrowser ? 'block' : 'none';
  if (el.frameTitleGroup) el.frameTitleGroup.style.display = isWindow ? 'block' : 'none';
}

function updateBorderControls() {
  if (el.borderControls) el.borderControls.style.display = state.showBorder ? 'block' : 'none';
}

function updateTextControls() {
  if (el.textControls) el.textControls.style.display = state.textOverlay.enabled ? 'block' : 'none';
  if (el.addTextBtn) el.addTextBtn.textContent = state.textOverlay.enabled ? '✏️ Edit Text' : '+ Add Text';
}

// v14 — fill in the text-effect sub-objects on designs saved before v14 (which
// only had the flat textOverlay), so the controls and edits have somewhere to
// write. Idempotent: a no-op once the groups exist.
function ensureTextEffectDefaults() {
  const t = state.textOverlay;
  if (!t.stroke) t.stroke = { enabled: false, width: 2, color: '#000000' };
  if (!t.gradient) t.gradient = { enabled: false, color1: '#ffffff', color2: '#2348ff', angle: 0 };
  if (!t.highlight) t.highlight = { enabled: false, color: '#ffff00', padding: 8, radius: 6 };
  if (!t.shadow) t.shadow = { enabled: false, blur: 6, x: 2, y: 2, color: '#000000' };
}

// v15.0 — restore the main-image layer style on designs saved before v15 (an
// Object.assign restore drops any key the saved object lacks). Per-item blend/
// opacity on annotations / extra images / text are optional and read as no-ops
// when absent, so only the dedicated imageLayer object needs backfilling.
function ensureLayerStyleDefaults() {
  if (!state.imageLayer) state.imageLayer = { blend: 'source-over', opacity: 100 };
}

// v15.2 — backfill the animation block on designs saved before animation was
// serialized (an Object.assign restore drops any key the saved object lacks),
// and force the playback runtime off so a restored design never starts mid-
// frame. Idempotent.
function ensureAnimationDefaults() {
  const a = state.animation || (state.animation = {});
  if (typeof a.enabled !== 'boolean') a.enabled = false;
  if (typeof a.duration !== 'number') a.duration = 3000;
  if (!Array.isArray(a.tracks)) a.tracks = [];
  a.playing = false;
  a.currentTime = 0;
}

// v16.1 — backfill the Studio Effects blocks on designs saved before v16.
function ensureEffectsDefaults() {
  if (!state.glass) state.glass = { enabled: false, x: 0.3, y: 0.3, w: 0.4, h: 0.3, radius: 24, blur: 12, tint: '#ffffff', tintOpacity: 12, rim: true, rimOpacity: 40 };
  if (!state.grain) state.grain = { enabled: false, amount: 18, scale: 1, blend: 'overlay', monochrome: true };
}

// v16.2 — backfill + reflect the pattern background block.
function ensurePatternDefaults() {
  if (!state.pattern) state.pattern = { type: 'dots', fg: '#ffffff', bg: '#1a1a2e', size: 24, opacity: 100, angle: 0 };
}

// v17 — backfill the Color blocks on designs/templates saved before v17 (an
// Object.assign restore drops keys the saved object lacks). temperature/tint
// join imageFilters; colorPalettes/colorMap get their neutral no-op defaults.
function ensureColorDefaults() {
  const f = state.imageFilters || (state.imageFilters = {});
  if (typeof f.temperature !== 'number') f.temperature = 0;
  if (typeof f.tint !== 'number') f.tint = 0;
  if (!state.colorPalettes || typeof state.colorPalettes !== 'object') state.colorPalettes = { active: null, library: {} };
  if (!state.colorPalettes.library) state.colorPalettes.library = {};
  if (!state.colorMap || typeof state.colorMap !== 'object') state.colorMap = { mode: 'off', intensity: 100, steps: 6 };
}
function refreshPatternUI() {
  const p = state.pattern;
  if (el.patternFg) el.patternFg.value = p.fg;
  if (el.patternFgText) el.patternFgText.value = p.fg;
  if (el.patternBg) el.patternBg.value = p.bg;
  if (el.patternBgText) el.patternBgText.value = p.bg;
  if (el.patternSize) el.patternSize.value = p.size;
  if (el.patternSizeValue) el.patternSizeValue.textContent = p.size;
  if (el.patternOpacity) el.patternOpacity.value = p.opacity;
  if (el.patternOpacityValue) el.patternOpacityValue.textContent = p.opacity + '%';
  if (el.patternAngle) el.patternAngle.value = p.angle;
  if (el.patternAngleValue) el.patternAngleValue.textContent = p.angle + '°';
  document.querySelectorAll('.tab-btn[data-pattern-type]').forEach(b => b.classList.toggle('active', b.dataset.patternType === p.type));
}

// v15.2 — backfill the Ken Burns block on designs saved before it existed.
function ensureKenBurnsDefaults() {
  const k = state.kenBurns || (state.kenBurns = {});
  if (typeof k.enabled !== 'boolean') k.enabled = false;
  if (typeof k.fromScale !== 'number') k.fromScale = 1.0;
  if (typeof k.toScale !== 'number') k.toScale = 1.2;
  if (typeof k.fromX !== 'number') k.fromX = 0.5;
  if (typeof k.fromY !== 'number') k.fromY = 0.5;
  if (typeof k.toX !== 'number') k.toX = 0.5;
  if (typeof k.toY !== 'number') k.toY = 0.5;
  if (typeof k.easing !== 'string') k.easing = 'easeInOut';
}

function updateTextEffectControls() {
  if (el.textStrokeControls) el.textStrokeControls.style.display = state.textOverlay.stroke?.enabled ? 'block' : 'none';
  if (el.textGradientControls) el.textGradientControls.style.display = state.textOverlay.gradient?.enabled ? 'block' : 'none';
  if (el.textHighlightControls) el.textHighlightControls.style.display = state.textOverlay.highlight?.enabled ? 'block' : 'none';
  if (el.textShadowControls) el.textShadowControls.style.display = state.textOverlay.shadow?.enabled ? 'block' : 'none';
}

function updateWatermarkControls() {
  if (el.watermarkControls) el.watermarkControls.style.display = state.watermark.enabled ? 'block' : 'none';
}

// v34 — push state.spotlight into the Spotlight section (also run after undo/redo).
export function refreshSpotlightUI() {
  if (!el.spotlightEnabled || !state.spotlight) return;
  const set = (e, val) => { if (e) e.value = val; };
  const txt = (e, val) => { if (e) e.textContent = val; };
  const sp = state.spotlight;
  el.spotlightEnabled.checked = sp.enabled;
  set(el.spotlightOpacity, Math.round(sp.opacity * 100));
  txt(el.spotlightOpacityValue, Math.round(sp.opacity * 100) + '%');
  set(el.spotlightBlur, sp.blur || 0); txt(el.spotlightBlurValue, (sp.blur || 0) + 'px');
  set(el.spotlightFeather, sp.feather || 0); txt(el.spotlightFeatherValue, (sp.feather || 0) + 'px');
  set(el.spotlightTint, sp.tint || '#000000'); set(el.spotlightTintText, sp.tint || '#000000');
  set(el.spotlightShape, sp.shape || 'rect');
  updateSpotlightControls();
}

function updateSpotlightControls() {
  if (el.spotlightControls) el.spotlightControls.style.display = state.spotlight.enabled ? 'block' : 'none';
  const n = Array.isArray(state.spotlight.regions) ? state.spotlight.regions.length : 0;
  if (el.spotlightCount) el.spotlightCount.textContent = n === 1 ? '1 focus area.' : `${n} focus areas.`;
}

function updateReflectionControls() {
  if (el.reflectionControls) el.reflectionControls.style.display = state.reflection.enabled ? 'block' : 'none';
}

function updateQualityControls() {
  if (el.qualityControls) el.qualityControls.style.display = state.exportSettings.format === 'png' ? 'none' : 'block';
}

function bindImageEditing() {
  if (el.rotateLeftBtn) el.rotateLeftBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.imageTransform.rotation = (state.imageTransform.rotation - 90 + 360) % 360;
    render();
  });
  if (el.rotateRightBtn) el.rotateRightBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.imageTransform.rotation = (state.imageTransform.rotation + 90) % 360;
    render();
  });
  if (el.flipHBtn) el.flipHBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.imageTransform.flipH = !state.imageTransform.flipH;
    render();
  });
  if (el.flipVBtn) el.flipVBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.imageTransform.flipV = !state.imageTransform.flipV;
    render();
  });

  linkSlider(el.brightness, el.brightnessValue, v => v + '%', v => state.imageFilters.brightness = v);
  linkSlider(el.contrast, el.contrastValue, v => v + '%', v => state.imageFilters.contrast = v);
  linkSlider(el.saturation, el.saturationValue, v => v + '%', v => state.imageFilters.saturation = v);
  linkSlider(el.blur, el.blurValue, v => v + 'px', v => state.imageFilters.blur = v);
  linkSlider(el.grayscale, el.grayscaleValue, v => v + '%', v => state.imageFilters.grayscale = v);
  linkSlider(el.sepia, el.sepiaValue, v => v + '%', v => state.imageFilters.sepia = v);
  // v17 — temperature/tint (per-pixel grade via render/color-grade.js).
  linkSlider(el.temperature, el.temperatureValue, v => String(v), v => state.imageFilters.temperature = v);
  linkSlider(el.tint, el.tintValue, v => String(v), v => state.imageFilters.tint = v);
}

function bindBackground() {
  document.querySelectorAll('.tab-btn[data-bg]').forEach(btn => {
    btn.addEventListener('click', () => { saveStateToHistory(); setBgMode(btn.dataset.bg); });
  });

  document.querySelectorAll('.preset-button[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = gradientPresets[btn.dataset.preset];
      if (!p) return;
      saveStateToHistory();
      state.gradient.colors = [...p.colors];
      state.gradient.positions = [...p.positions];
      state.gradient.angle = p.angle;
      if (el.gradientAngle) el.gradientAngle.value = p.angle;
      if (el.gradientAngleValue) el.gradientAngleValue.textContent = p.angle + '°';
      document.querySelectorAll('.preset-button').forEach(b => b.classList.toggle('active', b === btn));
      syncFromGradientState();
      updateGradientPreview();
      render();
    });
  });

  document.querySelectorAll('.tab-btn[data-mesh-preset]').forEach(b => {
    b.addEventListener('click', () => applyMeshPreset(b.dataset.meshPreset));
  });

  if (el.gradientType) el.gradientType.addEventListener('change', (e) => {
    saveStateToHistory();
    state.gradient.type = e.target.value;
    if (el.gradientAngleGroup) el.gradientAngleGroup.style.display = e.target.value === 'linear' ? 'block' : 'none';
    updateGradientPreview();
    render();
  });

  linkSlider(el.gradientAngle, el.gradientAngleValue, v => v + '°', v => {
    state.gradient.angle = v; updateGradientPreview();
  });

  linkColor(el.bgSolidColor, el.bgSolidColorText, v => state.bgColor = v);

  // v16.2 — pattern background controls.
  document.querySelectorAll('.tab-btn[data-pattern-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveStateToHistory();
      state.pattern.type = btn.dataset.patternType;
      document.querySelectorAll('.tab-btn[data-pattern-type]').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
  linkColor(el.patternFg, el.patternFgText, v => state.pattern.fg = v);
  linkColor(el.patternBg, el.patternBgText, v => state.pattern.bg = v);
  linkSlider(el.patternSize, el.patternSizeValue, v => v, v => state.pattern.size = v);
  linkSlider(el.patternOpacity, el.patternOpacityValue, v => v + '%', v => state.pattern.opacity = v);
  linkSlider(el.patternAngle, el.patternAngleValue, v => v + '°', v => state.pattern.angle = v);
}

// v16.2 — art-filter presets: each replaces state.imageFilters wholesale, then
// updateUIFromState re-syncs every filter slider. Exports for free (render reads
// state.imageFilters).
function bindArtFilterPresets() {
  document.querySelectorAll('.tab-btn[data-art-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = artFilterPresets[btn.dataset.artPreset];
      if (!preset) return;
      saveStateToHistory();
      state.imageFilters = { ...preset };
      updateUIFromState();
      render();
    });
  });
}

function bindImageSettings() {
  linkSlider(el.padding, el.paddingValue, v => v + 'px', v => state.padding = v);
  linkSlider(el.scale, el.scaleValue, v => v + '%', v => state.scale = v);
  linkSlider(el.borderRadius, el.borderRadiusValue, v => v + 'px', v => state.borderRadius = v);
  if (el.showBorder) el.showBorder.addEventListener('change', (e) => {
    saveStateToHistory();
    state.showBorder = e.target.checked;
    updateBorderControls();
    render();
  });
  linkSlider(el.borderWidth, el.borderWidthValue, v => v + 'px', v => state.borderWidth = v);
  linkColor(el.borderColor, el.borderColorText, v => state.borderColor = v);
}

function bindDeviceFrame() {
  if (el.deviceFrameType) el.deviceFrameType.addEventListener('change', (e) => {
    saveStateToHistory();
    state.deviceFrame.type = e.target.value || null;
    updateDeviceFrameSubcontrols();
    render();
  });
  if (el.deviceFrameColor) el.deviceFrameColor.addEventListener('change', (e) => {
    saveStateToHistory();
    state.deviceFrame.color = e.target.value;
    render();
  });
  if (el.frameUrl) el.frameUrl.addEventListener('input', (e) => {
    state.deviceFrame.url = e.target.value; render();
  });
  if (el.frameUrl) el.frameUrl.addEventListener('change', () => saveStateToHistory());
  if (el.frameTitle) el.frameTitle.addEventListener('input', (e) => {
    state.deviceFrame.title = e.target.value; render();
  });
  if (el.frameTitle) el.frameTitle.addEventListener('change', () => saveStateToHistory());
}

function bindShadow() {
  document.querySelectorAll('.shadow-preset-btn[data-shadow]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = shadowPresets[btn.dataset.shadow];
      if (!p) return;
      saveStateToHistory();
      Object.assign(state.shadow, p);
      if (el.shadowBlur) el.shadowBlur.value = p.blur;
      if (el.shadowSpread) el.shadowSpread.value = p.spread;
      if (el.shadowOpacity) el.shadowOpacity.value = p.opacity;
      if (el.shadowX) el.shadowX.value = p.x;
      if (el.shadowY) el.shadowY.value = p.y;
      if (el.shadowBlurValue) el.shadowBlurValue.textContent = p.blur + 'px';
      if (el.shadowSpreadValue) el.shadowSpreadValue.textContent = p.spread + 'px';
      if (el.shadowOpacityValue) el.shadowOpacityValue.textContent = p.opacity + '%';
      if (el.shadowXValue) el.shadowXValue.textContent = p.x + 'px';
      if (el.shadowYValue) el.shadowYValue.textContent = p.y + 'px';
      document.querySelectorAll('.shadow-preset-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
  linkSlider(el.shadowBlur, el.shadowBlurValue, v => v + 'px', v => state.shadow.blur = v);
  linkSlider(el.shadowSpread, el.shadowSpreadValue, v => v + 'px', v => state.shadow.spread = v);
  linkSlider(el.shadowOpacity, el.shadowOpacityValue, v => v + '%', v => state.shadow.opacity = v);
  linkSlider(el.shadowX, el.shadowXValue, v => v + 'px', v => state.shadow.x = v);
  linkSlider(el.shadowY, el.shadowYValue, v => v + 'px', v => state.shadow.y = v);
  linkColor(el.shadowColor, el.shadowColorText, v => state.shadow.color = v);
}

function bindRedactionSpotlight() {
  if (el.redactType) el.redactType.addEventListener('change', (e) => { state.redactType = e.target.value; });
  linkSlider(el.redactIntensity, el.redactIntensityValue, v => String(v), v => state.redactIntensity = v);
  if (el.clearRedactionsBtn) el.clearRedactionsBtn.addEventListener('click', clearAllRedactions);
  if (el.spotlightEnabled) el.spotlightEnabled.addEventListener('change', (e) => {
    saveStateToHistory();
    state.spotlight = upgradeSpotlight(state.spotlight);
    state.spotlight.enabled = e.target.checked;
    // v34 — turning it on with no focus areas adds a centered one to start from.
    if (state.spotlight.enabled && !state.spotlight.regions.length) {
      state.spotlight.regions.push({ id: Date.now(), x: 0.2, y: 0.2, w: 0.6, h: 0.6, shape: state.spotlight.shape });
    }
    updateSpotlightControls();
    render();
  });
  linkSlider(el.spotlightOpacity, el.spotlightOpacityValue, v => v + '%', v => state.spotlight.opacity = v / 100);
  linkSlider(el.spotlightBlur, el.spotlightBlurValue, v => v + 'px', v => state.spotlight.blur = v);
  linkSlider(el.spotlightFeather, el.spotlightFeatherValue, v => v + 'px', v => state.spotlight.feather = v);
  linkColor(el.spotlightTint, el.spotlightTintText, v => state.spotlight.tint = v);
  if (el.spotlightShape) el.spotlightShape.addEventListener('change', (e) => {
    saveStateToHistory();
    const shape = e.target.value;
    state.spotlight = upgradeSpotlight(state.spotlight);
    state.spotlight.shape = shape;
    // Reshape the selected focus areas too; new ones use this shape.
    const ids = state.canvasSelection.filter((s) => s.kind === 'spotlight').map((s) => s.id);
    (state.spotlight.regions || []).forEach((r) => { if (ids.includes(r.id)) r.shape = shape; });
    render();
  });
  if (el.spotlightClearBtn) el.spotlightClearBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.spotlight.regions = [];
    setSelection(state.canvasSelection.filter((s) => s.kind !== 'spotlight'));
    updateSpotlightControls();
    render();
  });
}

function bindReflection() {
  if (el.reflectionEnabled) el.reflectionEnabled.addEventListener('change', (e) => {
    saveStateToHistory();
    state.reflection.enabled = e.target.checked;
    updateReflectionControls();
    render();
  });
  linkSlider(el.reflectionOpacity, el.reflectionOpacityValue, v => v + '%', v => state.reflection.opacity = v / 100);
  linkSlider(el.reflectionLength, el.reflectionLengthValue, v => v + '%', v => state.reflection.length = v / 100);
  linkSlider(el.reflectionGap, el.reflectionGapValue, v => v + 'px', v => state.reflection.gap = v);
}

function bindCanvasSize() {
  const update = () => {
    state.canvas.width = parseInt(el.canvasWidth.value, 10) || 1200;
    state.canvas.height = parseInt(el.canvasHeight.value, 10) || 675;
    render();
  };
  if (el.canvasWidth) {
    el.canvasWidth.addEventListener('input', update);
    el.canvasWidth.addEventListener('change', () => saveStateToHistory());
  }
  if (el.canvasHeight) {
    el.canvasHeight.addEventListener('input', update);
    el.canvasHeight.addEventListener('change', () => saveStateToHistory());
  }
  document.querySelectorAll('.size-preset-btn[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = sizePresets[btn.dataset.size];
      if (!p) return;
      saveStateToHistory();
      state.canvas.width = p.width;
      state.canvas.height = p.height;
      if (el.canvasWidth) el.canvasWidth.value = p.width;
      if (el.canvasHeight) el.canvasHeight.value = p.height;
      document.querySelectorAll('.size-preset-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
}

function bindText() {
  if (el.addTextBtn) el.addTextBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.textOverlay.enabled = !state.textOverlay.enabled;
    if (state.textOverlay.enabled && !state.textOverlay.content) state.textOverlay.content = 'Your text here';
    if (el.textContent) el.textContent.value = state.textOverlay.content;
    updateTextControls();
    render();
  });
  if (el.textContent) {
    el.textContent.addEventListener('input', (e) => { state.textOverlay.content = e.target.value; render(); });
    el.textContent.addEventListener('change', () => saveStateToHistory());
  }
  linkSlider(el.textSize, el.textSizeValue, v => v + 'px', v => state.textOverlay.size = v);
  if (el.textFont) el.textFont.addEventListener('change', (e) => { saveStateToHistory(); state.textOverlay.font = e.target.value; render(); });
  linkColor(el.textColor, el.textColorText, v => state.textOverlay.color = v);
  if (el.textBold) el.textBold.addEventListener('change', (e) => { saveStateToHistory(); state.textOverlay.bold = e.target.checked; render(); });
  if (el.textItalic) el.textItalic.addEventListener('change', (e) => { saveStateToHistory(); state.textOverlay.italic = e.target.checked; render(); });
  if (el.removeTextBtn) el.removeTextBtn.addEventListener('click', () => {
    saveStateToHistory();
    state.textOverlay.enabled = false;
    state.textOverlay.content = '';
    if (el.textContent) el.textContent.value = '';
    updateTextControls();
    render();
  });
}

function bindTextEffects() {
  const to = () => state.textOverlay;
  const toggle = (input, key) => {
    if (!input) return;
    input.addEventListener('change', (e) => {
      ensureTextEffectDefaults();
      saveStateToHistory();
      to()[key].enabled = e.target.checked;
      updateTextEffectControls();
      render();
    });
  };
  toggle(el.textStrokeEnabled, 'stroke');
  toggle(el.textGradientEnabled, 'gradient');
  toggle(el.textHighlightEnabled, 'highlight');
  toggle(el.textShadowEnabled, 'shadow');

  // Outline
  linkSlider(el.textStrokeWidth, el.textStrokeWidthValue, v => v + 'px', v => to().stroke.width = v);
  linkColor(el.textStrokeColor, el.textStrokeColorText, v => to().stroke.color = v);
  // Gradient fill
  linkColor(el.textGradientColor1, el.textGradientColor1Text, v => to().gradient.color1 = v);
  linkColor(el.textGradientColor2, el.textGradientColor2Text, v => to().gradient.color2 = v);
  linkSlider(el.textGradientAngle, el.textGradientAngleValue, v => v + '°', v => to().gradient.angle = v);
  // Highlight
  linkColor(el.textHighlightColor, el.textHighlightColorText, v => to().highlight.color = v);
  linkSlider(el.textHighlightPadding, el.textHighlightPaddingValue, v => v + 'px', v => to().highlight.padding = v);
  linkSlider(el.textHighlightRadius, el.textHighlightRadiusValue, v => v + 'px', v => to().highlight.radius = v);
  // Drop shadow
  linkSlider(el.textShadowBlur, el.textShadowBlurValue, v => v + 'px', v => to().shadow.blur = v);
  linkSlider(el.textShadowX, el.textShadowXValue, v => v + 'px', v => to().shadow.x = v);
  linkSlider(el.textShadowY, el.textShadowYValue, v => v + 'px', v => to().shadow.y = v);
  linkColor(el.textShadowColor, el.textShadowColorText, v => to().shadow.color = v);
}

function bindWatermark() {
  if (el.watermarkEnabled) el.watermarkEnabled.addEventListener('change', (e) => {
    saveStateToHistory();
    state.watermark.enabled = e.target.checked;
    updateWatermarkControls();
    render();
  });
  if (el.watermarkText) {
    el.watermarkText.addEventListener('input', (e) => { state.watermark.text = e.target.value; render(); });
    el.watermarkText.addEventListener('change', () => saveStateToHistory());
  }
  if (el.watermarkPosition) el.watermarkPosition.addEventListener('change', (e) => {
    saveStateToHistory();
    state.watermark.position = e.target.value;
    render();
  });
  linkSlider(el.watermarkSize, el.watermarkSizeValue, v => v + 'px', v => state.watermark.size = v);
  linkSlider(el.watermarkOpacity, el.watermarkOpacityValue, v => v + '%', v => state.watermark.opacity = v);
  linkColor(el.watermarkColor, el.watermarkColorText, v => state.watermark.color = v);
}

function bindExportFormat() {
  if (el.exportFormat) el.exportFormat.addEventListener('change', (e) => {
    state.exportSettings.format = e.target.value;
    updateQualityControls();
  });
  linkSlider(el.exportQuality, el.exportQualityValue, v => v + '%', v => state.exportSettings.quality = v);
}

function bindAutoLayout() {
  document.querySelectorAll('.layout-btn[data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveStateToHistory();
      state.autoLayout.pattern = btn.dataset.layout;
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
  linkSlider(el.layoutGap, el.layoutGapValue, v => v + 'px', v => state.autoLayout.gap = v);
  document.querySelectorAll('.align-btn[data-align]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveStateToHistory();
      state.autoLayout.align = btn.dataset.align;
      document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
}

export function updateUIFromState() {
  // Reflect current state into all the inputs. Called after load template or reset.
  const set = (e, val) => { if (e) e.value = val; };
  const txt = (e, val) => { if (e) e.textContent = val; };

  ensureTextEffectDefaults();   // backfill v14 text-effect groups on older designs
  ensureLayerStyleDefaults();   // backfill v15 main-image layer style on older designs
  ensureAnimationDefaults();    // backfill v15.2 animation block; force runtime off
  ensureKenBurnsDefaults();     // backfill v15.2 Ken Burns block on older designs
  ensureEffectsDefaults();      // backfill v16.1 glass + grain blocks on older designs
  ensurePatternDefaults();      // backfill v16.2 pattern block on older designs
  ensureColorDefaults();        // backfill v17 temperature/tint + colorPalettes/colorMap
  refreshAnimationUI();         // reflect persisted animation (tracks, duration, toggle)
  refreshKenBurnsUI();          // reflect persisted Ken Burns toggle + controls
  refreshEffectsUI();           // reflect persisted glass + grain controls
  refreshPatternUI();           // reflect persisted pattern background controls
  refreshPalettesUI();          // reflect v17 palette library + editor
  refreshColorMapUI();          // reflect v17 color-map mode + controls
  if (typeof window.__refreshSurfaceUi === 'function') window.__refreshSurfaceUi();  // v27 Surface Studio
  if (!state.exportMotion) state.exportMotion = { resolution: 1, quality: 'high', loop: 0 };
  syncMotionExportControls();   // reflect v15.1 motion-export prefs into their selects

  set(el.brightness, state.imageFilters.brightness); txt(el.brightnessValue, state.imageFilters.brightness + '%');
  set(el.contrast, state.imageFilters.contrast); txt(el.contrastValue, state.imageFilters.contrast + '%');
  set(el.saturation, state.imageFilters.saturation); txt(el.saturationValue, state.imageFilters.saturation + '%');
  set(el.blur, state.imageFilters.blur); txt(el.blurValue, state.imageFilters.blur + 'px');
  set(el.grayscale, state.imageFilters.grayscale); txt(el.grayscaleValue, state.imageFilters.grayscale + '%');
  set(el.sepia, state.imageFilters.sepia); txt(el.sepiaValue, state.imageFilters.sepia + '%');
  set(el.temperature, state.imageFilters.temperature); txt(el.temperatureValue, String(state.imageFilters.temperature));
  set(el.tint, state.imageFilters.tint); txt(el.tintValue, String(state.imageFilters.tint));

  set(el.padding, state.padding); txt(el.paddingValue, state.padding + 'px');
  set(el.scale, state.scale); txt(el.scaleValue, state.scale + '%');
  set(el.borderRadius, state.borderRadius); txt(el.borderRadiusValue, state.borderRadius + 'px');
  if (el.showBorder) el.showBorder.checked = state.showBorder;
  updateBorderControls();
  set(el.borderWidth, state.borderWidth); txt(el.borderWidthValue, state.borderWidth + 'px');
  set(el.borderColor, state.borderColor); set(el.borderColorText, state.borderColor);

  set(el.shadowBlur, state.shadow.blur); txt(el.shadowBlurValue, state.shadow.blur + 'px');
  set(el.shadowSpread, state.shadow.spread); txt(el.shadowSpreadValue, state.shadow.spread + 'px');
  set(el.shadowOpacity, state.shadow.opacity); txt(el.shadowOpacityValue, state.shadow.opacity + '%');
  set(el.shadowX, state.shadow.x); txt(el.shadowXValue, state.shadow.x + 'px');
  set(el.shadowY, state.shadow.y); txt(el.shadowYValue, state.shadow.y + 'px');
  set(el.shadowColor, state.shadow.color); set(el.shadowColorText, state.shadow.color);

  set(el.gradientType, state.gradient.type);
  set(el.gradientAngle, state.gradient.angle); txt(el.gradientAngleValue, state.gradient.angle + '°');
  syncFromGradientState();
  updateGradientPreview();

  set(el.bgSolidColor, state.bgColor); set(el.bgSolidColorText, state.bgColor);
  setBgMode(state.bgMode);

  set(el.canvasWidth, state.canvas.width); set(el.canvasHeight, state.canvas.height);
  set(el.deviceFrameType, state.deviceFrame.type || '');
  set(el.deviceFrameColor, state.deviceFrame.color);
  set(el.frameUrl, state.deviceFrame.url || '');
  set(el.frameTitle, state.deviceFrame.title || '');
  updateDeviceFrameSubcontrols();

  // v21 — backfill the 3D mockup block on pre-v21 designs, then sync its controls.
  if (!state.mockup3d) {
    state.mockup3d = {
      enabled: false, device: 'iphone', scene: 'studio', orbitX: 12, orbitY: -25,
      zoom: 1, material: 'graphite', envReflections: true,
      spin: { enabled: false, turns: 1 }, orbitProgress: 0
    };
  }
  if (!state.mockup3d.spin) state.mockup3d.spin = { enabled: false, turns: 1 };
  refreshMockup3dUI();

  if (el.textControls && el.textContent) {
    el.textContent.value = state.textOverlay.content;
    set(el.textSize, state.textOverlay.size); txt(el.textSizeValue, state.textOverlay.size + 'px');
    set(el.textFont, state.textOverlay.font);
    set(el.textColor, state.textOverlay.color); set(el.textColorText, state.textOverlay.color);
    if (el.textBold) el.textBold.checked = state.textOverlay.bold;
    if (el.textItalic) el.textItalic.checked = state.textOverlay.italic;
    updateTextControls();

    const to = state.textOverlay;
    if (el.textStrokeEnabled) el.textStrokeEnabled.checked = to.stroke.enabled;
    set(el.textStrokeWidth, to.stroke.width); txt(el.textStrokeWidthValue, to.stroke.width + 'px');
    set(el.textStrokeColor, to.stroke.color); set(el.textStrokeColorText, to.stroke.color);
    if (el.textGradientEnabled) el.textGradientEnabled.checked = to.gradient.enabled;
    set(el.textGradientColor1, to.gradient.color1); set(el.textGradientColor1Text, to.gradient.color1);
    set(el.textGradientColor2, to.gradient.color2); set(el.textGradientColor2Text, to.gradient.color2);
    set(el.textGradientAngle, to.gradient.angle); txt(el.textGradientAngleValue, to.gradient.angle + '°');
    if (el.textHighlightEnabled) el.textHighlightEnabled.checked = to.highlight.enabled;
    set(el.textHighlightColor, to.highlight.color); set(el.textHighlightColorText, to.highlight.color);
    set(el.textHighlightPadding, to.highlight.padding); txt(el.textHighlightPaddingValue, to.highlight.padding + 'px');
    set(el.textHighlightRadius, to.highlight.radius); txt(el.textHighlightRadiusValue, to.highlight.radius + 'px');
    if (el.textShadowEnabled) el.textShadowEnabled.checked = to.shadow.enabled;
    set(el.textShadowBlur, to.shadow.blur); txt(el.textShadowBlurValue, to.shadow.blur + 'px');
    set(el.textShadowX, to.shadow.x); txt(el.textShadowXValue, to.shadow.x + 'px');
    set(el.textShadowY, to.shadow.y); txt(el.textShadowYValue, to.shadow.y + 'px');
    set(el.textShadowColor, to.shadow.color); set(el.textShadowColorText, to.shadow.color);
    updateTextEffectControls();
  }

  if (el.watermarkEnabled) {
    el.watermarkEnabled.checked = state.watermark.enabled;
    set(el.watermarkText, state.watermark.text);
    set(el.watermarkPosition, state.watermark.position);
    set(el.watermarkSize, state.watermark.size); txt(el.watermarkSizeValue, state.watermark.size + 'px');
    set(el.watermarkOpacity, state.watermark.opacity); txt(el.watermarkOpacityValue, state.watermark.opacity + '%');
    set(el.watermarkColor, state.watermark.color); set(el.watermarkColorText, state.watermark.color);
    updateWatermarkControls();
  }

  refreshSpotlightUI();   // v34
  refreshBokehUI();   // v34
  refreshCompareUI(); // v35

  if (el.reflectionEnabled) {
    el.reflectionEnabled.checked = state.reflection.enabled;
    set(el.reflectionOpacity, Math.round(state.reflection.opacity * 100));
    txt(el.reflectionOpacityValue, Math.round(state.reflection.opacity * 100) + '%');
    set(el.reflectionLength, Math.round(state.reflection.length * 100));
    txt(el.reflectionLengthValue, Math.round(state.reflection.length * 100) + '%');
    set(el.reflectionGap, state.reflection.gap);
    txt(el.reflectionGapValue, state.reflection.gap + 'px');
    updateReflectionControls();
  }

  set(el.redactType, state.redactType);
  set(el.redactIntensity, state.redactIntensity); txt(el.redactIntensityValue, state.redactIntensity);

  if (el.layoutGap) {
    set(el.layoutGap, state.autoLayout.gap); txt(el.layoutGapValue, state.autoLayout.gap + 'px');
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === state.autoLayout.pattern));
    document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === state.autoLayout.align));
  }

  set(el.exportFormat, state.exportSettings.format);
  set(el.exportQuality, state.exportSettings.quality); txt(el.exportQualityValue, state.exportSettings.quality + '%');
  updateQualityControls();
}

export function bindAllControls() {
  bindImageEditing();
  bindBackground();
  bindArtFilterPresets();
  bindImageSettings();
  bindDeviceFrame();
  bindShadow();
  bindRedactionSpotlight();
  bindReflection();
  bindCanvasSize();
  bindText();
  bindTextEffects();
  bindWatermark();
  bindExportFormat();
  bindAutoLayout();

  // Initial UI display
  setBgMode(state.bgMode);
  updateDeviceFrameSubcontrols();
  updateBorderControls();
  updateTextControls();
  updateTextEffectControls();
  updateWatermarkControls();
  updateSpotlightControls();
  updateReflectionControls();
  updateQualityControls();
  updateGradientPreview();

  // expose for templates/reset
  window.__updateUIFromState = updateUIFromState;
  window.__refreshSpotlightUI = refreshSpotlightUI;   // v34
}
