# Site Audit: https://snapshotpro.xyz
*Generated: 2026-10-02T13:40Z*

> **How this was run:** the live site (`snapshotpro.xyz`) is blocked by this cloud session's network policy, so the audit ran against a **local production build of branch `claude/stoic-volta-7k3l3c`** (`npm run build` + `vite preview` at `http://127.0.0.1:4173`). Page paths below are the same on production. Pages crawled: `/`, `/editor/`, `/features/`, `/pricing/`, `/ai/`, `/changelog/`, `/gallery/`, `/faq/`. Caveats:
> - External hosts (Google Fonts, picsum.photos) were blocked in the sandbox. Their failures were **not** counted as bugs, but their production impact is noted under Performance.
> - Cache headers, TTFB, and compression come from `vite preview`, not Vercel. Findings that depend on them say **verify on production**.
> - Several findings were spot-checked against the source (`src/styles.css:432-442`, `src/features/templates.js:51-57`, `src/features/reset.js`, `public/site.css:146-147`).

## Fixes applied in v33.2

- **Slider/color-picker undo:** fixed in `src/state/history.js` (snapshot at the gesture's first `input`, used by the save on `change`).
- **Reset / Clear All:** now show an Undo toast; Reset keeps `imageRegistry` so undo restores extra images.
- **picsum placeholders:** replaced on the homepage and gallery with real editor output (`public/shots/`, made by `scripts/build-site-shots.mjs`). Other marketing pages still use picsum.
- **SW precache:** 83 entries / 5.3 MB down to 69 / 1.6 MB.
- Found while doing the above: **Spotlight erased the highlighted area** (exported as transparent). Fixed in `src/render/spotlight.js`.

## Fixes applied (2026-10-03)

Fixed on this branch and checked in a headless browser (30/30 checks pass, including an axe re-run):

- **Invisible toast blocking clicks:** fixed. Hidden toasts get `pointer-events: none; visibility: hidden` (`src/styles.css`), and `#notification` now has `role="status" aria-live="polite"`.
- **Unlabeled editor controls (both Critical):** fixed. `src/ui/a11y.js` links each `.control-label` to its control and names toggle switches, color hex boxes and placeholder-only inputs. axe `label` went from 43 to 0 and `select-name` from 13 to 0.
- **Click-only tiles:** fixed. Background, size and shadow presets, scenes, 3D demos and the upload zone are now focusable buttons that Enter and Space activate.
- **Escape doesn't close dialogs:** fixed for Welcome and the cloud, auth and versions dialogs.
- **Load Template not undoable:** fixed (`saveStateToHistory()` before applying).
- **Marketing pages:** added a phone menu (≤560px), a skip link, a `<main id="main">` landmark on every page (via the partial injector in `vite.config.js`), `aria-current` on the active nav link, underlined in-text links, and fixed contrast (`--ink-3`, the hero `.url`, the editor `--text-tertiary`).
- **Found while verifying (not in the original audit):** the header **Undo/Redo buttons were permanently disabled**. `renderHistoryTimeline()` returned early because `#history-track` doesn't exist. Also, undo/redo never refreshed the sidebar controls. Both are fixed (`history-timeline.js`, `history.js`).

**Still open:** everything else below, notably the picsum placeholder images and other content/UX items, performance work (fonts, code-splitting, SW precache), Reset/Clear All confirmations, and one more undo bug found while verifying. Sliders and color pickers save their undo step on `change`, *after* the value moved, so the first Undo after a slider drag does nothing. Moving the save to the start of the drag changes when collaboration broadcasts and autosave fire, so it needs its own careful change.

## Summary

| Category       | Critical | High | Medium | Low | Total |
|----------------|----------|------|--------|-----|-------|
| UX             | 0        | 4    | 17     | 6   | 27    |
| Accessibility  | 2        | 8    | 7      | 4   | 21    |
| Performance    | 0        | 3    | 9      | 3   | 15    |
| Bugs           | 0        | 1    | 2      | 0   | 3     |
| **Total**      | **2**    | **16**| **35** | **13**| **66** |

> **Lighthouse performance score: 98/100** (homepage, mobile, simulated). The editor scores lower: LCP 2.7 s, FCP 2.5 s.

A few findings show up in two categories because they affect both. The picsum placeholder images appear under UX and Performance, the gallery filter state and the changelog heading levels under UX and Accessibility. They're counted once per category.

---

## Critical Issues

### Accessibility (WCAG 1.3.1) — /editor/
**Issue:** Sliders, checkboxes, color inputs and number inputs across all 8 sidebar groups have no accessible name (axe `label`). 43 controls were flagged with the panels open, and a static scan found **181 of 225** form controls unlabeled. The visible `<label class="control-label">` captions (172 in `editor/index.html`) have no `for` attribute and don't wrap their control, so a screen reader announces just "slider" or "checkbox". Examples: `#brightness`, `#contrast`, `#padding`, `#shadow-blur`, `#canvas-width`, `#watermark-enabled`.
**Fix:** Add `for="<control id>"` to each `.control-label`, e.g. `<label class="control-label" for="brightness">Brightness</label>`. A one-place fix: at startup, have `src/ui/a11y.js` link each `.control-label` to the next input or select in its `.control-group`. Use `aria-label` where there's no visible caption.

### Accessibility (WCAG 4.1.2) — /editor/
**Issue:** 13 `<select>` elements have no accessible name (axe `select-name`), including `#export-format`, `#export-preset-select`, `#gradient-type`, `#device-frame-type`, `#mockup-3d-device`, `#template-list` and `#brand-list`.
**Fix:** Link each one to its visible caption with `<label for>`, or add `aria-label` (e.g. `aria-label="Export format"`). The `a11y.js` auto-link above covers these too.

---

## UX Issues

### High

- **/editor/** (Unexpected behavior): The header **Reset** button wipes every annotation, redaction, extra image, text overlay, watermark, device frame and background, with no confirmation. It sits right next to **Export Image** and looks like Undo/Redo. It does save an undo step, but the toast ("Reset to defaults.") has no Undo button, unlike the v33 delete toasts. It also empties `imageRegistry`, so undo may not bring extra images back.
  *Fix: Add a confirmation step or a v33-style toast with an Undo button, move Reset away from Export (into an overflow menu or the Project tab) and give it destructive styling, and keep registry entries so undo fully restores the design.*
- **/editor/** (Content clarity): **☁ Set up cloud** in the main header opens a modal asking visitors for a **Supabase project URL and anon key** (`src/features/auth.js`). Share says "Upload to Supabase Storage… Requires cloud setup", and Live collaboration and Community Gallery publishing need it too. That's developer jargon on a core sharing flow, and it contradicts the marketing pages, which describe sign-in as a simple optional account.
  *Fix: On the hosted site, use the platform's own Supabase config from env and show a plain "Sign in". Move the URL/key form under "Advanced / self-host". Say "Get a share link" instead of "Supabase Storage". When cloud isn't available, disable Share and Live session with a short reason.*
- **/** and all marketing pages (Mobile): below 560px, `public/site.css:146-147` hides every `.nav-link`, and there's **no hamburger menu**. On phones the header shows only the logo and "Open the studio". Features, Pricing, Gallery, AI and Guide are reachable only from the footer.
  *Fix: Add a mobile menu button (with `aria-expanded`) that opens a drawer containing the nav links.*
- **/** (Content clarity): The hero "A polished product screenshot composed in SnapShotPro" and the showcase cards load **random picsum.photos stock photos**, not real SnapShotPro output. The Gallery page has the same problem. Visitors can't see what the tool actually makes.
  *Fix: Replace them with real, self-hosted exports from the editor for each look the copy claims, served from `/public`.*

### Medium

- **/** (Mobile): 9 nav links plus the CTA sit in one non-wrapping row in a fixed 66px bar, about 950px of content. Between about 560px and 1000px, labels like "Studio Intelligence" get squeezed and wrap.
  *Fix: Cut the primary nav to 5-6 items and move the rest into a "Product" dropdown or the footer. Switch to the mobile menu below about 1024px.*
- **/** (Navigation): The shared nav never marks the current page (no `.active` class or `aria-current`).
  *Fix: Set `aria-current="page"` on the matching link, at build time in the partial injector or in `site.js`, and style it.*
- **/** (Consistency): The four use-case cards all link to the same `/use-cases/` URL with no anchor. "See all capture tools" and "See all styling tools" both go to the top of `/features/`.
  *Fix: Deep-link each card, e.g. `/app-store-screenshots/`, `/use-cases/#changelogs` and `/features/#capture`.*
- **/features/** (Consistency): All 15 feature cards glow and lift on hover, so they look clickable, but they're static `div`s.
  *Fix: Make each card a link to its landing page, or remove the hover effects.*
- **/features/** (Content clarity): The page claims "The whole studio" and "Thirty-plus tools" but leaves out flagship features: Open Canvas, Motion Studio, Merge Studio, 3D and print mockups, Tours, Code Snippets, the extension, and the Design Agent.
  *Fix: Add cards for the missing features, each linking to its page.*
- **/ai/** (Content clarity): The headings say "Four ways AI…" and "four kinds of AI", but the grid has **five** cards.
  *Fix: Drop "Four", or move the Studio Intelligence card into a separate "Go deeper" row.*
- **/ai/** (Unexpected behavior): "Generate a background →", "Clean up an image →" and "Read a screenshot →" all open plain `/editor/`, which starts on the Import panel.
  *Fix: Deep-link to the right tool (e.g. `/editor/?panel=ai&tool=assets`), or relabel the links "Open the studio".*
- **/ai/** (Consistency): The AI features go by too many overlapping names: "AI", "Studio Intelligence", "AI studio" (which links to `/agent/`), "Design Agent", "Producer".
  *Fix: Pick one vocabulary and rename the footer "AI studio" and the "Explore the AI studio" buttons to "Design Agent".*
- **/gallery/** (Unexpected behavior): The cards have no "Try this look" action, and the "community gallery built in" mention isn't a link.
  *Fix: Add a per-card action that opens the editor with that preset applied, and link the community gallery mention.*
- **/changelog/** (Navigation): One very long page from v33 back to v4, with no version index. "Read the notes" jumps to the whole list instead of the v33 entry.
  *Fix: Add a version jump list with anchors, collapse older releases, and point the button at `#v33`.*
- **/editor/** (Navigation): The header logo is a plain `div`, so there's no way back to the marketing site, the Guide or Help.
  *Fix: Make the logo a link to `/`, and add a Help link to `/guide/`.*
- **/editor/** (Unexpected behavior): The annotation **Clear All** button sits next to Delete, erases every annotation instantly with no confirmation or Undo toast, and doesn't touch redactions, text or images despite its name.
  *Fix: Rename it "Clear annotations" and show a toast with an Undo button.*
- **/editor/** (Unexpected behavior): **Load Template** overwrites the current design with `Object.assign(state, snap)` **without calling `saveStateToHistory()`** (confirmed at `src/features/templates.js:51-57`), so **Undo can't recover the previous design**. Saving a template under an existing name also overwrites it silently.
  *Fix: Call `saveStateToHistory()` before applying, and confirm before overwriting a template with the same name.*
- **/editor/** (Forms): Some inputs use placeholder text as their only label: the URL loader, campaign name, art direction, and gallery submission name and search. Slider captions aren't linked to their sliders (see Critical).
  *Fix: Add visible `<label for>` elements.*
- **/editor/** (Forms): The annotation toolbar always shows two unexplained number inputs (6 and 5), a second color swatch and a "Fill" checkbox, explained only by tooltips, which don't work on touch.
  *Fix: Show Sides only for the Polygon tool and Points only for Star, with visible labels.*
- **/editor/** (Content clarity): Motion features are split oddly. Animation and Ken Burns are under Markup, while Motion Studio, Add video clip and **Record screen** are under Export.
  *Fix: Add a "Motion" rail group, and move Record screen to Import.*
- **/editor/** (Unexpected behavior): Every toast, errors included, disappears after a fixed 3 s, and the status pill after 1.4 s, so long errors are hard to read.
  *Fix: Keep error toasts until dismissed (or at least 5 s) and add a close button.*

### Low

- **/ai/** (Unexpected behavior): The suggestion pills ("Bolder headline", "Try dark mode") look like buttons but do nothing.
  *Fix: Style them as part of the illustration, or make them links that prefill the agent.*
- **/gallery/** (Consistency): The selected filter chip is shown only by its CSS class, and nothing shows how many results match.
  *Fix: Use `aria-pressed` and a live "Showing N looks" count.*
- **/changelog/** (Content clarity): Each release title is an `h2`, the same level as its "Every release" section heading.
  *Fix: Demote the release titles to `h3`.*
- **/pricing/** (Consistency): The Pricing FAQ repeats `/faq/` with conflicting account and sync wording, and neither mentions the Supabase setup.
  *Fix: Share one source for both FAQs and link to `/faq/`.*
- **/editor/** (Content clarity): The dropzone says "Supports PNG, JPG, WebP", but the editor also takes video, URLs, paste, code and SVG. Auto Layout shows up before any image exists.
  *Fix: Update the copy, and hide Auto Layout until a second image is added.*
- **/editor/** (Consistency): Icon styles are mixed (SVG rail icons vs emoji header buttons), label case is mixed (ALL CAPS vs Title Case), and the name "Pro Editor" differs from "the studio" used everywhere else.
  *Fix: Standardize icons, label case and naming.*

---

## Accessibility Issues

### High

- **/editor/** (WCAG 4.1.2) `select#export-preset-scale`: its only name is a `title` attribute.
  *Fix: Add a visible `<label for>` or `aria-label="Preset pixel scale"`.*
- **/editor/** (WCAG 2.1.1) `div.scene-tile` (24), `div[data-demo3d]` (4), `div.preset-button` (20), `div.size-preset-btn` (8), `div.shadow-preset-btn` (4): these are **click-only `div`s**, with no role, no tabindex and no key handler. Keyboard users **cannot pick a scene, background preset, size preset, or 3D demo**.
  *Fix: Change them to `<button type="button">`, with `aria-label` on swatch-only presets and `aria-pressed` for the selected one.*
- **/editor/** (WCAG 1.4.3) the rail tab labels (Import, Adjust…) are `#63656f` on `#131419` at 9.5px, a contrast of **3.17:1** (minimum 4.5:1).
  *Fix: Lighten them to at least `#8a8d99`, and consider a bigger font.*
- **/editor/** (WCAG 1.4.3) the muted helper text (`.info-text`, `.layers-empty`, `.welcome-dismiss`, `.scene-tile`) has a contrast of about 3.2:1.
  *Fix: Raise the muted text token to at least `#8a8d99` in the dark theme, then recheck the light theme.*
- **/** and all marketing pages (WCAG 1.4.3) the footer `.foot-tag`, `.foot-col h4` and `.foot-note` text is `#6f7794` on `#080b14`, a contrast of **4.43:1**.
  *Fix: Lighten it to at least `#7a829e` in `site/partials`.*
- **/** (WCAG 1.4.3) the hero mock address bar `span.url` has a contrast of 4.34:1.
  *Fix: Lighten it, or mark the decorative browser mockup `aria-hidden`.*
- **/** and all marketing pages (WCAG 2.4.1) there's **no "Skip to content" link and no `<main>`**, so keyboard users tab through 12 nav items on every page.
  *Fix: Add a skip link to the nav partial and wrap page content in `<main id="main">`.*
- **/pricing/** (WCAG 1.4.1) the inline "privacy page" link differs from the surrounding text only by color (1.75:1 against the text) and has no underline.
  *Fix: Underline links inside paragraphs (`p a { text-decoration: underline }`).*

### Medium

- **/editor/** (WCAG 1.1.1) `#preview-canvas` and `#minimap-canvas` have no name or role.
  *Fix: Give the preview canvas `role="img"` and an `aria-label`, and mark the minimap `aria-hidden="true"`.*
- **/editor/** (WCAG 4.1.3) the `#notification` toast has no `role` or `aria-live`, so screen readers never hear status messages, errors or Undo prompts.
  *Fix: Add `role="status" aria-live="polite" aria-atomic="true"`, and use `role="alert"` for errors.*
- **/editor/** (WCAG 1.3.1) no `<main>` landmark, most content sits outside any landmark, and there's no skip link.
  *Fix: Wrap the canvas area in `<main>`, wrap the sidebar in a labelled `<aside>`, and add a "Skip to canvas" link.*
- **/editor/** (WCAG 2.4.6) there's no `<h1>` once the welcome dialog closes.
  *Fix: Add a visually hidden `<h1>SnapShotPro editor</h1>`.*
- **/** and other marketing pages (WCAG 1.3.1) no `<main>` landmark, with content outside landmarks (41 nodes on `/features/`), and `/ai/` has no banner landmark.
  *Fix: Wrap the content between nav and footer in `<main>`, and use `<header>` for the `/ai/` hero.*
- **/** (WCAG 1.3.1) the footer column headings are `<h4>` right after `h2`/`h3` content, which skips a heading level.
  *Fix: Use `<h2>` styled the same, or plain `<p>`.*
- **/gallery/** (WCAG 4.1.2) the filter chips have no `aria-pressed`.
  *Fix: Toggle `aria-pressed` in the click handler.*

### Low

- **/editor/** (WCAG 4.1.2) `h3.section-title[role=button]` loses its heading semantics.
  *Fix: Put a `<button aria-expanded>` inside the `<h3>` instead.*
- **/editor/** (WCAG 1.3.1) `#whatsnew-heading` is an empty `h3` while the toast is hidden.
  *Fix: Hide the whole toast until it's used.*
- **/editor/** (WCAG 2.1.1) the `#upload-zone` dropzone is click-only. The "Choose Image" button is an alternative.
  *Fix: Add `role="button" tabindex="0"` and an Enter/Space handler.*
- **/changelog/** (WCAG 1.3.1) the release headings are at the same level as the section heading that contains them.
  *Fix: Use `h3`.*

---

## Performance Issues

### High

- **/editor/** (LCP): **2.7 s** simulated (2.97 s observed). The LCP element is the welcome modal tip, which `welcome.js:116` opens after `setTimeout(…, 600)` once the 152 KB module has run. About 2.96 s of that is render delay; TTFB is only about 10 ms.
  *Fix: Make the canvas or dropzone the first meaningful paint. Render the welcome modal statically and show it with CSS, or open it from `requestIdleCallback` after the studio paints.*
- **/editor/** (FCP): **2.5 s** simulated. First paint is blocked by the third-party Google Fonts CSS (about 780 ms connection), the editor CSS and a synchronous `registerSW.js` in `<head>`.
  *Fix: Self-host Geist and JetBrains Mono as woff2 with `font-display: swap`, preload the main weight, and defer `registerSW.js`.*
- **/** (LCP image): the hero `img.browser-shot` is hotlinked from **picsum.photos**, which redirects to a CDN. It has no preload, no `fetchpriority`, no `srcset` and no preconnect, and 5 more images also come from picsum. It will likely be the production LCP element. It failed in the sandbox, which is why the measured LCP looked good.
  *Fix: Use self-hosted AVIF/WebP images with `srcset`, plus `<link rel="preload" as="image" fetchpriority="high">` for the hero.*

### Medium

- **/editor/** (Unused JS): `editor-CszegF4O.js` is **489 KB raw / 152 KB transferred, with about 107 KB (70%) unused at startup**. Every `bind*` module is imported statically; the biggest are board.js, ai-cloud.js, canvas-tools.js and tour-export.js (100% unused).
  *Fix: Use `import()` to load board/seed, tour-export, merge-studio, campaign-generator, producer, ai-screenshot-editor, surfaces, code-snippet and timeline-export on first use, behind small `bind*` stubs.*
- **/editor/** (Speed Index): **4.7 s**.
  *Fix: Same fixes as above: fonts, registerSW and code splitting.*
- **/** (Speed Index): **3.9 s**, held back by the font CSS and `registerSW.js`.
  *Fix: Self-host the fonts and defer `registerSW.js`.*
- **/** (CLS): 5 lazy-loaded images have no `width`/`height` attributes. CLS measured 0 only because the sandbox blocked them.
  *Fix: Add the intrinsic sizes (900×680 and 800×500), or CSS `aspect-ratio`.*
- **/** (Render-blocking): Google Fonts CSS (8 font files, including weights 300 and 800 that are probably unused), `site.css`, and a synchronous `registerSW.js`. Estimated savings: **750 ms**.
  *Fix: Self-host the fonts, drop unused weights, and set VitePWA `injectRegister: 'script-defer'`.*
- **/features/** and all marketing pages (Render-blocking): the same issue, plus a parser-blocking `<script src="/site.js">` with no `defer`. Estimated savings: **770 ms**.
  *Fix: Add `defer` to `site.js` and `registerSW.js` in the partials.*
- **/** (Inline bloat): a 7,037-character inline `<style>` block (threshold 5,000).
  *Fix: Move the non-critical rules into a cached stylesheet.*
- **/** (Service-worker precache): **83 entries, about 5.4 MB, downloaded in the background on the first visit to any page**, including the marketing homepage. That includes vendor-three (684 KB), two ~400 KB onnxruntime bundles, jspdf (384 KB) and the OG and marketing PNGs.
  *Fix: Add `globIgnores` for lazy vendor chunks and marketing images, and cache those with `runtimeCaching` (CacheFirst) only when they're actually used.*
- **/editor/** (Caching headers, **verify on production**): hashed `/assets/*` are served with `no-cache` locally, and the repo has no `vercel.json` headers rule.
  *Fix: Add a `vercel.json` rule `"/assets/(.*)" → Cache-Control: public, max-age=31536000, immutable`, then check production with `curl -I`.*

### Low

- **/editor/** (Forced reflow): about 108 ms of forced layout at startup, mapped approximately to `set-ui.js:191` and `seed.js:24`.
  *Fix: Batch DOM writes before layout reads, and build hidden panels on first open.*
- **/editor/** (HTML size): `editor/index.html` is 131 KB raw / about 22 KB gzipped, and every panel and modal is static markup.
  *Fix: Put hidden panels and modals in `<template>` or build them on first open.*
- **/editor/** (Bundle duplication): four onnxruntime-web bundles (`.js` and `.mjs` × wasm and webgpu, about 400 KB each) plus a 23.9 MB wasm. These are lazy-loaded, but the `.js` copies are precached.
  *Fix: Import a single ort entry and exclude ort files from the precache.*

---

## Bugs & Functional Issues

These come from a Playwright spec run against the real built pages (`/tmp/site-audit-snapshotpro.xyz/bugs.spec.ts`).

### High

- **/editor/** (dead-click): **The invisible toast eats clicks.** After a toast hides, `.notification` keeps `opacity: 0` and `transform: translateX(400px)` but **still receives pointer events** at `z-index: 2000` (confirmed at `src/styles.css:432-442`). Any toast wider than 400px leaves an invisible strip on screen. In the test, that strip covered the **Layers "Collapse" button** (`#layers-toggle-btn`), so clicking it did nothing.
  *Fix: Add `pointer-events: none; visibility: hidden;` to `.notification` and `pointer-events: auto; visibility: visible;` to `.notification.show`. Optionally hide it with `translateX(calc(100% + 40px))` so it always fully leaves the screen.*

### Medium

- **/editor/** (modal-trap): the first-visit **Welcome dialog doesn't close on Escape**, even though it's `aria-modal` and traps focus. Keyboard users have to tab to ✕.
  *Fix: Handle Escape in `welcome.js` `bindWelcome()`, or better, add a generic Escape-to-close in `src/ui/a11y.js` for every dialog it manages.*
- **/editor/** (modal-trap): the **☁ Set up cloud** modal (`#cloud-setup-modal`) **doesn't close on Escape**. The Escape cascade in `keyboard.js` only handles the board, the shortcuts overlay, the sticker drawer and the tool. The shortcuts overlay does close on Escape, so this is inconsistent.
  *Fix: Use the same generic Escape handler in `a11y.js`, or add a branch for `.auth-modal-overlay.visible` in `keyboard.js`.*

---

## Top 5 Recommendations

1. **Stop the invisible toast from blocking clicks.** Two CSS lines in `src/styles.css` (`pointer-events: none` until `.show`) fix a real dead-click bug on the editor toolbar. This is the quickest high-severity fix.
2. **Label every editor control.** This fixes both Critical issues: 181 unlabeled inputs and 13 unlabeled selects. Adding `for` to the existing `.control-label`s, or having `a11y.js` link each one to its control at startup, fixes it everywhere at once.
3. **Make the editor keyboard-friendly.** Turn the click-only preset, scene and 3D tiles into `<button>`s, and add one generic Escape-to-close in `a11y.js` for the Welcome and cloud dialogs. Right now keyboard users can't pick scenes or background presets at all.
4. **Add a mobile menu to the marketing site, plus a skip link and `<main>`.** Below 560px the nav links vanish with no replacement, and every page lacks a skip link and main landmark. One change to the shared nav partial fixes all pages.
5. **Replace the picsum placeholders with real, self-hosted SnapShotPro exports.** This one change fixes the trust problem (visitors see unrelated stock photos), the likely production LCP problem (third-party hero image with no preload), and the CLS risk (unsized images) on the homepage and gallery.

Honorable mentions: make **Load Template** undoable (one `saveStateToHistory()` call), trim the **5.4 MB service-worker precache**, and lighten the muted text color token for contrast.
