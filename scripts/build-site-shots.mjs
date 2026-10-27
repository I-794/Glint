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
import { LOOKS } from '../src/state/site-looks.js';

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
      canvas: { width: W, height: H }, ...LOOKS['warm-gradient'].state
    }
  },
  {
    file: 'cobalt-mesh', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['cobalt-mesh'].state
    }
  },
  {
    file: 'glass-spotlight', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['glass-spotlight'].state,
      // Placed for the dashboard source: image at x 110, y 56, scale 0.542, so
      // the two left KPI cards land at roughly (255,115)-(558,212).
      spotlight: { enabled: true, x: 0.24, y: 0.17, w: 0.335, h: 0.21, opacity: 0.6 },
      annotations: [
        { id: 1, type: 'rect', x1: 248, y1: 108, x2: 566, y2: 219, color: '#ffd23f', strokeWidth: 4, number: null },
        { id: 2, type: 'arrow', x1: 720, y1: 70, x2: 580, y2: 126, color: '#ffd23f', strokeWidth: 5, number: null },
        { id: 3, type: 'number', x1: 248, y1: 108, x2: 248, y2: 108, color: '#ff3b6b', strokeWidth: 4, number: 1 }
      ]
    }
  },
  {
    file: 'device-mockup', source: 'mobileToday',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['device-mockup'].state
    }
  },
  {
    file: 'sunset-pop', source: 'landing',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['sunset-pop'].state
    }
  },
  {
    file: 'aurora-mesh', source: 'kanban',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['aurora-mesh'].state
    }
  },
  {
    file: 'frosted-panel', source: 'landing',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['frosted-panel'].state
    }
  },
  {
    file: 'laptop-scene', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['laptop-scene'].state
    }
  },
  // v36 Glint: graphite with one amber flare, the brand's own look.
  {
    file: 'amber-flare', source: 'dashboard',
    state: {
      canvas: { width: W, height: H }, ...LOOKS['amber-flare'].state
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
  },
  // v39.5 Amplified: the homepage raw-vs-Glint slider. Same canvas size, so the
  // two line up under the divider: the plain capture filling the frame, then the
  // same capture finished with the amber-flare design.
  {
    file: 'compare-raw', source: 'dashboard',
    state: {
      canvas: { width: 1600, height: 1000 }, padding: 0, borderRadius: 0,
      bgMode: 'solid', bgColor: '#ffffff', shadow: shadow(0, 0, 0)
    }
  },
  {
    file: 'compare-finished', source: 'dashboard',
    state: {
      canvas: { width: 1600, height: 1000 }, padding: 120, borderRadius: 14,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.5, y: 0.9, color: '#121214', radius: 0.8 },
        { x: 0.1, y: 0.06, color: '#f2a93b', radius: 0.5 },
        { x: 0.98, y: 0.98, color: '#e8613a', radius: 0.42 },
        { x: 0.85, y: 0.1, color: '#2a2a30', radius: 0.5 }
      ] },
      deviceFrame: { type: 'chrome', color: 'dark', url: 'lumen.app/overview', title: 'Lumen' },
      shadow: shadow(80, 55, 34)
    }
  },
  // v39.5 Amplified: one real output per Tools card.
  {
    file: 'tool-shadow', source: 'kanban',
    state: {
      canvas: { width: W, height: H }, padding: 90, borderRadius: 16,
      bgMode: 'solid', bgColor: '#eceef2',
      shadow: shadow(90, 30, 44)
    }
  },
  {
    file: 'tool-readme', source: 'landing',
    state: {
      canvas: { width: W, height: H }, padding: 56, borderRadius: 12,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 180, colors: ['#f6f8fa', '#d8dee4'], positions: [0, 100] },
      deviceFrame: { type: 'chrome', color: 'light', url: 'orbit.dev', title: 'Orbit' },
      shadow: shadow(40, 22, 16)
    }
  },
  {
    file: 'tool-print', source: 'landing',
    state: {
      canvas: { width: W, height: H }, padding: 40,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 180, colors: ['#3a3a40', '#1c1c20'], positions: [0, 100] },
      surface: { enabled: true, type: 'mug', variant: 'white', scale: 1, offsetX: 0, offsetY: 0, rotation: 0, shadow: true, shadingOpacity: 0.85 }
    }
  },
  {
    file: 'tool-og', source: 'landing',
    state: {
      canvas: { width: 1200, height: 630 }, padding: 110, borderRadius: 12,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.5, y: 0.9, color: '#121214', radius: 0.8 },
        { x: 0.1, y: 0.06, color: '#f2a93b', radius: 0.5 },
        { x: 0.98, y: 0.98, color: '#e8613a', radius: 0.42 },
        { x: 0.85, y: 0.1, color: '#2a2a30', radius: 0.5 }
      ] },
      textOverlay: { enabled: true, content: 'Orbit 3.0 is here', size: 46, font: 'Arial', color: '#ffffff', bold: true, x: 0.5, y: 0.1 },
      shadow: shadow(50, 45, 20)
    }
  }
];

// v39.5.2: the tool pages' own images (they used stock photos). Phone panels
// are 9:19 to fill the .lp-shots slots; product mockups go through Surface Studio.
const PW = 720, PH = 1520;
const GRAPHITE = { type: 'linear', angle: 180, colors: ['#2e2e34', '#16161a'], positions: [0, 100] };
const surface = (type, variant = 'white', scale = 1) => ({ enabled: true, type, variant, scale, offsetX: 0, offsetY: 0, rotation: 0, shadow: true, shadingOpacity: 0.85 });
RECIPES.push(
  { file: 'dev-iphone', source: 'mobileToday', state: { canvas: { width: PW, height: PH }, ...LOOKS['device-mockup'].state, reflection: { enabled: false } } },
  { file: 'dev-pixel', source: 'mobileWorkout', state: { canvas: { width: PW, height: PH }, ...LOOKS['aurora-mesh'].state, padding: 40, deviceFrame: { type: 'pixel', color: 'dark', glare: true } } },
  { file: 'dev-classic', source: 'mobilePlans', state: { canvas: { width: PW, height: PH }, ...LOOKS['amber-flare'].state, padding: 40, deviceFrame: { type: 'iphone', color: 'dark', glare: true } } },
  { file: 'social-a', source: 'mobileToday', state: { canvas: { width: PW, height: PH }, ...LOOKS['amber-flare'].state, padding: 60, deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true } } },
  { file: 'social-b', source: 'mobileWorkout', state: { canvas: { width: PW, height: PH }, ...LOOKS['sunset-pop'].state, padding: 60, deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true } } },
  { file: 'social-c', source: 'mobilePlans', state: { canvas: { width: PW, height: PH }, ...LOOKS['cobalt-mesh'].state, padding: 60, tilt3d: { rx: 0, ry: 0, rz: 0, perspective: 1400 }, deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true } } },
  { file: 'surf-tee', source: 'landing', state: { canvas: { width: PW, height: PH }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('tshirt', 'white', 1.8) } },
  { file: 'surf-mug', source: 'landing', state: { canvas: { width: PW, height: PH }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('mug', 'white', 1.8) } },
  { file: 'surf-poster', source: 'mobileToday', state: { canvas: { width: PW, height: PH }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('poster') } },
  { file: 'surf-apparel', source: 'mobileWorkout', state: { canvas: { width: 1040, height: 1400 }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('tshirt') } },
  { file: 'surf-box', source: 'landing', state: { canvas: { width: 1040, height: 720 }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('box') } },
  { file: 'surf-frame', source: 'mobilePlans', state: { canvas: { width: 1040, height: 720 }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('framedprint') } },
  { file: 'surf-card', source: 'landing', state: { canvas: { width: 1040, height: 720 }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('businesscard') } },
  { file: 'surf-poster-wide', source: 'mobileWorkout', state: { canvas: { width: 1040, height: 720 }, padding: 40, bgMode: 'gradient', gradient: GRAPHITE, surface: surface('poster') } },
  { file: 'surf-export', source: 'landing', state: { canvas: { width: 1200, height: 900 }, ...LOOKS['amber-flare'].state, deviceFrame: { type: null }, surface: surface('mug') } },
  { file: 'agent-styled', source: 'mobileToday', state: { canvas: { width: 1200, height: 740 }, ...LOOKS['warm-gradient'].state, padding: 50, deviceFrame: { type: 'iphone16pro', color: 'titanium', glare: true } } }
);

// v39.5 Amplified: Tools cards that show one design rendered several ways,
// laid out side by side. Social: the same design at square, portrait and story
// sizes. Merge: one template filled from three CSV rows (headline + color).
const BRAND_MESH = RECIPES.find(r => r.file === 'amber-flare').state.meshGradient;
const MULTI = [
  {
    file: 'tool-social', source: 'mobileToday',
    base: { padding: 70, bgMode: 'mesh', meshGradient: BRAND_MESH, deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true }, shadow: shadow(50, 45, 24) },
    variants: [
      { canvas: { width: 1080, height: 1080 } },
      { canvas: { width: 1080, height: 1350 } },
      { canvas: { width: 1080, height: 1920 } }
    ]
  },
  {
    file: 'tool-merge', source: 'mobileWorkout',
    base: { canvas: { width: 1080, height: 1350 }, padding: 150, bgMode: 'gradient', deviceFrame: { type: 'iphone16pro', color: 'dark', glare: true }, shadow: shadow(50, 40, 24) },
    variants: [
      { gradient: { type: 'linear', angle: 160, colors: ['#ffd36e', '#ff7a59'], positions: [0, 100] }, textOverlay: { enabled: true, content: 'Track every run', size: 64, font: 'Arial', color: '#141416', bold: true, x: 0.5, y: 0.06 } },
      { gradient: { type: 'linear', angle: 160, colors: ['#5b82ff', '#6a3cff'], positions: [0, 100] }, textOverlay: { enabled: true, content: 'Beat your pace', size: 64, font: 'Arial', color: '#ffffff', bold: true, x: 0.5, y: 0.06 } },
      { gradient: { type: 'linear', angle: 160, colors: ['#2bd4c4', '#139e93'], positions: [0, 100] }, textOverlay: { enabled: true, content: 'Train with a plan', size: 64, font: 'Arial', color: '#0b2420', bold: true, x: 0.5, y: 0.06 } }
    ]
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

// v40 Hindsight: one design at three points in its history (framed, then a
// look, then flipped to dark), each drawn back from its undo snapshot with
// withSnapshot + renderInto. Composed as a stack of prints cascading down to
// the right: oldest at the back top-left, newest at the front bottom-right. The
// canvas is portrait so it holds the changelog spotlight's narrow column.
const HINDSIGHT = {
  file: 'hindsight-steps', source: 'kanban', look: 'starter-warm-film',
  state: { ...RECIPES.find(r => r.file === 'amber-flare').state, canvas: { width: 1200, height: 900 }, padding: 70 },
  backdrop: ['#1c1c20', '#0f0f11']
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

// Multi-render cards: each variant is applied over the base and rendered with
// renderInto, then the results are set side by side at matching heights.
for (const m of MULTI) {
  await upload(m.source);
  const canvases = [];
  for (const v of m.variants) {
    await applyState({ ...m.base, ...v });
    canvases.push(await exportWebp());
  }
  const b64 = await page.evaluate(async ({ shots, W, H, q }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/webp;base64,' + s; await i.decode(); return i; }));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c1c20'); g.addColorStop(1, '#0f0f11');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // Fit the row: 82% of the height, or less when the panels would run off the sides.
    const gap = W * 0.03, ratios = imgs.map((i) => i.width / i.height);
    const th = Math.min(H * 0.82, (W * 0.9 - gap * (imgs.length - 1)) / ratios.reduce((a, b) => a + b, 0));
    const widths = ratios.map((r) => th * r);
    let tx = (W - widths.reduce((a, b) => a + b, 0) - gap * (imgs.length - 1)) / 2;
    imgs.forEach((im, i) => {
      const ty = (H - th) / 2;
      x.save();
      x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 30; x.shadowOffsetY = 14;
      x.beginPath(); x.roundRect(tx, ty, widths[i], th, 12); x.fillStyle = '#121214'; x.fill();
      x.shadowColor = 'transparent'; x.clip();
      x.drawImage(im, tx, ty, widths[i], th);
      x.restore();
      tx += widths[i] + gap;
    });
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { shots: canvases, W, H, q: QUALITY });
  save(m.file, b64);
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
    // v39.5.2: each panel on its own (720 wide) for the App Store tool page.
    window.__setPanels = imgs.map((im) => {
      const c = document.createElement('canvas'); c.width = 720; c.height = Math.round(720 * im.height / im.width);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', q).split(',')[1];
    });
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
  const panels = await page.evaluate(() => window.__setPanels);
  panels.forEach((p, i) => save(`store-${'abc'[i]}`, p));
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

// Hindsight: three history steps of one design, oldest on the left.
{
  await upload(HINDSIGHT.source);
  await applyState(HINDSIGHT.state);
  const b64 = await page.evaluate(async ({ hs, W, H, q }) => {
    const { state } = await window.__shotImport('/src/state/state.js');
    const { renderInto } = await window.__shotImport('/src/render/render.js');
    const hist = await window.__shotImport('/src/state/history.js');
    const core = await window.__shotImport('/src/render/curves-core.js');
    const flip = await window.__shotImport('/src/render/mode-flip-core.js');
    const look = core.STARTER_LOOKS.find((l) => l.id === hs.look);
    const framed = hist.currentSnapshot();
    state.colorTools = core.normalizeColorTools(look.colorTools);
    state.imageFilters = core.normalizeFilters(look.imageFilters);
    const graded = hist.currentSnapshot();
    state.modeFlip = { ...flip.modeFlipDefaults(), enabled: true, target: 'dark' };
    const flipped = hist.currentSnapshot();
    const outs = [framed, graded, flipped].map((snap) => hist.withSnapshot(snap, () => {
      const off = document.createElement('canvas');
      renderInto(off, true);
      return off;
    }));
    state.colorTools = core.colorToolsDefaults();
    state.imageFilters = core.normalizeFilters({});
    state.modeFlip = flip.modeFlipDefaults();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hs.backdrop[0]); g.addColorStop(1, hs.backdrop[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const m = W * 0.035, tw = W * 0.76, th = tw * 900 / 1200;
    const dx = (W - m * 2 - tw) / 2, dy = (H - m * 2 - th) / 2;
    outs.forEach((im, i) => {
      const tx = m + i * dx, ty = m + i * dy;
      x.save();
      x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
      x.beginPath(); x.roundRect(tx, ty, tw, th, 6); x.fillStyle = '#121214'; x.fill();
      x.shadowColor = 'transparent'; x.clip();
      x.drawImage(im, tx, ty, tw, th);
      x.restore();
    });
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { hs: HINDSIGHT, W: 1200, H: 1560, q: QUALITY });
  save(HINDSIGHT.file, b64);
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

// v41 Iris: the share viewer (/s/<id>) showing real renders. The designs are
// rendered by the editor, then served to the real viewer page through
// intercepted requests (the manifest API and a stand-in Blob host), so the
// page, the players and the chrome are exactly what a link opens.
const IRIS = {
  tour: { file: 'share-viewer', id: 'IrisTourDemo', title: 'Lumen onboarding', viewport: { width: 1440, height: 900 } },
  compare: { file: 'share-phone', id: 'IrisCmprDemo', title: 'Lumen, before and after', viewport: { width: 390, height: 844 } },
  steps: [
    { source: 'dashboard', recipe: 'amber-flare', hotspot: { x: 0.33, y: 0.354, w: 0.108, h: 0.114, label: 'Revenue', callout: { title: 'Revenue at a glance', body: 'Every number on the overview links to its report.', side: 'bottom' } } },
    { source: 'kanban', recipe: 'aurora-mesh' },
    { source: 'landing', recipe: 'frosted-panel' }
  ]
};
{
  const BLOB = 'https://shots.public.blob.vercel-storage.com';
  const files = {};
  const steps = [];
  for (const [i, st] of IRIS.steps.entries()) {
    await upload(st.source);
    await applyState(RECIPES.find((r) => r.file === st.recipe).state);
    const b64 = await exportWebp();
    files[`${IRIS.tour.id}/${i}.webp`] = Buffer.from(b64, 'base64');
    const dims = await page.evaluate(async (src) => { const im = new Image(); im.src = 'data:image/webp;base64,' + src; await im.decode(); return [im.width, im.height]; }, b64);
    steps.push({ src: `${i}.webp`, w: dims[0], h: dims[1], autoAdvanceMs: 0, hotspots: st.hotspot ? [st.hotspot] : [] });
  }
  for (const [i, f] of ['compare-raw', 'compare-finished'].entries()) {
    const r = RECIPES.find((x) => x.file === f);
    await upload(r.source);
    await applyState(r.state);
    files[`${IRIS.compare.id}/${i}.webp`] = Buffer.from(await exportWebp(), 'base64');
  }
  const manifests = {
    [IRIS.tour.id]: { v: 1, id: IRIS.tour.id, kind: 'tour', title: IRIS.tour.title, poster: null, tour: { steps } },
    [IRIS.compare.id]: { v: 1, id: IRIS.compare.id, kind: 'compare', title: IRIS.compare.title, poster: null, compare: {
      before: '0.webp', after: '1.webp', w: 1600, h: 1000, rect: { x: 0, y: 0, w: 1, h: 1 }, orientation: 'vertical', split: 0.42,
      labels: { enabled: true, before: 'Raw', after: 'Glint', position: 'top' }, divider: { color: '#ffffff', width: 3, handle: true } } }
  };
  for (const shot of [IRIS.tour, IRIS.compare]) {
    const vctx = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 });
    await vctx.route('**/api/share-manifest*', (r) => {
      const id = new URL(r.request().url()).searchParams.get('id');
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ manifest: manifests[id], base: `${BLOB}/shares/${id}/`, report: null }) });
    });
    await vctx.route(`${BLOB}/**`, (r) => {
      const buf = files[new URL(r.request().url()).pathname.replace('/shares/', '')];
      return buf ? r.fulfill({ body: buf, contentType: 'image/webp' }) : r.fulfill({ status: 404 });
    });
    const vp = await vctx.newPage();
    vp.on('pageerror', (e) => console.warn('[viewer]', e.message));
    await vp.goto(`${BASE}/s/${shot.id}`, { waitUntil: 'load' });
    await vp.waitForSelector('.sv-enter');
    await vp.evaluate(() => document.fonts.ready);
    await vp.waitForFunction(() => [...document.images].filter((i) => i.closest('#share-app')).every((i) => i.complete && i.naturalWidth));
    await vp.waitForTimeout(900);
    const png = await vp.screenshot();
    await vctx.close();
    const b64 = await page.evaluate(async ({ src, q }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', q).split(',')[1];
    }, { src: png.toString('base64'), q: QUALITY });
    save(shot.file, b64);
  }
}

await browser.close();
