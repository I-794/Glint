import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { undo, redo } from '../state/history.js';
import { render } from '../render/render.js';
import { applyTheme } from '../ui/theme.js';
import { setZoom, fitZoom } from './zoom-pan.js';
import { exportImage, copyToClipboard, exportAsHTML } from './export.js';
import { resetTilt, applyTiltPreset } from './tilt.js';
import { applyMeshPreset } from './mesh-pad.js';
import { setScene } from './scene-select.js';
import { setTool, clearAllAnnotations, clearAllRedactions } from './canvas-tools.js';
import { selectAll, duplicateSelection, groupDistribute, groupMatchSize, setSelectionFlag, unlockAll, pruneSelection } from './selection.js';
import { upgradeSpotlight } from '../render/spotlight-geom.js';
import { listExportPresets, applyExportPreset, quickExport } from './export-presets.js';
import { toggleLayersPanel, renderLayersPanel } from './layers.js';
import { openStickerDrawer } from './stickers.js';
import { stickers } from '../state/presets.js';
import { addSticker } from './stickers.js';
import { saveStateToHistory } from '../state/history.js';
import { showStatus } from '../ui/notification.js';
import { setMode } from './set-ui.js';
import { exportSet, exportBatch } from './batch-export.js';
import { openMergeStudio, exportMerge } from './merge-studio.js';
import { replaceBackground, extendCanvas, openEraser } from './ai-image-edit.js';
import { togglePlay } from './video.js';
import { focusUrlLoad } from './url-load.js';
import { openCodeStudio } from './code-snippet.js';
import { toggleTourMode } from './tours.js';
import { previewTour, exportTour } from './tour-export.js';
import { addPage } from './pages.js';
import { toggleBoardMode, enterBoardMode } from './board.js';
import { setGroup } from './studio-nav.js';
import { seedFromUrl } from './seed.js';
import { openGalleryBrowse } from './gallery.js';
import { exportVideoMp4, exportVideoGif } from './video-export.js';
import { resetOnboarding } from './welcome.js';
import { canInstallApp, installApp } from './install-app.js';
import { formatKeys } from './shortcuts.js';
import { getFrequencyBoost, getRecent, recordUse } from './command-usage.js';
import { getUiMode, setUiMode } from './ui-mode.js';
import { pickBeforeImage, useCurrentAsBefore, swapBeforeAfter, toggleCompare } from './compare-ui.js';
import { toggleFloatingToolbar, isFloatingToolbarEnabled } from './floating-toolbar.js';

let commands = [];

function setBg(mode) {
  saveStateToHistory();
  state.bgMode = mode;
  document.querySelectorAll('.tab-btn[data-bg]').forEach(b => b.classList.toggle('active', b.dataset.bg === mode));
  ['bgGradientPanel', 'bgMeshPanel', 'bgSolidPanel', 'bgPatternPanel', 'bgTransparentPanel'].forEach(k => { if (el[k]) el[k].style.display = 'none'; });
  if (mode === 'gradient' && el.bgGradientPanel) el.bgGradientPanel.style.display = 'block';
  if (mode === 'mesh' && el.bgMeshPanel) el.bgMeshPanel.style.display = 'block';
  if (mode === 'solid' && el.bgSolidPanel) el.bgSolidPanel.style.display = 'block';
  if (mode === 'pattern' && el.bgPatternPanel) el.bgPatternPanel.style.display = 'block';
  if (mode === 'transparent' && el.bgTransparentPanel) el.bgTransparentPanel.style.display = 'block';
  render();
}

const GROUP_ORDER = ['File', 'Edit', 'View', 'Tools', 'AI', 'Motion', 'Stickers', 'More'];

function groupFor(id) {
  if (id.startsWith('sticker-')) return 'Stickers';
  if (id.startsWith('ai-')) return 'AI';
  if (id.startsWith('tool-') || id.startsWith('clear-')) return 'Tools';
  if (id.startsWith('video') || id.startsWith('anim') || id === 'export-gif' ||
      id === 'screen-record' || id === 'auto-zoom-toggle') return 'Motion';
  if (id.startsWith('export') || id === 'copy-clipboard' || id === 'load-url' ||
      id.startsWith('share') || id === 'generate-qr' || id.startsWith('mode-') ||
      id.startsWith('tour-') || id === 'code-studio' || id.startsWith('merge-') || id === 'compare-export-html') return 'File';
  if (id === 'undo' || id === 'redo' || id === 'duplicate-selection' || id === 'select-all-objects' ||
      id.startsWith('distribute-') || id.startsWith('match-') || id === 'hide-selection' ||
      id === 'lock-selection' || id === 'unlock-all') return 'Edit';
  if (id.startsWith('bg-') || id.startsWith('mesh-') || id.startsWith('scene-') ||
      id.startsWith('tilt-') || id === 'reset-tilt' || id.startsWith('style-') ||
      id === 'toggle-layers' || id.startsWith('zoom') || id.startsWith('theme') ||
      id.startsWith('ui-') || id === 'toggle-float-toolbar' || id.startsWith('compare-') ||
      id === 'toggle-spotlight' || id.startsWith('spotlight-') || id.startsWith('bokeh-') || id === 'toggleBoard' || id.startsWith('board') || id === 'seedFromUrl' || id === 'askAgentBoard') return 'View';
  return 'More';
}

export function registerCommands() {
  commands = [
    { id: 'export-png',       label: 'Export as PNG',         icon: '📥', run: () => { state.exportSettings.format = 'png'; exportImage(); } },
    { id: 'export-jpeg',      label: 'Export as JPEG',        icon: '📥', run: () => { state.exportSettings.format = 'jpeg'; exportImage(); } },
    { id: 'export-webp',      label: 'Export as WebP',        icon: '📥', run: () => { state.exportSettings.format = 'webp'; exportImage(); } },
    { id: 'export-html',      label: 'Export as HTML Card',   icon: '🌐', run: exportAsHTML },
    { id: 'copy-clipboard',   label: 'Copy to Clipboard',     icon: '📋', run: copyToClipboard },
    { id: 'load-url',         label: 'Load from URL',         icon: '🔗', run: focusUrlLoad },
    { id: 'code-studio',      label: 'Open Code Snippet Studio', icon: '</>', run: openCodeStudio },
    { id: 'campaign-generate', label: 'Generate Campaign',     icon: '📦', group: groupFor('campaign-generate'),
      run: () => import('./campaign-generator.js').then(m => m.generateCampaign({ name: 'Campaign', includeAppStore: true })),
      when: () => !!state.image },
    { id: 'undo',             label: 'Undo',                  icon: '↶',  run: () => (state.mode === 'board' ? window.__boardUndo?.() : undo(render)) },
    { id: 'redo',             label: 'Redo',                  icon: '↷',  run: () => (state.mode === 'board' ? window.__boardRedo?.() : redo(render)) },
    { id: 'duplicate-selection', label: 'Duplicate selection', icon: '⧉', run: () => { if (duplicateSelection()) render(); }, when: () => state.canvasSelection.length > 0 },
    { id: 'select-all-objects',  label: 'Select all objects',  icon: '▦', run: () => { selectAll(); render(); }, when: () => !!state.image },
    { id: 'theme-dark',       label: 'Theme: Dark',           icon: '🌙', run: () => applyTheme('dark') },
    { id: 'theme-light',      label: 'Theme: Light',          icon: '☀️', run: () => applyTheme('light') },
    // v35 — Before / After Compare.
    { id: 'compare-add-before', label: 'Before / After: Add Before image', icon: '◧', run: pickBeforeImage },
    { id: 'compare-use-current', label: 'Before / After: Use current screenshot as Before', icon: '◧', run: useCurrentAsBefore, when: () => !!state.image },
    { id: 'compare-toggle', label: 'Before / After: Show or hide comparison', icon: '◧', run: toggleCompare, when: () => !!state.compare?.beforeSrc },
    { id: 'compare-swap', label: 'Before / After: Swap Before and After', icon: '⇄', run: swapBeforeAfter, when: () => !!(state.compare?.beforeSrc && state.image) },
    { id: 'compare-export-html', label: 'Before / After: Export interactive slider (HTML)', icon: '🌐',
      run: () => import('./compare-export.js').then((m) => m.exportCompareHTML()), when: () => !!(state.compare?.beforeSrc && state.image) },
    // v35 — Simple / Pro sidebar + floating selection toolbar.
    { id: 'ui-simple', label: 'Simple mode: show only the essential tools', icon: '◐',
      run: () => setUiMode('simple', { announce: true }), when: () => getUiMode() !== 'simple' },
    { id: 'ui-pro',    label: 'Pro mode: show every tool', icon: '◑',
      run: () => setUiMode('pro', { announce: true }), when: () => getUiMode() !== 'pro' },
    { id: 'toggle-float-toolbar', label: 'Floating selection toolbar: on / off', icon: '▭',
      run: toggleFloatingToolbar, when: () => state.mode === 'single' || !isFloatingToolbarEnabled() },
    { id: 'install-app',      label: 'Install SnapShotPro as an app', icon: '⬇', run: installApp, when: canInstallApp },
    { id: 'zoom-in',          label: 'Zoom in',               icon: '🔍', run: () => setZoom(state.view.zoom * 1.2) },
    { id: 'zoom-out',         label: 'Zoom out',              icon: '🔍', run: () => setZoom(state.view.zoom / 1.2) },
    { id: 'zoom-fit',         label: 'Fit to screen',         icon: '⌧',  run: fitZoom },
    { id: 'toggle-layers',    label: 'Toggle Layers Panel',   icon: '☰',  run: toggleLayersPanel },
    { id: 'toggleBoard', label: 'Toggle Board view', icon: '⊞', group: 'View',
      run: toggleBoardMode },
    { id: 'boardAddText', label: 'Board: add text', icon: 'type', group: 'View',
      run: () => { import('./board.js').then(m => { if (state.mode !== 'board') m.enterBoardMode(); m.addBoardText(); }); },
      when: () => state.mode === 'board' },
    { id: 'exportBoard', label: 'Board: export PNG', icon: 'download', group: 'File',
      run: () => import('./board.js').then(m => m.exportBoard()),
      when: () => state.mode === 'board' },
    // v32.1 — board layout commands (previously reachable only via the agent).
    { id: 'boardFit', label: 'Board: fit to screen', icon: '⌧', group: 'View', keys: '0',
      run: () => import('./board.js').then(m => m.fitBoard()),
      when: () => state.mode === 'board' },
    { id: 'boardResetZoom', label: 'Board: zoom to 100%', icon: '🔍', group: 'View', keys: '1',
      run: () => import('./board.js').then(m => m.resetBoard()),
      when: () => state.mode === 'board' },
    { id: 'boardGroup', label: 'Board: group selected', icon: '▣', group: 'View', keys: 'mod+g',
      run: () => import('./board.js').then(m => m.groupSelected()),
      when: () => state.mode === 'board' && state.boardSelection.length > 1 },
    { id: 'boardUngroup', label: 'Board: ungroup', icon: '▢', group: 'View', keys: 'mod+shift+g',
      run: () => import('./board.js').then(m => m.ungroupSelected()),
      when: () => state.mode === 'board' && state.boardSelection.some(r => state.board.objects.some(o => o.id === r.id && o.kind === 'group')) },
    ...['grid', 'row', 'hero', 'bento'].map(layout => ({
      id: `boardArrange-${layout}`, label: `Board: arrange as ${layout}`, icon: '▦', group: 'View',
      run: () => import('./board.js').then(m => { m.arrangeCards(layout); m.fitBoard(); }),
      when: () => state.mode === 'board'
    })),
    { id: 'boardUpload', label: 'Board: upload images as cards', icon: '📁', group: 'View',
      run: () => {
        if (state.mode !== 'board') enterBoardMode();
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.addEventListener('change', () => import('./board.js').then(m => m.addFilesAsCards(inp.files)));
        inp.click();
      } },
    { id: 'seedFromUrl', label: 'Board: add from URL', icon: 'link', group: 'View',
      run: () => {
        if (state.mode !== 'board') enterBoardMode();
        const url = window.prompt('Paste a page URL to drop its images as cards');
        if (url) seedFromUrl(url);
      },
      when: () => true },
    { id: 'askAgentBoard', label: 'Ask the agent about the board', icon: 'comment', group: 'View',
      run: () => {
        if (state.mode !== 'board') enterBoardMode();
        setGroup('ai');
        const inp = document.getElementById('agent-input');
        if (inp) { inp.value = ''; inp.focus(); }
      },
      when: () => true },
    { id: 'reset-tilt',       label: 'Reset 3D Tilt',         icon: '⟲',  run: resetTilt },
    { id: 'tilt-iso',         label: 'Tilt: Isometric',       icon: '◆',  run: () => applyTiltPreset('iso') },
    { id: 'tilt-lean',        label: 'Tilt: Lean',            icon: '◆',  run: () => applyTiltPreset('lean') },
    { id: 'tilt-card',        label: 'Tilt: Card',            icon: '◆',  run: () => applyTiltPreset('card') },
    { id: 'bg-gradient',      label: 'Background: Gradient',  icon: '🎨', run: () => setBg('gradient') },
    { id: 'bg-mesh',          label: 'Background: Mesh',      icon: '🎨', run: () => setBg('mesh') },
    { id: 'bg-solid',         label: 'Background: Solid',     icon: '🎨', run: () => setBg('solid') },
    { id: 'bg-transparent',   label: 'Background: Transparent', icon: '🎨', run: () => setBg('transparent') },
    { id: 'mesh-aurora',      label: 'Mesh: Aurora',          icon: '✨', run: () => applyMeshPreset('aurora') },
    { id: 'mesh-sunset',      label: 'Mesh: Sunset',          icon: '✨', run: () => applyMeshPreset('sunset') },
    { id: 'mesh-cyber',       label: 'Mesh: Cyber',           icon: '✨', run: () => applyMeshPreset('cyber') },
    { id: 'mesh-pastel',      label: 'Mesh: Pastel',          icon: '✨', run: () => applyMeshPreset('pastel') },
    { id: 'scene-none',       label: 'Scene: None',           icon: '⊘',  run: () => setScene('') },
    { id: 'scene-laptop',     label: 'Scene: Laptop',         icon: '💻', run: () => setScene('laptop') },
    { id: 'scene-phone',      label: 'Scene: Phone',          icon: '📱', run: () => setScene('phone') },
    { id: 'scene-tablet',     label: 'Scene: Tablet',         icon: '📺', run: () => setScene('tablet') },
    { id: 'scene-blurred',    label: 'Scene: Blurred bg',     icon: '🌫', run: () => setScene('blurred') },
    { id: 'scene-float',      label: 'Scene: Floating',       icon: '🪟', run: () => setScene('float') },
    { id: 'stickers',         label: 'Open Stickers Drawer',  icon: '✨', run: openStickerDrawer },
    { id: 'tool-select',      label: 'Tool: Select',          icon: '↖',  run: () => setTool('select') },
    { id: 'tool-arrow',       label: 'Tool: Arrow',           icon: '→',  run: () => setTool('arrow') },
    { id: 'tool-rect',        label: 'Tool: Rectangle',       icon: '▭',  run: () => setTool('rect') },
    { id: 'tool-circle',      label: 'Tool: Circle',          icon: '○',  run: () => setTool('circle') },
    { id: 'tool-pen',         label: 'Tool: Pen (freehand)',  icon: '✎',  run: () => setTool('pen') },
    { id: 'tool-highlighter', label: 'Tool: Highlighter',     icon: '🖍', run: () => setTool('highlighter') },
    { id: 'tool-number',      label: 'Tool: Number',          icon: '①',  run: () => setTool('number') },
    { id: 'tool-redact',      label: 'Tool: Redact',          icon: '▓',  run: () => setTool('redact') },
    { id: 'clear-annotations', label: 'Clear all annotations', icon: '🗑', run: clearAllAnnotations },
    { id: 'clear-redactions',  label: 'Clear all redactions',  icon: '🗑', run: clearAllRedactions },
    { id: 'toggle-spotlight',  label: 'Toggle Spotlight',     icon: '◎',  run: () => {
      saveStateToHistory();
      state.spotlight = upgradeSpotlight(state.spotlight);
      state.spotlight.enabled = !state.spotlight.enabled;
      // Same as the sidebar: turning it on with no focus areas adds a centered one.
      if (state.spotlight.enabled && !state.spotlight.regions.length) {
        state.spotlight.regions.push({ id: Date.now(), x: 0.2, y: 0.2, w: 0.6, h: 0.6, shape: state.spotlight.shape });
      }
      pruneSelection(); render(); window.__updateUIFromState?.();
    } },
    { id: 'spotlight-add-region', label: 'Spotlight: Add focus area',   icon: '◎', run: () => setTool('spotlight') },
    { id: 'spotlight-clear',      label: 'Spotlight: Clear focus areas', icon: '🗑', run: () => { saveStateToHistory(); state.spotlight.regions = []; pruneSelection(); render(); window.__updateUIFromState?.(); showStatus('Focus areas cleared'); } },
    { id: 'bokeh-detect', label: 'Bokeh: Detect subject', icon: '◉', run: () => import('./bokeh-ui.js').then((m) => m.detectSubject()), when: () => !!state.image },
    { id: 'bokeh-toggle', label: 'Bokeh: Toggle background blur', icon: '◉', run: () => { if (!state.bokeh?.maskDataUrl) { showStatus('Detect the subject first'); return; } saveStateToHistory(); state.bokeh.enabled = !state.bokeh.enabled; render(); window.__updateUIFromState?.(); } },
    { id: 'ai-enhance',       label: 'AI Auto-Enhance',      icon: '✨', run: () => document.getElementById('ai-enhance-btn')?.click() },
    { id: 'style-watercolor', label: 'Style: Watercolor',    icon: '🎨', run: () => document.querySelector('[data-style-preset="watercolor"]')?.click() },
    { id: 'style-sketch',     label: 'Style: Sketch',        icon: '✏️', run: () => document.querySelector('[data-style-preset="sketch"]')?.click() },
    { id: 'style-vintage',    label: 'Style: Vintage',       icon: '📷', run: () => document.querySelector('[data-style-preset="vintage"]')?.click() },
    { id: 'style-cyber',      label: 'Style: Cyberpunk',     icon: '🌆', run: () => document.querySelector('[data-style-preset="cyber"]')?.click() },
    { id: 'style-noir',       label: 'Style: Noir',          icon: '🖤', run: () => document.querySelector('[data-style-preset="noir"]')?.click() },
    { id: 'style-reset',      label: 'Reset Filters',        icon: '⟲',  run: () => document.getElementById('style-reset-btn')?.click() },
    { id: 'share-image',      label: 'Share Image',          icon: '🔗', run: () => document.getElementById('share-btn')?.click() },
    { id: 'generate-qr',      label: 'Generate QR Code',     icon: '📱', run: () => document.getElementById('qr-btn')?.click() },
    { id: 'export-gif',       label: 'Export as GIF',         icon: '🎬', run: () => document.getElementById('gif-export-btn')?.click() },
    { id: 'anim-play',        label: 'Play/Pause Animation', icon: '▶',  run: () => document.getElementById('animation-play-btn')?.click() },
    { id: 'mode-single',      label: 'Mode: Single',         icon: '🖼', run: () => setMode('single') },
    { id: 'mode-set',         label: 'Mode: App Store Set',  icon: '📱', run: () => setMode('set') },
    { id: 'mode-batch',       label: 'Mode: Batch',          icon: '🗂', run: () => setMode('batch') },
    { id: 'export-set',       label: 'Export App Store set (ZIP)', icon: '📦', run: exportSet },
    { id: 'export-batch',     label: 'Batch export (ZIP)',   icon: '📦', run: exportBatch },
    { id: 'merge-studio',     label: 'Merge Studio: open (CSV → N designs)', icon: '🗂', run: openMergeStudio },
    { id: 'merge-export',     label: 'Merge Studio: export from CSV', icon: '📦', run: exportMerge, when: () => state.mergeStudio.rows.length > 0 },
    { id: 'tour-toggle',      label: 'Interactive Tour: Toggle mode', icon: '🎬', run: toggleTourMode, when: () => !!state.image },
    { id: 'tour-add-step',    label: 'Interactive Tour: Add step', icon: '＋', run: () => addPage(), when: () => state.mode === 'tour' },
    { id: 'tour-preview',     label: 'Interactive Tour: Preview', icon: '▶', run: previewTour, when: () => !!state.image },
    { id: 'tour-export',      label: 'Interactive Tour: Export (HTML)', icon: '⬇', run: exportTour, when: () => !!state.image },
    { id: 'ai-art-director',  label: 'AI: Art Director (full design)', icon: '🎬', run: () => document.getElementById('art-director-btn')?.click() },
    { id: 'ai-replace-bg',    label: 'AI: Replace background', icon: '🪄', run: replaceBackground },
    { id: 'ai-extend',        label: 'AI: Extend canvas (outpaint)', icon: '↔', run: extendCanvas },
    { id: 'ai-eraser',        label: 'AI: Magic Eraser',     icon: '🧽', run: openEraser },
    { id: 'medit-redact',    label: 'Redact PII (auto)',    icon: '🛡️', group: groupFor('medit-redact'),
      run: () => import('./ai-screenshot-editor.js').then(m => m.redact({ autoPII: true })),
      when: () => !!state.image },
    { id: 'producer-launch-kit', label: 'Producer: Launch Kit', icon: '🤖', group: groupFor('producer-launch-kit'),
      run: () => import('./producer.js').then(m => m.runProducer('Launch kit', (l) => console.log(l))),
      when: () => !!state.image },
    { id: 'screen-record',    label: 'Record screen',        icon: '⏺', run: () => document.getElementById('screen-record-btn')?.click() },
    { id: 'auto-zoom-toggle', label: 'Toggle auto-zoom',     icon: '🔎', run: () => { const t = document.getElementById('auto-zoom-enabled'); if (t) { t.checked = !t.checked; t.dispatchEvent(new Event('change')); } } },
    { id: 'video-play',       label: 'Video: Play/Pause clip', icon: '🎬', run: togglePlay },
    { id: 'video-mp4',        label: 'Video: Export MP4',    icon: '⬇', run: exportVideoMp4 },
    { id: 'video-gif',        label: 'Video: Export GIF',    icon: '⬇', run: exportVideoGif },
    { id: 'gallery-browse',   label: 'Browse community gallery', icon: '🌐', run: openGalleryBrowse },
    { id: 'gallery-publish',  label: 'Publish design to gallery', icon: '⬆', run: () => document.getElementById('gallery-publish-template')?.click() },
    { id: 'collab-start',     label: 'Live collaboration: Start/leave session', icon: '👥', run: () => document.getElementById('collab-start-btn')?.click() },
    { id: 'reset-onboarding', label: 'Reset onboarding tour', icon: '🧭', run: () => { resetOnboarding(); showStatus('Onboarding reset'); } },
    { id: 'brand-brain-apply', label: 'Apply Brand',          icon: '🎨', run: () => import('./brand-brain.js').then(m => m.applyBrand()), when: () => !!state.brand?.enabled },
    // v33 — Aperture QoL
    { id: 'export-quick',       label: 'Quick export (repeat last preset)', icon: '⚡', run: quickExport, when: () => !!state.image },
    { id: 'distribute-h',       label: 'Distribute horizontally', icon: '⇹', run: () => { saveStateToHistory(); if (groupDistribute('h')) render(); else showStatus('Select 3+ objects'); }, when: () => state.canvasSelection.length >= 3 },
    { id: 'distribute-v',       label: 'Distribute vertically',   icon: '⇳', run: () => { saveStateToHistory(); if (groupDistribute('v')) render(); else showStatus('Select 3+ objects'); }, when: () => state.canvasSelection.length >= 3 },
    { id: 'match-width',        label: 'Match width (largest)',   icon: '⇔', run: () => { saveStateToHistory(); if (groupMatchSize('w')) render(); }, when: () => state.canvasSelection.length >= 2 },
    { id: 'match-height',       label: 'Match height (largest)',  icon: '⇕', run: () => { saveStateToHistory(); if (groupMatchSize('h')) render(); }, when: () => state.canvasSelection.length >= 2 },
    { id: 'hide-selection',     label: 'Hide selected',           icon: '⊘', run: () => { if (setSelectionFlag('hide')) { render(); renderLayersPanel(); } }, when: () => state.canvasSelection.length > 0 },
    { id: 'lock-selection',     label: 'Lock selected',           icon: '🔒', run: () => { if (setSelectionFlag('lock')) { render(); renderLayersPanel(); } }, when: () => state.canvasSelection.length > 0 },
    { id: 'unlock-all',         label: 'Unlock & show all objects', icon: '🔓', run: () => { const n = unlockAll(); if (n) { render(); renderLayersPanel(); } showStatus(n ? `Unlocked ${n}` : 'Nothing locked or hidden'); } },
    { id: 'show-whats-new',   label: "Show what's new",      icon: '🆕', run: () => { if (window.__openWhatsNew) window.__openWhatsNew(); else showStatus('What\'s new is unavailable'); } }
  ];

  // Quick-add stickers as commands
  Object.values(stickers).flat().slice(0, 24).forEach(g => {
    commands.push({ id: 'sticker-' + g, label: 'Add sticker ' + g, icon: g, run: () => addSticker(g) });
  });

  // v28 — one command per export preset (built-in + user-saved).
  listExportPresets().forEach((p) => {
    commands.push({ id: 'export-preset-' + p.id, label: 'Export: ' + p.name, icon: '📐', run: () => applyExportPreset(p.id), when: () => !!state.image });
  });

  // v22 — Command Center metadata: category, optional shortcut hint, and an
  // optional context predicate ('when'), applied in one pass so the command
  // definitions above stay readable.
  const WHEN = {
    'video-play':        () => state.video.loaded,
    'video-mp4':         () => state.video.loaded,
    'video-gif':         () => state.video.loaded,
    'anim-play':         () => state.animation.enabled,
    'export-set':        () => state.mode === 'set',
    'export-batch':      () => state.mode === 'batch',
    'clear-annotations': () => state.annotations.length > 0,
    'clear-redactions':  () => state.redactions.length > 0,
  };
  const KEYS = {
    'export-png':     'mod+s',
    'copy-clipboard': 'mod+shift+c',
    'undo':           'mod+z',
    'redo':           'mod+shift+z',
    'duplicate-selection': 'mod+d',
    'select-all-objects':  'mod+a',
    'export-quick':        'mod+shift+s',
  };
  commands.forEach((c) => {
    c.group = groupFor(c.id);
    // Per-command `when` defined inline takes precedence; the WHEN map fills the rest.
    if (WHEN[c.id] && !c.when) c.when = WHEN[c.id];
    if (KEYS[c.id]) c.keys = KEYS[c.id];
  });

  // v28 — let export-presets.js re-register so newly saved presets appear in Cmd-K.
  window.__refreshPaletteCommands = registerCommands;
}

let activeIdx = 0;
let lastResults = [];

function fuzzyMatch(q, label) {
  if (!q) return 1;
  const qq = q.toLowerCase();
  const ll = label.toLowerCase();
  if (ll.includes(qq)) return 2;
  let qi = 0;
  for (let i = 0; i < ll.length && qi < qq.length; i++) {
    if (ll[i] === qq[qi]) qi++;
  }
  return qi === qq.length ? 1 : 0;
}

function applicable(c) {
  if (!c.when) return true;
  try { return !!c.when(); } catch { return false; }
}

function rowHtml(c, i, active) {
  const right = c.keys
    ? `<span class="palette-keys">${formatKeys(c.keys).map((x) => `<kbd>${x}</kbd>`).join('')}</span>`
    : `<span class="palette-group">${c.group}</span>`;
  return `<div class="palette-item${active ? ' active' : ''}" data-i="${i}">
    <span class="palette-icon">${c.icon}</span><span class="palette-label">${c.label}</span>${right}
  </div>`;
}

function bindResultRows() {
  el.paletteResults.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('click', () => runPaletteIndex(parseInt(item.dataset.i, 10)));
    item.addEventListener('mouseenter', () => {
      activeIdx = parseInt(item.dataset.i, 10);
      el.paletteResults.querySelectorAll('.palette-item').forEach((x, j) => x.classList.toggle('active', j === activeIdx));
    });
  });
}

function renderPaletteResults() {
  const q = el.paletteInput.value.trim();
  const pool = commands.filter(applicable);

  if (!q) {
    // Empty query → a "Recent" section, then categories in fixed order.
    const byId = Object.fromEntries(pool.map((c) => [c.id, c]));
    const recent = getRecent(6).map((id) => byId[id]).filter(Boolean);
    const recentIds = new Set(recent.map((c) => c.id));

    const sections = [];
    if (recent.length) sections.push({ title: 'Recent', items: recent });
    for (const g of GROUP_ORDER) {
      const items = pool.filter((c) => c.group === g && !recentIds.has(c.id));
      if (items.length) sections.push({ title: g, items });
    }

    lastResults = [];
    let html = '';
    for (const sec of sections) {
      html += `<div class="palette-section-header">${sec.title}</div>`;
      for (const c of sec.items) {
        const i = lastResults.length;
        lastResults.push(c);
        html += rowHtml(c, i, i === activeIdx);
      }
    }
    activeIdx = Math.min(activeIdx, Math.max(0, lastResults.length - 1));
    el.paletteResults.innerHTML = html;
    bindResultRows();
    return;
  }

  lastResults = pool
    .map((c) => { const m = fuzzyMatch(q, c.label); return { c, s: m > 0 ? m + getFrequencyBoost(c.id) : 0 }; })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
    .slice(0, 40);

  if (lastResults.length === 0) {
    el.paletteResults.innerHTML = '<div class="palette-empty">No matching commands</div>';
    return;
  }
  activeIdx = Math.min(activeIdx, lastResults.length - 1);
  el.paletteResults.innerHTML = lastResults.map((c, i) => rowHtml(c, i, i === activeIdx)).join('');
  bindResultRows();
}

function runPaletteIndex(i) {
  const cmd = lastResults[i];
  if (!cmd) return;
  recordUse(cmd.id);
  closePalette();
  try { cmd.run(); } catch (e) { console.error(e); }
}

export function openPalette() {
  state.ui.paletteOpen = true;
  el.paletteOverlay.classList.add('visible');
  el.paletteInput.value = '';
  activeIdx = 0;
  renderPaletteResults();
  setTimeout(() => el.paletteInput.focus(), 30);
}

export function closePalette() {
  state.ui.paletteOpen = false;
  el.paletteOverlay.classList.remove('visible');
}

export function bindPalette() {
  if (!el.paletteInput) return;
  el.paletteInput.addEventListener('input', () => { activeIdx = 0; renderPaletteResults(); });
  el.paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, lastResults.length - 1);
      renderPaletteResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderPaletteResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runPaletteIndex(activeIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  });
  el.paletteOverlay.addEventListener('click', (e) => {
    if (e.target === el.paletteOverlay) closePalette();
  });
}
