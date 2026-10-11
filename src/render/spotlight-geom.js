// v34 — Spotlight 2.0 geometry. DOM-free so it can be checked in plain Node.
// Regions are stored as fractions of the canvas (0..1), like v1's single rect,
// so they stay put when the canvas is resized.

export const ROUNDED_FRAC = 0.18;   // 'rounded' corner radius, as a share of the short side
export const SHAPES = ['rect', 'ellipse', 'rounded'];

export function spotlightDefaults() {
  return { enabled: false, opacity: 0.65, blur: 0, feather: 0, tint: '#000000', shape: 'rect', regions: [] };
}

// Upgrade any spotlight block (v1 single rect, v34, or missing) to the v34
// shape. Returns a new object and never mutates the input.
export function upgradeSpotlight(sp) {
  const base = spotlightDefaults();
  if (!sp || typeof sp !== 'object') return base;
  if (Array.isArray(sp.regions)) {
    return { ...base, ...sp, regions: sp.regions.map((r) => ({ ...r })) };
  }
  const { x, y, w, h, ...rest } = sp;
  const regions = (w > 0 && h > 0) ? [{ id: 1, x, y, w, h, shape: 'rect' }] : [];
  return { ...base, ...rest, regions };
}

// Regions to draw. Tolerates a not-yet-upgraded v1 block, because collab,
// gallery, and template payloads are applied without normalizeProject().
export function spotlightRegions(sp) {
  if (!sp) return [];
  const list = Array.isArray(sp.regions) ? sp.regions : upgradeSpotlight(sp).regions;
  return list.filter((r) => r && r.w > 0 && r.h > 0);
}

export function regionBox(r, cw, ch) {
  return { x: r.x * cw, y: r.y * ch, w: r.w * cw, h: r.h * ch };
}

// Add the region's outline to the current path (caller does beginPath + fill).
export function traceRegion(ctx, r, cw, ch) {
  const b = regionBox(r, cw, ch);
  if (r.shape === 'ellipse') {
    ctx.moveTo(b.x + b.w, b.y + b.h / 2);
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  } else if (r.shape === 'rounded') {
    ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * ROUNDED_FRAC);
  } else {
    ctx.rect(b.x, b.y, b.w, b.h);
  }
}

// True when (x, y) is on the region's outline band. Only the edge counts, so a
// big focus area never blocks clicks on the objects inside it.
export function hitRegionEdge(r, cw, ch, x, y, pad = 10) {
  const b = regionBox(r, cw, ch);
  const inOuter = x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
  const inInner = x > b.x + pad && x < b.x + b.w - pad && y > b.y + pad && y < b.y + b.h - pad;
  return inOuter && !inInner;
}

// True when (x, y) is on the bottom-right resize handle.
export function hitRegionCorner(r, cw, ch, x, y, pad = 12) {
  const b = regionBox(r, cw, ch);
  return Math.abs(x - (b.x + b.w)) <= pad && Math.abs(y - (b.y + b.h)) <= pad;
}

// Normalize a dragged rectangle (canvas px, any corner order) into a region.
export function regionFromDrag(x0, y0, x1, y1, cw, ch, shape, id) {
  return {
    id, shape: SHAPES.includes(shape) ? shape : 'rect',
    x: Math.min(x0, x1) / cw, y: Math.min(y0, y1) / ch,
    w: Math.abs(x1 - x0) / cw, h: Math.abs(y1 - y0) / ch,
  };
}
