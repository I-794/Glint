// Builds public/og.png — the 1200x630 social/Discord preview card.
// Run: node scripts/build-og.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = join(root, '.ogfonts');
const fontFiles = readdirSync(fontDir).filter(f => f.endsWith('.ttf')).map(f => join(fontDir, f));

const W = 1200, H = 630;

// Domain shown on the card: same source as vite.config.js SITE_URL.
const SITE = (process.env.OG_BASE_URL || 'https://snapshotpro.xyz').replace(/^https?:\/\//, '').replace(/\/$/, '');

// The Glint sparkle (64-unit artwork from public/favicon.svg), placed at x,y and scaled.
const STAR = 'M32 11 C34 25 39 30 53 32 C39 34 34 39 32 53 C30 39 25 34 11 32 C25 30 30 25 32 11 Z';
const mark = (x, y, size, id) => `
  <g transform="translate(${x} ${y}) scale(${size / 64})">
    <rect width="64" height="64" rx="15" fill="url(#${id})"/>
    <path d="${STAR}" fill="#141416"/>
    <circle cx="46.5" cy="17.5" r="3" fill="#141416"/>
  </g>`;

// v36 Glint card: graphite, one amber accent, no fake UI.
const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6bb5e"/>
      <stop offset="1" stop-color="#e8613a"/>
    </linearGradient>
    <linearGradient id="tileBig" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6bb5e"/>
      <stop offset="1" stop-color="#e8613a"/>
    </linearGradient>
    <radialGradient id="leak" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f2a93b" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#f2a93b" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#0d0d0f"/>
  <ellipse cx="930" cy="300" rx="420" ry="360" fill="url(#leak)"/>

  <!-- brand -->
  ${mark(64, 56, 48, 'tile')}
  <text x="128" y="90" font-family="Geist" font-weight="600" font-size="28" fill="#f2f2f0">Glint</text>

  <!-- headline -->
  <text x="62" y="282" font-family="Geist" font-weight="700" font-size="76" letter-spacing="-2.4" fill="#f2f2f0">Screenshots,</text>
  <text x="62" y="366" font-family="Geist" font-weight="700" font-size="76" letter-spacing="-2.4" fill="#f2f2f0"><tspan fill="#f2a93b">finished</tspan>.</text>

  <!-- sub -->
  <text x="64" y="428" font-family="Geist" font-weight="400" font-size="24" fill="#b4b4b0">Turn raw screenshots into finished, on-brand images.</text>
  <text x="64" y="462" font-family="Geist" font-weight="400" font-size="24" fill="#b4b4b0">Free, in your browser, no account.</text>

  <!-- footer url -->
  <text x="64" y="572" font-family="Geist Mono" font-weight="400" font-size="18" fill="#8d8d89">${SITE}</text>

  <!-- the mark, large -->
  ${mark(780, 150, 330, 'tileBig')}
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' },
});
const png = resvg.render().asPng();
const out = join(root, 'public', 'og.png');
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
