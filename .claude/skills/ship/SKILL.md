---
name: ship
description: Use when shipping a new Glint version — bumps package.json, updates the changelog page, runs the production build, then commits and pushes to main. Triggers on "ship v27", "ship this version", "cut a release".
---

# Ship a version

Releases in this repo are driven by `package.json` `version` (the single version source — it feeds the footer `{{VERSION}}` and the returning-user "what's new" toast). `npm run check` (lint + knip + regression tests + build, the same as CI) is the gate. The changelog is the static page `changelog/index.html`, not a `CHANGELOG.md`.

Ask for the target version and a one-line summary of what shipped if not already given.

## Steps

1. **Bump the version.** Edit `package.json` `version` to the new `X.Y.Z`. This is what drives the footer and the whats-new toast.

2. **Update the changelog page.** Add an entry to `changelog/index.html` for the new version (match the existing entry markup/structure already on the page). If this release should surface the returning-user toast, also update `src/features/whats-new.js` (`CURRENT_VERSION`, heading, items), the editor header version/codename in `editor/index.html`, and the CLAUDE.md Shipped features table.

3. **Check; abort if red.** Run `npm run check`. If it fails, stop and report — do not commit a broken build.

4. **Commit.** Stage the changes and commit with message `release: vX.Y.Z`.
   - **PowerShell only:** use a single `-m` flag, never a heredoc (`@'...'@` leaves stray `@` chars in the message). Example:
     ```
     git commit -m "release: v27.0.0"
     ```
   - Append the standard co-author trailer line on its own line inside the `-m` string if commits in this repo carry one.

5. **Push to main.**
   ```
   git push origin main
   ```

## Notes
- Recent commits use Conventional-Commit subjects like `feat(v26): …`; the user asked for `release: <version>` for the ship flow specifically — honor that.
- Confirm the working tree only contains intended release changes before committing (`git status`).
