# SnapShotPro design system

The full system (brand book, every component with live previews in both themes, example screens, contrast tables) lives in the Design System artifact: https://claude.ai/artifact/Bp6o8N7LVnU9pQdxPumZEL

This folder holds the parts you can drop into a vanilla CSS project:

| File | What |
|---|---|
| `snapshotpro-tokens.css` | Every token as a CSS custom property. Dark is the default (`:root`); set `data-theme="light"` on `<html>` for light. Also defines one class per type style (`.ed-body`, `.mk-display`, ...). Generated from `tokens.json`. |
| `snapshotpro-components.css` | Component classes (`sp-btn`, `sp-menu`, `sp-toast`, and the v35 `sp-mode`, `sp-ftb`, `sp-wipe`, `sp-more`, ...) built only on the tokens, with hover / active / focus-visible / disabled states and reduced-motion + reduced-transparency fallbacks. Imports Geist and JetBrains Mono from Google Fonts. |
| `tokens.json` | The source tokens (colors per theme, type scale, spacing, radius, shadow, size, blur, duration, easing, z-index), each with a usage note. |
| `logos/` | Logo proposals: `logo-a-cobalt-violet.svg` (recommended, 32px and up), `logo-b-solid-cobalt.svg` (32px and below, favicon), `logo-c-aperture.svg` (motif, not the logo). |

```html
<link rel="stylesheet" href="/docs/design-system/snapshotpro-tokens.css">
<link rel="stylesheet" href="/docs/design-system/snapshotpro-components.css">
<button class="sp-btn sp-btn--primary">Export PNG</button>
```

Up to date with v35.0.0 (Contrast). Nothing in `src/` or `public/` uses these files yet. The artifact's brand book has a migration table that maps the current `src/styles.css` and `public/site.css` variables to the new token names.
