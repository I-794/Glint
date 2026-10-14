// Generates Chrome Web Store screenshots (1280x800 PNG) for SnapShotPro Capture.
//
//   node scripts/build-store-shots.mjs http://localhost:5173
//
// Produces, in chrome-extension/store/screenshots/:
//   01-modes.png  — the capture popup on a branded canvas
//   02-region.png — the /extension/ landing hero (browser + region marquee + popup)
//   03-studio.png — a captured screenshot framed in the real studio
// Requires the dev server (or a preview build) running at the given base URL,
// and `playwright` installed.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import path from 'path';

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/+$/, '');
const OUT = 'chrome-extension/store/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

// 01 — popup on a branded canvas.
const popupHtml = readFileSync('chrome-extension/popup/popup.html', 'utf8')
  .replace('href="popup.css"', `href="${BASE}/_popup.css"`);   // not used; inline below instead
const popupCss = readFileSync('chrome-extension/popup/popup.css', 'utf8');
const popupBody = popupHtml.replace(/^[\s\S]*<body>/, '').replace(/<script[\s\S]*$/, '');
await page.setContent(`<!doctype html><html><head><style>
  html,body{margin:0;height:800px;width:1280px;}
  body{display:flex;align-items:center;justify-content:center;gap:64px;
    background:radial-gradient(60% 80% at 18% 10%,#1f2a6b,transparent 60%),radial-gradient(60% 80% at 90% 90%,#3a2d6b,transparent 60%),#080b14;
    font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;}
  .copy{max-width:430px;}
  .copy h1{font-size:46px;line-height:1.04;letter-spacing:-0.03em;margin:0 0 16px;font-weight:700;}
  .copy p{font-size:19px;line-height:1.5;color:#9aa3bd;margin:0;}
  .pop{${popupCss.match(/body\s*\{([^}]*)\}/)?.[1] || ''};border:1px solid rgba(255,255,255,0.1);border-radius:16px;box-shadow:0 30px 70px rgba(0,0,0,0.6);}
  ${popupCss.replace(/body\s*\{[^}]*\}/, '')}
</style></head><body>
  <div class="copy"><h1>Capture any page in one click.</h1><p>Visible area, full page, or a region you drag.</p></div>
  <div class="pop">${popupBody}</div>
</body></html>`);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, '01-modes.png') });

// 02 — the landing hero (real page), cropped to the hero band.
await page.goto(`${BASE}/extension/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, '02-region.png') });   // 1280x800 viewport = hero

// 03 — a real capture framed in the studio.
await ctx.addInitScript(() => { try { localStorage.setItem('glint_welcome_v1', 'dismissed'); } catch (e) {} });
const studio = await ctx.newPage();
await studio.goto(`${BASE}/editor/`, { waitUntil: 'load' });
await studio.waitForSelector('#upload-zone');
const shot = await studio.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1000; c.height = 680;
  const x = c.getContext('2d');
  x.fillStyle = '#0f172a'; x.fillRect(0, 0, 1000, 680);
  x.fillStyle = '#fff'; x.fillRect(60, 60, 420, 150);
  x.fillStyle = '#3b82f6'; x.fillRect(700, 540, 220, 70);
  x.fillStyle = '#94a3b8'; x.fillRect(60, 560, 520, 60);
  return c.toDataURL('image/png');
});
await studio.setInputFiles('#file-input', { name: 'capture.png', mimeType: 'image/png', buffer: Buffer.from(shot.split(',')[1], 'base64') });
await studio.waitForFunction(() => { const c = document.getElementById('preview-canvas'); return c && c.width > 0; });
await studio.waitForTimeout(600);
await studio.setViewportSize({ width: 1280, height: 800 });
await studio.waitForTimeout(300);
await studio.screenshot({ path: path.join(OUT, '03-studio.png') });

console.log('Store screenshots written to ' + OUT);
await browser.close();
