// v40 — Hindsight: a short name for one undo step, worked out by comparing two
// history snapshots (the state before the step and after it), so the existing
// saveStateToHistory() calls need no labels of their own. A caller that knows
// better passes saveStateToHistory('Label'). DOM-free (the tests import it).

const NAMES = {
  imageTransform: 'Rotate / flip', imageCrop: 'Crop', imageFilters: 'Filters', imageLayer: 'Image layer',
  textOverlay: 'Text', windowOverlay: 'Window', watermark: 'Watermark',
  gradient: 'Background', bgMode: 'Background', bgColor: 'Background', meshGradient: 'Background', pattern: 'Background',
  scene: 'Scene', padding: 'Padding', scale: 'Scale', borderRadius: 'Corners',
  showBorder: 'Border', borderWidth: 'Border', borderColor: 'Border',
  shadow: 'Shadow', reflection: 'Reflection', canvas: 'Canvas size', deviceFrame: 'Frame',
  annotations: 'Annotations', redactions: 'Redactions', extraImages: 'Images', spotlight: 'Spotlight',
  autoLayout: 'Layout', tilt3d: '3D tilt', mockup3d: '3D mockup', surface: 'Product mockup',
  animation: 'Animation', kenBurns: 'Ken Burns', timeline: 'Motion', glass: 'Glass', grain: 'Grain',
  colorPalettes: 'Palette', colorMap: 'Color map', codeSnippet: 'Code', tour: 'Tour', brand: 'Brand',
  bokeh: 'Bokeh', colorTools: 'Curves & Levels', modeFlip: 'Light / Dark', compare: 'Before / After', roll: 'Roll',
};

// Tool defaults change alongside the object they create; they are not a step.
const IGNORE = new Set(['annotationColor', 'annotationStrokeWidth', 'annotationFill', 'polygonSides',
  'starPoints', 'nextNumber', 'redactType', 'redactIntensity']);

const TYPE_NAMES = {
  arrow: 'arrow', rect: 'rectangle', circle: 'circle', line: 'line', triangle: 'triangle', polygon: 'polygon',
  star: 'star', pen: 'pen drawing', highlighter: 'highlight', number: 'number', text: 'text',
};

const LISTS = {
  annotations: { noun: (a) => TYPE_NAMES[a && a.type] || 'annotation', many: 'annotations' },
  redactions: { noun: () => 'redaction', many: 'redactions' },
  extraImages: { noun: () => 'image', many: 'images' },
};

const TEXT_MAX = 24;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const humanize = (k) => {
  const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const nameOf = (k) => NAMES[k] || humanize(k);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function listChange(key, before, after) {
  const spec = LISTS[key];
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  const idsOf = (list) => new Set(list.map((x) => x && x.id));
  if (b.length > a.length) {
    const n = b.length - a.length;
    if (n > 1) return `Added ${n} ${spec.many}`;
    const had = idsOf(a);
    return `Added ${spec.noun(b.find((x) => !had.has(x && x.id)) || b[b.length - 1])}`;
  }
  if (b.length < a.length) {
    const n = a.length - b.length;
    if (n > 1) return `Deleted ${n} ${spec.many}`;
    const has = idsOf(b);
    return `Deleted ${spec.noun(a.find((x) => !has.has(x && x.id)) || a[a.length - 1])}`;
  }
  const i = b.findIndex((x, j) => !same(x, a[j]));
  return `Edited ${spec.noun(b[Math.max(0, i)])}`;
}

const SPECIAL = {
  annotations: (a, b) => listChange('annotations', a, b),
  redactions: (a, b) => listChange('redactions', a, b),
  extraImages: (a, b) => listChange('extraImages', a, b),
  textOverlay(a, b) {
    a = a || {}; b = b || {};
    if ((a.content || '') === (b.content || '') || !b.content) return null;
    const t = String(b.content).replace(/\s+/g, ' ').trim();
    return `Text: "${t.length > TEXT_MAX ? t.slice(0, TEXT_MAX).trimEnd() + '…' : t}"`;
  },
  modeFlip(a, b) {
    a = a || {}; b = b || {};
    if (!a.enabled && b.enabled) return b.target === 'dark' || b.target === 'light' ? `Flipped to ${b.target}` : 'Light / Dark on';
    if (a.enabled && !b.enabled) return 'Light / Dark off';
    return null;
  },
  imageCrop(a, b) {
    if (!a && b) return 'Cropped';
    if (a && !b) return 'Removed crop';
    return null;
  },
  compare(a, b) {
    a = a || {}; b = b || {};
    if (!a.beforeSrc && b.beforeSrc) return 'Set Before image';
    if (a.beforeSrc && !b.beforeSrc) return 'Removed Before image';
    return null;
  },
};

export function describeChange(before, after) {
  if (!before || !after) return 'Edit';
  const keys = Object.keys(after).filter((k) => !IGNORE.has(k) && !same(before[k], after[k]));
  if (!keys.length) return 'Edit';
  if (keys.length === 1) {
    const k = keys[0];
    return (SPECIAL[k] && SPECIAL[k](before[k], after[k])) || nameOf(k);
  }
  const names = [...new Set(keys.map(nameOf))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${lower(names[1])}`;
  return `Changed ${names.length} settings`;
}
