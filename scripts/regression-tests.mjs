import assert from 'node:assert/strict';
import fs from 'node:fs';

import fetchUrlHandler from '../api/fetch-url.js';
import { state } from '../src/state/state.js';
import { serializeFull, normalizeProject } from '../src/state/serialize.js';
import { normalizeCompare, wipeSplit, splitFromPoint, hitDivider, fitRect } from '../src/render/compare-core.js';
import { applyDesignToState } from '../src/features/document.js';
import { migrateLocalStorage, MIGRATED_FLAG } from '../src/state/brand-migrate.js';
import { normalizeCrop, cropRect, cropKey } from '../src/render/crop-core.js';
import { colorToolsDefaults, normalizeColorTools, isIdentity, curveLut, levelsLut, channelLuts, applyLuts, encodeLook, decodeLook, lookToJson, STARTER_LOOKS } from '../src/render/curves-core.js';
import { classifyAspect, smartFrameFor, fileName, parseSizes, captureOverrideFields, diffOverrides, applyOverrides, normalizeRoll } from '../src/render/roll-core.js';
import { normalizeModeFlip, resolveTarget, srgbToOklab, oklabToSrgb, flipLightness, detectMode, photoMask, buildLut3d, applyFlip, flipColorHex, sceneFlip } from '../src/render/mode-flip-core.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; }
  };
}

async function testFetchUrlRejectsPrivateHostsBeforeFetch() {
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCalled = true;
    return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    const res = mockRes();
    await fetchUrlHandler({ method: 'GET', query: { url: 'http://127.0.0.1/secret.png' } }, res);
    assert.equal(fetchCalled, false, 'private URL must be rejected before fetch()');
    assert.equal(res.statusCode, 422);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testFetchUrlUsesManualRedirects() {
  let redirectMode = null;
  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) => {
    redirectMode = options.redirect;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' }
    });
  };
  try {
    const res = mockRes();
    await fetchUrlHandler({ method: 'GET', query: { url: 'http://93.184.216.34/image.png' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(redirectMode, 'manual', 'media proxy must validate redirects before following them');
  } finally {
    global.fetch = originalFetch;
  }
}

function testColorMapPersistsInProjects() {
  state.image = null;
  state.colorMap = { mode: 'gradient', intensity: 73, steps: 5 };
  state.colorPalettes = {
    active: 'pal_test',
    library: { pal_test: { name: 'Test', swatches: ['#000000', '#ffffff'] } }
  };

  const payload = serializeFull();
  assert.deepEqual(payload.design.colorMap, state.colorMap);
  assert.deepEqual(payload.design.colorPalettes, state.colorPalettes);
}

async function testFailedProjectImageDecodeClearsPreviousImage() {
  const originalImage = global.Image;
  state.image = { stale: true };

  class FailingImage {
    set src(_value) {
      queueMicrotask(() => this.onerror && this.onerror(new Error('decode failed')));
    }
  }
  global.Image = FailingImage;

  try {
    await applyDesignToState({ schemaVersion: 19, design: {}, image: 'data:image/png;base64,bad' });
    assert.equal(state.image, null, 'failed project image decode must not leave the previous image active');
  } finally {
    global.Image = originalImage;
  }
}

function testGalleryTemplateApplySnapshotsHistory() {
  const source = fs.readFileSync('src/features/gallery.js', 'utf8');
  assert.match(source, /import\s+\{\s*saveStateToHistory\s*\}\s+from\s+['"]\.\.\/state\/history\.js['"]/);
  assert.match(
    source,
    /else\s*\{[\s\S]*saveStateToHistory\(\);[\s\S]*Object\.assign\(state,\s*data\.payload\)/,
    'gallery template apply should snapshot before mutating state'
  );
}

// v35 — Before / After Compare: migration + geometry.
function testCompareMigratesAndPersists() {
  // A pre-v35 design gets a full default block (no Before image leaks in).
  const old = normalizeProject({ schemaVersion: 20, design: { bgColor: '#000000' }, image: null });
  assert.equal(old.design.compare.enabled, false);
  assert.equal(old.design.compare.beforeSrc, null);
  assert.equal(old.design.compare.split, 0.5);

  // Bad values are repaired; good ones survive.
  const fixed = normalizeCompare({ enabled: true, beforeSrc: 'data:x', split: 7, orientation: 'diagonal', fit: 'contain',
    labels: { before: 'v1', position: 'side' }, divider: { width: 99 } });
  assert.equal(fixed.split, 1);
  assert.equal(fixed.orientation, 'vertical');
  assert.equal(fixed.fit, 'contain');
  assert.equal(fixed.labels.before, 'v1');
  assert.equal(fixed.labels.after, 'After');
  assert.equal(fixed.labels.position, 'top');
  assert.equal(fixed.divider.width, 12);

  // It round-trips through a saved project.
  const saved = state.compare;
  try {
    state.compare = normalizeCompare({ enabled: true, beforeSrc: 'data:image/png;base64,AAAA', split: 0.3, orientation: 'horizontal' });
    const payload = serializeFull();
    const back = normalizeProject(payload).design.compare;
    assert.equal(back.beforeSrc, 'data:image/png;base64,AAAA');
    assert.equal(back.split, 0.3);
    assert.equal(back.orientation, 'horizontal');
    assert.equal(payload.schemaVersion, 24);
  } finally {
    state.compare = saved;
  }
}

function testCompareGeometry() {
  assert.equal(wipeSplit(0), 1);
  assert.equal(wipeSplit(1), 0);
  assert.ok(Math.abs(wipeSplit(0.5) - 0.5) < 1e-9);
  const rect = { x: 100, y: 50, w: 400, h: 200 };
  assert.equal(splitFromPoint(rect, 200, 0, 'vertical'), 0.25);
  assert.equal(splitFromPoint(rect, 0, 150, 'horizontal'), 0.5);
  assert.equal(splitFromPoint(rect, 9999, 0, 'vertical'), 1);
  assert.ok(hitDivider(rect, 0.5, 'vertical', 305, 120, 10));
  assert.ok(!hitDivider(rect, 0.5, 'vertical', 330, 120, 10));
  assert.ok(!hitDivider(rect, 0.5, 'vertical', 300, 400, 10));   // outside the image
  const cover = fitRect(100, 100, 400, 200, 'cover');
  assert.deepEqual(cover, { x: 0, y: -100, w: 400, h: 400 });
  const contain = fitRect(100, 100, 400, 200, 'contain');
  assert.deepEqual(contain, { x: 100, y: 0, w: 200, h: 200 });
}

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

// v37 — Exposure: Roll logic.
function testRollAspectAndSmartFit() {
  assert.equal(classifyAspect(1170, 2532), 'phone');
  assert.equal(classifyAspect(2048, 2732), 'tablet');
  assert.equal(classifyAspect(1920, 1080), 'wide');
  assert.equal(classifyAspect(0, 0), 'wide');
  const fit = { enabled: true, phone: 'iphone16pro', tablet: 'ipadpro', wide: 'chrome' };
  assert.equal(smartFrameFor({ w: 1170, h: 2532 }, fit), 'iphone16pro');
  assert.equal(smartFrameFor({ w: 1920, h: 1080 }, fit), 'chrome');
  assert.equal(smartFrameFor({ w: 1920, h: 1080 }, { ...fit, enabled: false }), undefined);
  assert.equal(smartFrameFor({ w: 1920, h: 1080 }, fit, { mockup3d: true }), undefined, '3D owns the frame');
  assert.equal(smartFrameFor({ w: 1920, h: 1080, overrides: { 'deviceFrame.type': 'safari' } }, fit), undefined,
    'a shot that picks its own frame wins');
}

function testRollFileNamesAndSizes() {
  assert.equal(fileName('{n}-{name}-{size}', { n: 3, name: 'Home Screen.png', size: { label: 'canvas' } }), '03-Home-Screen-canvas.png');
  assert.equal(fileName('{name}_{size}', { n: 1, name: 'a', size: { width: 1080, height: 1920 }, ext: 'webp' }), 'a_1080x1920.webp');
  assert.equal(fileName('', { n: 12, name: '', size: null, pad: 3 }), '012-shot-canvas.png');
  assert.deepEqual(parseSizes('1080x1920, canvas, junk'), [
    { label: '1080x1920', width: 1080, height: 1920 }, { label: 'canvas' }]);
  assert.deepEqual(parseSizes(''), [{ label: 'canvas' }]);
  // v39 — {mode}: filled when present, appended when a mode is given without it.
  assert.equal(fileName('{n}-{mode}', { n: 1, name: 'a', size: null, mode: 'dark' }), '01-dark.png');
  assert.equal(fileName('{n}-{name}', { n: 1, name: 'a', size: null, mode: 'light' }), '01-a-light.png');
  assert.equal(fileName('{n}-{name}', { n: 1, name: 'a', size: null }), '01-a.png', 'no mode, no suffix');
}

function testRollOverrides() {
  const roll = { textOverlay: { enabled: true, content: 'Roll caption', size: 48 }, annotations: [], redactions: [],
    imageTransform: { rotation: 0 }, compare: { enabled: false, beforeSrc: null }, deviceFrame: { type: 'chrome' } };
  const base = captureOverrideFields(roll);
  const edited = JSON.parse(JSON.stringify(roll));
  edited.textOverlay.content = 'Shot caption';
  edited.textOverlay.size = 99; // not an override field: ignored
  const diff = diffOverrides(base, captureOverrideFields(edited));
  assert.deepEqual(diff, { 'textOverlay.content': 'Shot caption' });
  const target = JSON.parse(JSON.stringify(roll));
  applyOverrides(target, { ...diff, 'not.a.field': 1 });
  assert.equal(target.textOverlay.content, 'Shot caption');
  assert.equal(target.textOverlay.size, 48);
  assert.equal(target.not, undefined);
}

function testRollMigratesAndPersists() {
  const old = normalizeProject({ schemaVersion: 21, design: { bgColor: '#000000' }, image: null });
  assert.deepEqual(old.design.roll.shots, [], 'a v36 design gets an empty roll');
  const fixed = normalizeRoll({ shots: [{ id: 'a', src: 'data:image/jpeg;base64,AA', w: 10, h: 20 }, { id: 'b' }, null],
    smartFit: { phone: 'not-a-frame' }, activeShot: 'a' });
  assert.equal(fixed.shots.length, 1, 'shots without image data are dropped');
  assert.equal(fixed.smartFit.phone, 'iphone16pro');
  assert.equal(fixed.activeShot, null);
  const saved = state.roll;
  try {
    state.roll = normalizeRoll({ shots: [{ id: 's1', name: 'x.png', src: 'data:image/jpeg;base64,AA', w: 1, h: 2,
      overrides: { 'textOverlay.content': 'hi' } }], naming: '{name}', activeShot: 's1' });
    const payload = serializeFull();
    assert.equal(payload.schemaVersion, 24);
    const back = normalizeProject(payload).design.roll;
    assert.equal(back.shots[0].overrides['textOverlay.content'], 'hi');
    assert.equal(back.naming, '{name}');
    assert.equal(back.activeShot, null);
  } finally {
    state.roll = saved;
  }
}

// v37 — non-destructive crop.
function testCropNormalizeAndPersist() {
  assert.equal(normalizeCrop(null), null);
  assert.equal(normalizeCrop({ x: 0, y: 0, w: 1, h: 1, angle: 0 }), null, 'a full-frame crop is no crop');
  const c = normalizeCrop({ x: 0.9, y: -1, w: 5, h: 0.5, angle: 90 });
  assert.equal(c.x, 0.9);
  assert.equal(c.y, 0);
  assert.equal(Math.round(c.w * 100), 10, 'width is clamped to the image');
  assert.equal(c.angle, 45);
  assert.deepEqual(cropRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25, angle: 0 }, 800, 400), { sx: 200, sy: 200, sw: 400, sh: 100, angle: 0 });
  assert.equal(cropKey({ x: 0, y: 0, w: 1, h: 1 }), '');
  const old = normalizeProject({ schemaVersion: 21, design: { bgColor: '#000000' }, image: null });
  assert.equal(old.design.imageCrop, null, 'a pre-v37 design gets no crop');
  const saved = state.imageCrop;
  try {
    state.imageCrop = { x: 0.1, y: 0.2, w: 0.5, h: 0.5, angle: 2 };
    const back = normalizeProject(serializeFull()).design.imageCrop;
    assert.deepEqual(back, { x: 0.1, y: 0.2, w: 0.5, h: 0.5, angle: 2 });
  } finally {
    state.imageCrop = saved;
  }
}

// v38 — curves + levels.
function testColorToolsLuts() {
  const id = curveLut([[0, 0], [255, 255]]);
  for (let x = 0; x < 256; x++) assert.equal(id[x], x, 'identity curve is an identity table');
  assert.ok(isIdentity(colorToolsDefaults()));
  const s = curveLut([[0, 0], [64, 40], [192, 220], [255, 255]]);
  for (let x = 1; x < 256; x++) assert.ok(s[x] >= s[x - 1], 'an S-curve never goes down');
  assert.equal(s[0], 0);
  assert.equal(s[255], 255);
  assert.equal(s[64], 40, 'the curve passes through its points');
  const lv = levelsLut({ black: 20, white: 200, gamma: 1 });
  assert.equal(lv[20], 0);
  assert.equal(lv[10], 0, 'below the black point clips to black');
  assert.equal(lv[200], 255);
  assert.equal(lv[230], 255);
  const bright = levelsLut({ black: 0, white: 255, gamma: 2 });
  assert.ok(bright[128] > 128, 'gamma above 1 brightens the midtones');
  const ct = colorToolsDefaults();
  ct.curves.r = [[0, 0], [255, 128]];
  const [lr, lg, lb] = channelLuts(ct);
  const px = new Uint8ClampedArray([255, 255, 255, 77]);
  applyLuts(px, lr, lg, lb);
  assert.deepEqual([...px], [128, 255, 255, 77], 'only red changes and alpha is untouched');
  const fixed = normalizeColorTools({ curves: { rgb: [[300, -5], [128, 'x'], [128, 100], [128, 140]] }, levels: { g: { black: 250, white: 10, gamma: 99 } } });
  assert.deepEqual(fixed.curves.rgb, [[0, 0], [128, 140], [255, 0]], 'points are clamped, de-duplicated and the end points pinned');
  assert.deepEqual(fixed.levels.g, { black: 250, white: 252, gamma: 5 });
}

function testLooksAndColorToolsPersist() {
  const look = { name: 'Night été', imageFilters: { saturation: 80 }, colorTools: { curves: { b: [[0, 30], [255, 255]] } } };
  const back = decodeLook(encodeLook(look));
  assert.equal(back.name, 'Night été');
  assert.equal(back.imageFilters.saturation, 80);
  assert.equal(back.imageFilters.brightness, 100, 'missing filters get defaults');
  assert.deepEqual(back.colorTools.curves.b, [[0, 30], [255, 255]]);
  assert.deepEqual(decodeLook(lookToJson(look)), back, 'the file form decodes the same');
  assert.equal(decodeLook('glint-look:not base64!!'), null);
  assert.equal(decodeLook('{"type":"other"}'), null);
  assert.equal(decodeLook(''), null);
  assert.ok(STARTER_LOOKS.every(l => !isIdentity(l.colorTools)), 'every starter look changes the image');
  const old = normalizeProject({ schemaVersion: 22, design: { bgColor: '#000000' }, image: null });
  assert.ok(isIdentity(old.design.colorTools), 'a pre-v38 design gets identity curves');
  const saved = state.colorTools;
  try {
    state.colorTools = normalizeColorTools({ curves: { rgb: [[0, 10], [255, 245]] }, levels: { r: { gamma: 1.5 } } });
    const payload = serializeFull();
    assert.equal(payload.schemaVersion, 24);
    const design = normalizeProject(payload).design;
    assert.deepEqual(design.colorTools.curves.rgb, [[0, 10], [255, 245]]);
    assert.equal(design.colorTools.levels.r.gamma, 1.5);
  } finally {
    state.colorTools = saved;
  }
}

function flat(w, h, rgb) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; }
  return d;
}

function testModeFlipCore() {
  // OKLab round trip stays within one step.
  for (const c of [[0, 0, 0], [255, 255, 255], [37, 99, 235], [239, 68, 68], [18, 18, 18], [250, 204, 21]]) {
    const back = oklabToSrgb(...srgbToOklab(...c));
    back.forEach((v, i) => assert.ok(Math.abs(v - c[i]) <= 1, `round trip ${c} -> ${back}`));
  }
  // Dark: white becomes the surface level, black becomes soft ink; light is the inverse.
  assert.ok(Math.abs(flipLightness(1, 'dark', 20) - 0.20) < 1e-9);
  assert.ok(Math.abs(flipLightness(0, 'dark', 20) - 0.93) < 1e-9);
  assert.ok(Math.abs(flipLightness(flipLightness(0.7, 'dark', 20), 'light', 20) - 0.7) < 1e-9);
  const lut = buildLut3d('dark', 20, 60);
  const px = (rgb, l = lut, protect = 60) => [...applyFlip(flat(1, 1, rgb), l, null, protect).slice(0, 3)];
  const white = px([255, 255, 255]);
  assert.ok(white.every(v => v > 12 && v < 40), `white goes to a dark surface, got ${white}`);
  assert.ok(px([0, 0, 0]).every(v => v > 215), 'black text goes light');
  // A saturated brand color keeps its lightness at protect 100, and flips at protect 0.
  // (A bright yellow, since mid-lightness colors barely move under the flip.)
  const yellowL = srgbToOklab(250, 204, 21)[0];
  const kept = srgbToOklab(...px([250, 204, 21], buildLut3d('dark', 20, 100)))[0];
  const flipped = srgbToOklab(...px([250, 204, 21], buildLut3d('dark', 20, 0)))[0];
  assert.ok(Math.abs(kept - yellowL) < 0.03, 'protected yellow keeps its lightness');
  assert.ok(flipped < yellowL - 0.3, 'unprotected yellow flips dark');
  // Detection and targets: a matching target is a no-op.
  assert.equal(detectMode(flat(40, 40, [250, 250, 250]), 40, 40), 'light');
  assert.equal(detectMode(flat(40, 40, [20, 20, 24]), 40, 40), 'dark');
  assert.equal(resolveTarget('auto', 'light'), 'dark');
  assert.equal(resolveTarget('auto', 'dark'), 'light');
  assert.equal(resolveTarget('dark', 'dark'), null);
  assert.equal(resolveTarget('light', 'dark'), 'light');
  // Photo mask: a noisy tile is kept, a flat one is not.
  // Tiles, left to right: a busy photo, a smooth photo (sky: few colors but
  // noisy), flat white, and white with a dark glyph (an interface text tile).
  const w = 64, h = 16, d = flat(w, h, [255, 255, 255]);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed >> 7) & 255; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * w + x) * 4;
      d[i] = rand(); d[i + 1] = rand(); d[i + 2] = rand();
      const j = (y * w + x + 16) * 4;
      d[j] = 120 + (rand() % 3); d[j + 1] = 170 + (rand() % 3); d[j + 2] = 230 + (rand() % 3);
    }
    for (let x = 52; x < 56; x++) { const k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = 30; }
  }
  const mask = photoMask(d, w, h);
  assert.equal(mask[8 * w + 8], 255, 'busy photo pixel is kept');
  assert.equal(mask[8 * w + 24], 255, 'smooth photo pixel is kept');
  assert.equal(mask[8 * w + 40], 0, 'flat interface pixel flips');
  assert.equal(mask[8 * w + 53], 0, 'interface text pixel flips');
  const out = applyFlip(new Uint8ClampedArray(d), lut, mask, 100);
  assert.equal(out[(8 * w + 8) * 4], d[(8 * w + 8) * 4], 'photo pixel unchanged at protect 100');
  assert.ok(out[(8 * w + 40) * 4] < 60, 'interface pixel flipped');
  // Scene colors keep hue; colors already on the target side stay.
  assert.equal(flipColorHex('#1a1a2e', 'dark'), '#1a1a2e');
  assert.equal(flipColorHex('not a color', 'dark'), 'not a color');
  const hueOf = (hex) => { const [, a, b] = srgbToOklab(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)); return Math.atan2(b, a); };
  const lilac = '#c8b6ff', darkLilac = flipColorHex(lilac, 'dark');
  assert.ok(Math.abs(hueOf(lilac) - hueOf(darkLilac)) < 0.15, `hue kept: ${lilac} -> ${darkLilac}`);
  const scene = sceneFlip({ bgMode: 'solid', bgColor: '#ffffff', deviceFrame: { type: 'chrome', color: 'silver' }, textOverlay: { color: '#111111' } }, 'dark');
  assert.ok(srgbToOklab(...[1, 3, 5].map(i => parseInt(scene.bgColor.slice(i, i + 2), 16)))[0] < 0.3, 'solid background goes dark');
  assert.equal(scene.deviceFrame.color, 'dark');
  assert.ok(srgbToOklab(...[1, 3, 5].map(i => parseInt(scene.textOverlay.color.slice(i, i + 2), 16)))[0] > 0.8, 'caption goes light');
  // Normalize repairs junk.
  assert.deepEqual(normalizeModeFlip({ enabled: 'yes', target: 'sideways', surface: 99, protect: -5 }),
    { enabled: false, target: 'auto', surface: 36, protect: 0 });
}

function testModeFlipMigratesAndPersists() {
  const old = normalizeProject({ schemaVersion: 23, design: { bgColor: '#000000' }, image: null });
  assert.deepEqual(old.design.modeFlip, normalizeModeFlip(null), 'a pre-v39 design gets the flip off');
  assert.equal(normalizeRoll({}).modes, 'as-set');
  assert.equal(normalizeRoll({ modes: 'both' }).modes, 'both');
  const saved = state.modeFlip;
  try {
    state.modeFlip = normalizeModeFlip({ enabled: true, target: 'dark', surface: 24, protect: 80 });
    const payload = serializeFull();
    assert.equal(payload.schemaVersion, 24);
    assert.deepEqual(normalizeProject(payload).design.modeFlip, { enabled: true, target: 'dark', surface: 24, protect: 80 });
  } finally {
    state.modeFlip = saved;
  }
}

const tests = [
  testFetchUrlRejectsPrivateHostsBeforeFetch,
  testFetchUrlUsesManualRedirects,
  testColorMapPersistsInProjects,
  testFailedProjectImageDecodeClearsPreviousImage,
  testGalleryTemplateApplySnapshotsHistory,
  testCompareMigratesAndPersists,
  testCompareGeometry,
  testBrandMigrateCopiesOnce,
  testBrandMigrateMovesWhenQuotaIsFull,
  testRollAspectAndSmartFit,
  testRollFileNamesAndSizes,
  testRollOverrides,
  testRollMigratesAndPersists,
  testCropNormalizeAndPersist,
  testColorToolsLuts,
  testLooksAndColorToolsPersist,
  testModeFlipCore,
  testModeFlipMigratesAndPersists
];

for (const test of tests) {
  await test();
  console.log(`ok ${test.name}`);
}
