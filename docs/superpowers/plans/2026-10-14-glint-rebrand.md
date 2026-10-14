# Glint Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename SnapShotPro to Glint and ship it as v36 "Darkroom" with a new identity, a redesigned homepage and a launch page. Every feature stays, and no user loses saved data.

**Architecture:**
- A side-effect module (`src/state/brand-migrate.js`) is the first import of the editor. It copies `snapshotpro_*` localStorage keys to `glint_*` once.
- `project-db.js` copies the old `snapshotpro` IndexedDB store into the new `glint` db the first time it opens.
- After that, the change is a mechanical rename of identifiers and copy, a token and logo swap, and new marketing markup built under the taste-skill rules.

**Tech Stack:** Vanilla JS + Vite, plain CSS custom properties, Node regression tests (`scripts/regression-tests.mjs`), Playwright (Chromium at `/opt/pw-browsers/chromium`) for browser checks and PNG rendering.

## Global Constraints

- **Name:** "Glint". The extension is "Glint Capture". The editor header is `Glint v36 · Darkroom`. `package.json` name is `glint` and version is `36.0.0`.
- **Storage:** keys use the `glint_` prefix. The IndexedDB db is `glint`. The BroadcastChannel is `glint-projects`. The extension message types are `glint-capture` / `glint-capture-ack`, and `snapshotpro-capture` is still accepted.
- **Old data is never deleted in v36.** The `snapshotpro_*` keys and the `snapshotpro` db stay as a backup until v37.
- **Domain:** `SITE_URL` in `vite.config.js` is the only place it's set (it stays `https://snapshotpro.xyz`).
- **Palette** (neutral bases + one amber pop, never cream or brass):
  - Dark: bg `#0d0d0f`, `#151518`, `#1c1c20`, elevated `#24242a`. Accent `#f2a93b`, hover `#f6bb5e`, secondary `#e8913a`.
  - Light: bg `#f4f4f3`, `#fafaf9`, `#ebebea`, elevated `#ffffff`. Accent `#f2a93b` (fills only), deep `#c47a14` (for marks and borders, never body text).
  - Text on amber is always `#141416`. Links in light mode use ink text with an amber underline.
- **Logo:** a four-point sparkle on a rounded square with an amber `#f6bb5e` to coral `#e8613a` gradient. The gradient id is `glint-g` (editor: `glint-hg`).
- **Marketing copy** (taste-skill §9):
  - zero `—` and zero `–`
  - no filler verbs (elevate, seamless, unleash, revolutionize, next-gen)
  - no scroll cues, decorative dots or section-number eyebrows
  - at most one `·` per line
- **Marketing pages are built with the taste-skill** (design read and dials from the spec: VARIANCE 7, MOTION 6, DENSITY 3), expressed as vanilla HTML/CSS.
- **CLAUDE.md** is updated in the same commit as each phase.
- **Commits** use a single `-m` subject plus `-m` trailers (no heredoc), and end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01LBEPQY1iasU5EERt8oj9dC`.
- **Branch:** `glint-rebrand`. Push with `git push -u origin glint-rebrand`. No PR and no merge to main unless the user asks.

---

## Phase 1: Data migration and internal renames

### Task 1: localStorage migration module

**Files:**
- Create: `src/state/brand-migrate.js`
- Modify: `src/main.js:1-4` (first import)
- Test: `scripts/regression-tests.mjs`

**Interfaces:**
- Produces: `migrateLocalStorage(storage) -> number` (count copied), plus the constants `OLD_PREFIX='snapshotpro_'`, `NEW_PREFIX='glint_'` and `MIGRATED_FLAG='glint_migrated_v1'`.

- [ ] **Step 1: Write the failing test.** Add to `scripts/regression-tests.mjs` (import at the top, and add the function to `tests`):

```js
import { migrateLocalStorage, MIGRATED_FLAG } from '../src/state/brand-migrate.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    _map: m
  };
}

function testBrandMigrateCopiesOnce() {
  const s = fakeStorage({
    snapshotpro_theme: 'light',
    snapshotpro_agent_chat_abc: '[1]',
    snapshotpro_ui_mode: 'pro',
    glint_ui_mode: 'simple',
    unrelated: 'x'
  });
  const copied = migrateLocalStorage(s);
  assert.equal(copied, 2);
  assert.equal(s.getItem('glint_theme'), 'light');
  assert.equal(s.getItem('glint_agent_chat_abc'), '[1]');
  assert.equal(s.getItem('glint_ui_mode'), 'simple', 'never overwrite an existing glint_ key');
  assert.equal(s.getItem('snapshotpro_theme'), 'light', 'old keys stay as a backup');
  assert.equal(s.getItem(MIGRATED_FLAG), '1');
  // A key the user deletes after migrating must not come back from the backup.
  s.removeItem('glint_theme');
  assert.equal(migrateLocalStorage(s), 0);
  assert.equal(s.getItem('glint_theme'), null);
}

function testBrandMigrateMovesWhenQuotaIsFull() {
  const s = fakeStorage({ snapshotpro_projects_v12: 'BIG' });
  const realSet = s.setItem.bind(s);
  // Simulate a full quota: writing a new key fails while the old copy exists.
  s.setItem = (k, v) => {
    if (k === 'glint_projects_v12' && s._map.has('snapshotpro_projects_v12')) {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    }
    realSet(k, v);
  };
  migrateLocalStorage(s);
  assert.equal(s.getItem('glint_projects_v12'), 'BIG', 'falls back to a move when a copy does not fit');
}
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npm test`. Expected: `ERR_MODULE_NOT_FOUND ... brand-migrate.js`.

- [ ] **Step 3: Implement `src/state/brand-migrate.js`.**

```js
// v36 — Glint rebrand: carry SnapShotPro-era browser data over to the new names.
//
// Must stay the FIRST import in src/main.js: ES modules evaluate in import
// order and several feature modules read localStorage while loading.
// Runs once (MIGRATED_FLAG). Never overwrites a glint_ key, and leaves the
// snapshotpro_ keys in place as a backup until v37 removes them. If a copy
// does not fit in the quota, the value is moved instead (old key removed
// first, restored if the write still fails).

export const OLD_PREFIX = 'snapshotpro_';
export const NEW_PREFIX = 'glint_';
export const MIGRATED_FLAG = 'glint_migrated_v1';

export function migrateLocalStorage(storage) {
  if (!storage || storage.getItem(MIGRATED_FLAG) !== null) return 0;
  const oldKeys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(OLD_PREFIX)) oldKeys.push(k);
  }
  let copied = 0;
  for (const oldKey of oldKeys) {
    const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
    if (storage.getItem(newKey) !== null) continue;
    const value = storage.getItem(oldKey);
    if (value === null) continue;
    try {
      storage.setItem(newKey, value);
      copied++;
    } catch (e) {
      try {
        storage.removeItem(oldKey);
        storage.setItem(newKey, value);
        copied++;
      } catch (e2) {
        try { storage.setItem(oldKey, value); } catch (e3) { /* nothing more to do */ }
      }
    }
  }
  try { storage.setItem(MIGRATED_FLAG, '1'); } catch (e) { /* retried next load */ }
  return copied;
}

if (typeof window !== 'undefined') {
  try { migrateLocalStorage(window.localStorage); } catch (e) { /* storage blocked */ }
}
```

- [ ] **Step 4: Make it the first import** in `src/main.js`. Line 1 becomes the header comment, and the first import line is `import './state/brand-migrate.js';`, placed above `import { inject } from '@vercel/analytics';`. Update the header comment to `// Glint (formerly SnapShotPro) v7+ — app entry.`
- [ ] **Step 5: Run the tests.** Run `npm test`. Expected: all `ok`, including `testBrandMigrateCopiesOnce` and `testBrandMigrateMovesWhenQuotaIsFull`.

### Task 2: IndexedDB migration

**Files:**
- Modify: `src/state/project-db.js` (DB_NAME, `openDb()` success path, header comment)

**Interfaces:**
- Consumes: nothing new.
- Produces: the same exports (`idbGet/idbSet/idbDel/idbUpdate/idbAvailable/idbReset`). The `glint` db holds the copied `kv` records plus the marker key `'__glint_migrated_from_snapshotpro'`.

- [ ] **Step 1: Set `DB_NAME = 'glint'`** and add `const LEGACY_DB = 'snapshotpro';` and `const MARKER = '__glint_migrated_from_snapshotpro';`.
- [ ] **Step 2: Add the legacy copy helpers** above `openDb()`:

```js
// v36: open the SnapShotPro-era db only if it already exists. Opening without a
// version creates an empty db when none exists, so abort that upgrade (which
// discards the new db) and report null.
function openLegacy() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(LEGACY_DB); } catch (e) { resolve(null); return; }
    let fresh = false;
    req.onupgradeneeded = () => { fresh = true; try { req.transaction.abort(); } catch (e) { /* already done */ } };
    req.onsuccess = () => {
      const db = req.result;
      if (fresh || !db.objectStoreNames.contains(STORE)) { db.close(); resolve(null); return; }
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => {};
  });
}

// Copy every kv record from the legacy db into `db` (skipping keys that already
// exist), then write MARKER so it runs once. Leaves the legacy db untouched.
function migrateLegacy(db) {
  return new Promise((resolve) => {
    let check;
    try { check = db.transaction(STORE, 'readonly').objectStore(STORE).get(MARKER); }
    catch (e) { resolve(); return; }
    check.onerror = () => resolve();
    check.onsuccess = async () => {
      if (check.result) { resolve(); return; }
      const legacy = await openLegacy();
      const finish = (records) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const s = tx.objectStore(STORE);
          for (const [k, v] of records) {
            const g = s.get(k);
            g.onsuccess = () => { if (g.result === undefined) s.put(v, k); };
          }
          s.put(Date.now(), MARKER);
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => { console.warn('[glint] project db migration failed', tx.error); resolve(); };
        } catch (e) { console.warn('[glint] project db migration failed', e); resolve(); }
      };
      if (!legacy) { finish([]); return; }
      try {
        const s = legacy.transaction(STORE, 'readonly').objectStore(STORE);
        const keysReq = s.getAllKeys();
        const valsReq = s.getAll();
        valsReq.onsuccess = () => {
          const keys = keysReq.result || [];
          const vals = valsReq.result || [];
          legacy.close();
          finish(keys.map((k, i) => [k, vals[i]]));
        };
        valsReq.onerror = () => { legacy.close(); console.warn('[glint] could not read legacy db'); resolve(); };
      } catch (e) { legacy.close(); console.warn('[glint] could not read legacy db', e); resolve(); }
    };
  });
}
```

When the read fails, the marker isn't written, so the copy is tried again on the next load.

- [ ] **Step 2b (found during execution):** keys inside the old store are renamed during the copy (`snapshotpro_projects_v12` becomes `glint_projects_v12`), because Task 3 renames `STORE_KEY` in projects.js.
- [ ] **Step 3: Wire it in.** In `openDb()`'s `req.onsuccess`, replace `resolve(db);` with `migrateLegacy(db).then(() => resolve(db));`.
- [ ] **Step 4: Update the header comment.** Change "DB `snapshotpro` v1" to "DB `glint` v1 (v36: copied once from the SnapShotPro-era `snapshotpro` db, which is left as a backup)".
- [ ] **Step 5: Run `npm run lint` and `npm test`.** Expected: green. The browser check happens in Task 5.

### Task 3: Rename the internal identifiers

**Files (modify):** every `src/**/*.js` holding a `snapshotpro_` key or the `snapshotpro-projects` channel, plus `scripts/build-site-shots.mjs`, `scripts/build-store-shots.mjs`, `api/_shared.js`, `api/scrape-page.js` and `api/brand-extract.js`.

- [ ] **Step 1: Rename the keys and channel.** This skips brand-migrate.js:

```bash
grep -rlE "snapshotpro_|snapshotpro-projects" src scripts | grep -v brand-migrate.js | xargs sed -i -e 's/snapshotpro_/glint_/g' -e 's/snapshotpro-projects/glint-projects/g'
```

- [ ] **Step 2: Update the user agents.**
  - `api/_shared.js:152` becomes `'Mozilla/5.0 Glint/36'`.
  - `api/scrape-page.js:37` becomes `'Mozilla/5.0 Glint/36 scraper'`.
  - `api/brand-extract.js:111` becomes `'Glint-BrandBrain/1.0'`.
- [ ] **Step 3: Check that nothing was missed.** Run `grep -rn "snapshotpro_\|snapshotpro-projects" src scripts api | grep -v brand-migrate.js`. Expected: no output.
- [ ] **Step 4: Run `npm run check`.** Expected: green.

### Task 4: Extension handoff with both message types

**Files:** `src/features/ext-receiver.js`, `chrome-extension/content/bridge.js`

- [ ] **Step 1: Update the receiver.** Replace the constants and the source check in `ext-receiver.js`:

```js
// v36: Glint Capture sends 'glint-capture'; SnapShotPro Capture builds still in
// users' browsers send 'snapshotpro-capture'. Ack with the matching type so the
// sender stops retrying.
const SOURCES = { 'glint-capture': 'glint-capture-ack', 'snapshotpro-capture': 'snapshotpro-capture-ack' };
```

  - The check becomes `if (!d || !Object.prototype.hasOwnProperty.call(SOURCES, d.source) || d.nonce !== nonce || typeof d.dataUrl !== 'string') return;`
  - The ack becomes `postMessage({ source: SOURCES[d.source], nonce }, e.origin)`.
  - In the header comment, "SnapShotPro Capture" becomes "Glint Capture".
- [ ] **Step 2: Update the bridge.** In `bridge.js`, send `source: 'glint-capture'`, and accept `d.source === 'glint-capture-ack'`. The header comment becomes `// Glint Capture — studio bridge content script.`

### Task 5: Browser-check Phase 1, update CLAUDE.md, commit

- [ ] **Step 1: Write the check script** `$SCRATCH/phase1-check.mjs`, where `$SCRATCH` is the session scratchpad. It needs `npm run dev -- --port 5173 --strictPort` running. With Playwright `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`, it:
  1. Goes to `http://localhost:5173/editor/` once to get the origin.
  2. In `page.evaluate`: clears localStorage, deletes the `glint` db, sets `snapshotpro_theme='light'` and `snapshotpro_ui_mode='pro'`, and creates the `snapshotpro` db v1 with store `kv` holding key `snapshotpro_projects_v12` = `{ projects: [{ id: 'p1', name: 'Legacy roll', updatedAt: 1 }] }`. Before this, read the real shape in `src/features/projects.js` (STORE_KEY and the value shape) and use it.
  3. Reloads the page and asserts:
     - `document.documentElement.dataset.theme === 'light'`
     - `localStorage.glint_ui_mode === 'pro'`
     - the `glint` db contains the projects key and the marker
     - the projects list UI shows "Legacy roll"
  4. Reloads again and asserts that nothing is duplicated and there are no console errors.
  5. Runs `page.goto('/editor/?ext=n1')` and then posts `{source:'snapshotpro-capture', nonce:'n1', dataUrl:<1x1 png>}`. It asserts that an ack `snapshotpro-capture-ack` arrives and the canvas gets the image (`#upload-zone` hidden or the canvas is visible).
- [ ] **Step 2: Run it.** Expected: all assertions pass. If a project-shape detail differs, fix the script, not the app.
- [ ] **Step 3: Update CLAUDE.md for Phase 1.**
  - Add a "Brand & identifiers (v36)" subsection under Persistence covering the key prefix, db, channel, message types, `brand-migrate.js` (first import, copy-once, never overwrites, old data kept until v37) and the IDB marker.
  - In the Persistence and Architecture prose, replace `snapshotpro_` with `glint_`, `db snapshotpro` with `db glint`, and `snapshotpro_projects_idb` with `glint_projects_idb`.
  - Add a checklist line: "New storage keys use the `glint_` prefix."
- [ ] **Step 4: Run `npm run check`, then commit and push.** Commit message: `feat(v36): Glint data migration and internal renames`.

## Phase 2: Visual identity

### Task 6: Design tokens

**Files:** `src/styles.css` (`:root` around :3-37 and `[data-theme="light"]` around :39-60), `public/site.css` `:root` (:9-45), and the hardcoded blue values in both files and in `editor/index.html` inline styles.

- [ ] **Step 1: Set the editor tokens.** In both blocks of `src/styles.css`, set `--bg-primary/secondary/tertiary/elevated`, `--accent-primary`, `--accent-secondary`, `--accent-hover` and `--accent-light` to the Global Constraints palette. `--accent-light` is `rgba(242,169,59,0.12)` in dark mode and `rgba(196,122,20,0.10)` in light mode.
  - Any button that uses the accent as a background must get `color: #141416`. Find them with `grep -n "background: var(--accent-primary)\|background:var(--accent-primary)" src/styles.css` and fix each rule's `color`.
- [ ] **Step 2: Set the site tokens.** In `public/site.css`, set `--bg` and `--ink` to the palette (light bg `#f4f4f3`, ink `#141416`; dark bg `#0d0d0f`, ink `#f2f2f0`). Set `--accent: #f2a93b`, `--accent-deep: #c47a14` and `--accent-soft: rgba(242,169,59,.14)`.
  - Links get `color: var(--ink); text-decoration-color: var(--accent);`.
  - Primary buttons get `background: var(--accent); color: #141416`.
- [ ] **Step 3: Remove the leftover blues.** Run `grep -rnE "#(2348ff|4f7cff|5470ff|6d86ff|7d92ff|667eea|764ba2)" src/styles.css public/site.css editor/index.html index.html */index.html site/partials`. Replace each hit with the matching token (`var(--accent)` / `var(--accent-primary)`), and remove any purple gradients. Expected after: no output.
- [ ] **Step 4: Check contrast** with `npx --yes @axe-core/cli http://localhost:5173/ http://localhost:5173/editor/ --tags wcag2aa --chromedriver-path ...`. If that's unavailable, use a Playwright script that injects `axe.min.js` from `node_modules` or the cdnjs `axe-core@4.10.2` and run `axe.run({runOnly:['color-contrast']})` on both pages in both themes. Expected: 0 violations caused by the new tokens.

### Task 7: Logo mark everywhere

**Files:** `site/partials/mark.html`, `editor/index.html:20-30`, `public/favicon.svg`, `public/pwa-192.svg`, `public/pwa-512.svg`, `public/pwa-512-maskable.svg`, `chrome-extension/icons/{16,32,48,128}.png`

- [ ] **Step 1: Write the mark** (64×64 viewBox). Use it for the symbol, the editor header (gradient id `glint-hg`) and favicon.svg:

```svg
<defs><linearGradient id="glint-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f6bb5e"/><stop offset="100%" stop-color="#e8613a"/></linearGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#glint-g)"/>
<path d="M32 11 C34 25 39 30 53 32 C39 34 34 39 32 53 C30 39 25 34 11 32 C25 30 30 25 32 11 Z" fill="#141416"/>
<circle cx="46.5" cy="17.5" r="3" fill="#141416"/>
```

  - Replace the camera `<symbol id="mark">` content in `mark.html` (update its comment to "Glint brand mark").
  - Replace the camera SVG in `editor/index.html`.
  - Write `favicon.svg` and `pwa-192.svg` / `pwa-512.svg` with the same artwork. Keep each file's existing width/height attributes.
  - For `pwa-512-maskable.svg`, use a full-bleed square (`rx="0"`) and scale the sparkle to fit the 80% safe zone with `transform="translate(32 32) scale(.8) translate(-32 -32)"` on the path and circle.
- [ ] **Step 2: Render the extension icons** with a Playwright script in `$SCRATCH/icons.mjs`. Set the viewport to N×N, call `page.setContent('<body style="margin:0">' + svg + '</body>')` with the svg sized N×N, then `page.screenshot({ path: 'chrome-extension/icons/N.png', omitBackground: true })` for N in 16, 32, 48, 128.
- [ ] **Step 3: Check it visually.** Screenshot `http://localhost:5173/` (nav), `/editor/` (header) and `/favicon.svg`. Read the PNGs and confirm the sparkle shows up and nothing is broken.

### Task 8: OG image, domain notes, CLAUDE.md, commit

**Files:** `scripts/build-og.mjs`, `public/og.png`, `scripts/make-og.mjs` (delete if unused), `chrome-extension/manifest.json`, `chrome-extension/background.js`, `CLAUDE.md`

- [ ] **Step 1: Update `build-og.mjs`.** Change the colors to the palette, the wordmark to "Glint", and the logo to the new mark. Read the domain text from `process.env.OG_BASE_URL || 'https://snapshotpro.xyz'` with the protocol stripped, so it matches `vite.config.js`. Then run `node scripts/build-og.mjs` and look at `public/og.png`.
- [ ] **Step 2: Remove `make-og.mjs` if nothing uses it.** Run `grep -rn "make-og" --exclude-dir=node_modules .`. If only the file itself matches, `git rm scripts/make-og.mjs`.
- [ ] **Step 3: Add the domain notes.**
  - `background.js`: add the comment `// Domain: when Glint moves to its own domain, update DEFAULT_EDITOR and add the new origin to manifest.json host_permissions + content_scripts.matches (keep snapshotpro.xyz while it still serves).`
  - `manifest.json` can't hold comments, so the note lives in `background.js` and CLAUDE.md.
- [ ] **Step 4: Update CLAUDE.md for Phase 2.** Add a "Brand identity (v36 Glint)" section covering the palette tokens and their files, the one-accent rule, the amber-on-fills rule (ink text on amber), where the logo lives, `SITE_URL` as the single domain source plus the extension steps, and that `build-og.mjs` generates `og.png`.
- [ ] **Step 5: Run `npm run check`, then commit and push.** Commit message: `feat(v36): Glint identity (tokens, sparkle mark, OG image)`.

## Phase 3: User-visible rename

### Task 9: Editor, PWA and src strings

- [ ] **Step 1: Update `editor/index.html`.**
  - title: `Glint v36 · Darkroom`
  - header span: `Glint <span ...>v36 · Darkroom</span>`
  - `title="Install Glint as an app"`
  - "Sign in to Glint"
- [ ] **Step 2: Rename the strings in `src`.** Run `grep -rln "SnapShotPro" src | xargs sed -i 's/SnapShotPro/Glint/g'`. Then review `git diff src` and keep `brand-migrate.js` comments meaningful (they say SnapShotPro-era on purpose). Restore any comment that should read "formerly SnapShotPro".
- [ ] **Step 3: Update `vite.config.js`.** Set the manifest `name: 'Glint'` and `short_name: 'Glint'`, and rename any other "SnapShotPro" there except the domain.

### Task 10: Marketing pages, partials and changelog

- [ ] **Step 1: Rename in the pages and partials.** This covers everything except the changelog:

```bash
for f in $(grep -rlI "SnapShotPro" --include=index.html . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=SnapShot-Pro-main --exclude-dir=editor | grep -v "^./changelog/"); do sed -i 's/SnapShotPro/Glint/g' "$f"; done
sed -i 's/SnapShotPro/Glint/g' site/partials/nav.html site/partials/footer.html site/partials/mark.html public/site.css public/site.js
```

  Keep the GitHub URL path (`I-794/SnapShotPro`) until the repo is renamed. If the sed changed it, restore `github.com/I-794/SnapShotPro`.
- [ ] **Step 2: Update the changelog.** In `changelog/index.html`, replace the brand only in `<head>` (title, meta, og) and add a note under the page intro: `<p class="note">Glint was called SnapShotPro through v35. Older entries keep the name they shipped with.</p>`. The body of older entries stays as it is.
- [ ] **Step 3: Check for dashes.** Run `git diff -U0 -- '*.html' | grep "^+" | grep -n "[—–]"`. Expected: no new dashes introduced by this task.

### Task 11: Extension, repo files, ship skill, CLAUDE.md, commit

- [ ] **Step 1: Rename in the extension.** Run `grep -rlI "SnapShotPro" chrome-extension | xargs sed -i 's/SnapShotPro/Glint/g'` (this covers the manifest name "Glint Capture", popup, editor, comments and `store/listing.md`). Keep the `snapshotpro.xyz` URLs. Bump `manifest.json` `version` by a minor step. Rebuild the store screenshots with `node scripts/build-store-shots.mjs` if it runs headless without a dev server. Otherwise start the dev server first, as its header says.
- [ ] **Step 2: Update the repo files.**
  - `package.json`: `"name": "glint"`, and `description` if it names the brand. Keep the homepage and repo URLs. Then run `npm install --package-lock-only`.
  - README.md, DEPLOY.md and MIGRATION.md: replace SnapShotPro with Glint and add one line saying "Glint was called SnapShotPro through v35".
  - `.claude/skills/ship/SKILL.md`: set its description to "shipping a new Glint version" and fix the outdated line "There is no test runner and no linter" so it says `npm run check` is the gate.
- [ ] **Step 3: Update CLAUDE.md for Phase 3.**
  - Replace SnapShotPro with Glint throughout, but keep the `SnapShot-Pro-main/` legacy note and add "(Glint was called SnapShotPro through v35)".
  - The header example becomes `v36 · Darkroom`.
  - The "Things that look like project rules" entry becomes: "the taste-skill is the required design skill for marketing pages and identity work (expressed as vanilla HTML/CSS); redesign-skill is only for small polish passes".
- [ ] **Step 4: Run the leftover check:** `grep -rIn "SnapShotPro\|snapshotpro" --exclude-dir={node_modules,dist,SnapShot-Pro-main,docs,.git} . | grep -v "snapshotpro.xyz\|I-794/SnapShotPro\|brand-migrate\|ext-receiver\|changelog/\|picsum.photos/seed/snapshotpro\|project-db.js\|regression-tests"`. Expected: only intentional history notes ("called SnapShotPro through v35").
- [ ] **Step 5: Run `npm run check`, then commit and push.** Commit message: `feat(v36): rename SnapShotPro to Glint everywhere users see it`.

## Phase 4: Launch content (load `taste-skill` first)

### Task 12: Homepage redesign

**Files:** `index.html`, `public/site.css`, `site/partials/nav.html`, `site/partials/footer.html`

- [ ] **Step 1: Audit.** Read the current `index.html` in full and list its sections, anchor IDs, CTAs and image sources. Keep every slug and nav label the same.
- [ ] **Step 2: Rebuild the hero.** It's a left-aligned headline with a real shot from `public/shots/` on the right, stacking to one column under 768px.
  - Eyebrow: `New name. Same studio.`
  - H1: `SnapShotPro is now Glint.`
  - Sub (20 words or fewer): `Turn raw screenshots into finished, on-brand images. Every tool you used is still here, with a new look.`
  - CTA: `Open the editor` (to `/editor/`), plus a secondary text link `Meet Glint` (to `/glint/`).
  - Use `min-height: 100dvh` capped by content and top padding of 96px at most.
- [ ] **Step 3: Recompose the remaining sections** using at least 4 different layout families. Keep the existing content blocks and their copy where it still holds:
  - a bento with at least 2 image cells
  - a 2-column feature split
  - a horizontal-scroll gallery strip of real shots
  - a single closing CTA band
  
  Don't use three equal cards, and don't repeat the same layout across 3 consecutive sections. Scroll reveal uses IntersectionObserver plus CSS, all wrapped in `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 4: Regenerate the images** with `npm run build:shots` (dev server running) so the shots use the new palette in any brand-colored recipe. Look at the images.
- [ ] **Step 5: Screenshot and pre-flight.** Take screenshots at 390px and 1440px in light and dark (`emulateMedia({ colorScheme })`). Then go through the taste-skill §14 checklist and fix every box that fails.

### Task 13: `/glint/` launch page

**Files:** create `glint/index.html`. Modify `vite.config.js` (`rollupOptions.input` gets `glint: resolve(__dirname, 'glint/index.html')`) and `site/partials/footer.html` (add a "Meet Glint" link).

- [ ] **Step 1: Build the page** from the same partial placeholders the other marketing pages use (copy the `<head>`/partial structure from `about/index.html`).
  - A centered manifesto hero: eyebrow `v36 · Darkroom`, H1 `Meet Glint.`, sub `SnapShotPro grew into a full studio. It deserved a name and a look of its own.`
  - Then these sections:
    - "Why a new name": 2 short paragraphs.
    - "What changed": the name, colors, logo and launch page, shown as a split with the old and new mark images.
    - "What stayed": every feature, your projects (moved automatically on first visit), templates, brand kits and API keys. Show it as a compact grid of real shots, not cards with icons.
    - FAQ (`<details>`):
      - "Will I lose my projects?" No, they copy over automatically on your first visit.
      - "Do I need a new extension?" Update to Glint Capture. The old one keeps working.
      - "Is the address changing?" snapshotpro.xyz still works.
      - "Does anything cost more?" Nothing changes.
    - Closing CTA: `Open the editor`.
- [ ] **Step 2: Run `npm run build`** and confirm that `dist/glint/index.html` exists and the partials were injected (grep for `class="brand"`).
- [ ] **Step 3: Screenshot at 390 and 1440 px in both themes, and run the §14 pre-flight.** Expected: zero `—`/`–` (`grep -n "[—–]" glint/index.html` returns nothing).

### Task 14: What's new, welcome, release, CLAUDE.md, commit

- [ ] **Step 1: Update `src/features/whats-new.js`.**
  - `CURRENT_VERSION = '36.0'`
  - heading `'✨ v36 · Darkroom: SnapShotPro is now Glint'`
  - items:
    - `{ title: 'Same studio, new name', desc: 'Every tool is where you left it. Your projects, templates and brand kits moved over automatically.' }`
    - `{ title: 'A new look', desc: 'A warmer, quieter interface with a single amber accent, in light and dark.' }`
    - `{ title: 'Update the extension', desc: 'The capture extension is now Glint Capture. The old version keeps working until you update.' }`
- [ ] **Step 2: Update `welcome.js`.** Run `grep -n "SnapShotPro\|Welcome" src/features/welcome.js` and make sure the first-run copy says Glint (done by Task 9's sed; verify here).
- [ ] **Step 3: Update the changelog.** Add a v36 entry at the top of the release list in `changelog/index.html`, matching the `<h2>Contrast</h2>` entry markup: `<h2>Darkroom</h2>` with version 36.0.0 and bullets for the rename, the identity, data migration, the extension and the new pages. Also update the hero block near :974 (`<h2>Contrast.</h2>`) to feature Darkroom / Glint the way it featured Contrast.
- [ ] **Step 4: Bump `package.json` `version`** to `36.0.0` and run `npm install --package-lock-only`.
- [ ] **Step 5: Update CLAUDE.md for Phase 4.**
  - Add a Shipped row: `| v36 | Darkroom (Glint relaunch) | SnapShotPro renamed Glint; brand-migrate.js + project-db legacy copy; tokens + sparkle mark; homepage redesign; /glint/ launch page; extension Glint Capture (accepts both message types) |`.
  - Add `/glint/` to the Commands marketing list.
  - Codenames: `v36 Darkroom (Glint relaunch), v37 Exposure, v38 Focus`.
  - The backlog heading becomes `### Planned: v37 Exposure (batch develop) — not started`, with "v36 flagship (codename Darkroom)" changed to "v37 flagship (codename Exposure)" and the content kept.
- [ ] **Step 6: Run `npm run check`, then commit and push.** Commit message: `release: v36.0.0 Darkroom, SnapShotPro is now Glint`.

### Task 15: Final verification

- [ ] Run `npm run check`. Expected: green.
- [ ] Re-run the Task 11 Step 4 leftover check and the CLAUDE.md grep: `grep -n "snapshotpro_\|SnapShotPro" CLAUDE.md` should only find intentional history notes and the brand-migrate docs.
- [ ] Re-run `phase1-check.mjs` against `npm run preview` (the production build). Expected: pass.
- [ ] Take final screenshots: the homepage, `/glint/`, `/editor/` and `/changelog/` at 390 and 1440 in light and dark. Send the key ones to the user.
