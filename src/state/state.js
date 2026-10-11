// Single source of truth for the entire app.
// Other modules import this and mutate it directly (kept simple — no observer pattern).
// Call render() from render/render.js after mutating to redraw.

import { spotlightDefaults } from '../render/spotlight-geom.js';   // v34 (DOM-free, no imports)
import { bokehDefaults } from '../render/bokeh-core.js';           // v34 (DOM-free, no imports)
import { compareDefaults } from '../render/compare-core.js';       // v35 (DOM-free, no imports)

export const state = {
  image: null,
  svgCode: null,
  // v24 — Code Snippet Studio. When enabled, render/code-render.js rasterizes
  // `code` into state.image (like svg-input), then the normal pipeline frames /
  // shadows / exports it. windowChrome maps onto state.deviceFrame's macOS /
  // Windows window. enabled:false is a full no-op, so pre-v24 designs are
  // untouched. The rasterized canvas itself lives in state.image (not here).
  codeSnippet: {
    enabled: false, code: '', language: 'auto', theme: 'snazzy',
    fontFamily: 'jetbrains', fontSize: 15, lineHeight: 1.6, pad: 28, tabSize: 2,
    showLineNumbers: true, lineNumberStart: 1, wrap: false, maxWidth: 720,
    windowChrome: 'macos', windowTitle: 'untitled'
  },
  imageTransform: { rotation: 0, flipH: false, flipV: false },
  // v17 — temperature/tint extend the filter set. They can't be expressed by
  // ctx.filter, so render/color-grade.js bakes them per-pixel (see colorMap).
  // 0 = neutral for both; pre-v17 saves backfill via ensureColorDefaults().
  imageFilters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, temperature: 0, tint: 0 },
  // v15.0 — blend mode + opacity for the main screenshot layer. Per-item blend/
  // opacity for annotations / extra images / the text overlay ride on those
  // objects themselves. Defaults are no-ops so pre-v15 designs render unchanged.
  imageLayer: { blend: 'source-over', opacity: 100 },
  textOverlay: {
    enabled: false, content: '', size: 48, font: 'Arial', color: '#ffffff', bold: false, italic: false, x: 0.5, y: 0.5,
    // v14 — richer text effects. All default off; pre-v14 saves lack these and
    // render fine (drawTextOverlay + updateUIFromState default-merge them).
    stroke: { enabled: false, width: 2, color: '#000000' },
    gradient: { enabled: false, color1: '#ffffff', color2: '#2348ff', angle: 0 },
    highlight: { enabled: false, color: '#ffff00', padding: 8, radius: 6 },
    shadow: { enabled: false, blur: 6, x: 2, y: 2, color: '#000000' }
  },
  windowOverlay: { enabled: false, style: 'macos', title: 'Screenshot', height: 40, showControls: true },
  watermark: { enabled: false, text: '', position: 'bottom-right', size: 16, opacity: 50, color: '#ffffff' },
  exportSettings: { format: 'png', quality: 92 },
  // v15.1 — motion (MP4/GIF) export controls. resolution multiplies the encode
  // canvas (render stays design-size); quality maps to MP4 bitrate / gif.js
  // quality; loop is gif.js `repeat` (-1 = once, 0 = forever). fps stays on
  // state.video.fps (the existing Frame rate control).
  exportMotion: { resolution: 1, quality: 'high', loop: 0 },
  gradient: { type: 'linear', angle: 135, colors: ['#667eea', '#764ba2'], positions: [0, 100] },
  padding: 60,
  scale: 100,
  borderRadius: 12,
  showBorder: false,
  borderWidth: 2,
  borderColor: '#ffffff',
  shadow: { blur: 40, spread: 10, opacity: 30, x: 0, y: 10, color: '#000000' },
  // v14 — mirrored reflection beneath the device/subject. length = fraction of
  // subject height that is mirrored; gap = px between subject and reflection.
  reflection: { enabled: false, opacity: 0.35, length: 0.5, gap: 8 },
  canvas: { width: 1200, height: 675 },
  theme: 'dark',
  bgMode: 'gradient',
  bgColor: '#1a1a2e',
  bgImage: null,
  // v16.2 — tiled pattern background. Active only when bgMode === 'pattern', so
  // the gradient default is untouched until the user picks the Pattern tab.
  pattern: { type: 'dots', fg: '#ffffff', bg: '#1a1a2e', size: 24, opacity: 100, angle: 0 },
  deviceFrame: { type: null, color: 'dark', glare: true, url: 'https://example.com', title: 'Screenshot' },
  annotations: [],
  redactions: [],
  // v34 — Spotlight 2.0: any number of focus regions (fractions of the canvas).
  spotlight: spotlightDefaults(),
  // v34 — Subject Bokeh. maskDataUrl is a white-on-transparent subject mask
  // (from cutSubject); maskSig is the image's aspect ratio when it was made.
  bokeh: bokehDefaults(),
  // v35 — Before / After Compare. beforeSrc is the Before screenshot's dataURL;
  // the main screenshot (state.image) is After. See render/compare.js.
  compare: compareDefaults(),
  annotationColor: '#ff3b30',
  annotationStrokeWidth: 4,
  // v16.0 — vector shape tools. Fill applies to the closeable shapes
  // (rect/circle/triangle/polygon/star); line + arrow stay stroke-only.
  annotationFill: { enabled: false, color: '#ffffff', opacity: 100 },
  polygonSides: 6,
  starPoints: 5,
  // v16.1 — Studio Effects overlays, both off by default (no-op until enabled).
  // glass: a frosted glassmorphism panel that samples + blurs the pixels behind
  // it (fractional x/y/w/h of the canvas). grain: a full-canvas film-grain pass.
  glass: { enabled: false, x: 0.3, y: 0.3, w: 0.4, h: 0.3, radius: 24, blur: 12, tint: '#ffffff', tintOpacity: 12, rim: true, rimOpacity: 40 },
  grain: { enabled: false, amount: 18, scale: 1, blend: 'overlay', monochrome: true },
  tool: 'select',
  selectedAnnotation: null,
  selectedRedaction: null,
  nextNumber: 1,
  redactType: 'pixelate',
  redactIntensity: 12,
  extraImages: [],
  selectedExtraImage: null,
  autoLayout: { pattern: 'free', gap: 40, align: 'center' },
  view: { zoom: 1, panX: 0, panY: 0 },
  tilt3d: { rx: 0, ry: 0, rz: 0, perspective: 1200 },
  // v21 — true 3D / isometric device mockups. A screenshot is mapped onto a
  // WebGL (three.js) device the user can orbit; the rendered GL canvas is
  // composited into the main 2D canvas inside renderInto (so it exports). All
  // off by default — when `enabled` is false this block is a no-op. orbitProgress
  // is runtime-only (set per export frame for the turntable spin), NOT persisted.
  mockup3d: {
    enabled: false,
    device: 'iphone',          // 'iphone' | 'ipad' | 'macbook'
    scene: 'studio',           // 'studio' | 'float' | 'iso'
    orbitX: 12, orbitY: -25,   // degrees
    zoom: 1,
    material: 'graphite',      // 'graphite' | 'silver' | 'gold'
    envReflections: true,
    spin: { enabled: false, turns: 1 },
    orbitProgress: 0           // runtime-only, set per export frame
  },
  meshGradient: {
    points: [
      { x: 0.20, y: 0.25, color: '#667eea', radius: 0.55 },
      { x: 0.80, y: 0.30, color: '#f093fb', radius: 0.55 },
      { x: 0.30, y: 0.80, color: '#4facfe', radius: 0.55 },
      { x: 0.85, y: 0.85, color: '#43e97b', radius: 0.55 }
    ]
  },
  scene: { id: '' },
  animation: {
    enabled: false,
    duration: 3000,
    playing: false,
    currentTime: 0,
    tracks: []
  },
  // v15.2 — Ken Burns pan/zoom on a still. Two keyframes (from/to) of a focal
  // point (0..1 of the image) and a scale (>=1); the clock drives p=0..1 and
  // drawImageContent crops the source accordingly. Disabled while a clip is
  // loaded (auto-zoom owns the crop then).
  kenBurns: {
    enabled: false,
    fromScale: 1.0,
    toScale: 1.2,
    fromX: 0.5, fromY: 0.5,
    toX: 0.5, toY: 0.5,
    easing: 'easeInOut'
  },
  // v29 — Motion Studio. ONE playback clock + a multi-lane timeline that
  // unifies the four motion sources (entrance / Ken Burns / video / turntable).
  // `lanes` is the undoable + serialized config; currentTime/playing/_driving are
  // RUNTIME-ONLY (stripped from snapshot + serialize). `_driving` true means the
  // unified clock is the active preview driver (so the render getters in
  // motion-clock.js take over from the legacy per-feature clocks).
  timeline: {
    enabled: false,        // gates the Motion Studio panel + unified export
    currentTime: 0,        // ms — THE playback clock (runtime-only)
    duration: 3000,        // ms — derived from lanes via deriveDuration()
    playing: false,        // runtime-only
    _driving: false,       // runtime-only — unified clock is driving the preview
    fps: 30,               // playback + export frame rate
    loop: true,            // preview loop
    // lane: { id, kind:'entrance'|'kenburns'|'video'|'turntable'|'compare' (v35), target, label,
    //         clips:[{ start, duration, easing, ref }] }  (start/duration in ms)
    lanes: []
  },
  aiEnhance: {
    stylePreset: null,
    lastSuggestion: null
  },
  share: {
    lastUrl: null
  },
  ui: { layersCollapsed: false, paletteOpen: false, stickerDrawerOpen: false },
  selection: { layerIds: [] },
  // v28 — unified canvas multi-select. An array of object refs
  // ({ kind:'annotation'|'redaction'|'extraImage'|'text', id }) — the source of
  // truth for what's selected on the canvas. Runtime-only (like selectedAnnotation),
  // so it is NOT snapshotted for undo. selection.js keeps the legacy single-select
  // fields (selectedAnnotation/Redaction/ExtraImage) in sync for one-object cases.
  canvasSelection: [],
  lastImageRect: null,

  // v31 — Merge Studio (data-driven batch). Runtime-only: the CSV columns/rows
  // are re-uploaded per session and are NOT snapshotted or serialized. The
  // template itself lives in the already-serialized text/color fields
  // (textOverlay.content, watermark.text, deviceFrame.title/url, bgColor,
  // textOverlay.color) via {{token}} markers, so it travels with the project
  // for free. See src/features/merge-studio.js.
  mergeStudio: { columns: [], rows: [] },

  // v32 — Open Canvas: the infinite board. Document-level (one layout for the
  // whole document, sibling to pages/active). NOT snapshotted: board spatial
  // edits are document ops like addPage/deletePage, not per-design undo. A
  // `card` object refs a pages[i].id; the scene payload still lives in
  // pages[i].payload (unchanged). `camera` is runtime-only pan/zoom.
  board: {
    objects: [],   // { id, kind:'card'|'text'|'arrow'|'group', x, y, w, h, z, ... }
    camera: { x: 0, y: 0, zoom: 1 }
  },
  boardSelection: [],   // runtime-only array of { kind:'boardObject', id }

  // v9 — App Store screenshot sets + batch.
  // mode: 'single' (normal editor) | 'set' (one design → N captioned store
  // panels) | 'batch' (one template → N uploaded images → ZIP) | 'tour' (v25 —
  // Interactive Tour authoring: the page sequence becomes clickable steps and a
  // hotspot-authoring overlay appears on the canvas; 'tour' is a transient UI
  // mode, not serialized; the per-step hotspots live in `tour` below) | 'board'
  // (v32 — Open Canvas: pages laid out as cards on a pan/zoom surface; the
  // board layout is document-level state.board, not serialized per-design).
  mode: 'single',
  screenshotSet: {
    preset: 'ios-6.7',
    active: 0,
    // Each panel: { imageId, headline, subhead, position: 'top'|'bottom' }.
    // imageId is null to reuse the globally-loaded screenshot, else a key into
    // imageRegistry (panels can each show a different app screen).
    panels: [
      { imageId: null, headline: 'Capture anything', subhead: 'One tap and done.', position: 'top' }
    ],
    // Caption styling shared across panels. headlineSize/subheadSize are
    // fractions of canvas width so they scale across preset sizes.
    shared: { font: 'Geist', headlineColor: '#0b0b0d', subheadColor: '#4a4a52', headlineSize: 0.05, subheadSize: 0.028 },
    // v11.2 — locales to export. 'en' uses the original captions; each other
    // locale gets AI-translated captions in its own ZIP subfolder.
    locales: ['en']
  },
  batch: { images: [] },   // [{ id, name }] — Image objects live in imageRegistry

  // v9.2 — video/clip support. The <video> element + frame canvas live in
  // video.js (not JSON-serializable); this just holds trim + playback params.
  video: { loaded: false, duration: 0, in: 0, out: 0, fps: 30, playing: false, w: 0, h: 0 },

  // v11.1 — screen recording cursor/click track (normalized coords, t in ms
  // from record start) used to build auto-zoom keyframes; and the auto-zoom
  // toggle/intensity. `keyframes` is derived from events when a recording loads.
  recording: { events: [] },
  autoZoom: { enabled: false, intensity: 1.6, keyframes: [] },

  // v10 — Brand Kit logo watermark. `src` is a dataUrl (JSON-serializable so it
  // travels with brand kits/templates); the decoded Image lives in `brandAssets`
  // below. `scale`/`opacity` are fractions/percent; position mirrors watermark.
  logo: { enabled: false, src: null, position: 'bottom-right', scale: 0.12, opacity: 90 },

  // v30 — Brand Brain: an extracted, enforceable brand system. Applied via
  // brand-brain.js applyBrand() which routes through applySpec() + state setters.
  // Carries a logo dataUrl, so it rides PROJECT_FIELDS (full fidelity), not the
  // lean SERIALIZED_FIELDS — mirroring how `logo` is handled.
  brand: {
    enabled: false, name: '', sourceUrl: '',
    palette: [],
    background: { mode: 'gradient', gradient: { colors: [], type: 'linear', angle: 135 } },
    frame: { type: null, color: 'dark' },
    typography: { headlineFont: 'Arial', captionFont: 'Arial' },
    colorMap: { mode: 'off', intensity: 100, steps: 6 },
    filter: 'none',
    logo: { dataUrl: null, position: 'bottom-right', scale: 0.12, opacity: 90 },
    watermark: { text: '', color: '#ffffff', position: 'bottom-right', size: 16, opacity: 50 },
    enforce: false
  },

  // v17 — Color release.
  // colorPalettes: the active palette id + an in-memory mirror of the saved
  // library. The durable copy lives in localStorage (snapshotpro_colorpalettes,
  // managed by features/palettes.js); `library` here is hydrated on load so undo
  // snapshots and the Color Map can read it without touching storage.
  colorPalettes: { active: null, library: {} },
  // colorMap: palette-driven per-pixel grade applied by render/color-grade.js.
  // mode 'off' is a no-op passthrough (the common case). intensity blends the
  // graded result with the original; steps controls recolor posterization.
  colorMap: { mode: 'off', intensity: 100, steps: 6 },

  // v25 — Interactive Tour. Per-step hotspots/callouts for the *active* step
  // (each page carries its own `tour`; this mirrors the active page, same as how
  // the rest of `state` mirrors the active page's design). Authored as overlay
  // chrome (NOT baked into renderInto) and exported into a self-contained player.
  //   hotspots: [{ id, x, y, w, h, label, callout: { title, body, side }, action }]
  //   x/y/w/h are normalized 0..1 over the rendered frame (survive any export size).
  //   side: 'top'|'bottom'|'left'|'right' — which edge the callout pins to.
  //   action: 'next' (MVP) — schema reserves room for { goto: stepIndex } branching.
  //   autoAdvanceMs: 0 = manual advance; > 0 = auto-advance after that many ms.
  tour: { hotspots: [], autoAdvanceMs: 0 },

  // v27 — Surface Studio: physical & print mockups. When enabled and `type` is a
  // surface, render/surfaces.js wraps the graded image onto the surface inside
  // renderInto (so it bakes into export, like the device-mockup path). enabled:
  // false is a full no-op, so pre-v27 designs are untouched. scale/offset/
  // rotation place the artwork within the print region; variant is the garment/
  // material colour; shadingOpacity controls the fold/curvature multiply.
  surface: {
    enabled: false,
    type: 'tshirt',            // tshirt | mug | poster | framedprint | businesscard | box
    variant: 'white',
    scale: 1, offsetX: 0, offsetY: 0, rotation: 0,
    shadow: true,
    shadingOpacity: 0.85
  }
};

// Extra-image Image objects live outside state (not JSON-serializable).
export const imageRegistry = {};

// v10 — decoded brand-logo Image lives here (not in state, like imageRegistry).
// brand-kit.js loads state.logo.src into this; overlays.js draws it.
export const brandAssets = { logoImage: null };
