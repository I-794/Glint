// v33.2 — Real Glint output for the marketing site (homepage + gallery),
// replacing the old picsum.photos stock photos.
//
//   npm run dev                    (in another terminal)
//   npm run build:shots            (or: node scripts/build-site-shots.mjs http://localhost:5173)
//
// Writes WebP files to public/shots/. Each image is made the way a user makes
// one: a source screenshot (a fictional app UI from site-shots/sources.mjs) is
// loaded through the editor's own upload input, the recipe's settings are
// applied to the editor state (what the sidebar controls do), and the result is
// rendered with renderInto(canvas, true), the same pass Export uses. The App
// Store card uses Set mode's renderSetPanels(); the homepage hero is a
// screenshot of the editor itself. To restyle an image, edit its recipe below.
//
// Requires the dev server (module URLs like /src/state/state.js) and the
// `playwright` devDependency.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import * as SOURCES from './site-shots/sources.mjs';

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/+$/, '');
const OUT = 'public/shots';
const QUALITY = 0.86;
mkdirSync(OUT, { recursive: true });

// name -> [html, width, height, deviceScaleFactor]
const SOURCE_SIZES = {
  dashboard: [1440, 900, 1],
  kanban: [1440, 820, 1],
  landing: [1440, 760, 1],
  mobileToday: [390, 844, 2],
  mobileWorkout: [390, 844, 2],
  mobilePlans: [390, 844, 2]
};

const W = 1000, H = 600;          // gallery + homepage showcase cards (~5:3 slot)
const FW = 1200, FH = 900;        // homepage feature visuals (4:3 slot)

const shadow = (blur, opacity, y, spread = 0) => ({ blur, spread, opacity, x: 0, y, color: '#000000' });

// Each recipe: { file, source, state: <patch deep-merged onto a clean editor state>,
// extras?: [source names added as extra image layers] }.
const RECIPES = [
  {
    file: 'warm-gradient', source: 'kanban',
    state: {
      canvas: { width: W, height: H }, padding: 64, borderRadius: 18,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 150, colors: ['#ffb45c', '#ff5e7e', '#c5318f'], positions: [0, 55, 100] },
      shadow: shadow(60, 34, 24)
    }
  },
  {
    file: 'cobalt-mesh', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, padding: 80, borderRadius: 12,
      bgMode: 'mesh',
      meshGradient: { points: [
        // The first point's color is also the base fill; the rest blend additively.
        { x: 0.2, y: 0.85, color: '#0c1a5e', radius: 0.7 },
        { x: 0.78, y: 0.12, color: '#1f45e0', radius: 0.7 },
        { x: 0.08, y: 0.08, color: '#139e93', radius: 0.4 },
        { x: 0.95, y: 0.95, color: '#4a22b8', radius: 0.5 }
      ] },
      deviceFrame: { type: 'chrome', color: 'dark', url: 'lumen.app/overview', title: 'Lumen' },
      tilt3d: { rx: 10, ry: -24, rz: 3, perspective: 1400 },
      shadow: shadow(70, 45, 30)
    }
  },
  {
    file: 'glass-spotlight', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, padding: 56, borderRadius: 14,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 160, colors: ['#3a2d6b', '#15161a'], positions: [0, 100] },
      // Image sits at x 110, y 56, scale 0.542 (1440x900 source, 56px padding),
      // so the two left KPI cards land at roughly (255,115)-(558,212).
      spotlight: { enabled: true, x: 0.24, y: 0.17, w: 0.335, h: 0.21, opacity: 0.6 },
      glass: { enabled: true, x: 0.63, y: 0.55, w: 0.27, h: 0.32, radius: 22, blur: 14, tint: '#ffffff', tintOpacity: 14, rim: true, rimOpacity: 50 },
      annotations: [
        { id: 1, type: 'rect', x1: 248, y1: 108, x2: 566, y2: 219, color: '#ffd23f', strokeWidth: 4, number: null },
        { id: 2, type: 'arrow', x1: 720, y1: 70, x2: 580, y2: 126, color: '#ffd23f', strokeWidth: 5, number: null },
        { id: 3, type: 'number', x1: 248, y1: 108, x2: 248, y2: 108, color: '#ff3b6b', strokeWidth: 4, number: 1 }
      ],
      shadow: shadow(50, 40, 20)
    }
  },
  {
    file: 'device-mockup', source: 'mobileToday',
    state: {
      canvas: { width: W, height: H }, padding: 40,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 135, colors: ['#5b82ff', '#2348ff', '#6a3cff'], positions: [0, 55, 100] },
      deviceFrame: { type: 'iphone16pro', color: 'titanium', glare: true },
      reflection: { enabled: true, opacity: 0.3, length: 0.35, gap: 6 },
      shadow: shadow(50, 40, 24)
    }
  },
  {
    file: 'sunset-pop', source: 'landing',
    state: {
      canvas: { width: W, height: H }, padding: 70, borderRadius: 16,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 120, colors: ['#ffd36e', '#ff7a59', '#e0379b'], positions: [0, 50, 100] },
      imageFilters: { brightness: 104, contrast: 112, saturation: 145, blur: 0, grayscale: 0, sepia: 0, temperature: 18, tint: 0 },
      grain: { enabled: true, amount: 22, scale: 1, blend: 'overlay', monochrome: true },
      shadow: shadow(60, 40, 26)
    }
  },
  {
    file: 'aurora-mesh', source: 'kanban',
    state: {
      canvas: { width: W, height: H }, padding: 72, borderRadius: 14,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.5, y: 0.95, color: '#061620', radius: 0.7 },
        { x: 0.12, y: 0.1, color: '#14a37a', radius: 0.55 },
        { x: 0.6, y: 0.05, color: '#1f5fc4', radius: 0.5 },
        { x: 0.95, y: 0.4, color: '#6a2fd0', radius: 0.5 }
      ] },
      deviceFrame: { type: 'macos', color: 'dark', title: 'Tasklane' },
      shadow: shadow(60, 55, 26)
    }
  },
  {
    file: 'frosted-panel', source: 'landing',
    state: {
      canvas: { width: W, height: H }, padding: 60, borderRadius: 16,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.85, y: 0.9, color: '#25163f', radius: 0.6 },
        { x: 0.1, y: 0.1, color: '#6a4fe0', radius: 0.6 },
        { x: 0.9, y: 0.15, color: '#2f7fd0', radius: 0.55 },
        { x: 0.2, y: 0.9, color: '#c2408f', radius: 0.5 }
      ] },
      glass: { enabled: true, x: 0.12, y: 0.62, w: 0.76, h: 0.26, radius: 26, blur: 18, tint: '#ffffff', tintOpacity: 16, rim: true, rimOpacity: 55 },
      shadow: shadow(60, 45, 24)
    }
  },
  {
    file: 'laptop-scene', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, padding: 40,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 180, colors: ['#eef1f8', '#cfd6e6'], positions: [0, 100] },
      deviceFrame: { type: 'macbookpro', color: 'silver', glare: true },
      shadow: shadow(40, 22, 18)
    }
  },
  // v36 Glint: graphite with one amber flare, the brand's own look.
  {
    file: 'amber-flare', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, padding: 80, borderRadius: 12,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.5, y: 0.9, color: '#121214', radius: 0.8 },
        { x: 0.1, y: 0.06, color: '#f2a93b', radius: 0.5 },
        { x: 0.98, y: 0.98, color: '#e8613a', radius: 0.42 },
        { x: 0.85, y: 0.1, color: '#2a2a30', radius: 0.5 }
      ] },
      deviceFrame: { type: 'chrome', color: 'dark', url: 'lumen.app/overview', title: 'Lumen' },
      shadow: shadow(70, 50, 30)
    }
  },
  // Homepage "Capture & arrange": several screenshots arranged by auto-layout.
  {
    file: 'capture-arrange', source: 'dashboard', extras: ['landing', 'kanban', 'mobileToday'],
    state: {
      canvas: { width: FW, height: FH }, padding: 56, borderRadius: 10,
      autoLayout: { pattern: 'grid-2x2', gap: 28, align: 'center' },
      bgMode: 'gradient', gradient: { type: 'linear', angle: 145, colors: ['#26262b', '#0d0d0f'], positions: [0, 100] },
      shadow: shadow(40, 45, 18)
    }
  },
  // Homepage "Frame & style": phone frame, gradient, tilt, grain.
  {
    file: 'frame-style', source: 'mobileWorkout',
    state: {
      canvas: { width: FW, height: FH }, padding: 70,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.85, y: 0.85, color: '#0b0e1a', radius: 0.65 },
        { x: 0.1, y: 0.12, color: '#5f8a12', radius: 0.4 },
        { x: 0.88, y: 0.15, color: '#0e6f68', radius: 0.55 },
        { x: 0.2, y: 0.9, color: '#16239a', radius: 0.6 }
      ] },
      deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true },
      tilt3d: { rx: 6, ry: 18, rz: -3, perspective: 1400 },
      grain: { enabled: true, amount: 12, scale: 1, blend: 'overlay', monochrome: true },
      shadow: shadow(60, 45, 30)
    }
  }
];

// App Store card: three real Set-mode panels, laid out as the set they export as.
const SET = {
  file: 'app-store-set',
  panels: [
    { source: 'mobileToday', headline: 'Close every ring', subhead: 'Move, exercise and stand at a glance.' },
    { source: 'mobileWorkout', headline: 'Track every run', subhead: 'Live pace, time and route.' },
    { source: 'mobilePlans', headline: 'Train with a plan', subhead: 'Coached programs that adapt.' }
  ],
  state: {
    screenshotSet: { shared: { headlineSize: 0.072, subheadSize: 0.036 } },
    bgMode: 'gradient', gradient: { type: 'linear', angle: 160, colors: ['#e9ffb8', '#c6ff4a'], positions: [0, 100] },
    deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true }
  },
  backdrop: ['#2bd4c4', '#2348ff']
};

// v37 Exposure: one roll developed with one design. Each shot goes through the
// Roll's own logic (roll-core smart frame + overrides, then renderInto), and the
// developed images are laid out side by side like a contact sheet.
const ROLL = {
  file: 'roll-develop',
  shots: [
    { source: 'mobileToday' },
    { source: 'dashboard' },
    { source: 'landing' }
  ],
  state: {
    ...RECIPES.find(r => r.file === 'amber-flare').state,
    canvas: { width: 900, height: 900 }, padding: 90
  },
  backdrop: ['#1c1c20', '#0f0f11']
};

// v38 Focus: the same design twice, as it comes and with a starter look's
// curves + levels, side by side. Both go through renderInto, so the right-hand
// one is the real curves pass, not an edit of the left.
const FOCUS = {
  file: 'focus-curves', source: 'dashboard', look: 'starter-cool-night',
  state: { ...RECIPES.find(r => r.file === 'amber-flare').state, canvas: { width: 1200, height: 900 }, padding: 70 },
  backdrop: ['#1c1c20', '#0f0f11']
};

// v39 Glossifier: the light kanban as Before and the same screenshot flipped
// to dark by the real Light / Dark pass as After, with the Compare divider in
// the middle (what "Keep the original as Before" makes). The scene is already
// dark, so it is not flipped.
const GLOSS = {
  file: 'glossifier-modes', source: 'kanban',
  state: { ...RECIPES.find(r => r.file === 'amber-flare').state, canvas: { width: 1280, height: 600 }, padding: 46 }
};

// Homepage hero: the editor itself, mid-design.
const HERO = {
  file: 'hero-editor', source: 'dashboard', viewport: { width: 1280, height: 800 },
  // Same look as amber-flare (v36 Glint), at hero size.
  state: { ...RECIPES.find(r => r.file === 'amber-flare').state, canvas: { width: 1600, height: 1000 }, padding: 100 }
};

// ── run ──────────────────────────────────────────────────────────────────────
const whatsNew = readFileSync('src/features/whats-new.js', 'utf8').match(/CURRENT_VERSION = '([^']+)'/)[1];
const browser = await chromium.launch();

async function renderSources() {
  const out = {};
  for (const [name, [w, h, dpr]] of Object.entries(SOURCE_SIZES)) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await p.setContent(SOURCES[name]);
    await p.evaluate(() => document.fonts.ready);
    out[name] = (await p.screenshot()).toString('base64');
    await p.close();
  }
  return out;
}
const sources = await renderSources();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript((ver) => {
  // Page-side module loader: these URLs live on the Vite dev server, and keeping
  // them out of literal import() calls stops knip resolving them as Node imports.
  window.__shotImport = (url) => import(url);
  try {
    localStorage.setItem('glint_welcome_v1', 'dismissed');
    localStorage.setItem('glint_lastseen_version', ver);
  } catch (e) {}
}, whatsNew);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.warn('[editor]', e.message));
await page.goto(`${BASE}/editor/`, { waitUntil: 'load' });
await page.waitForSelector('#file-input', { state: 'attached' });
await page.waitForTimeout(800);

// Clean-state baseline, captured before any image is loaded.
await page.evaluate(async () => {
  const { state } = await window.__shotImport('/src/state/state.js');
  window.__shotBase = JSON.stringify(state, (k, v) => (k === 'image' || k === 'bgImage' || k === 'svgCode' ? undefined : v));
});

// Load a source through the real upload input and wait for it to decode.
async function upload(name) {
  await page.evaluate(async () => { (await window.__shotImport('/src/state/state.js')).state.image = null; });
  await page.setInputFiles('#file-input', { name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(sources[name], 'base64') });
  // waitForFunction treats an async predicate's Promise as truthy, so poll a
  // synchronous check against the state module instead.
  await page.evaluate(async () => { window.__shotState = (await window.__shotImport('/src/state/state.js')).state; });
  await page.waitForFunction(() => !!(window.__shotState && window.__shotState.image && window.__shotState.image.width));
}

// Restore the baseline, then deep-merge a recipe patch onto the editor state.
async function applyState(patch, extras = []) {
  await page.evaluate(async ({ patch, extras }) => {
    const { state, imageRegistry } = await window.__shotImport('/src/state/state.js');
    const base = JSON.parse(window.__shotBase);
    for (const k of Object.keys(base)) state[k] = base[k];
    const merge = (dst, src) => {
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
        else dst[k] = v;
      }
    };
    merge(state, patch);
    state.extraImages = [];
    for (const [i, src] of extras.entries()) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + src;
      await img.decode();
      const id = 'shot_extra_' + i;
      imageRegistry[id] = img;
      state.extraImages.push({ id, xFrac: 0.5, yFrac: 0.5, scaleFrac: 0.4 });
    }
  }, { patch, extras: extras.map((n) => sources[n]) });
}

async function exportWebp() {
  return page.evaluate(async (q) => {
    const { renderInto } = await window.__shotImport('/src/render/render.js');
    const off = document.createElement('canvas');
    renderInto(off, true);
    return off.toDataURL('image/webp', q).split(',')[1];
  }, QUALITY);
}

function save(file, b64) {
  const p = path.join(OUT, `${file}.webp`);
  writeFileSync(p, Buffer.from(b64, 'base64'));
  console.log(`  ${p}  ${(Buffer.byteLength(b64, 'base64') / 1024).toFixed(0)} KB`);
}

console.log('Rendering site shots with the editor at ' + BASE);
for (const r of RECIPES) {
  await upload(r.source);
  await applyState(r.state, r.extras);
  save(r.file, await exportWebp());
}

// App Store set: Set mode renders each panel at the real store size.
{
  await upload(SET.panels[0].source);
  await applyState(SET.state);
  const b64 = await page.evaluate(async ({ set, panelSrcs, W, H, q }) => {
    const { state, imageRegistry } = await window.__shotImport('/src/state/state.js');
    const { renderSetPanels } = await window.__shotImport('/src/features/screenshot-set.js');
    state.screenshotSet.panels = [];
    for (const [i, p] of set.panels.entries()) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + panelSrcs[i];
      await img.decode();
      imageRegistry['shot_panel_' + i] = img;
      state.screenshotSet.panels.push({ imageId: 'shot_panel_' + i, headline: p.headline, subhead: p.subhead, position: 'top' });
    }
    const files = await renderSetPanels();
    const imgs = await Promise.all(files.map((f) => createImageBitmap(f.blob)));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, set.backdrop[0]); g.addColorStop(1, set.backdrop[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const ph = H * 0.84, pw = ph * imgs[0].width / imgs[0].height, gap = W * 0.035;
    const x0 = (W - (pw * 3 + gap * 2)) / 2, y0 = (H - ph) / 2;
    imgs.forEach((im, i) => {
      x.save();
      x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 30; x.shadowOffsetY = 14;
      x.beginPath(); x.roundRect(x0 + i * (pw + gap), y0, pw, ph, 14); x.fillStyle = '#000'; x.fill();
      x.shadowColor = 'transparent'; x.clip();
      x.drawImage(im, x0 + i * (pw + gap), y0, pw, ph);
      x.restore();
    });
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { set: SET, panelSrcs: SET.panels.map((p) => sources[p.source]), W, H, q: QUALITY });
  save(SET.file, b64);
}

// Roll: develop three shots with one design, then lay them out as a sheet.
{
  await upload(ROLL.shots[0].source);
  await applyState(ROLL.state);
  const b64 = await page.evaluate(async ({ roll, srcs, W, H, q }) => {
    const { state } = await window.__shotImport('/src/state/state.js');
    const { renderInto } = await window.__shotImport('/src/render/render.js');
    const core = await window.__shotImport('/src/render/roll-core.js');
    const fit = core.rollDefaults().smartFit;
    const base = core.captureOverrideFields(state);
    const outs = [];
    for (const src of srcs) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + src;
      await img.decode();
      const shot = { w: img.naturalWidth, h: img.naturalHeight, overrides: {} };
      core.applyOverrides(state, base);
      const frame = core.smartFrameFor(shot, fit);
      if (frame !== undefined) state.deviceFrame.type = frame;
      state.image = img;
      const off = document.createElement('canvas');
      renderInto(off, true);
      outs.push(off);
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, roll.backdrop[0]); g.addColorStop(1, roll.backdrop[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // The middle shot is the largest; the outer two sit a little lower.
    const sizes = [W * 0.28, W * 0.34, W * 0.28], gap = W * 0.022;
    let tx = (W - sizes.reduce((a, b) => a + b, 0) - gap * 2) / 2;
    outs.forEach((im, i) => {
      const side = sizes[i], ty = (H - side) / 2 + (i === 1 ? 0 : H * 0.05);
      x.save();
      x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 36; x.shadowOffsetY = 16;
      x.beginPath(); x.roundRect(tx, ty, side, side, 14); x.fillStyle = '#121214'; x.fill();
      x.shadowColor = 'transparent'; x.clip();
      x.drawImage(im, tx, ty, side, side);
      x.restore();
      tx += side + gap;
    });
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { roll: ROLL, srcs: ROLL.shots.map((s) => sources[s.source]), W: 1280, H: 600, q: QUALITY });
  save(ROLL.file, b64);
}

// Focus: as-shot on the left, graded with a look on the right.
{
  await upload(FOCUS.source);
  await applyState(FOCUS.state);
  const b64 = await page.evaluate(async ({ focus, W, H, q }) => {
    const { state } = await window.__shotImport('/src/state/state.js');
    const { renderInto } = await window.__shotImport('/src/render/render.js');
    const core = await window.__shotImport('/src/render/curves-core.js');
    const look = core.STARTER_LOOKS.find((l) => l.id === focus.look);
    const outs = [];
    for (const graded of [false, true]) {
      state.colorTools = graded ? core.normalizeColorTools(look.colorTools) : core.colorToolsDefaults();
      state.imageFilters = graded ? { ...look.imageFilters } : core.normalizeFilters({});
      const off = document.createElement('canvas');
      renderInto(off, true);
      outs.push(off);
    }
    state.colorTools = core.colorToolsDefaults();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, focus.backdrop[0]); g.addColorStop(1, focus.backdrop[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const gap = W * 0.024, tw = (W - gap * 3) / 2, th = tw * 900 / 1200;
    outs.forEach((im, i) => {
      const tx = gap + i * (tw + gap), ty = (H - th) / 2;
      x.save();
      x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 36; x.shadowOffsetY = 16;
      x.beginPath(); x.roundRect(tx, ty, tw, th, 14); x.fillStyle = '#121214'; x.fill();
      x.shadowColor = 'transparent'; x.clip();
      x.drawImage(im, tx, ty, tw, th);
      x.restore();
    });
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { focus: FOCUS, W: 1280, H: 600, q: QUALITY });
  save(FOCUS.file, b64);
}

// Glossifier: Before light, After dark, divider in the middle.
{
  await upload(GLOSS.source);
  await applyState(GLOSS.state);
  const b64 = await page.evaluate(async ({ q }) => {
    const { state } = await window.__shotImport('/src/state/state.js');
    const { renderInto } = await window.__shotImport('/src/render/render.js');
    const { compareDefaults } = await window.__shotImport('/src/render/compare-core.js');
    const { ensureCompareImage } = await window.__shotImport('/src/render/compare.js');
    const flip = await window.__shotImport('/src/render/mode-flip-core.js');
    const c0 = document.createElement('canvas');
    c0.width = state.image.width; c0.height = state.image.height;
    c0.getContext('2d').drawImage(state.image, 0, 0);
    const beforeSrc = c0.toDataURL('image/png');
    await ensureCompareImage(beforeSrc);
    state.compare = { ...compareDefaults(), enabled: true, beforeSrc, split: 0.5,
      labels: { enabled: true, before: 'Light', after: 'Dark', position: 'bottom' } };
    state.modeFlip = { ...flip.modeFlipDefaults(), enabled: true, target: 'dark' };
    const off = document.createElement('canvas');
    renderInto(off, true);
    state.compare = compareDefaults();
    state.modeFlip = flip.modeFlipDefaults();
    return off.toDataURL('image/webp', q).split(',')[1];
  }, { q: QUALITY });
  save(GLOSS.file, b64);
}

// Hero: the editor UI itself with a design on the canvas.
{
  await page.setViewportSize(HERO.viewport);
  await upload(HERO.source);
  await applyState(HERO.state);
  await page.evaluate(async () => {
    const { render } = await window.__shotImport('/src/render/render.js');
    render();
    window.__updateUIFromState && window.__updateUIFromState();
    document.querySelector('.rail-btn[data-group="background"]')?.click();
    const mm = document.getElementById('minimap');
    if (mm && getComputedStyle(mm).display !== 'none') document.getElementById('minimap-hide')?.click();
    document.getElementById('zoom-fit')?.click();
    document.getElementById('notification')?.classList.remove('show');
  });
  await page.waitForTimeout(700);
  const png = await page.screenshot();
  const b64 = await page.evaluate(async ({ src, q }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { src: png.toString('base64'), q: QUALITY });
  save(HERO.file, b64);
}

await browser.close();
