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

// Rounded-rect path helper
const rr = (x, y, w, h, r) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`;

const chip = (x, y, label) => {
  const w = 36 + label.length * 10.2;
  return `
    <path d="${rr(x, y, w, 42, 21)}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <text x="${x + w / 2}" y="${y + 27}" font-family="Geist" font-weight="500" font-size="16" fill="#dfe4f2" text-anchor="middle">${label}</text>`;
};

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070a12"/>
      <stop offset="1" stop-color="#0b1124"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#2348ff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#2348ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#7c5cff" stop-opacity="0.40"/>
      <stop offset="1" stop-color="#7c5cff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d91ff"/>
      <stop offset="1" stop-color="#2348ff"/>
    </linearGradient>
    <linearGradient id="accentText" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7da2ff"/>
      <stop offset="0.55" stop-color="#4f7cff"/>
      <stop offset="1" stop-color="#36d0ff"/>
    </linearGradient>
    <linearGradient id="shot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b6bff"/>
      <stop offset="0.5" stop-color="#27c6e6"/>
      <stop offset="1" stop-color="#b65cff"/>
    </linearGradient>
    <linearGradient id="winbar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161d33"/>
      <stop offset="1" stop-color="#11182b"/>
    </linearGradient>
  </defs>

  <!-- base -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="730" cy="250" rx="620" ry="460" fill="url(#glowA)"/>
  <ellipse cx="180" cy="540" rx="420" ry="320" fill="url(#glowB)"/>
  <rect width="${W}" height="${H}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>

  <!-- brand -->
  <g>
    <path d="${rr(64, 54, 46, 46, 13)}" fill="url(#mark)"/>
    <circle cx="87" cy="77" r="13" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-opacity="0.95"/>
    <circle cx="87" cy="77" r="4.4" fill="#ffffff"/>
    <text x="124" y="86" font-family="Geist" font-weight="600" font-size="27" fill="#eef1f8">SnapShotPro</text>
  </g>

  <!-- eyebrow pill -->
  <g>
    <path d="${rr(64, 150, 418, 38, 19)}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <circle cx="88" cy="169" r="4.5" fill="#4f7cff"/>
    <text x="104" y="174" font-family="Geist" font-weight="500" font-size="15.5" fill="#aab2c8">Free screenshot studio — runs in your browser</text>
  </g>

  <!-- headline -->
  <text x="62" y="296" font-family="Geist" font-weight="700" font-size="78" letter-spacing="-2.4" fill="#f3f5fc">Screenshots that</text>
  <text x="62" y="382" font-family="Geist" font-weight="700" font-size="78" letter-spacing="-2.4" fill="#f3f5fc">carry <tspan fill="url(#accentText)">weight</tspan>.</text>

  <!-- sub -->
  <text x="64" y="438" font-family="Geist" font-weight="400" font-size="22" fill="#aab2c8">Backgrounds, device frames, App Store sets,</text>
  <text x="64" y="470" font-family="Geist" font-weight="400" font-size="22" fill="#aab2c8">generative AI edits, even video.</text>

  <!-- feature chips -->
  ${chip(64, 506, 'Liquid glass')}
  ${chip(212, 506, 'Device frames')}
  ${chip(380, 506, 'AI edits')}
  ${chip(498, 506, 'Video to MP4')}

  <!-- footer url -->
  <circle cx="70" cy="585" r="5" fill="#4f7cff"/>
  <text x="84" y="591" font-family="Geist Mono" font-weight="500" font-size="17" fill="#eef1f8">snapshotpro.xyz</text>
  <text x="262" y="591" font-family="Geist Mono" font-weight="400" font-size="17" fill="#6f7794">Free, no account</text>

  <!-- browser mockup -->
  <g transform="rotate(-3.2 1000 320)">
    <ellipse cx="1000" cy="330" rx="300" ry="240" fill="url(#glowA)" opacity="0.5"/>
    <path d="${rr(742, 150, 540, 348, 18)}" fill="#0d1426" stroke="rgba(255,255,255,0.10)" stroke-width="1.5"/>
    <!-- title bar -->
    <path d="M760,150 h504 a18,18 0 0 1 18,18 v30 h-540 v-30 a18,18 0 0 1 18,-18 z" fill="url(#winbar)"/>
    <circle cx="766" cy="172" r="6" fill="#ff5f57"/>
    <circle cx="788" cy="172" r="6" fill="#febc2e"/>
    <circle cx="810" cy="172" r="6" fill="#28c840"/>
    <path d="${rr(850, 162, 360, 20, 10)}" fill="#0a0f1c"/>
    <text x="868" y="176" font-family="Geist Mono" font-weight="400" font-size="11" fill="#6f7794">snapshotpro.xyz/studio</text>
    <!-- screenshot -->
    <path d="M742,198 h540 v282 a18,18 0 0 1 -18,18 h-504 a18,18 0 0 1 -18,-18 z" fill="url(#shot)"/>
    <!-- inner device card -->
    <path d="${rr(820, 244, 384, 210, 16)}" fill="rgba(8,12,24,0.30)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
    <path d="${rr(848, 274, 150, 150, 26)}" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.40)" stroke-width="2"/>
    <path d="${rr(1024, 274, 152, 26, 13)}" fill="rgba(255,255,255,0.30)"/>
    <path d="${rr(1024, 314, 152, 18, 9)}" fill="rgba(255,255,255,0.20)"/>
    <path d="${rr(1024, 344, 110, 18, 9)}" fill="rgba(255,255,255,0.20)"/>
    <path d="${rr(1024, 396, 100, 28, 14)}" fill="#0e1426" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
  </g>

  <!-- floating glass chip over the mockup -->
  <g transform="rotate(-3.2 1000 320)">
    <path d="${rr(700, 430, 196, 52, 14)}" fill="rgba(14,18,32,0.78)" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
    <circle cx="726" cy="456" r="9" fill="none" stroke="#4f7cff" stroke-width="2.4"/>
    <path d="M722,456 l3,3 l5,-6" fill="none" stroke="#4f7cff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="746" y="461" font-family="Geist" font-weight="600" font-size="15" fill="#eef1f8">1200 × 630 export</text>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' },
});
const png = resvg.render().asPng();
const out = join(root, 'public', 'og.png');
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
