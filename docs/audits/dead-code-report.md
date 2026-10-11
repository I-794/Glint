# Dead Code Report

*Generated: 2026-10-02 · branch `claude/stoic-volta-7k3l3c` · read-only audit (no code was changed)*

Scope: `src/`, `api/`, `scripts/`, `public/` (JavaScript, ES modules). Excluded: `SnapShot-Pro-main/` (legacy copy), `chrome-extension/` (separate MV3 bundle), `dist/`, `node_modules/`.

Tools used:
- **knip 5**: unused files, exports, and dependencies. Entry points: `src/main.js`, every Vite HTML input, `api/*.js`, `scripts/*`, `public/*.js`, `vite.config.js`.
- **ESLint 10** `no-unused-vars` + `no-unreachable`: unused imports, locals, and private functions.
- **ripgrep**: cross-checked every candidate against `src/`, `api/`, `editor/`, `scripts/`, `public/`, `chrome-extension/`, and HTML. Comment-only mentions don't count as uses.

### Summary
- High confidence:   21 findings (1 unused file, 18 unused imports, 1 dead private function, 1 unused local)
- Medium confidence:  8 findings (exported functions with zero callers anywhere)
- Low confidence:     3 findings (unused, but documented as parked or shared APIs)
- DI-excluded:        0 (vanilla JS, no DI framework)
- Not dead (info):  119 exports only used inside their own file, so the `export` keyword could be dropped

> ⚠ **Dynamic dispatch exists in this project:** 76 dynamic `import()` calls, 56 `window.__*` cross-module globals, and `RECIPES[name]()` in `src/features/compose.js`. Every candidate below was searched for by name across the whole repo, so a dynamic access that spells out the name (e.g. `(await import('./x.js')).fn`) would have shown up. None did. A name built from a string at runtime would still be missed.

---

### High Confidence

**src/ui/mobile-nav.js:1**
  [unused file] whole module (`bindMobileNav`, 35 lines): never imported by anything.
  It was replaced by `src/ui/mobile-studio.js` (v23 phone dock). Its button is dead too: `editor/index.html:35` `#sidebar-toggle-btn` (☰) has no click handler, and `src/styles.css:1512` hides it on phones with the comment "Superseded affordances". Safe cleanup: delete the file, the ☰ button markup, and the `#sidebar-toggle-btn` / `.sidebar-backdrop` CSS rules (`src/styles.css:1384, 1415, 1512-1513`).

**src/features/share.js:21**
  [private function] `expiryToSeconds`: never called. There's no link-expiry option in the UI, so this is leftover code, not a missing feature.

**src/features/api-keys.js:40**
  [local variable] `tone`: computed inside `renderApiKeyStatus` but never used in the HTML it builds.

**Unused imports** (names imported but never used in that file; remove just the name):

| File:line | Unused name(s) |
|---|---|
| scripts/build-og.mjs:4 | `readFileSync` |
| src/features/agent-tools.js:6 | `render` |
| src/features/ai-agent.js:8 | `showNotification` |
| src/features/ai-cloud.js:2 | `el` |
| src/features/ai-cloud.js:3 | `saveStateToHistory` |
| src/features/ai-cloud.js:4 | `render` |
| src/features/ai-image-edit.js:13 | `dataUrlToBase64` |
| src/features/ai-screenshot-editor.js:14 | `saveStateToHistory` |
| src/features/ai-screenshot-editor.js:15 | `render` |
| src/features/animation.js:2 | `el` |
| src/features/asset-library.js:12 | `showNotification` |
| src/features/motion-studio.js:17 | `render` |
| src/features/pages.js:13 | `render` |
| src/features/set-ui.js:10 | `el` |
| src/features/share.js:4 | `isConfigured` |
| src/render/frames.js:3 | `roundRectPath` |
| src/state/spec.js:21 | `gradientPresets`, `meshPresets` |

---

### Medium Confidence

Exported functions with **zero callers anywhere in the repo** (not even in their own file). This isn't a library, so nothing outside the repo can call them. They may have been kept as hooks for future work, so check before deleting.

**src/features/agent-memory.js:26**
  [exported function] `clearChat`: no call sites.

**src/features/asset-library.js:34**
  [exported function] `listAssets`: no call sites (the module reads its store through the private `read()` instead).

**src/features/layers.js:291**
  [exported function] `altSelectAt`: no call sites; Alt-click select-through isn't wired to any pointer handler.
  ⚠ Possibly an unfinished feature, not leftover code. Decide whether to wire it up or remove it.

**src/features/snapping.js:20**
  [exported function] `getGuides`: no call sites.

**src/render/color-grade.js:197**
  [exported function] `resetGradeCache`: no call sites. The cache key (`cache.sig`) already invalidates itself.

**src/render/tour-overlay.js:23**
  [exported function] `isTourOverlayActive`: no call sites.

**src/render/tour-overlay.js:24**
  [exported function] `getSelectedHotspotId`: no call sites.

**src/ui/haptics.js:11**
  [exported const] `tap`: no call sites (`mobile-studio.js` imports only `snap` and `tab`).

---

### Low Confidence

⚠ These have no callers today, but deleting them is risky: project docs treat them as intentionally parked features or shared helpers.

**src/features/campaigns.js:121** and **:168**
  [exported functions] `publishCampaign`, `pullCampaigns`: no call sites.
  ⚠ CLAUDE.md says the "optional Supabase mirror ships but is unwired", and lists the wiring under the Backlog. This is deliberately parked code. Keep it unless that backlog item is dropped.

**src/features/ai-cloud.js:307**
  [exported function] `runVisionJson`: no call sites (only mentioned in comments in `api/brand-extract.js:4` and `src/features/ai-screenshot-editor.js:3`); live code uses `runVisionJsonOnDataUrl`.
  ⚠ CLAUDE.md names `runVisionJson` as a shared AI primitive "to reuse rather than reinvent". Either keep it or update CLAUDE.md in the same change.

---

### Not dead, informational

- **119 exports used only inside their own file** (e.g. `serialize.js` `SCHEMA_VERSION`, `board.js` `commitBoard`, `utils/color.js` `hexToRgb`). knip flags these as "unused exports", but the functions are used (often through `window.__*` globals set in the same module). Dropping the `export` keyword is optional tidying, not dead-code removal. Every one was rechecked with comment lines stripped.
- **Unlisted dependency:** `scripts/build-store-shots.mjs` imports `playwright`, which isn't in `package.json` devDependencies. It works only because Playwright happens to be installed globally. Add it to devDependencies, or note the requirement in the script header.
- **Dependencies:** knip found no unused npm dependencies.

---

### DI / framework notes

No dependency-injection framework (vanilla JS + Vite). The project's own conventions were treated as entry points: each `bind*()` is imported and called from `src/main.js`, `api/*.js` are Vercel serverless entry points (default exports), and every Vite HTML input listed in `vite.config.js` counts as an entry.

### Recommended next steps

- **Act on High confidence now.** These are safe, mechanical deletions. Run `npm run build` and spot-check the editor in `npm run dev` afterwards (there's no test suite).
- **Review Medium and Low by hand.** Some are unfinished features (`altSelectAt`) or parked work (`publishCampaign`/`pullCampaigns`), not leftovers.
- **Make it repeatable:** the repo has no linter. Adding a minimal `eslint.config.js` with `no-unused-vars` plus `npx knip` as a CI step (or an npm script) would catch new dead code as it appears. This report is a snapshot; new code can leave dead code behind.
