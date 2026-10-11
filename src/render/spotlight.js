// v34 — Spotlight 2.0: any number of focus regions (rect / ellipse / rounded),
// dimmed with a tint and optionally blurred outside them, with soft edges.
// v1 drew one dark rectangle; a v1 block still renders (spotlightRegions
// upgrades it on the fly). Call sites are unchanged, so every composition path
// that drew the v1 spotlight draws this one.
import { state } from '../state/state.js';
import { spotlightRegions, traceRegion, regionBox } from './spotlight-geom.js';

let _blurOff = null;
let _dimOff = null;

// Reusable, cleared scratch canvas at w x h.
function scratch(c, w, h) {
  if (!c) c = document.createElement('canvas');
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.filter = 'none';
  x.clearRect(0, 0, w, h);
  return c;
}

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Cut every region out of canvas `c`, feathered when feather > 0.
function punchHoles(c, regions, feather) {
  const x = c.getContext('2d');
  x.save();
  x.globalCompositeOperation = 'destination-out';
  if (feather > 0) x.filter = `blur(${feather}px)`;
  x.fillStyle = '#000';
  for (const r of regions) { x.beginPath(); traceRegion(x, r, c.width, c.height); x.fill(); }
  x.restore();
}

export function drawSpotlight(ctx, canvas) {
  const sp = state.spotlight;
  if (!sp || !sp.enabled) return;
  const regions = spotlightRegions(sp);
  if (!regions.length) return;
  const cw = canvas.width, ch = canvas.height;
  const feather = Math.max(0, sp.feather || 0);

  // Blur outside the regions: blur a copy of what's drawn so far, cut the
  // regions out of it, and lay it back over the sharp original.
  if ((sp.blur || 0) > 0) {
    _blurOff = scratch(_blurOff, cw, ch);
    const b = _blurOff.getContext('2d');
    b.filter = `blur(${sp.blur}px)`;
    b.drawImage(canvas, 0, 0);
    b.filter = 'none';
    punchHoles(_blurOff, regions, feather);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(_blurOff, 0, 0);
    ctx.restore();
  }

  // Dim layer with the same holes.
  _dimOff = scratch(_dimOff, cw, ch);
  const d = _dimOff.getContext('2d');
  d.fillStyle = hexToRgba(sp.tint || '#000000', sp.opacity ?? 0.65);
  d.fillRect(0, 0, cw, ch);
  punchHoles(_dimOff, regions, feather);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(_dimOff, 0, 0);
  ctx.restore();
}

// Preview-only selection chrome (dashed outline + bottom-right resize handle).
// render() draws it after renderInto, so it never reaches an export.
export function drawSpotlightChrome(ctx, canvas) {
  const sp = state.spotlight;
  if (!sp || !sp.enabled || !Array.isArray(sp.regions)) return;
  const sel = state.canvasSelection.filter((s) => s.kind === 'spotlight');
  if (!sel.length) return;
  const cw = canvas.width, ch = canvas.height;
  const lw = Math.max(1.5, cw * 0.0015);
  const hs = Math.max(8, cw * 0.008);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const r of sp.regions) {
    if (!sel.some((s) => s.id === r.id)) continue;
    const b = regionBox(r, cw, ch);
    ctx.strokeStyle = '#0af';
    ctx.lineWidth = lw;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); traceRegion(ctx, r, cw, ch); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
    ctx.strokeRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
  }
  ctx.restore();
}
