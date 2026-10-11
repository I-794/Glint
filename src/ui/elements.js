// All getElementById calls in one place. Initialized after DOMContentLoaded.

export const el = {};

const IDS = [
  // Core
  'upload-zone', 'canvas-wrapper', 'preview-canvas', 'file-input', 'upload-btn',
  'svg-btn', 'render-svg-btn', 'svg-input-container', 'svg-code-input',
  'url-load-input', 'url-load-btn',
  // v24 — Code Snippet Studio
  'code-btn', 'code-snippet-panel', 'code-input', 'code-language', 'code-theme',
  'code-chrome', 'code-window-title', 'code-font', 'code-font-size', 'code-font-size-value',
  'code-pad', 'code-pad-value', 'code-tab-size', 'code-line-numbers', 'code-wrap', 'code-apply-btn',
  'export-btn', 'reset-btn', 'undo-btn', 'redo-btn', 'drop-zone',
  'notification', 'notification-text', 'theme-toggle-btn', 'install-app-btn',
  'shortcuts-btn', 'shortcuts-overlay', 'shortcuts-grid', 'close-shortcuts-btn', 'annotation-toolbar',

  // Image editing
  'rotate-left-btn', 'rotate-right-btn', 'flip-h-btn', 'flip-v-btn',
  'brightness', 'brightness-value', 'contrast', 'contrast-value',
  'saturation', 'saturation-value', 'blur', 'blur-value',
  'grayscale', 'grayscale-value', 'sepia', 'sepia-value',
  // v17 — color filters (temperature/tint baked per-pixel)
  'temperature', 'temperature-value', 'tint', 'tint-value',

  // v17 — Color: custom palette library + harmonies + Color Map
  'palette-as-saved',
  'color-palette-list', 'color-palette-new', 'color-palette-delete',
  'color-palette-editor', 'color-palette-name', 'color-palette-swatches',
  'color-add-swatch', 'color-harmony-base', 'color-harmony-type', 'color-harmony-generate',
  'color-palette-hint',
  'color-map-mode', 'color-map-controls', 'color-map-intensity', 'color-map-intensity-value',
  'color-map-steps-row', 'color-map-steps', 'color-map-steps-value', 'color-map-hint',

  // v18 — Design Variations
  'vary-generate', 'vary-grid', 'vary-shuffle',

  // Gradient
  'gradient-type', 'gradient-angle', 'gradient-angle-value', 'gradient-angle-group',
  'angle-indicator', 'gradient-color-1', 'gradient-color-2',
  'gradient-pos-1', 'gradient-pos-2', 'gradient-pos-1-value', 'gradient-pos-2-value',
  'gradient-preview',

  // Background panels
  'bg-gradient-panel', 'bg-solid-panel', 'bg-transparent-panel', 'bg-mesh-panel',
  'bg-solid-color', 'bg-solid-color-text',
  // v16.2 — pattern background
  'bg-pattern-panel', 'pattern-fg', 'pattern-fg-text', 'pattern-bg', 'pattern-bg-text',
  'pattern-size', 'pattern-size-value', 'pattern-opacity', 'pattern-opacity-value',
  'pattern-angle', 'pattern-angle-value',

  // Image settings
  'padding', 'padding-value', 'scale', 'scale-value',
  'border-radius', 'border-radius-value', 'show-border', 'border-controls',
  'border-width', 'border-width-value', 'border-color', 'border-color-text',

  // Device frame
  'device-frame-type', 'device-frame-controls', 'device-frame-color', 'device-frame-glare',
  'frame-url-group', 'frame-title-group', 'frame-url', 'frame-title',

  // v21 — 3D / isometric device mockup
  'mockup-3d-device', 'mockup-3d-controls', 'mockup-3d-scene', 'mockup-3d-material',
  'mockup-3d-rx', 'mockup-3d-rx-value', 'mockup-3d-ry', 'mockup-3d-ry-value',
  'mockup-3d-zoom', 'mockup-3d-zoom-value', 'mockup-3d-reflections',
  'mockup-3d-spin', 'mockup-3d-turns', 'mockup-3d-turns-value',

  // Shadow
  'shadow-blur', 'shadow-blur-value', 'shadow-spread', 'shadow-spread-value',
  'shadow-opacity', 'shadow-opacity-value', 'shadow-x', 'shadow-x-value',
  'shadow-y', 'shadow-y-value', 'shadow-color', 'shadow-color-text',

  // Redaction
  'redact-type', 'redact-intensity', 'redact-intensity-value', 'clear-redactions-btn',

  // Spotlight
  'spotlight-enabled', 'spotlight-controls', 'spotlight-opacity', 'spotlight-opacity-value',
  // v34 — Spotlight 2.0
  'spotlight-shape', 'spotlight-blur', 'spotlight-blur-value', 'spotlight-feather', 'spotlight-feather-value',
  'spotlight-tint', 'spotlight-tint-text', 'spotlight-clear-btn', 'spotlight-count',
  // v34 — Subject Bokeh
  'bokeh-detect-btn', 'bokeh-status', 'bokeh-enabled', 'bokeh-controls',
  'bokeh-amount', 'bokeh-amount-value', 'bokeh-highlights', 'bokeh-highlights-value', 'bokeh-shape',

  // v35 — Before / After Compare
  'compare-upload-btn', 'compare-use-current-btn', 'compare-file-input', 'compare-thumb-row', 'compare-thumb',
  'compare-swap-btn', 'compare-remove-btn', 'compare-status', 'compare-enabled', 'compare-controls',
  'compare-split', 'compare-split-value', 'compare-orientation', 'compare-fit', 'compare-labels-enabled',
  'compare-label-fields', 'compare-label-before', 'compare-label-after', 'compare-label-position',
  'compare-divider-color', 'compare-divider-color-text', 'compare-divider-width', 'compare-divider-width-value',
  'compare-handle', 'compare-wipe', 'compare-export-html-btn',

  // v16.1 — Studio Effects: liquid glass + film grain
  'glass-enabled', 'glass-controls', 'glass-blur', 'glass-blur-value',
  'glass-radius', 'glass-radius-value', 'glass-tint', 'glass-tint-opacity', 'glass-tint-opacity-value', 'glass-rim',
  'grain-enabled', 'grain-controls', 'grain-amount', 'grain-amount-value',
  'grain-scale', 'grain-scale-value', 'grain-blend', 'grain-monochrome',

  // Reflection (v14)
  'reflection-enabled', 'reflection-controls', 'reflection-opacity', 'reflection-opacity-value',
  'reflection-length', 'reflection-length-value', 'reflection-gap', 'reflection-gap-value',

  // Canvas
  'canvas-width', 'canvas-height',

  // Text overlay
  'add-text-btn', 'text-controls', 'text-content', 'text-size', 'text-size-value',
  'text-font', 'text-color', 'text-color-text', 'text-bold', 'text-italic', 'remove-text-btn',

  // Text effects (v14)
  'text-stroke-enabled', 'text-stroke-controls', 'text-stroke-width', 'text-stroke-width-value',
  'text-stroke-color', 'text-stroke-color-text',
  'text-gradient-enabled', 'text-gradient-controls', 'text-gradient-color1', 'text-gradient-color1-text',
  'text-gradient-color2', 'text-gradient-color2-text', 'text-gradient-angle', 'text-gradient-angle-value',
  'text-highlight-enabled', 'text-highlight-controls', 'text-highlight-color', 'text-highlight-color-text',
  'text-highlight-padding', 'text-highlight-padding-value', 'text-highlight-radius', 'text-highlight-radius-value',
  'text-shadow-enabled', 'text-shadow-controls', 'text-shadow-blur', 'text-shadow-blur-value',
  'text-shadow-x', 'text-shadow-x-value', 'text-shadow-y', 'text-shadow-y-value',
  'text-shadow-color', 'text-shadow-color-text',

  // Watermark
  'watermark-enabled', 'watermark-controls', 'watermark-text', 'watermark-position',
  'watermark-size', 'watermark-size-value', 'watermark-opacity', 'watermark-opacity-value',
  'watermark-color', 'watermark-color-text',

  // Export
  'export-format', 'quality-controls', 'export-quality', 'export-quality-value',
  'copy-clipboard-btn', 'export-html-btn',
  // v28 — export presets + asset library
  'export-preset-select', 'export-preset-apply', 'export-preset-save', 'export-preset-scale',
  'asset-library-grid',
  // v31 — Merge Studio (data-driven batch: CSV → N designs)
  'merge-studio-section', 'merge-tokens', 'merge-color-bg', 'merge-color-text',
  'merge-csv-drop', 'merge-csv-input', 'merge-sample-btn', 'merge-summary',
  'merge-preview-prev', 'merge-preview-next', 'merge-preview-stop', 'merge-preview-label',
  'merge-export-btn', 'merge-progress',

  // Templates
  'template-name', 'save-template-btn', 'clear-templates-btn', 'template-list',
  'load-template-btn', 'template-info',

  // v4 — layers, history, palette, zoom, stickers, tilt, scenes
  'layers-panel', 'layers-list', 'layers-toggle-btn',
  'layers-footer', 'layer-blend', 'layer-opacity', 'layer-opacity-value',
  'layer-entrance-preset', 'layer-entrance-easing', 'layer-entrance-easing-row',
  'history-track', 'history-position', 'history-undo-btn', 'history-redo-btn',
  'palette-overlay', 'palette-input', 'palette-results',
  'canvas-viewport', 'zoom-controls', 'zoom-label', 'zoom-in', 'zoom-out', 'zoom-fit',
  'minimap', 'minimap-canvas', 'minimap-viewport',
  'sticker-btn', 'sticker-drawer', 'sticker-close', 'sticker-grid', 'sticker-cats',
  'status-pill', 'mesh-pad',
  'tilt-rx', 'tilt-ry', 'tilt-rz', 'tilt-perspective', 'tilt-reset-btn',
  'tilt-rx-value', 'tilt-ry-value', 'tilt-rz-value', 'tilt-perspective-value',
  'scenes-grid',

  // Extra images / auto layout
  'add-image-btn', 'extra-file-input', 'extra-images-list',
  'layout-gap', 'layout-gap-value',

  // v7 — animation
  'animation-enabled', 'animation-controls', 'animation-duration', 'animation-duration-value',
  'animation-play-btn', 'animation-track-list', 'gif-export-btn', 'gif-progress',
  // v15.2 — Ken Burns + still MP4 export
  'ken-burns-enabled', 'ken-burns-controls', 'mp4-export-btn',
  // v29 — Motion Studio unified timeline
  'motion-studio-section', 'ms-empty', 'ms-body', 'ms-track', 'ms-playhead',
  'ms-lanes', 'ms-play-btn', 'ms-stop-btn', 'ms-time-readout', 'ms-fps',
  'ms-loop', 'ms-export-mp4', 'ms-export-gif', 'ms-progress',

  // v7 — AI enhance
  'ai-enhance-btn', 'style-reset-btn',

  // v7 — share
  'share-btn', 'embed-container', 'embed-codes', 'qr-btn', 'qr-container'
];

export function initElements() {
  for (const id of IDS) {
    // Convert kebab-case to camelCase (handles letters and digits)
    const key = id.replace(/-(.)/g, (_, c) => c.toUpperCase());
    el[key] = document.getElementById(id);
  }
  return el;
}
