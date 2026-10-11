# v34 "Bokeh": Focus Studio design

Status: approved 2026-10-03. Next step: implementation plan (writing-plans).

## Context
v33 Aperture (QoL) shipped as 33.0.0. v34's codename is **Bokeh**. Choices made in the brainstorm:
- Flagship: **Focus Studio**
- v34 scope: **Spotlight 2.0** + **Subject Bokeh** (uses the existing subject mask). Tilt-shift, focus-pull animation, and a true depth model move to v34.1.

Goal: make it easy to say "look here". Dim and blur everything except the important part of a screenshot, or give a photo a real-camera background blur, and have it bake into every export.

## What already exists (reuse, don't rebuild)
- **Spotlight v1**: `state.spotlight = {enabled,x,y,w,h,opacity}` (`src/state/state.js:67`), drawn by `src/render/spotlight.js` (one dark rectangle, no blur). It's already undoable (`history.js:33`), serialized (`SERIALIZED_FIELDS`, `serialize.js:15`), has a drag tool (`canvas-tools.js:253` preview, `:580` commit), a layers entry (`layers.js:30/216/230`), the palette command `toggle-spotlight`, a reset in `reset.js:28`, and DOM refs in `elements.js:76`. It's called on the flat path (`render.js:237`), the 2D mockup path (`render.js:145`), and is baked into the 3D screen texture (`render.js:293/315`).
- **Subject mask**: `cutSubject()` (`src/features/bg-remove.js:87`) runs @imgly in the browser (~40MB, already cached by the PWA) and returns a cut-out `Image`. Its alpha channel is the subject mask.
- **Cached image pre-pass**: `getGradedImage()` (`src/render/color-grade.js:68`) caches a processed copy of `state.image` keyed by a signature. All four composition paths draw through it, so a pre-pass placed here reaches every path and every export for free.

## Part 1: Spotlight 2.0 (no AI)
**State (schema 19 → 20):**
```
spotlight: {
  enabled, opacity,            // existing
  blur: 0,                     // px of blur outside the regions (0 = v1 look)
  feather: 0,                  // soft edge, px
  tint: '#000000',             // dim color
  regions: [{ id, x, y, w, h, shape: 'rect'|'ellipse'|'rounded' }]
}
```
- Implementation note: no per-region radius; `rounded` uses a fixed share of the short side (`ROUNDED_FRAC`).
- Implementation note: regions use group-drag move and corner resize; they have no per-region hide/lock (the spotlight is shown/hidden as a whole). `groupMatchSize` includes them (their handles have `target: null`). The editing chrome (`drawSpotlightChrome`) is preview-only, drawn in `render()`; `export.js` `exportImage` and `copyToClipboard` now call `render(true)` before reading the preview canvas and `render()` after, so the chrome never reaches the file. `exportAsHTML`, share, and gallery still read the live preview (known follow-up).
- `migrateSpotlightV20()` in `serialize.js` turns the old single `x,y,w,h` into `regions[0]`. Also update `reset.js` and the `state.js` defaults.
- **Renderer** (`spotlight.js`): fill the tint over the canvas, then for each region punch a hole with `destination-out` (shape path + `ctx.filter = blur(feather)` for a soft edge). When `blur > 0`, first copy the canvas to an offscreen, blur it with `ctx.filter`, and draw the blurred copy *outside* the regions (clip with an even-odd path), then the tint. This is the same "sample the canvas" approach `drawRedactions` already uses. No change to call sites, so the flat, 2D-mockup, and 3D-texture paths all get it automatically. (Surface path: it currently has no spotlight call; leave that unchanged, as in v33.)
- **Tool**: the spotlight drag tool *adds* a region instead of replacing it (Shift-drag = ellipse). Regions become a selectable kind in `selection.js` (`kind: 'spotlight'`) so move, resize, delete, duplicate, align, and the context menu all work through `resolveRef`. `isPickable` and the hit tests include them.
- **Sidebar** (Markup → Spotlight): opacity, blur, feather, tint, and shape for the selected region, plus a "Clear regions" button. Update `updateUIFromState()`.
- **Palette**: keep `toggle-spotlight`; add `spotlight-add-region` and `spotlight-clear`.

## Part 2: Subject Bokeh (reuses the mask)
**State (same schema bump):**
```
bokeh: { enabled: false, amount: 12, highlights: 0.4, shape: 'circle'|'hexagon',
         maskDataUrl: null, maskSig: null }
```
- **Make mask** button → `cutSubject()` → read the alpha channel into a grayscale mask canvas → store it as `maskDataUrl` (downscaled to a 1024px long edge, PNG) plus `maskSig` = the image signature. If `state.image` changes, the signature no longer matches, so bokeh turns off and the UI says "Re-detect subject".
- Implementation note: `maskSig` is the image aspect ratio (a pixel hash would break when a saved project re-encodes the image as JPEG); loading a new image clears the mask. The optional `set_bokeh` agent tool was skipped.
- Implementation note (mask ownership): the mask applies only to the exact image object it was detected on. `render/bokeh.js` tags images (`img.__bokehMasks`, a runtime-only Set of mask dataURLs) via `bindMaskOwner`; `maskFits(img)` is checked at the single seam, `getGradedImage` in `color-grade.js`. After a page/project load, `document.js` `applyDesignToState` calls `releaseMaskOwner()` in the image's `onload`, so the page's own freshly decoded image claims the saved mask once. Undo/redo never transfers a mask to another image. `maskSig` stays as an extra guard.
- Implementation note (video): bokeh is skipped while a video clip is loaded (`bokehActive()`), loading a video clears the mask, and Detect subject refuses on video.
- Implementation note (lens blur): `bokeh-core.js` `lensBlur` is an alpha- and highlight-weighted average in linear light rather than a pre-blur brightness boost. Pixels above `BRIGHT` get extra weight via a smoothstep, so they bloom while flat tones keep their value; alpha weighting keeps transparent pixels from darkening edges; a radius under 0.5 or non-finite returns a copy. User-approved change from the plan.
- Implementation note (verification): real @imgly subject detection could not be exercised in the build environment (model host blocked); everything else was verified with a synthetic mask.
- **New `src/render/bokeh.js`**: `applyBokeh(srcCanvasOrImage)` → cached result keyed by (image sig + bokeh settings).
  1. Background = the source with a **lens blur**: a disc/hex-kernel blur done at reduced resolution (fast) in an `ImageData` pass. Bright pixels above a threshold get boosted before blurring, so they bloom into round "bokeh balls" (`highlights`).
  2. Composite: blurred background, then the sharp source masked by the feathered subject mask. The mask is blurred slightly so edges don't look cut out.
- **Hook**: `getGradedImage()` returns `bokeh.enabled ? applyBokeh(graded) : graded`. That one spot covers flat, 2D mockup, 3D texture, and Surface. Tainted images fall back to the source with a single notification, matching color-grade's behavior.
- **Persistence**: `bokeh` goes in `PROJECT_FIELDS` (it carries a dataURL, mirroring `brand` and `logo`); undo via `snapshot()`.
- **UI**: a new "Bokeh" section, `data-group="adjust"`: Detect subject (with the existing bg-remove progress UI), amount, highlights, shape, enable. Module `src/features/bokeh-ui.js` exports `bindBokeh()` (tag `// v34`), called in `main.js`.
- **Palette**: `bokeh-detect`, `bokeh-toggle`. **Design Agent**: optional `set_bokeh` tool in `agent-tools.js`; skip it if time is short.

## Files touched
- New: `src/render/bokeh.js`, `src/features/bokeh-ui.js`
- Edit: `src/render/spotlight.js`, `src/render/color-grade.js`, `src/state/state.js`, `src/state/serialize.js` (v20 + migration), `src/state/history.js`, `src/features/canvas-tools.js`, `src/features/selection.js`, `src/features/context-menu.js`, `src/features/layers.js`, `src/features/reset.js`, `src/features/palette.js`, `src/ui/elements.js`, `src/ui/bindings.js`, `editor/index.html`, `src/main.js`
- Release: `package.json` 34.0.0, `whats-new.js` `v34 · Bokeh`, changelog `<h2>`, and CLAUDE.md (State registry rows for `spotlight`/`bokeh`, `SCHEMA_VERSION` 20, a v34 row in Shipped features)

## Release notes: changelog + what's new (taste-skill)
**Timing:** write these as the last step, after both features work in `npm run dev`. That way the live changelog never lists features that aren't built yet.

**Design read (taste-skill §0.B):** Redesign (preserve) of the existing changelog spotlight for returning SnapShotPro users. It keeps the dark glass "spotlight" language and gives v34 its own motif, leaning on vanilla CSS. The dials match the existing page: VARIANCE 7, MOTION 5, DENSITY 4. Follow the existing SWAP-START/SWAP-END convention. Plain hyphens only, no em-dashes in any new copy.

**1. `changelog/index.html`: v34 Bokeh becomes the new highlight.** Replace the v33 Aperture content in the "Latest release" spotlight box (the SWAP slot, around lines 873-933). v33 stays in the "Every release" list below as a normal entry.
- Change the class to `spotlight spotlight-bokeh`. Add a `/* v34 — Bokeh spotlight */` CSS block next to `.spotlight-aperture` (line 743).
- **Accent:** one muted rose, `#e48a9e` (distinct from v33's amber, saturation under 80%). Use it for icon tints, the button shadow, and the stage glow. Locked to that one color.
- **Stage motif `.bk-stage`** (square, same frame as `.ap-stage`):
  - A real out-of-focus background: 6-8 soft radial-gradient "bokeh balls" in rose and warm white at different sizes and opacities.
  - A mock screenshot card where a CSS `filter: blur()` layer covers everything except one crisp spotlight region (a `mask` / `clip-path` hole). It shows both Spotlight 2.0 and the bokeh idea in one scene.
  - A small control chip echoing the sidebar: "Blur 12 · Feather 8".
  - It follows the v33 stage structure (absolute layers, `aria-hidden`), so there are no images to load.
  - Motion: under `@media (prefers-reduced-motion: no-preference)` only, the balls drift slowly (transform/opacity only).
- **Copy:**
  - Tag: Latest release. Version: v34 · the month it ships, e.g. October 2026. H2: "Bokeh."
  - Lede (20 words or fewer): "Put the focus where it belongs. Blur everything but what matters, or give any photo a real lens background."
  - Feature 1, **Spotlight, rebuilt**: "Draw as many focus areas as you need: boxes, circles, or rounded shapes, with soft edges and blur."
  - Feature 2, **Real background blur**: "One click finds the subject and softens everything behind it, with round bokeh highlights."
  - Feature 3, **Private by default**: "Subject detection runs in your browser. Your photo never leaves your computer."
  - Keep the existing buttons (Open the studio / Read the notes).
- **History list:** a new `<li class="entry latest">` for v34.0 with `<h2>Bokeh</h2>` and 4-5 `<b>Lead.</b> sentence` bullets in the same voice as the v33 entry (multiple regions + shapes, blur/feather/tint, old spotlights carry over automatically, subject bokeh + highlights, bokeh works in every mockup, both bake into export). Remove `latest` from the v33 entry.
- **Meta:** prepend "v34 Bokeh (multi-region spotlight, background blur)" to `<meta name="description">` and `og:description`.

**2. `src/features/whats-new.js`**
- `CURRENT_VERSION = '34.0'`, heading `"📷 v34 · Bokeh"` (same emoji as v33's card, for consistency)
- 4 items, short and with no em-dashes:
  - **Spotlight, rebuilt**: "Add several focus areas, pick box, circle, or rounded, and blur everything else."
  - **Real background blur**: "Bokeh (Adjust tab) finds your subject and softens the background like a camera lens."
  - **Bokeh highlights**: "Bright spots bloom into soft circles. Turn it up or down with one slider."
  - **Works everywhere**: "Both effects bake into every export, and Bokeh works in every mockup too."
- Header badge in `editor/index.html` (lines 8 and 32): `v34 · Bokeh`.

**3. taste-skill pre-flight (the parts that apply):** zero em-dashes in new copy, one accent, radius matches the existing stage (18px stage, 10-12px inner), button contrast passes, reduced-motion respected, no fake numbers. Then check the page in `npm run dev` at desktop and at 375px width.

## Verification (no tests or linter exist)
- `npm run build` passes.
- `npm run dev`:
  - Open an old project with a v1 spotlight → it migrates to one region and looks the same.
  - Add 3 regions (rect, ellipse, rounded) with blur and feather → move, resize, and delete them through selection and the context menu → undo/redo.
  - Bokeh on a photo: detect subject, adjust the sliders, export a PNG → bokeh is baked in. Repeat with a 2D mockup, a 3D mockup, and a Surface mockup.
  - Save and reload the project → the mask persists. Replace the image → bokeh turns off with the re-detect prompt.
  - Load a cross-origin image → shows the notification and falls back without crashing.
