# Glint rebrand design (v36 · Darkroom)

Status: design approved in brainstorming, awaiting spec review. Date: 2026-10-14.

## Context
SnapShotPro is being renamed **Glint** in its biggest launch so far. Every feature stays. Decisions made during brainstorming:
- **Name:** Glint.
- **Scope:** a full relaunch. That means a new identity, a redesigned homepage, a launch page, and a welcome-back message for returning users.
- **Look:** a warm gold-amber "light" accent and a four-point sparkle logo. The bases are neutral graphite and off-white rather than cream, per the taste-skill palette rules (see Phase 2).
- **Version:** v36.0.0 with the codename **Darkroom**. The batch-develop feature moves to v37 (Exposure).
- **Internal names:** renamed to `glint*`, with a startup migration so nobody loses saved work.
- **Domain:** set in one place. `snapshotpro.xyz` stays live until the user buys a Glint domain.

**Why we're doing this:** Glint should have **its own identity and feel like something new**, not SnapShotPro with a different name. So all identity and marketing design goes through the **taste-skill** (`.claude/skills/taste-skill/SKILL.md`, "design-taste-frontend"). Under its Redesign Protocol §11.E, "the brand itself is changing" counts as **greenfield** for visuals. Content, information architecture, URL slugs and SEO stay as they are (§11.C).

**Taste-skill design read:** *"Reading this as: launch-announcement landing for designers, indie developers and marketers who make product screenshots, with a premium-consumer 'flash of light' language, leaning toward native CSS (vanilla HTML/CSS per CLAUDE.md, not the skill's React/Tailwind defaults) + Geist + restrained scroll-reveal motion."* The dials are **DESIGN_VARIANCE 7, MOTION_INTENSITY 6, VISUAL_DENSITY 3** (the premium-consumer landing preset). The taste-skill covers the marketing pages and the identity. The editor UI is product UI, which the skill says it doesn't cover, so the editor only gets the new tokens and logo.

The brand appears in 117 files, 31 `snapshotpro_*` localStorage keys, IndexedDB db `snapshotpro`, BroadcastChannel `snapshotpro-projects`, extension postMessage types `snapshotpro-capture(-ack)`, and 3 api user-agent strings.

## Phase 0: Spec (this document)
Committed on branch `glint-rebrand`. After review, the writing-plans skill turns it into a step-by-step implementation plan.

## Phase 1: Data migration and internal renames (the riskiest part, so it goes first)
- **New `src/state/brand-migrate.js`** (`// v36`). It must be the **first import in `src/main.js`**, because ES imports run in order and some modules read localStorage when they load.
  - Export a pure `migrateLocalStorage(storage)`. For each `snapshotpro_*` key (including the `snapshotpro_agent_chat_*` prefix), copy it to `glint_*` only when the new key doesn't exist yet. Leave the old keys in place as a backup for one release, and set `glint_migrated_v1`.
  - At load, guard with `typeof window !== 'undefined'` so the Node tests can import the module.
- **`src/state/project-db.js`.** Change `DB_NAME` to `'glint'`. Inside `openDb()`, if the new `kv` store is empty, copy every record from the old `snapshotpro` db. Open the old db without a version number, and abort in `onupgradeneeded` so we never create an empty `snapshotpro` db. Leave the old db in place. If the copy fails, still resolve with the new db and log a warning, so the existing localStorage fallback in `projects.js` keeps working.
- **Rename keys in the files the map found:** agent-memory, ai-enhance, api-keys, asset-library, auth, brand-kit, campaigns, cloud-sync/templates, color-tools, command-usage, custom-font, export-presets, floating-toolbar, palettes, projects (including the BroadcastChannel, now `glint-projects`), studio-nav, mobile-studio, ui-mode, welcome, whats-new, zoom-pan and ui/theme. Also update `scripts/build-site-shots.mjs` and `scripts/build-store-shots.mjs`.
- **Extension handoff.** In `src/features/ext-receiver.js`, accept both `glint-capture` and `snapshotpro-capture`, and send back an ack of the matching type. `chrome-extension/content/bridge.js` sends `glint-capture` and accepts either ack. The origin and nonce checks stay as they are.
- **`api/_shared.js`, `api/scrape-page.js` and `api/brand-extract.js`** user agents become `Glint/36`.
- **Add a test in `scripts/regression-tests.mjs`.** Run `migrateLocalStorage` on a fake storage with old keys and check three things: the values were copied, existing `glint_*` values were not overwritten, and running it twice changes nothing.

## Phase 2: Visual identity
- **Palette.** Taste-skill §4.2 bans the default cream/beige backgrounds and brass/ochre accents (for example `#f7f5f1` and `#9c6e2a`). An amber-on-cream look would land exactly in that banned family. So the "warm light" direction becomes **"pure monochrome + one saturated pop"**: neutral graphite and off-white bases with a single amber flash. That keeps it warm without looking like a template.
- **Tokens.** In `src/styles.css`, both the dark `:root` and the `[data-theme="light"]` blocks change `--accent-primary/secondary/hover/light`. In `public/site.css`, `--accent`, `--accent-deep`, `--accent-soft` and `--bg`/`--ink` change.
  - **Dark:** neutral graphite backgrounds (about `#0d0d0f` / `#151518`, never `#000`) with the amber accent (about `#f2a93b`, saturation under 80%).
  - **Light:** neutral off-white backgrounds (about `#f4f4f3`, not cream) with ink text.
  - **One accent, used the same way everywhere** (§4.2 Color Consistency Lock). Amber is only for fills, marks and focus rings, always with off-black text on top. Links in light mode use ink text with an amber underline, never amber text, so everything passes WCAG AA without falling back on a brass color.
  - Shadows are tinted to the background, with no glows (§9.A).
  - Geist and JetBrains Mono stay. No serif (§4.1).
- **Logo.** A four-point sparkle on a rounded square with an amber-to-coral gradient. It replaces the camera in:
  - `site/partials/mark.html` (`<symbol id="mark">`, gradient id renamed to `glint-g`)
  - the inline SVG in the editor header (`editor/index.html:20-30`)
  - `public/favicon.svg` and the `public/pwa-*.svg` icons
  - the chrome-extension icons, which are regenerated from the SVG
- **OG image.** Update `scripts/build-og.mjs` (the Glint wordmark, with the domain read from the same `SITE_URL` source) and regenerate `public/og.png`. Delete the outdated `scripts/make-og.mjs` if knip confirms nothing uses it.
- **Domain.** `SITE_URL` in `vite.config.js` stays the only place the domain is set. The extension manifest and `background.js` get a comment saying to add the new domain next to `snapshotpro.xyz` once it exists.

## Phase 3: Renaming everywhere users can see it
- **Editor.**
  - `editor/index.html`: the title, the header (`Glint v36 · Darkroom`), the install tooltip and the sign-in text.
  - `src/` strings: main.js, stale-build, install-app, palette, share alt text, the `ai-agent.js` system prompt ("You are the Glint Design Agent") and the default HTML export title in `export.js:51`.
- **PWA manifest** in `vite.config.js`: `name` and `short_name` become "Glint".
- **Marketing site.** Replace the name across all 27 marketing pages plus `site/partials/nav.html` and `footer.html`.
  - In `changelog/`, the meta tags and nav change. Past entries keep their original wording, and a note at the top says "Glint was called SnapShotPro through v35".
  - Picsum seed strings don't need to change.
- **Extension.** The manifest name becomes "Glint Capture", along with the popup and editor titles and `store/listing.md`. Then regenerate the store screenshots.
- **Repo files.** `package.json` (name `glint`, then refresh the lockfile with `npm install`), README, DEPLOY, MIGRATION, and `.claude/skills/ship/SKILL.md`. CLAUDE.md is covered in its own section below.
  - Older docs under `docs/` are historical, so they stay as they are.

## Phase 4: Launch content
- **Load the `taste-skill` before writing any marketing markup.** Use it as a greenfield visual build with the content preserved.
- **Homepage redesign** (`index.html`, the partials and `public/site.css`).
  - The hero is left-aligned with the real asset on the right (§4.3 anti-center), and the headline is "SnapShotPro is now Glint". It has at most 4 text elements, fits the viewport (`min-height: 100dvh`) and has one main CTA ("Open the editor").
  - Sections use at least 4 different layout families: no three equal cards, a bento with real image cells, and no repeated zigzag.
  - The images are new real output from `npm run build:shots`, never stock photos and never div-based fake screenshots.
  - Every animation respects `prefers-reduced-motion`.
  - The nav fits on one line. Page slugs and nav labels stay the same.
- **New launch page `/glint/`** ("Meet Glint"). It's a new Vite input in `rollupOptions.input` and is linked from the homepage hero and the footer. It covers: the story behind the name and why it now has its own identity, what changed (name and look), what didn't (every feature and all your projects), and a FAQ (your data, the extension, the old domain).
  - A centered manifesto hero and the "v36" label are allowed here, because taste-skill makes an exception for launch announcements (§4.3, §9.F).
- **Copy rules for all new and changed marketing text** (taste-skill §9):
  - zero em or en dashes
  - no filler verbs (elevate, seamless, unleash, ...)
  - no scroll cues, decorative dots or section-number eyebrows
  - the middle dot used at most once per line
- **Taste-skill §14 pre-flight check** on the homepage and `/glint/` before committing.
- **Returning users.** In `whats-new.js`, set `CURRENT_VERSION='36.0'` and use the heading "✨ v36 · Darkroom: SnapShotPro is now Glint". The items cover: your projects moved automatically, the new look, and update the extension. `welcome.js` copy says Glint.
- **Release.** Bump `package.json` to 36.0.0 and add a changelog v36 entry with an `<h2>` for the "Darkroom" codename. Use the `ship` skill steps, but push to the session branch. Merging or opening a PR happens only when the user asks.

## CLAUDE.md updates (in the same commit as each phase, not saved up for the end)
- **Phase 1:**
  - Add a "Brand & identifiers" note: storage keys are `glint_*`, the IndexedDB db is `glint`, the BroadcastChannel is `glint-projects`, and the extension message types are `glint-capture(-ack)`, with the old `snapshotpro-*` types still accepted.
  - Document `brand-migrate.js`: it must be the first import, it copies without overwriting, and the old keys and db are kept until v37 cleans them up.
  - Update the Persistence section's key and db names, add a `brand-migrate` row (or a note) to the State registry, and replace every `snapshotpro_` example in the file (section-collapsed, ui-mode, float-toolbar, cmd-usage, campaigns, projects, recent-colors, last-export-preset).
  - Add a new rule: **"New storage keys use the `glint_` prefix."**
- **Phase 2:**
  - Add a "Brand identity" section: the palette tokens and where they live (`src/styles.css`, `public/site.css`), the one-accent rule, the amber-only-on-fills rule, and where the logo lives (`site/partials/mark.html`, the editor header SVG, `public/*.svg`, the extension icons).
  - Note that `SITE_URL` in `vite.config.js` is the one place the domain is set, plus the steps for adding a new domain to the extension manifest.
  - Note that `scripts/build-og.mjs` generates `og.png`.
- **Phase 3:**
  - Replace SnapShotPro with Glint throughout the file, including the title line and the header example `v36 · Darkroom`.
  - Add a note that the name was SnapShotPro through v35, past changelog entries keep that name, and `SnapShot-Pro-main/` keeps its legacy name.
  - Change the "Things that look like project rules" entry so it says the **taste-skill is the required design skill** for marketing pages and identity work, and redesign-skill is only for small polish.
- **Phase 4:**
  - Add a **v36 Darkroom (Glint relaunch)** row to Shipped features: the rename, the migration, the identity, the `/glint/` page and the redesigned homepage.
  - Add the `/glint/` page to the marketing-pages list in the Commands section.
  - Codename list: v36 Darkroom = Glint relaunch. Move the "Planned: v36 Darkroom (batch develop)" backlog entry to **"Planned: v37 Exposure (batch develop)"** with its content kept.
  - Update the version and codename example in Build details.

## Things the user does by hand (not in code)
Renaming the GitHub repo, the Vercel project, the Chrome Web Store listing and the extension upload, and buying a domain if they want one.

## Verification
1. `npm run check` (lint, knip, tests including the new migration test, build) is green.
2. CLAUDE.md check: `grep -n "snapshotpro_\|SnapShotPro" CLAUDE.md` should only find the intentional history and legacy-folder notes.
3. A leftover-name check: `grep -rIi "snapshot ?pro" --exclude-dir={node_modules,dist,SnapShot-Pro-main,docs}` returns only the allowed places: the migration module, the past changelog entries, the extension's old-message handling and the domain.
4. Browser check (`npm run dev` + Playwright, Chromium at `/opt/pw-browsers`):
   - Seed old `snapshotpro_*` keys plus an IndexedDB `snapshotpro` project in a fresh profile, then load `/editor/`. The project, theme and UI mode should all come back, and `glint_*` keys and the `glint` db should exist.
   - Reload once more and confirm nothing gets copied twice.
   - Post a `snapshotpro-capture` message and confirm the image loads, which proves old extension builds still work.
5. Screenshots of the homepage, `/glint/` and the editor in light and dark at phone width and desktop width. Run an axe check for contrast on the amber accent. Then go through the taste-skill §14 checklist item by item, including a `grep -n "[—–]"` over the changed marketing HTML, which should find nothing.
6. `npm run build:shots` and `node scripts/build-og.mjs` run without errors, and the outputs show the new look.
