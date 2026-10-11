# Public Marketing System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all 27 SnapShotPro public marketing routes as one distinctive, accessible bright-editorial system with complete light/dark appearance support, authentic product proof, clearer messaging, and no editor changes or deployment.

**Architecture:** Keep the existing Vite multi-page application and HTML partial injector. Introduce a single route manifest, a shared head and route context, semantic theme tokens, accessible shared navigation, reusable page-archetype primitives, a static marketing contract test, and optimized local product assets. Migrate representative pilots first, then move the remaining pages by route family so every commit builds and can be reviewed independently.

**Tech Stack:** Vanilla HTML, native CSS, vanilla JavaScript, Vite 5, Node.js built-in assertions, Python 3 with Pillow for reproducible marketing image conversion, existing SVG brand assets.

**Approved spec:** `docs/superpowers/specs/2026-07-10-public-marketing-system-redesign-design.md`

**Required design guidance:** `design-taste-frontend`, `frontend-design`, and `ui-ux-pro-max`.

**Delivery boundary:** Local implementation and verification only. Do not deploy, push, create a pull request, or modify `/editor/` behavior or styling.

---

## File Map

### New shared files

- `site/routes.js` - canonical route, input, sitemap, archetype, navigation, and metadata registry.
- `site/partials/head.html` - shared fonts, stylesheet, theme bootstrap, favicon, and common head markup.
- `scripts/marketing-contract-tests.mjs` - source/build contract tests for every marketing route.
- `scripts/build-marketing-assets.py` - deterministic PNG/JPEG to WebP conversion and sizing.
- `public/fonts/` - self-hosted Geist and JetBrains Mono WOFF2 files.
- `public/marketing/` - optimized authentic editor captures and exported-result assets.

### Shared files to modify

- `package.json` - add `test:marketing` and `build:marketing-assets` scripts without changing dependencies.
- `vite.config.js` - derive Rollup inputs and sitemap routes from `site/routes.js`; inject shared head and route context.
- `site/partials/nav.html` - accessible grouped desktop/tablet/mobile navigation and appearance menu.
- `site/partials/footer.html` - simplified bright-editorial footer with the same destinations.
- `public/site.css` - semantic themes, shared shell, archetypes, responsive rules, states, and reduced motion.
- `public/site.js` - appearance preference, menus, active route, gallery filtering hooks, and restrained reveals.

### Marketing pages to migrate

- Flagship: `index.html`, `gallery/index.html`.
- Directory/decision: `features/index.html`, `tools/index.html`, `use-cases/index.html`, `pricing/index.html`, `alternatives/index.html`.
- Product pillars: `ai/index.html`, `agent/index.html`, `studio-intelligence/index.html`, `extension/index.html`.
- Task/solution: `app-store-screenshots/index.html`, `device-mockup-generator/index.html`, `product-mockups/index.html`, `merge/index.html`, `og-image-generator/index.html`, `drop-shadow-generator/index.html`, `social-media-mockups/index.html`, `github-readme-screenshots/index.html`, `code-screenshots/index.html`.
- Editorial/trust: `about/index.html`, `guide/index.html`, `faq/index.html`, `changelog/index.html`, `roadmap/index.html`, `privacy/index.html`, `terms/index.html`.

### Explicitly excluded

- `editor/index.html`, `src/styles.css`, `src/main.js`, all `src/features/`, and the legacy `SnapShot-Pro-main/` tree.

---

## Phase 1: Shared Foundations

### Task 1: Add the canonical route manifest contract

**Files:**
- Create: `site/routes.js`
- Create: `scripts/marketing-contract-tests.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the failing route-manifest test**

Create `scripts/marketing-contract-tests.mjs` with the initial contract:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { editorRoute, marketingRoutes } from '../site/routes.js';

function testRouteManifest() {
  assert.equal(marketingRoutes.length, 27, 'expected every public marketing route');
  assert.equal(editorRoute.path, '/editor/');
  assert.equal(editorRoute.input, 'editor/index.html');

  const paths = new Set(marketingRoutes.map((route) => route.path));
  assert.equal(paths.size, marketingRoutes.length, 'route paths must be unique');

  for (const route of marketingRoutes) {
    assert.ok(route.key);
    assert.ok(route.path.startsWith('/') && route.path.endsWith('/'));
    assert.ok(fs.existsSync(route.input), `missing input: ${route.input}`);
    assert.ok(['flagship', 'solution', 'directory', 'editorial'].includes(route.archetype));
    assert.ok(route.sitemap.priority);
    assert.ok(route.sitemap.changefreq);
  }
}

testRouteManifest();
console.log('ok testRouteManifest');
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node scripts/marketing-contract-tests.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `site/routes.js`.

- [ ] **Step 3: Create the complete route manifest**

Create `site/routes.js` with this shape and all current inputs:

```js
export const marketingRoutes = [
  ['main', '/', 'index.html', 'flagship', 'weekly', '1.0'],
  ['features', '/features/', 'features/index.html', 'directory', 'monthly', '0.8'],
  ['tools', '/tools/', 'tools/index.html', 'directory', 'monthly', '0.8'],
  ['ai', '/ai/', 'ai/index.html', 'solution', 'monthly', '0.8'],
  ['agent', '/agent/', 'agent/index.html', 'solution', 'monthly', '0.7'],
  ['gallery', '/gallery/', 'gallery/index.html', 'flagship', 'weekly', '0.7'],
  ['useCases', '/use-cases/', 'use-cases/index.html', 'directory', 'monthly', '0.7'],
  ['pricing', '/pricing/', 'pricing/index.html', 'directory', 'monthly', '0.7'],
  ['guide', '/guide/', 'guide/index.html', 'editorial', 'monthly', '0.7'],
  ['changelog', '/changelog/', 'changelog/index.html', 'editorial', 'weekly', '0.6'],
  ['about', '/about/', 'about/index.html', 'editorial', 'yearly', '0.5'],
  ['appStoreScreenshots', '/app-store-screenshots/', 'app-store-screenshots/index.html', 'solution', 'monthly', '0.8'],
  ['deviceMockupGenerator', '/device-mockup-generator/', 'device-mockup-generator/index.html', 'solution', 'monthly', '0.8'],
  ['productMockups', '/product-mockups/', 'product-mockups/index.html', 'solution', 'monthly', '0.8'],
  ['studioIntelligence', '/studio-intelligence/', 'studio-intelligence/index.html', 'solution', 'monthly', '0.8'],
  ['merge', '/merge/', 'merge/index.html', 'solution', 'monthly', '0.8'],
  ['ogImageGenerator', '/og-image-generator/', 'og-image-generator/index.html', 'solution', 'monthly', '0.8'],
  ['dropShadowGenerator', '/drop-shadow-generator/', 'drop-shadow-generator/index.html', 'solution', 'monthly', '0.8'],
  ['socialMediaMockups', '/social-media-mockups/', 'social-media-mockups/index.html', 'solution', 'monthly', '0.8'],
  ['githubReadmeScreenshots', '/github-readme-screenshots/', 'github-readme-screenshots/index.html', 'solution', 'monthly', '0.8'],
  ['codeScreenshots', '/code-screenshots/', 'code-screenshots/index.html', 'solution', 'monthly', '0.8'],
  ['extension', '/extension/', 'extension/index.html', 'solution', 'monthly', '0.8'],
  ['alternatives', '/alternatives/', 'alternatives/index.html', 'directory', 'monthly', '0.7'],
  ['faq', '/faq/', 'faq/index.html', 'editorial', 'monthly', '0.6'],
  ['roadmap', '/roadmap/', 'roadmap/index.html', 'editorial', 'monthly', '0.5'],
  ['privacy', '/privacy/', 'privacy/index.html', 'editorial', 'yearly', '0.3'],
  ['terms', '/terms/', 'terms/index.html', 'editorial', 'yearly', '0.3']
].map(([key, path, input, archetype, changefreq, priority]) => ({
  key,
  path,
  input,
  archetype,
  sitemap: { changefreq, priority }
}));

export const editorRoute = {
  key: 'editor',
  path: '/editor/',
  input: 'editor/index.html',
  sitemap: { changefreq: 'weekly', priority: '0.9' }
};

export const buildRoutes = [...marketingRoutes, editorRoute];
```

- [ ] **Step 4: Add the marketing test script**

Add this script to `package.json` without changing dependencies:

```json
"test:marketing": "node scripts/marketing-contract-tests.mjs"
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm run test:marketing`

Expected: `ok testRouteManifest`.

- [ ] **Step 6: Commit the route contract**

```bash
git add package.json site/routes.js scripts/marketing-contract-tests.mjs
git commit -m "test: define marketing route contract"
```

### Task 2: Derive Vite inputs and sitemap entries from the manifest

**Files:**
- Modify: `vite.config.js`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add a failing Vite integration assertion**

Append to the test file:

```js
function testViteUsesRouteManifest() {
  const source = fs.readFileSync('vite.config.js', 'utf8');
  assert.match(source, /import\s+\{\s*buildRoutes,\s*editorRoute,\s*marketingRoutes\s*\}\s+from\s+['"]\.\/site\/routes\.js['"]/);
  assert.match(source, /Object\.fromEntries\(buildRoutes\.map/);
  assert.match(source, /marketingRoutes\.map/);
}

testViteUsesRouteManifest();
console.log('ok testViteUsesRouteManifest');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:marketing`

Expected: FAIL in `testViteUsesRouteManifest`.

- [ ] **Step 3: Replace duplicated route registries in Vite**

Import `buildRoutes` and `marketingRoutes`, create Rollup inputs from `route.key` and `resolve(__dirname, route.input)`, and generate sitemap entries from the same objects. Keep editor in build inputs and sitemap, but exclude it from marketing partial injection.

The core expressions must be:

```js
import { buildRoutes, editorRoute, marketingRoutes } from './site/routes.js';

const rollupInputs = Object.fromEntries(
  buildRoutes.map((route) => [route.key, resolve(__dirname, route.input)])
);

const sitemapRoutes = [...marketingRoutes, editorRoute];
```

Use `rollupInputs` in `build.rollupOptions.input`. Use `sitemapRoutes.map(...)` inside `seoFiles()`.

- [ ] **Step 4: Run tests and build**

Run: `npm run test:marketing`

Expected: both route tests pass.

Run: `npm run build`

Expected: Vite emits all 28 inputs plus `sitemap.xml` and `robots.txt`.

- [ ] **Step 5: Commit the manifest integration**

```bash
git add vite.config.js scripts/marketing-contract-tests.mjs
git commit -m "refactor: derive site routes from one manifest"
```

### Task 3: Add the shared head, self-hosted fonts, and route context

**Files:**
- Create: `site/partials/head.html`
- Create: `public/fonts/geist-latin.woff2`
- Create: `public/fonts/geist-latin-ext.woff2`
- Create: `public/fonts/jetbrains-mono-latin.woff2`
- Modify: `vite.config.js`
- Modify: `scripts/marketing-contract-tests.mjs`
- Modify: all 27 marketing HTML files to remove duplicated Google Font links after shared injection is verified.

- [ ] **Step 1: Add failing shared-head contract tests**

Add a loop that asserts every marketing file contains no `fonts.googleapis.com`, and that transformed shared markup is owned by `site/partials/head.html`:

```js
function testSharedHeadContract() {
  const partial = fs.readFileSync('site/partials/head.html', 'utf8');
  assert.match(partial, /\/fonts\/geist-latin\.woff2/);
  assert.match(partial, /\/fonts\/jetbrains-mono-latin\.woff2/);
  assert.match(partial, /data-theme/);

  for (const route of marketingRoutes) {
    const html = fs.readFileSync(route.input, 'utf8');
    assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  }
}

testSharedHeadContract();
console.log('ok testSharedHeadContract');
```

- [ ] **Step 2: Run tests and confirm the missing partial/font-link failure**

Run: `npm run test:marketing`

Expected: FAIL because the partial is absent and marketing pages still link Google Fonts.

- [ ] **Step 3: Add the shared head partial and font files**

Create `site/partials/head.html` with local font preloads, `/site.css`, and the pre-paint theme bootstrap:

```html
<link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
<script>
(() => {
  const key = 'snapshotpro_marketing_theme';
  const saved = localStorage.getItem(key);
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = saved || 'system';
  document.documentElement.style.colorScheme = resolved;
})();
</script>
```

Use verified official Geist and JetBrains Mono WOFF2 sources. Do not alter the logo or introduce a new font family.

- [ ] **Step 4: Inject head and route context only into marketing inputs**

Extend `htmlPartials()` so a marketing route receives the head partial before `</head>` and receives these body attributes:

```html
<body data-route="/features/" data-archetype="directory">
```

Do not inject the marketing head or theme preference into `editor/index.html`.

- [ ] **Step 5: Remove duplicated font and stylesheet tags from marketing pages**

For all 27 marketing HTML files, remove Google preconnect/font links and the direct `/site.css` link. Keep route-specific title, description, canonical, Open Graph, Twitter, JSON-LD, and page-local style blocks until their migration task.

- [ ] **Step 6: Run tests and build**

Run: `npm run test:marketing`

Expected: shared-head contract passes.

Run: `npm run build`

Expected: all marketing pages load local fonts and CSS; editor output remains unchanged.

- [ ] **Step 7: Commit the shared head**

```bash
git add site/partials/head.html public/fonts vite.config.js scripts/marketing-contract-tests.mjs index.html about alternatives ai agent app-store-screenshots changelog code-screenshots device-mockup-generator drop-shadow-generator extension faq features gallery github-readme-screenshots guide merge og-image-generator pricing privacy product-mockups roadmap social-media-mockups studio-intelligence terms tools use-cases
git commit -m "feat: centralize marketing head and fonts"
```

### Task 4: Build semantic themes and the appearance controller

**Files:**
- Modify: `public/site.css`
- Modify: `public/site.js`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing theme contract tests**

Append assertions for semantic tokens and preference behavior:

```js
function testThemeContract() {
  const css = fs.readFileSync('public/site.css', 'utf8');
  const js = fs.readFileSync('public/site.js', 'utf8');
  assert.match(css, /:root\s*\{[\s\S]*--color-canvas:/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /--color-focus:/);
  assert.match(js, /snapshotpro_marketing_theme/);
  assert.match(js, /prefers-color-scheme/);
  assert.match(js, /setThemePreference/);
}

testThemeContract();
console.log('ok testThemeContract');
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm run test:marketing`

Expected: FAIL in `testThemeContract`.

- [ ] **Step 3: Replace global dark-glass tokens with semantic light/dark tokens**

Define these roles in `public/site.css` and map them separately for light and dark:

```css
:root {
  --color-canvas: #f4f6f8;
  --color-surface: #ffffff;
  --color-surface-muted: #e9edf2;
  --color-ink: #10131a;
  --color-ink-muted: #5c6675;
  --color-border: #d8dee7;
  --color-accent: #2348ff;
  --color-accent-hover: #1737d6;
  --color-on-accent: #ffffff;
  --color-focus: #2348ff;
  --radius-control: 4px;
  --radius-media: 8px;
  --duration-fast: 160ms;
  --duration-standard: 240ms;
}

[data-theme="dark"] {
  --color-canvas: #0d1118;
  --color-surface: #161c25;
  --color-surface-muted: #202733;
  --color-ink: #f1f4f8;
  --color-ink-muted: #aab3c1;
  --color-border: #343d4a;
  --color-accent: #6f8cff;
  --color-accent-hover: #8ba1ff;
  --color-on-accent: #0d1118;
  --color-focus: #8ba1ff;
}
```

Do not preserve the old aurora, gradient headline, global glass, or glow tokens as defaults.

- [ ] **Step 4: Implement the appearance preference API**

In `public/site.js`, add `getThemePreference()`, `resolveTheme(preference)`, `applyTheme(preference)`, and `setThemePreference(preference)`. Accepted values are `system`, `light`, and `dark`. Persist only explicit selections; system mode removes the localStorage key and follows media-query changes.

- [ ] **Step 5: Run tests**

Run: `npm run test:marketing`

Expected: theme contract passes.

- [ ] **Step 6: Commit theme foundations**

```bash
git add public/site.css public/site.js scripts/marketing-contract-tests.mjs
git commit -m "feat: add semantic marketing themes"
```

### Task 5: Rebuild shared navigation, footer, and accessibility shell

**Files:**
- Modify: `site/partials/nav.html`
- Modify: `site/partials/footer.html`
- Modify: `public/site.css`
- Modify: `public/site.js`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing shared-shell tests**

```js
function testSharedShellContract() {
  const nav = fs.readFileSync('site/partials/nav.html', 'utf8');
  assert.match(nav, /href="#main"[^>]*class="skip-link"/);
  assert.match(nav, /aria-controls="primary-menu"/);
  assert.match(nav, /data-menu="product"/);
  assert.match(nav, /data-menu="resources"/);
  assert.match(nav, /data-theme-option="system"/);
  assert.match(nav, /data-theme-option="light"/);
  assert.match(nav, /data-theme-option="dark"/);
}

testSharedShellContract();
console.log('ok testSharedShellContract');
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: FAIL in `testSharedShellContract`.

- [ ] **Step 3: Replace the shared navigation markup**

Use semantic links and buttons with this hierarchy:

```html
<a class="skip-link" href="#main">Skip to content</a>
<nav id="nav" aria-label="Primary">
  <a class="brand" href="/">SnapShotPro</a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-menu">Menu</button>
  <div id="primary-menu" class="nav-menu">
    <button type="button" data-menu="product" aria-expanded="false">Product</button>
    <a href="/tools/">Tools</a>
    <a href="/use-cases/">Use cases</a>
    <a href="/gallery/">Gallery</a>
    <a href="/pricing/">Pricing</a>
    <button type="button" data-menu="resources" aria-expanded="false">Resources</button>
    <a class="btn btn-primary" href="/editor/">Open the studio</a>
    <button type="button" data-menu="appearance" aria-expanded="false">Appearance</button>
  </div>
</nav>
```

Product contains Features, AI, Agent, Studio Intelligence, Extension, and Code. Resources contains Guide, Changelog, FAQ, Roadmap, About, Privacy, and Terms. Appearance contains System, Light, and Dark options. Keep all existing destinations reachable.

- [ ] **Step 4: Implement menu behavior and current-route state**

Use event delegation in `public/site.js`. Escape closes the active menu and restores focus to its trigger. Outside click closes menus. Mobile navigation traps no focus and returns focus to the menu button on close. Set `aria-current="page"` on the exact current link and `data-current="true"` on its top-level group.

- [ ] **Step 5: Add shell CSS states**

Provide full desktop, condensed tablet, and complete mobile layouts. Every touch target is at least 44px high with 8px gaps. Add visible focus rings, sticky-header offset, a documented z-index scale, pressed states without layout shift, and reduced-motion behavior.

- [ ] **Step 6: Simplify the footer without removing links**

Keep Product, Tools, Resources, and Project groups, remove the visually prominent build version, and ensure link targets remain unchanged.

- [ ] **Step 7: Run tests and keyboard-check the shell**

Run: `npm run test:marketing`

Expected: shared shell tests pass.

Run: `npm run dev -- --host 127.0.0.1 --port 5173`

Check Tab, Shift+Tab, Enter, Space, Escape, outside click, mobile menu, appearance persistence, and focus return.

- [ ] **Step 8: Commit the shared shell**

```bash
git add site/partials/nav.html site/partials/footer.html public/site.css public/site.js scripts/marketing-contract-tests.mjs
git commit -m "feat: rebuild accessible marketing shell"
```

### Task 6: Build shared archetype primitives

**Files:**
- Modify: `public/site.css`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing primitive-name assertions**

Assert the stylesheet owns `.hero--flagship`, `.hero--solution`, `.hero--editorial`, `.product-shot`, `.output-ribbon`, `.workflow`, `.capability-index`, `.trust-block`, `.related-links`, `.comparison`, `.closing-cta`, and `.prose`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: FAIL until all shared primitives exist.

- [ ] **Step 3: Implement the shared primitives**

Use a 12-column grid, 1280-1400px maximum container, 4/8px spacing rhythm, 65-75 character prose measure, stable media aspect ratios, and explicit single-column rules below 768px. Full-width page bands must remain unframed. Cards are limited to repeated selectable objects.

- [ ] **Step 4: Add motion and state primitives**

Use 160-240ms transitions for focus, menu, hover, and selection. Reveal only transform and opacity, never hide core content by default, and disable nonessential motion under `prefers-reduced-motion`.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:marketing`

Expected: primitive contract passes.

```bash
git add public/site.css scripts/marketing-contract-tests.mjs
git commit -m "feat: add marketing page archetypes"
```

---

## Phase 2: Authentic Assets and Archetype Pilots

### Task 7: Add the deterministic marketing asset pipeline

**Files:**
- Create: `scripts/build-marketing-assets.py`
- Create: `public/marketing/` asset outputs
- Modify: `package.json`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing asset-contract tests**

Test for required output files and Pillow script behavior. Required outputs:

```js
const requiredAssets = [
  'editor-workspace.webp',
  'output-launch.webp',
  'output-docs.webp',
  'output-store.webp',
  'output-social.webp',
  'output-code.webp',
  'output-mockup.webp'
];
```

For each entry in `requiredAssets`, assert `public/marketing/${name}` exists and is larger than 1KB.

- [ ] **Step 2: Run tests and confirm missing assets fail**

Run: `npm run test:marketing`

Expected: FAIL listing the missing marketing assets.

- [ ] **Step 3: Create the Pillow converter**

`scripts/build-marketing-assets.py` must accept source and destination directories, apply EXIF transpose, convert to RGB/RGBA, cap the longest edge at 1800px, and save WebP at quality 88 with method 6. It must print each source and output dimension and exit nonzero for a missing required source.

- [ ] **Step 4: Capture authentic source PNGs locally**

Use the current local editor and real exports. Capture one clean workspace state and produce launch, docs, store, social, code, and mockup results using existing functionality. Save temporary source PNGs under `tmp/marketing-source/`; do not commit source captures or fake UI.

- [ ] **Step 5: Generate optimized assets**

Add this script to `package.json`:

```json
"build:marketing-assets": "python scripts/build-marketing-assets.py tmp/marketing-source public/marketing"
```

Run: `npm run build:marketing-assets`

Expected: seven WebP files with printed dimensions and no error.

- [ ] **Step 6: Run tests and inspect every asset**

Run: `npm run test:marketing`

Expected: asset contract passes.

Open every image and reject blank, blurry, generic, cropped, or inaccurate output before continuing.

- [ ] **Step 7: Commit the asset pipeline and outputs**

```bash
git add package.json scripts/build-marketing-assets.py public/marketing scripts/marketing-contract-tests.mjs
git commit -m "feat: add authentic marketing assets"
```

### Task 8: Migrate the homepage and implement the Output Ribbon signature

**Files:**
- Modify: `index.html`
- Modify: `public/site.css`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add the failing homepage contract**

Assert `index.html` contains `<main id="main">`, `.hero--flagship`, exactly one `.output-ribbon`, `/marketing/editor-workspace.webp`, every `output-*.webp` ribbon asset, `Open the studio`, and `See examples`. Assert it contains no `picsum.photos`, `.grad-text`, `.glow`, `.float-chip`, or em dash.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: homepage contract fails on the current dark-glass markup.

- [ ] **Step 3: Recompose the homepage**

Required order:

1. Full-bleed product-proof hero with the literal category statement, short supporting copy, `Open the studio`, and `See examples`.
2. One Output Ribbon using authentic launch, docs, store, and social exports.
3. Four-stage Capture, Compose, Scale, Ship workflow.
4. Equal creator and product-team outcome bands.
5. Concise privacy/open-source/browser trust block.
6. Closing CTA.

Keep hero headline at two lines or fewer, supporting copy below 20 words where possible, both actions visible in the first viewport, and a visible hint of the Output Ribbon below.

- [ ] **Step 4: Implement responsive Output Ribbon behavior**

Desktop uses one static full-bleed varied-aspect composition. Mobile uses a visible-control scroll-snap region or vertical stack with no autoplay, no infinite marquee, and no gesture-only action.

- [ ] **Step 5: Run tests, build, and browser-check both themes**

Run: `npm run test:marketing && npm run build`

Expected: pass.

Check 1440x900, 1024x768, 390x844, 375x812, 360x740, phone landscape, light, dark, system, reduced motion, keyboard navigation, 200% zoom, and no horizontal overflow.

- [ ] **Step 6: Commit the homepage**

```bash
git add index.html public/site.css scripts/marketing-contract-tests.mjs
git commit -m "feat: redesign the marketing homepage"
```

### Task 9: Migrate one pilot from each remaining archetype

**Files:**
- Modify: `gallery/index.html`
- Modify: `features/index.html`
- Modify: `ai/index.html`
- Modify: `terms/index.html`
- Modify: `public/site.css`
- Modify: `public/site.js`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing pilot contracts**

For all four files, assert `<main id="main">`, no Picsum, no `.grad-text`, no `.glow`, and one matching archetype hero. Add route-specific assertions:

- Gallery: authentic local assets and `aria-pressed` filters.
- Features: Capture, Compose, Scale, Ship headings and no repeated `.cards3` grid.
- AI: suite overview copy that links separately to Agent and Studio Intelligence.
- Terms: compact editorial header and `.prose` content without legal-meaning changes.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: all four pilot contracts fail.

- [ ] **Step 3: Migrate Gallery**

Use authentic outputs, a scannable proof grid with varied aspect ratios, external captions, accessible text filter buttons, and `aria-pressed` updates in `public/site.js`. Preserve gallery route and purpose.

- [ ] **Step 4: Migrate Features**

Replace the old five three-card rows with the current four-stage workflow map. Include all shipped capability families from the approved spec. Use ruled capability indexes and related links rather than equal glass cards.

- [ ] **Step 5: Migrate AI**

Define AI as the suite overview. Present existing background generation/editing/OCR/design functions, then link to Agent for conversational composition and Studio Intelligence for brand/campaign work. Use real product proof and accurate hosted/BYOK language.

- [ ] **Step 6: Migrate Terms**

Preserve legal language and all destinations. Apply the editorial/trust header, readable prose measure, semantic headings, accessible links, and both themes.

- [ ] **Step 7: Run pilot tests and browser verification**

Run: `npm run test:marketing && npm run build`

Expected: pass.

Verify all four pilots at desktop, tablet, mobile, light, dark, reduced motion, keyboard navigation, and 200% zoom. Fix shared primitives before migrating more routes.

- [ ] **Step 8: Commit archetype pilots**

```bash
git add gallery/index.html features/index.html ai/index.html terms/index.html public/site.css public/site.js scripts/marketing-contract-tests.mjs
git commit -m "feat: validate marketing page archetypes"
```

---

## Phase 3: Route-Family Migration

### Task 10: Migrate directory and decision routes

**Files:**
- Modify: `tools/index.html`
- Modify: `use-cases/index.html`
- Modify: `pricing/index.html`
- Modify: `alternatives/index.html`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing contracts for all four routes**

Assert main landmark, directory hero, no forbidden dark-glass classes, no Picsum, and required content:

- Tools: task-based directory with every current specialized tool destination.
- Use cases: equal creator and product-team pathways without persona tabs.
- Pricing: free/open-source proposition plus accurate optional cloud/AI distinctions.
- Alternatives: dated comparison methodology, caveat, accessible table, and current facts.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: route-family contract fails.

- [ ] **Step 3: Migrate each route using directory primitives**

Keep existing slugs, canonical intent, and accurate claims. Use grouped indexes, sparse dividers, accessible comparison markup, related links, and one primary CTA. Remove repeated card grids and decorative highlighted H1 fragments.

- [ ] **Step 4: Run tests, build, and inspect both themes**

Run: `npm run test:marketing && npm run build`

Expected: pass.

- [ ] **Step 5: Commit directory routes**

```bash
git add tools/index.html use-cases/index.html pricing/index.html alternatives/index.html scripts/marketing-contract-tests.mjs
git commit -m "feat: migrate marketing directories"
```

### Task 11: Migrate product-pillar routes

**Files:**
- Modify: `agent/index.html`
- Modify: `studio-intelligence/index.html`
- Modify: `extension/index.html`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing pillar contracts**

Require main landmark, solution hero, real local media, no Picsum, one primary CTA, and distinct page contracts:

- Agent: conversational composition and editing.
- Studio Intelligence: brand consistency and campaign-scale automation.
- Extension: capture and handoff workflow with a verified installation destination or honest availability copy.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: pillar contract fails.

- [ ] **Step 3: Migrate Agent and Studio Intelligence**

Preserve current implemented capabilities. Remove duplicated suite-level AI claims and generic Acme/Jane proof. Use existing local Studio Intelligence assets only when they accurately show the current product; otherwise replace them with the new marketing assets.

- [ ] **Step 4: Migrate Extension**

Use existing capture modes and handoff facts. Verify any Chrome Web Store URL before including `Add to Chrome`; never link to the generic store homepage as if it were the product listing.

- [ ] **Step 5: Run tests, build, and browser-check**

Run: `npm run test:marketing && npm run build`

Expected: pass.

- [ ] **Step 6: Commit product pillars**

```bash
git add agent/index.html studio-intelligence/index.html extension/index.html scripts/marketing-contract-tests.mjs
git commit -m "feat: clarify marketing product pillars"
```

### Task 12: Migrate mockup, store, and scale solution routes

**Files:**
- Modify: `app-store-screenshots/index.html`
- Modify: `device-mockup-generator/index.html`
- Modify: `product-mockups/index.html`
- Modify: `merge/index.html`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing solution contracts**

Each page must have one job-specific hero, one authentic output, accurate steps, relevant related links, and `Open the studio`. Assert no repeated `Keep going`, no Picsum, no generic three-equal-card section, and no claim that `/editor/` opens preconfigured unless verified.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: solution contract fails.

- [ ] **Step 3: Migrate the four pages**

- App Store: store-set output, supported sizes, caption workflow, and accurate export facts.
- Device mockup: supported device/window frames and real device result.
- Product mockups: real product/print result and current supported mockup types.
- Merge: CSV-to-design workflow, supported token fields, preview, and batch export facts.

Use the shared solution archetype but give each route unique outcome copy, media, and related links.

- [ ] **Step 4: Run tests, build, and inspect**

Run: `npm run test:marketing && npm run build`

Expected: pass.

- [ ] **Step 5: Commit the solution group**

```bash
git add app-store-screenshots/index.html device-mockup-generator/index.html product-mockups/index.html merge/index.html scripts/marketing-contract-tests.mjs
git commit -m "feat: migrate mockup and scale pages"
```

### Task 13: Migrate social, code, and utility solution routes

**Files:**
- Modify: `og-image-generator/index.html`
- Modify: `drop-shadow-generator/index.html`
- Modify: `social-media-mockups/index.html`
- Modify: `github-readme-screenshots/index.html`
- Modify: `code-screenshots/index.html`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing utility contracts**

Require a unique outcome, authentic matching result, accurate workflow, relevant related links, `Open the studio`, and no repeated `Keep going`, Picsum, generic card trio, or false contextual deep-link claim.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: utility contract fails.

- [ ] **Step 3: Migrate all five utility pages**

- OG: 1200x630 output and social-card workflow.
- Drop shadow: before/after result and existing shadow controls.
- Social: existing platform sizes and one-source/multiple-output result.
- GitHub README: code/docs-oriented result and repository-image workflow.
- Code: current Code Snippet Studio naming, language rendering, and export output.

Use unique section rhythms within the solution archetype. Do not repeat the homepage Output Ribbon.

- [ ] **Step 4: Run tests, build, and inspect**

Run: `npm run test:marketing && npm run build`

Expected: pass.

- [ ] **Step 5: Commit utility routes**

```bash
git add og-image-generator/index.html drop-shadow-generator/index.html social-media-mockups/index.html github-readme-screenshots/index.html code-screenshots/index.html scripts/marketing-contract-tests.mjs
git commit -m "feat: migrate utility marketing pages"
```

### Task 14: Migrate editorial, resource, and project routes

**Files:**
- Modify: `about/index.html`
- Modify: `guide/index.html`
- Modify: `faq/index.html`
- Modify: `changelog/index.html`
- Modify: `roadmap/index.html`
- Modify: `privacy/index.html`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing editorial contracts**

Require `<main id="main">`, editorial hero, constrained prose, sequential headings, no gradient headline or decorative glass, and route-specific content:

- About: preserve the one-HTML-file origin story.
- Guide: preserve App Store conversion guidance and current feature terminology.
- FAQ: native details/summary and accurate objections.
- Changelog: preserve complete release history and remove stale global dark literals from its scoped CSS.
- Roadmap: remove or qualify items already shipped according to Changelog.
- Privacy: preserve concrete local/hosted processing distinctions and legal meaning.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:marketing`

Expected: editorial contract fails.

- [ ] **Step 3: Migrate About, Guide, FAQ, and Privacy**

Use compact headers, readable prose, sparse dividers, semantic links, both themes, and no decorative cards around long-form content.

- [ ] **Step 4: Migrate Changelog and Roadmap together**

Apply shared tokens and shell while preserving release content. Reconcile tours, motion, collaboration, Open Canvas, Merge, Studio Intelligence, and other shipped features so Roadmap no longer contradicts Changelog.

- [ ] **Step 5: Run tests, build, and inspect long pages**

Run: `npm run test:marketing && npm run build`

Expected: pass.

Verify deep-page navigation, focus, theme consistency, long-page performance, and heading hierarchy.

- [ ] **Step 6: Commit editorial routes**

```bash
git add about/index.html guide/index.html faq/index.html changelog/index.html roadmap/index.html privacy/index.html scripts/marketing-contract-tests.mjs
git commit -m "feat: migrate marketing resource pages"
```

---

## Phase 4: Cross-Site Content, Metadata, and Verification

### Task 15: Normalize copy, metadata, and product vocabulary

**Files:**
- Modify: all 27 marketing HTML files.
- Modify: `site/routes.js`
- Modify: `vite.config.js`
- Modify: `scripts/marketing-contract-tests.mjs`

- [ ] **Step 1: Add failing cross-site content and metadata tests**

For every marketing route, assert:

- Exactly one nonempty H1.
- Title, description no longer than 160 characters, canonical, Open Graph title/description/image, Twitter card/title/description/image, and theme-color.
- No `picsum.photos`, `John Doe`, `Jane`, `Acme`, `Keep going`, `grad-text`, em dash, or generic Chrome Web Store homepage link.
- Primary `/editor/` CTA text is `Open the studio`.
- Product casing is `SnapShotPro`.

Add explicit assertions that AI, Agent, and Studio Intelligence have different titles and descriptions.

- [ ] **Step 2: Run tests and confirm remaining failures**

Run: `npm run test:marketing`

Expected: FAIL with a concrete list of metadata/copy gaps.

- [ ] **Step 3: Apply targeted copy polish route by route**

Preserve search intent and factual meaning. Reconcile `studio` versus `editor`, AI Design Agent naming, Code Snippet Studio naming, current shipped capabilities, optional hosted AI, and local-by-default language. Do not alter legal obligations.

- [ ] **Step 4: Complete metadata from route context**

Move stable per-route metadata into `site/routes.js` where useful, retain page-specific JSON-LD in source, and make canonical/social/theme metadata complete and consistent. Keep `__OG_BASE__` replacement.

- [ ] **Step 5: Run tests and build**

Run: `npm run test:marketing && npm run build`

Expected: all structural, copy, and metadata contracts pass.

- [ ] **Step 6: Commit content and metadata**

```bash
git add site/routes.js vite.config.js scripts/marketing-contract-tests.mjs index.html about alternatives ai agent app-store-screenshots changelog code-screenshots device-mockup-generator drop-shadow-generator extension faq features gallery github-readme-screenshots guide merge og-image-generator pricing privacy product-mockups roadmap social-media-mockups studio-intelligence terms tools use-cases
git commit -m "fix: normalize marketing copy and metadata"
```

### Task 16: Run final build, UX, visual, and editor-boundary verification

**Files:**
- Modify only files required to fix verified failures.
- Update: `scripts/marketing-contract-tests.mjs` only if a missing deterministic assertion is discovered.

- [ ] **Step 1: Run deterministic verification from a clean build output**

Run:

```bash
npm run test:marketing
npm run build
node scripts/regression-tests.mjs
```

Expected: all commands exit 0. The regression script prints one `ok` line per existing regression test.

- [ ] **Step 2: Start the local server with no deployment**

Run: `npm run dev -- --host 127.0.0.1 --port 5173`

Expected: local site at `http://127.0.0.1:5173/`.

- [ ] **Step 3: Run the `ui-ux-pro-max` validation searches**

Run:

```powershell
python C:\Users\14148\.codex\skills\ui-ux-pro-max\scripts\search.py "animation accessibility z-index loading responsive dark mode" --domain ux -n 20
python C:\Users\14148\.codex\skills\ui-ux-pro-max\scripts\search.py "semantic responsive navigation theme accessibility performance" --stack html-tailwind
```

Review the applicable web rules. Reject stack-specific Tailwind syntax while retaining semantic guidance.

- [ ] **Step 4: Run the `design-taste-frontend` mechanical preflight**

Check all applicable items from the skill, including one accent, theme and radius locks, no repeated layout families, eyebrow restraint, no duplicate CTA intent, real imagery, hero viewport fit, reduced motion, no forbidden decorative patterns, and no em dashes in visible copy.

- [ ] **Step 5: Run the `frontend-design` critique pass**

Confirm the site is grounded in screenshot creation, the Output Ribbon is the one memorable signature, no other element competes with it, typography and copy feel subject-specific, and at least one decorative element was removed after screenshot review.

- [ ] **Step 6: Browser-check every route**

Use the in-app browser. Capture at least one full-page screenshot in Light and Dark for every public route. For each archetype, additionally verify 1440x900, 1024x768, 390x844, 375x812, 360x740, phone landscape, 200% zoom, keyboard-only navigation, reduced motion, system appearance, touch target size, and horizontal overflow.

- [ ] **Step 7: Verify console, assets, and pixels**

Check console errors on representative routes, ensure every referenced image renders nonblank, confirm hero and Output Ribbon assets have visible non-background pixels, and confirm no image or text overlaps at any required viewport.

- [ ] **Step 8: Verify editor boundary**

Open `/editor/` from primary CTAs. Confirm the editor title, styles, theme behavior, empty state, upload flow, and export controls match the pre-redesign baseline. Confirm the marketing appearance preference does not leak into editor storage or DOM.

- [ ] **Step 9: Fix failures and rerun the complete verification set**

Repeat Steps 1 through 8 after every cross-site fix. Do not claim completion with a known failed route, contrast pair, browser state, or build command.

- [ ] **Step 10: Commit final verified fixes**

```bash
git status --short
git add -- path/to/each-verified-fix
git commit -m "fix: complete marketing redesign verification"
```

Replace `path/to/each-verified-fix` with the exact paths shown by `git status --short`; do not stage unrelated `.gitignore`, lockfile, generated output, or temporary companion changes.

Do not deploy, push, or create a pull request.

---

## Completion Criteria

- All 27 marketing routes use the shared system and build from the route manifest.
- The existing logo and cobalt remain recognizable.
- Homepage category and action are immediately understandable.
- The Output Ribbon is the only site-wide signature composition.
- All generic Picsum imagery is replaced with authentic local product proof.
- Creators and product teams receive equal recognition.
- Light, Dark, and System appearances work without flash and persist correctly.
- Desktop, tablet, mobile, landscape, keyboard, reduced-motion, and 200% zoom checks pass.
- Metadata, canonicals, social cards, sitemap, and internal links are complete.
- `/editor/` behavior and styling remain unchanged.
- The final product is available at a local URL and has not been deployed.
