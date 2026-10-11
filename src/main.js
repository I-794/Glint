// SnapShotPro v7 — app entry.
// Initialize DOM refs, bind every module, then render.

import { inject } from '@vercel/analytics';
import { state } from './state/state.js';
import { onHistoryChange, undo, redo } from './state/history.js';
import { initElements, el } from './ui/elements.js';
import { loadSavedTheme, applyTheme } from './ui/theme.js';
import { showNotification } from './ui/notification.js';
import { render } from './render/render.js';

import { bindUploadEvents } from './features/upload.js';
import { bindUrlLoad } from './features/url-load.js';
import { bindExtraImagesEvents } from './features/extra-images.js';
import { exportImage, copyToClipboard, exportAsHTML } from './features/export.js';
import { bindCanvasTools, setTool } from './features/canvas-tools.js';
import { bindContextMenu } from './features/context-menu.js';
import { bindAssetLibrary } from './features/asset-library.js';
import { bindExportPresets } from './features/export-presets.js';
import { bindColorTools } from './features/color-tools.js';
import { bindMergeStudio } from './features/merge-studio.js';
import { bindLayersEvents, renderLayersPanel } from './features/layers.js';
import { bindHistoryTimeline, renderHistoryTimeline } from './features/history-timeline.js';
import { bindZoomPan, applyTransform } from './features/zoom-pan.js';
import { renderMeshPad } from './features/mesh-pad.js';
import { bindTiltEvents } from './features/tilt.js';
import { bindStickerEvents } from './features/stickers.js';
import { bindSceneEvents } from './features/scene-select.js';
import { bindMockupUi } from './features/mockup-ui.js';
import { bind3dMockupUi } from './features/mockup-3d-ui.js';
import { bindSurfaceUi } from './features/surface-ui.js';
import { bindSetUi } from './features/set-ui.js';
import { bindSvgInput } from './features/svg-input.js';
import { bindCodeSnippet } from './features/code-snippet.js';
import { bindTemplates } from './features/templates.js';
import { bindGradientEditor } from './features/gradient-editor.js';
import { bindCustomFont } from './features/custom-font.js';
import { bindPaletteExtractor } from './features/palette-extract.js';
import { bindPalettes } from './features/palettes.js';
import { bindColorMap } from './features/color-map.js';
import { bindCompose } from './features/compose.js';
import { bindBrandKit } from './features/brand-kit.js';
import { bindBrandBrain } from './features/brand-brain.js';
import { bindBgRemove } from './features/bg-remove.js';
import { bindBokeh } from './features/bokeh-ui.js';
import { bindCompare } from './features/compare-ui.js';
import { bindAiAssets } from './features/ai-assets.js';
import { bindAiAgent } from './features/ai-agent.js';
import { bindProducer } from './features/producer.js';
import { bindOcr } from './features/ocr.js';
import { bindApiKeysPanel } from './features/api-keys.js';
import { bindAiCloud } from './features/ai-cloud.js';
import { bindAiArtDirector } from './features/ai-art-director.js';
import { bindAiImageEdit } from './features/ai-image-edit.js';
import { bindScreenshotEditor } from './features/ai-screenshot-editor.js';
import { bindAuth } from './features/auth.js';
import { bindCloudSync } from './features/cloud-sync.js';
import { bindProjects } from './features/projects.js';
import { bindCampaigns } from './features/campaigns.js';
import { bindPages } from './features/pages.js';
import { bindBoard } from './features/board.js';
import { bindSeed } from './features/seed.js';
import { bindA11y } from './ui/a11y.js';
import { bindStaleBuildReload } from './ui/stale-build.js';
import { bindTours } from './features/tours.js';
import { bindGallery } from './features/gallery.js';
import { bindCrop } from './features/crop.js';
import { bindResetButton } from './features/reset.js';
import { bindShare } from './features/share.js';
import { bindCollab } from './features/collab.js';
import { bindAiEnhance } from './features/ai-enhance.js';
import { bindAnimation } from './features/animation.js';
import { bindKenBurns } from './features/ken-burns.js';
import { bindEffects } from './features/effects-ui.js';
import { bindGifExport } from './features/gif-export.js';
import { bindVideo } from './features/video.js';
import { bindVideoExport } from './features/video-export.js';
import { bindTimeline } from './features/timeline.js';
import { bindMotionStudio } from './features/motion-studio.js';
import { bindScreenRecord } from './features/screen-record.js';
import { registerCommands, bindPalette } from './features/palette.js';
import { renderShortcutsOverlay } from './features/shortcuts.js';
import { bindKeyboard } from './features/keyboard.js';
import { bindAllControls, updateUIFromState } from './ui/bindings.js';
import { bindMobileStudio } from './ui/mobile-studio.js';
import { bindStudioNav } from './features/studio-nav.js';
import { bindUiMode } from './features/ui-mode.js';
import { bindFloatingToolbar } from './features/floating-toolbar.js';
import { bindShareTarget } from './features/share-target.js';
import { bindExtReceiver } from './features/ext-receiver.js';
import { bindWelcome } from './features/welcome.js';
import { bindWhatsNew } from './features/whats-new.js';
import { bindInstallApp } from './features/install-app.js';

function bindHeader() {
  el.themeToggleBtn.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));
  el.undoBtn.addEventListener('click', () => undo(render));
  el.redoBtn.addEventListener('click', () => redo(render));
  el.exportBtn.addEventListener('click', exportImage);
  if (el.copyClipboardBtn) el.copyClipboardBtn.addEventListener('click', copyToClipboard);
  if (el.exportHtmlBtn) el.exportHtmlBtn.addEventListener('click', exportAsHTML);
}

function setInitialActivePresets() {
  document.querySelectorAll('.preset-button[data-preset="sunset"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.shadow-preset-btn[data-shadow="soft"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.layout-btn[data-layout="free"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.align-btn[data-align="center"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.scene-tile[data-scene=""]').forEach(t => t.classList.add('active'));
}

function init() {
  inject();
  initElements();
  loadSavedTheme();

  // History listeners (renders timeline + layers after every snapshot)
  onHistoryChange(renderHistoryTimeline);
  onHistoryChange(renderLayersPanel);

  bindHeader();
  bindUploadEvents();
  bindShareTarget();   // v23 — PWA share-target: load an image shared into the app
  bindExtReceiver();   // v26 — receive a capture from the browser extension (?ext)
  bindUrlLoad();
  bindExtraImagesEvents();
  bindCanvasTools();
  bindContextMenu();    // v28 — right-click canvas object menu
  bindFloatingToolbar(); // v35 — toolbar that floats above the canvas selection
  bindAssetLibrary();   // v28 — reusable asset library (Import group)
  bindExportPresets();  // v28 — export presets (Export group)
  bindColorTools();     // v33 — eyedropper + brand/recent swatches on color pickers
  bindMergeStudio();    // v31 — Merge Studio (data-driven batch: CSV → N designs)
  bindLayersEvents();
  bindHistoryTimeline();
  bindZoomPan();
  bindTiltEvents();
  bindStickerEvents();
  bindSceneEvents();
  bindMockupUi();
  bind3dMockupUi();
  bindSurfaceUi();     // v27 — Surface Studio (physical & print mockups)
  bindSetUi();
  bindSvgInput();
  bindCodeSnippet();   // v24 — Code Snippet Studio
  bindTemplates();
  bindGradientEditor();
  bindCustomFont();
  bindPaletteExtractor();
  bindPalettes();      // v17 — custom palette library + harmonies
  bindColorMap();      // v17 — palette-driven color mapping
  bindCompose();       // v18 — design variations generator
  bindBrandKit();
  bindBrandBrain();
  bindBgRemove();
  bindBokeh();          // v34 — Subject Bokeh (Adjust group)
  bindCompare();        // v35 — Before / After Compare (after canvas tools: its hover cursor wins)
  bindAiAssets();      // v19 — AI Assets (on-brand background + isolate)
  bindAiAgent();       // v20 — AI Design Agent copilot
  bindProducer();      // v30 — Producer autopilot (separate surface)
  bindOcr();
  bindApiKeysPanel();
  bindAiCloud();
  bindAiArtDirector();
  bindAiImageEdit();
  bindScreenshotEditor();   // v30 — Magic Edit panel
  bindAuth();
  bindCloudSync();
  bindPages();
  bindBoard();     // v32 — Open Canvas board surface
  bindSeed();       // v32 — Seed: URL -> board cards
  bindA11y();       // v32.1 — button names + modal dialog focus handling
  bindStaleBuildReload();   // v34 — offer a reload if a new deploy removed a lazy chunk
  bindTours();
  bindProjects();
  bindCampaigns();
  bindGallery();
  bindCrop();
  bindResetButton();
  bindShare();
  bindCollab();
  bindAiEnhance();
  bindAnimation();
  bindKenBurns();
  bindEffects();
  bindGifExport();
  bindVideo();
  bindVideoExport();
  bindTimeline();
  bindMotionStudio();   // v29 — unified motion timeline (after the motion editors bind)
  bindScreenRecord();
  registerCommands();
  bindPalette();
  renderShortcutsOverlay(el.shortcutsGrid);
  bindAllControls();
  bindKeyboard();
  bindStudioNav();
  bindUiMode();         // v35 — Simple / Pro sidebar (before welcome/what's-new write their flags)
  bindMobileStudio();   // v23 — phone bottom dock + sheet (after studio-nav wires setGroup)
  bindWelcome();
  bindWhatsNew();
  bindInstallApp();   // v34.1 — header "Install app" button (PWA)

  setInitialActivePresets();
  renderMeshPad();
  renderHistoryTimeline();
  renderLayersPanel();
  updateUIFromState();
  applyTransform();
  setTool('select');

  showNotification('SnapShotPro loaded. Drag, paste, or upload an image to begin.', 'success');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
