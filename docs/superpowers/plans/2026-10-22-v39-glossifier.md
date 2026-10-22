# v39 Glossifier: light to dark mode, hold to compare, polish

## Context

v38 Focus (curves, levels, Looks) has shipped (`package.json` 38.0.0). CLAUDE.md plans v39, codename **Glossifier** (the first codename from outside photography), with one headline and two QoL items: flip a screenshot between light and dark mode, hold `\` to see the ungraded original, and a small polish pass. This plan is the "tight" version of that release. It adds three things that make the headline feel finished, each built from a system that already exists:

- **Match the scene:** when the screenshot flips, the background, device frame and text overlay flip with it (reuses `state/spec.js` field shapes and the flip core's color math).
- **Flip the Roll:** the flip is a Roll override, and Develop can write light and dark versions of every shot in one ZIP (reuses v37 overrides and the Develop loop).
- **One-click light / dark pair:** keep the original as Before, flip After, offer the Compare slider page (reuses v35 Compare and `compare-export.js`).

Out of scope (kept in the backlog): the History panel, Looks thumbnails, a Design Agent flip tool, glass highlight, accent recolor.

### Decision: the free engine is a non-destructive pass

CLAUDE.md left open whether the free engine replaces the image once or runs as a pass in `getGradedImage`. It is a **pass** with its own state key, because:

- The Roll needs a state field to override per shot, and Develop needs to switch it on and off per output.
- Undo stays cheap (a few numbers, not an image), and the flip stays adjustable after the fact.
- The user's grade, curves and Looks then style the dark version, which is what people expect.

Cost: a schema bump (23 -> 24). The **AI engine** stays a one-shot image replace, like every other AI edit.

## Design

### State: `state.modeFlip`
```js
modeFlip: {
  enabled: false,
  target: 'auto',   // 'auto' | 'dark' | 'light'. auto = the opposite of what the image is now
  surface: 12,      // how dark white becomes, OKLab L x100 (range 6..30); light target mirrors it
  protect: 60,      // 0..100, how strongly photos and saturated brand colors are left alone
}
```
- `history.js` `snapshot()`: add `modeFlip`.
- `serialize.js`: add to `SERIALIZED_FIELDS`, bump `SCHEMA_VERSION` 23 -> 24, append `ensureModeFlipDefaults()` to the `normalizeProject` migrate chain.
- Runtime backfill next to `ensureColorDefaults()` in `src/ui/bindings.js` (templates and gallery `Object.assign` without normalizing). Add `modeFlip` to `templates.js` `snapshotState()` and `compose.js` `SPEC_KEYS`. `templates.js`/`gallery.js` normalize it the same way v38 did for `colorTools`.
- `reset.js`: reset to defaults.
- Roll: add `'modeFlip.enabled'` to `ROLL_OVERRIDE_FIELDS` (a shot that is already dark can opt out). `target`, `surface` and `protect` style the whole roll.
- `state.roll.modes`: `'as-set' | 'both'`, default `'as-set'`, defaulted in `normalizeRoll()`. Covered by the same schema bump.

### Pure logic: `src/render/mode-flip-core.js` (DOM-free, `// v39`)
- `modeFlipDefaults()`, `normalizeModeFlip(raw)` (clamps, repairs bad target), `ensureModeFlipDefaults(design)`.
- Color math in OKLab (a modern Lab: hue stays put when lightness changes). `srgbToOklab`, `oklabToSrgb`, `flipLightness(L, target, surface)`: maps white to `surface` and black to a soft ink (about 0.93 for dark), not to pure black and white, which is how real dark themes look.
- `flipColorHex(hex, target, surface)`: the same flip for one CSS color. Used by Match the scene.
- `detectMode(data, w, h)`: samples about 4000 pixels and returns `'light' | 'dark'` from mean lightness. With target `'dark'` on an image that is already dark, the pass is a no-op (this is what makes "both modes" in the Roll correct per shot).
- `buildLut3d(target, surface, protect)`: a 33x33x33 RGB table, computed once per setting. The per-pixel pass is then a trilinear lookup, so a 4K screenshot stays fast and no per-pixel cube roots run.
- Chroma guard inside the LUT: a smoothstep on OKLab chroma blends saturated colors back toward their original lightness, scaled by `protect`, so brand buttons and status colors keep their look.
- `photoMask(data, w, h)`: splits the image into 16x16 tiles and marks a tile as photo when it has many distinct colors and high variance (UI tiles are flat). The tile weights are blurred so the seam between a photo and the UI around it is soft. Computed once per source image and cached.
- `applyFlip(data, w, h, lut, mask, protect)`: writes into a `Uint8ClampedArray`, alpha untouched, mixing back the original by `mask * protect`.

### Render hook: `src/render/mode-flip.js`
- `modeFlipActive()`: false when not enabled, when `state.video.loaded` (per-frame tile analysis is out of scope, same as Bokeh and Compare), or when the detected mode already matches the target.
- `applyModeFlip(src)`: caches the source `ImageData` and photo mask by `imageId` (plus `__frame`), caches the LUT by `target:surface:protect`, writes a **fresh** output canvas whenever the result changes (Bokeh's rule, so 3D textures and Compare re-key). Cross-origin taint: warn once, return source.
- `color-grade.js` `gradeAndBlur`: **flip** -> v17 grade -> curves -> Bokeh, then Compare in `getGradedImage`. `maskFits` and the Compare check keep using the original `srcImage`, so Bokeh masks and Compare ownership are unaffected (the flip never changes size). The grade key must include the flip signature.
- Because it sits in `getGradedImage`, all four composition paths (flat, 2D device, 3D, Surface), Set panels, auto-layout and every export get it. Compare's Before is not graded, so it stays the original.

### Match the scene: in `mode-flip-core.js` + `features/mode-flip-ui.js`
One-shot, undoable, runs only when the user presses Flip with "Match the scene" on (default on). Not stored in state.
- Background: solid `bgColor`, every gradient stop, mesh point colors, pattern `fg`/`bg` go through `flipColorHex`. Background images are left alone.
- Device frame: for a dark target, `light`/`silver`/`gold`/`titanium` become `dark`; for a light target, `dark`/`graphite` become `silver`. Browser chrome follows `deviceFrame.color` already (`render/frames.js` `isDark`).
- `textOverlay.color` through `flipColorHex` so the caption stays readable on the new background.
- The same history entry as the flip, so one Cmd+Z undoes both. Turning the flip off later does not touch the scene (Undo restores it exactly).

### AI engine: in `features/mode-flip-ui.js`
- `edit(imageBlob, null, prompt, nearestGptImageSize(w, h))` from `ai-image-edit.js` / `ai-shared.js`. Prompt: convert this interface screenshot from light to dark mode (or the reverse), keep the exact layout, text, icons, spacing and accent colors, change only surfaces and text colors, add nothing.
- The result comes back at a GPT size, so scale it back to the original width and height before it replaces the image.
- Its own apply step (not `applyResultAsImage`): one `saveStateToHistory()`, replace `state.image`, set `modeFlip.enabled = false` so it is not flipped twice, `render()`.
- Refuse on video. Busy status in the section while it runs; error toast on failure (same wording style as `extendCanvas`).
- AI can redraw text, so "Keep the original as Before" defaults on for this engine and the UI says so in one line.

### One-click light / dark pair
- "Keep the original as Before" checkbox in the section. When on, Flip first calls `compare-ui.js` `useCurrentAsBefore()` logic (inside the same history entry; factor out a `setBeforeNoHistory` helper rather than calling the exported function, which saves its own entry), then flips After.
- After a flip with the pair on, the toast carries an action, "Export slider page", that runs `compare-export.js` `exportCompareHTML()`.
- Cmd-K `mode-pair` does all of it in one step with the free engine.

### Roll: both modes in one Develop
- Develop settings get "Modes: As set / Light and dark".
- With "Light and dark", the loop in `features/roll.js` `developRoll()` runs each shot and size twice, inside `withShot`, once with `modeFlip = { ...roll, enabled: true, target: 'light' }` and once with `target: 'dark'`, restoring `state.modeFlip` in a `finally`. Because a matching target is a no-op, a shot that is already dark comes out untouched as its dark version.
- `roll-core.js` `fileName()` gains a `{mode}` token. When modes is "both" and the pattern has no `{mode}`, append `-{mode}`. The total count and progress text double; the contact sheet uses the first mode only.

### Hold to compare
- `src/render/hold-original.js` (DOM-free, `// v39`): `export const holdOriginal = { held: false, exporting: 0 }`.
- `renderInto(canvas, forExport)`: when `forExport`, `holdOriginal.exporting++` at the start and `--` in a `finally`, so an export during a hold is never ungraded.
- `getGradedImage`: when `held && !exporting`, return the raw `srcImage` (no flip, grade, curves, Bokeh or Compare). The `ctx.filter` sites (`render.js` around line 365, `mockups.js` around line 105, `autolayout.js` `cssFilterFor`) skip their filter on the same condition.
- `keyboard.js`: `keydown` with `e.code === 'Backslash'`, no modifier, not `e.repeat`, not `isTextEntry`, `state.mode === 'single'` sets `held = true` and renders; `keyup` of the same key and `window` `blur` clear it and render.
- A small "Original" chip in `#drop-zone` while held (preview-only HTML, `aria-live="polite"`).
- `shortcuts.js`: `{ id: 'hold-original', keys: '\\', label: 'Hold to see the original', group: 'View', displayOnly: true }`. Never in `snapshot()` or saved.

### UI: `src/features/mode-flip-ui.js` (`bindModeFlip()`, `// v39`)
- New `.sidebar-section` "Light / Dark" in `editor/index.html`, `data-group="adjust"`, placed first in Adjust. **`data-simple`**: it is the release headline and a one-click action a first-time user can use. (Simple goes to 19 of 48; update CLAUDE.md.)
- Primary button reads "Flip to dark" or "Flip to light" from `detectMode` on the current image. Engine select: "In your browser (free)" / "AI (sharper, uses your key or credits)".
- Checkboxes: "Match the scene", "Keep the original as Before".
- While the pass is on: "Darkness" (`surface`) and "Protect photos and colors" (`protect`) sliders, following `bokeh-ui.js` `slider()` (live on `input`, save on `change`), and a "Turn off" button.
- Element ids in `src/ui/elements.js`; `refreshModeFlipUI()` from `updateUIFromState()` and `onHistoryChange(() => queueMicrotask(refreshModeFlipUI))`. `render()` calls `window.__modeFlipImageCheck` so the button label follows a new image (same trick as v38's histogram).

### Palette
`registerCommands()` in `palette.js`: `mode-flip` (flip with the current engine), `mode-flip-off`, `mode-pair`, `mode-flip-open` (reveal the section via `studio-nav.js` `revealSection`), `roll-modes-toggle`. No new global shortcut besides the display-only `\` entry.

### Polish pass
- **Toast icon per type:** `ui/notification.js` `showNotification` sets `.notification-icon` text from the type: `success` ✓, `error` !, `info` i (the three types the code uses). Icon gets `aria-hidden="true"` in `editor/index.html` since the message carries the meaning.
- **Section title hidden under the sticky header:** `.sidebar-section { scroll-margin-top: ... }` in `src/styles.css`, equal to the `.panel-header` height (sticky, `top: 0`). Check it after `revealSection` and Cmd-K jumps.
- **Looks without `window.prompt`:** `features/looks.js` uses `prompt` four times (two names, the copy fallback, paste code). Replace all four with one inline field in the Looks row: "Save look" opens it as a name field (Enter saves, Esc cancels), "Paste code" opens it as a code field, and the copy fallback shows the code there, selected.

## Release notes (taste-skill + What's new)

Mirror v38's single release-notes commit (`d6137e2`).

1. **Load `.claude/skills/taste-skill` first** and state the one-line design read (changelog spotlight for Glint users, graphite + one amber accent). Rules that bite: zero em or en dashes in visible copy, at most one middle dot per line, no fake-precise numbers, sub-paragraphs of 25 words or fewer, real images only. Run the §14 pre-flight.
2. **`src/features/whats-new.js`**: `CURRENT_VERSION = '39.0'`, heading `v39 · Glossifier`, three items, no trailing periods, no emoji. Draft:
   - "Light to dark in one click": Flip any screenshot between light and dark mode, with the background and frame to match.
   - "Both modes at once": Keep the original as Before for a slider, or develop the whole Roll in light and dark.
   - "Hold to compare": Hold the backslash key to see your screenshot without its grade, then let go.
3. **`editor/index.html`** header: `v39 · Glossifier`.
4. **`changelog/index.html`**: replace only between `SWAP-START`/`SWAP-END`, reuse `.spotlight-glint` + `.gl-stage`, image `/shots/glossifier-modes.webp`; v38's `entry latest` becomes `entry reveal`, add the v39 `latest` entry ("the first codename from outside photography"). Update the meta and og descriptions.
   - **Codename visuals:** three `.spot-feat-ico` line icons in the 24x24, stroke 1.6 style (a half-filled circle for light / dark, two stacked frames for the pair, a key cap for hold). No new font. The Glossifier theme shows as a single soft sheen that sweeps across the spotlight shot once when `.reveal` gets `.in`, inside `@media (prefers-reduced-motion: no-preference)`, scoped to the v39 spotlight.
5. **Site shot** in `scripts/build-site-shots.mjs`: load the light `kanban` source, flip it with the free engine and Match the scene, with Compare on at a 50% split (Before light, After dark), into `public/shots/glossifier-modes.webp` (1280x600). Bump `whats-new.js` **before** `npm run build:shots` so the toast stays out of `hero-editor.webp`.
6. Dash check: `git diff -U0 -- changelog/index.html src/features/whats-new.js editor/index.html | grep '^+' | grep -n '[—–]'` must print nothing.
7. No new marketing page. `package.json` stays 38.0.0; the `ship` skill bumps it when asked.

## Files

New: `src/render/mode-flip-core.js`, `src/render/mode-flip.js`, `src/render/hold-original.js`, `src/features/mode-flip-ui.js`, `public/shots/glossifier-modes.webp`.

Changed: `src/state/state.js`, `src/state/history.js`, `src/state/serialize.js`, `src/render/color-grade.js`, `src/render/render.js`, `src/render/mockups.js`, `src/render/autolayout.js`, `src/render/roll-core.js`, `src/features/roll.js`, `src/features/compare-ui.js`, `src/features/keyboard.js`, `src/features/shortcuts.js`, `src/features/looks.js`, `src/ui/notification.js`, `src/ui/elements.js`, `src/ui/bindings.js`, `src/features/templates.js`, `src/features/gallery.js`, `src/features/compose.js`, `src/features/reset.js`, `src/features/palette.js`, `src/main.js`, `editor/index.html`, `src/styles.css`, `scripts/regression-tests.mjs`, `scripts/build-site-shots.mjs`, `src/features/whats-new.js`, `changelog/index.html`, `CLAUDE.md`.

## Build order (commit + `npm run check` after each)

1. Save this plan to `docs/superpowers/plans/` (this file).
2. Core + state + persistence: `mode-flip-core.js`, state default, snapshot, `SERIALIZED_FIELDS`, schema 24 migration, runtime backfill, templates/gallery/compose/reset, `roll.modes` default. Tests: bump the three hard-coded `schemaVersion, 23` asserts to 24; add OKLab round-trip within 1/255, white flips to `surface` and black to ink, a saturated color keeps its lightness at `protect` 100, `detectMode` on flat light and dark buffers, a matching target is a no-op, a noisy tile is marked photo and a flat tile is not, `flipColorHex` keeps hue, and a schema 23 -> 24 migrate-and-persist test.
3. Render hook: `mode-flip.js`, the `gradeAndBlur` change with the flip in the grade key.
4. Sidebar section, free engine flip, Match the scene, sliders, palette commands.
5. AI engine and the light / dark pair (Compare helper, toast action, `mode-pair`).
6. Roll: override field, Develop modes setting and loop, `{mode}` token (test `fileName` with and without the token).
7. Hold to compare: `hold-original.js`, the export counter in `renderInto`, bypass at the four sites, key handling, chip, `SHORTCUTS` entry.
8. Polish pass: toast icons, `scroll-margin-top`, inline Looks field.
9. CLAUDE.md: State registry rows for `modeFlip` and the `roll.modes` note, `SCHEMA_VERSION` 24 text, Simple count, Shipped table v39 row, replace the "Planned: v39" backlog block (keep the open options list).
10. Release notes (section above): load taste-skill, What's new, header, changelog, site shot, dash check.

## Verification

- `npm run check` green (lint, knip, tests, build).
- `npm run dev`, load a light screenshot, Flip to dark: check preview and PNG export on the flat path, a 2D device frame, a 3D mockup (texture updates) and a Surface mockup. Load a dark one: the button reads "Flip to light" and it works.
- A screenshot with a photo inside: the photo stays natural, no blocky seam. A bright brand button keeps its color. Protect at 0 flips everything.
- Match the scene: background, frame and caption flip; one Cmd+Z undoes flip and scene together.
- Curves or a Look on top of the flip style the dark version; Bokeh still blurs the right area.
- AI engine with a key or the proxy: result is the original size, flip pass is off afterwards, Undo works; without a key the usual key hint shows. Refuses on video.
- Light / dark pair: Before is the original, After is dark, the toast's "Export slider page" downloads a working page; Cmd-K `mode-pair` does the same.
- Roll: Develop with "Light and dark" writes two files per shot and size with `-light` / `-dark`; a shot that is already dark gives an untouched dark file; turning the flip off on one shot overrides only that shot.
- Hold `\`: preview shows the raw screenshot with the "Original" chip, release restores it; typing `\` in a text field does nothing; an export while holding is graded; switching windows mid-hold does not leave it stuck.
- Video loaded: the flip has no effect and nothing errors.
- Save and reload a project: flip settings restored. Load a schema 23 project: defaults, no errors. Templates carry the flip.
- Polish: an error toast shows !, an info toast shows i; Cmd-K jumps leave the section title visible; saving, pasting and copying a Look never opens a browser prompt.
- Simple mode shows the Light / Dark section; returning users see the v39 card once; the changelog passes the §14 pre-flight and the dash check prints nothing.

## Build notes (what changed from this plan)

- **Surface default 20, range 12 to 36.** OKLab lightness 0.12 rendered white as near black; real dark themes sit around 0.18 to 0.24, so white now becomes about `#161616`.
- **Photo guard works on regions, not tiles.** Tile-by-tile detection turned CSS gradients and dense small text into a checkerboard of kept and flipped squares. Busy or noisy tiles now group into regions, and only regions of at least 3x3 tiles with enough busy tiles count; a region that mostly fills its bounding box becomes that rectangle.
- **Protect moves a threshold instead of blending.** A protected color is kept fully, the same as a photo, so a guarded area is never half flipped. Photos are fully kept from Protect 30 up.
- **New: a panel guard (`surfaceMask`).** A plain lightness flip turned a dark navy sidebar light. Large flat panels already in the target mode now keep their pixels and text, with rectangles and small holes filled and panel-colored pixels kept in the tiles around them, so the edge is seamless.
- **Scene restore is exact.** Flipping a scene back was lossy (a dark frame came back silver), so turning the flip off restores the scene it matched, unless it was edited since. `flipColorHex` never lightens a color on the way to dark.
- **Not touched:** `compose.js` (its spec keys do not include the flip, and v38 never added `colorTools` there either), and the Looks delete `confirm()` (only the four prompts were in scope).
- **Hold key group:** listed under Edit in the shortcuts overlay.
- **Section jumps:** `scroll-margin-top` alone did not help because Curves and Light / Dark scrolled with `block: 'nearest'`; both now scroll to the start.
