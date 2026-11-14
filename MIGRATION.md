# Migration guide: finishing the split

This scaffold has the foundation done (state, history, presets, utils, key render modules, upload, export, theme, notifications, main entry). The remaining modules just need their code lifted from `snapshot-pro-v4.html` and dropped into the right file. Nothing changes logically — just the wrapper.

## Pattern for each module

Every extracted module follows the same shape:

```js
// 1. Imports
import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
// (other deps as needed)

// 2. Exported functions (paste body from snapshot-pro-v4.html)
export function drawFoo(ctx, x, y) {
  // ...original body, but reference `state.X` and `el.X` instead of bare names
}

// 3. If the module owns event listeners, export a bind function
export function bindFoo() {
  el.fooBtn.addEventListener('click', () => { /* ... */ });
}
```

## What to lift, where it goes

| File | Source in snapshot-pro-v4.html (search for) |
|---|---|
| `src/render/frames.js` | `drawDeviceFrame`, `drawMacOSWindow`, `drawWindowsWindow`, `drawIphoneFrame`, `drawBrowserFrame` |
| `src/render/annotations.js` | `drawAnnotations`, `drawArrow`, `drawPreviewAnnotation` |
| `src/render/redactions.js` | `drawRedactions` |
| `src/render/spotlight.js` | `drawSpotlight` |
| `src/render/overlays.js` | `drawTextOverlay`, `drawWatermark` |
| `src/render/autolayout.js` | `renderAutoLayout`, `drawImageCell` |
| `src/render/scenes.js` | `drawSceneBackground` (uses helpers from `utils/geometry.js`) |
| `src/features/canvas-tools.js` | `canvasMouseDown`, `canvasMouseMove`, `canvasMouseUp`, `hitTestAnnotations`, `hitTestText`, `hitTestRedactions`, `hitTestExtraImageAtPoint`, `deleteSelected`, `altSelectAt` |
| `src/features/layers.js` | `buildLayerList`, `renderLayersPanel`, `toggleLayersPanel`, `toggleLayerVisibility`, `toggleLayerLock`, `reorderLayer`, `beginRenameLayer` |
| `src/features/palette.js` | `registerCommands`, `openPalette`, `closePalette`, `renderPaletteResults`, `runPaletteIndex`, `fuzzyMatch` |
| `src/features/zoom-pan.js` | `setZoom`, `fitZoom`, `applyTransform`, `bindZoomPan`, `renderMinimap` |
| `src/features/templates.js` | `saveTemplate`, `loadTemplate`, `clearTemplates`, `updateTemplateList` |
| `src/features/mesh-pad.js` | `renderMeshPad`, `applyMeshPreset` |
| `src/features/tilt.js` | `applyTilt3D`, `resetTilt`, `applyTiltPreset` |
| `src/features/stickers.js` | `openStickerDrawer`, `closeStickerDrawer`, `renderStickerGrid`, `addSticker` |
| `src/features/scenes.js` (the feature setup) | `setScene` |
| `src/ui/bindings.js` | The big `setupEventListeners` body — all the sidebar slider/color-picker listeners. Split into helper functions per section. |

## Two things to know

1. **Anywhere the original code reads a DOM element directly** like `elements.brightness.value = X`, replace with `el.brightness.value = X` since the new `elements.js` exports a single `el` object.

2. **Render dependencies in `render/render.js`** are currently commented out. As you create each render submodule, uncomment its import and the line that calls it. The order matters: bg → shadow → image → border → frame → redactions → spotlight → annotations → extra images → text → watermark.

## Sanity check after each module

```bash
npm run dev
```

Hot reload will pick up changes immediately. If the canvas goes blank, check the browser console for an import error — most likely a missing `el.X` (means you forgot to add the id to `IDS` in `src/ui/elements.js`) or a function called before it was uncommented in `render.js`.

## When everything's split

```bash
npm run build
```

Should produce a `dist/` folder with `index.html` plus hashed JS and CSS bundles. That's what Vercel deploys.

## Accounts database

Supabase is gone (cloud project and template sync, the community gallery and
live collaboration went with it). Sign-in is Clerk, and a Neon Postgres database
holds two tables, `subscriptions` and `ai_usage`, plus the `glint_use_credits`
function. The schema lives in `api/_account-schema.js` and the server installs
it on first use.
