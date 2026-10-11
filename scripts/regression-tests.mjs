import assert from 'node:assert/strict';
import fs from 'node:fs';

import fetchUrlHandler from '../api/fetch-url.js';
import { state } from '../src/state/state.js';
import { serializeFull, normalizeProject } from '../src/state/serialize.js';
import { normalizeCompare, wipeSplit, splitFromPoint, hitDivider, fitRect } from '../src/render/compare-core.js';
import { applyDesignToState } from '../src/features/document.js';

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
    assert.equal(payload.schemaVersion, 21);
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

const tests = [
  testFetchUrlRejectsPrivateHostsBeforeFetch,
  testFetchUrlUsesManualRedirects,
  testColorMapPersistsInProjects,
  testFailedProjectImageDecodeClearsPreviousImage,
  testGalleryTemplateApplySnapshotsHistory,
  testCompareMigratesAndPersists,
  testCompareGeometry
];

for (const test of tests) {
  await test();
  console.log(`ok ${test.name}`);
}
