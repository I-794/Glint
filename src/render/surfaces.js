// v27 — Surface Studio: physical & print mockups.
//
// Breaks Glint out of "screens only". The user's artwork (the graded
// source image) is wrapped onto real-world surfaces — t-shirt, mug, poster,
// framed print, business card, packaging box — with geometric warp + procedural
// lighting, all rendered on canvas so it BAKES into export exactly like the
// device-mockup path (see render.js). No asset packs: planar surfaces reuse the
// same subdivided-triangle warp idea as perspective.js, the mug uses a cylinder
// warp, and apparel uses a procedurally generated fabric-fold displacement so
// the print follows folds without bundling photos. A photographic base could be
// swapped in later behind the same drawSurfaceMockup() interface.
//
// Self-contained on purpose (local warp/rounded-rect helpers, reads only the
// passed args + light state), matching mockups.js.

export const SURFACE_TYPES = new Set([
  'tshirt', 'mug', 'poster', 'framedprint', 'businesscard', 'box'
]);

export function isSurfaceMockup(type) {
  return SURFACE_TYPES.has(type);
}

// Per-surface print substrate + artwork fit. Apparel prints onto the garment
// (transparent around the art so the fabric shows); paper goods print onto white
// and the art covers the face.
const SPEC = {
  tshirt:       { fit: 'contain', substrate: null,      printAR: 0.82 },
  mug:          { fit: 'contain', substrate: null,      printAR: 1.9  },
  poster:       { fit: 'cover',   substrate: '#ffffff', printAR: 0.7  },
  framedprint:  { fit: 'cover',   substrate: '#ffffff', printAR: 0.75 },
  businesscard: { fit: 'cover',   substrate: '#ffffff', printAR: 1.75 },
  box:          { fit: 'cover',   substrate: '#ffffff', printAR: 1.0  }
};

// Garment/material variants → base colour for the procedural body.
const VARIANTS = {
  white:    '#f4f5f7', black: '#1c1d21', navy: '#23304d', heather: '#9aa0aa',
  sand:     '#d9cfc0', forest: '#27433a', red: '#9e2b2b'
};
function variantColor(v) { return VARIANTS[v] || VARIANTS.white; }

// ── low-level warp ─────────────────────────────────────────────────────────

// Affine-map a source triangle onto a destination triangle, with a tiny outward
// bleed to hide hairline seams (same technique as perspective.js:tri).
function tri(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, d0, d1, d2) {
  const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (!den) return;
  const gx = (d0.x + d1.x + d2.x) / 3, gy = (d0.y + d1.y + d2.y) / 3;
  const push = (p) => {
    const dx = p.x - gx, dy = p.y - gy, len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * 0.6, y: p.y + (dy / len) * 0.6 };
  };
  const e0 = push(d0), e1 = push(d1), e2 = push(d2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.closePath();
  ctx.clip();
  const a = ((d1.x - d0.x) * (sy2 - sy0) - (d2.x - d0.x) * (sy1 - sy0)) / den;
  const c = ((d2.x - d0.x) * (sx1 - sx0) - (d1.x - d0.x) * (sx2 - sx0)) / den;
  const e = d0.x - a * sx0 - c * sy0;
  const b = ((d1.y - d0.y) * (sy2 - sy0) - (d2.y - d0.y) * (sy1 - sy0)) / den;
  const d = ((d2.y - d0.y) * (sx1 - sx0) - (d1.y - d0.y) * (sx2 - sx0)) / den;
  const f = d0.y - b * sx0 - d * sy0;
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// Warp a source canvas onto a parametric (u,v)→{x,y} surface via a subdivided
// triangle grid. `map(u,v)` returns destination coords; u,v ∈ [0,1].
function warpGrid(ctx, src, map, N) {
  const sw = src.width, sh = src.height;
  const pts = new Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++)
      pts[j * (N + 1) + i] = map(i / N, j / N);
  const P = (i, j) => pts[j * (N + 1) + i];
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const su = (i / N) * sw, sv = (j / N) * sh;
      const su2 = ((i + 1) / N) * sw, sv2 = ((j + 1) / N) * sh;
      const p00 = P(i, j), p10 = P(i + 1, j), p01 = P(i, j + 1), p11 = P(i + 1, j + 1);
      tri(ctx, src, su, sv, su2, sv, su, sv2, p00, p10, p01);
      tri(ctx, src, su2, sv, su2, sv2, su, sv2, p10, p11, p01);
    }
  }
  ctx.restore();
}

// Map the four corners of a unit square (bilinear) — for flat/planar faces.
function quadMap(tl, tr, br, bl) {
  return (u, v) => ({
    x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x,
    y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y
  });
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── shared building blocks ──────────────────────────────────────────────────

// Offscreen reused for the print texture (artwork placed into the print region).
let _printCanvas = null;
function printCanvas(w, h) {
  if (!_printCanvas) _printCanvas = document.createElement('canvas');
  _printCanvas.width = Math.max(1, Math.round(w));
  _printCanvas.height = Math.max(1, Math.round(h));
  return _printCanvas;
}

// Build the flat print texture: the artwork placed into a print-region of the
// given aspect ratio, honouring the user's scale/offset/rotation. `fit` is
// 'cover' (paper goods) or 'contain' (apparel/mug, art floats on the surface).
// `shadeKind` ('fold' | 'cylinder' | null) bakes curvature/fold shading into the
// art pixels via source-atop, so transparent margins stay clean (no grey box)
// and reveal the garment behind them.
function buildPrintTexture(art, spec, surface, shadeKind) {
  const RES = 1100;
  const pw = spec.printAR >= 1 ? RES : Math.round(RES * spec.printAR);
  const ph = spec.printAR >= 1 ? Math.round(RES / spec.printAR) : RES;
  const c = printCanvas(pw, ph);
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  if (spec.substrate) { ctx.fillStyle = spec.substrate; ctx.fillRect(0, 0, pw, ph); }

  const aw = art.width, ah = art.height;
  if (!aw || !ah) return c;
  const base = spec.fit === 'cover'
    ? Math.max(pw / aw, ph / ah)
    : Math.min(pw / aw, ph / ah) * 0.9;      // contain leaves a small print margin
  const s = base * (surface.scale || 1);
  const dw = aw * s, dh = ah * s;
  const cx = pw / 2 + (surface.offsetX || 0) * pw;
  const cy = ph / 2 + (surface.offsetY || 0) * ph;

  ctx.save();
  if (spec.fit === 'cover') { ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip(); }
  ctx.translate(cx, cy);
  if (surface.rotation) ctx.rotate((surface.rotation * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  // Shade only the printed pixels so the print reads as part of the material;
  // source-atop leaves the transparent margins untouched (garment shows through).
  const op = surface.shadingOpacity ?? 0.85;
  if (shadeKind && op > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = op;
    if (shadeKind === 'cylinder') {
      const g = ctx.createLinearGradient(0, 0, pw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.16, 'rgba(0,0,0,0.10)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.84, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, pw, ph);
    } else {
      for (let k = 0; k < 4; k++) {
        const fx = (0.2 + k * 0.2) * pw;
        const g = ctx.createLinearGradient(fx - pw * 0.08, 0, fx + pw * 0.08, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, `rgba(0,0,0,${0.10 + (k % 2) * 0.04})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(fx - pw * 0.08, 0, pw * 0.16, ph);
      }
      const vg = ctx.createRadialGradient(pw / 2, ph / 2, pw * 0.28, pw / 2, ph / 2, pw * 0.66);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, pw, ph);
    }
    ctx.restore();
  }
  return c;
}

// Soft elliptical contact shadow under a product.
function contactShadow(ctx, cx, cy, rw, rh) {
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rw, rh));
  g.addColorStop(0, 'rgba(0,0,0,0.30)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.translate(cx, cy);
  ctx.scale(1, rh / rw);
  ctx.beginPath();
  ctx.arc(0, 0, rw, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A calm studio backdrop so the product reads on any canvas size.
function studioBackground(ctx, W, H, dark) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (dark) { g.addColorStop(0, '#262a33'); g.addColorStop(1, '#15171c'); }
  else { g.addColorStop(0, '#f3f0ea'); g.addColorStop(1, '#dcd7cd'); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── surfaces ────────────────────────────────────────────────────────────────

// T-shirt (front view). Procedural garment silhouette sized to the canvas, the
// print warped over a gentle fold field. Print shading is baked into the art in
// buildPrintTexture (source-atop), so the transparent margins reveal the garment
// cleanly instead of a grey box.
function drawTshirt(ctx, W, H, print, surface) {
  const col = variantColor(surface.variant);
  const cx = W / 2;
  // Shirt sized to the smaller canvas dimension so it never goes boxy/huge.
  const sw = Math.min(W * 0.66, H * 0.60);   // shoulder-to-shoulder incl. sleeves
  const sh = sw * 1.16;
  const topY = (H - sh) / 2;
  // x offsets from centre
  const neck = sw * 0.13, shoulderX = sw * 0.30, sleeveX = sw * 0.50;
  const bodyX = sw * 0.345, hemX = sw * 0.325;
  // y positions
  const neckY = topY + sh * 0.02, shoulderY = topY + sh * 0.05;
  const sleeveTopY = topY + sh * 0.015, sleeveBotY = topY + sh * 0.30;
  const underarmY = topY + sh * 0.25, hemY = topY + sh;

  if (surface.shadow !== false) contactShadow(ctx, cx, hemY + 4, sw * 0.42, sh * 0.07);

  // Tee silhouette: neck → shoulder → sleeve → underarm → side → hem (mirrored).
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - neck, neckY);
  ctx.lineTo(cx - shoulderX, shoulderY);
  ctx.quadraticCurveTo(cx - sleeveX, sleeveTopY, cx - sleeveX * 0.94, sleeveBotY);          // rounded sleeve cap + tip
  ctx.quadraticCurveTo(cx - bodyX - sw * 0.04, underarmY + sh * 0.012, cx - bodyX, underarmY); // soft underarm
  ctx.lineTo(cx - hemX, hemY);
  ctx.quadraticCurveTo(cx, hemY + sh * 0.03, cx + hemX, hemY);
  ctx.lineTo(cx + bodyX, underarmY);
  ctx.quadraticCurveTo(cx + bodyX + sw * 0.04, underarmY + sh * 0.012, cx + sleeveX * 0.94, sleeveBotY);
  ctx.quadraticCurveTo(cx + sleeveX, sleeveTopY, cx + shoulderX, shoulderY);
  ctx.lineTo(cx + neck, neckY);
  ctx.quadraticCurveTo(cx, neckY + sh * 0.085, cx - neck, neckY); // collar dip
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(cx - sw * 0.5, 0, cx + sw * 0.5, 0);
  bodyGrad.addColorStop(0, shade(col, -0.16));
  bodyGrad.addColorStop(0.5, shade(col, 0.04));
  bodyGrad.addColorStop(1, shade(col, -0.16));
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.clip();
  fabricFolds(ctx, cx, topY, sw, sh);
  // ribbed collar
  ctx.lineWidth = Math.max(3, sh * 0.012);
  ctx.strokeStyle = shade(col, -0.26);
  ctx.beginPath();
  ctx.moveTo(cx - neck, neckY);
  ctx.quadraticCurveTo(cx, neckY + sh * 0.10, cx + neck, neckY);
  ctx.stroke();
  ctx.restore();

  // Chest print, gently bowed over the fabric.
  const pw = sw * 0.50, ph = pw / (print.width / print.height);
  const pcx = cx, pcy = topY + sh * 0.46;
  const fold = (u, v) => {
    const x = pcx + (u - 0.5) * pw;
    const drape = Math.sin((u - 0.5) * Math.PI) * pw * 0.04 * v;
    const y = pcy + (v - 0.5) * ph + Math.cos(u * Math.PI * 2) * ph * 0.01;
    return { x: x + drape, y };
  };
  warpGrid(ctx, print, fold, 22);
  return { x: pcx - pw / 2, y: pcy - ph / 2, w: pw, h: ph };
}

function fabricFolds(ctx, cx, top, sw, sh) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let k = -2; k <= 2; k++) {
    const x = cx + k * sw * 0.18;
    const g = ctx.createLinearGradient(x - sw * 0.05, 0, x + sw * 0.05, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - sw * 0.05, top, sw * 0.10, sh);
  }
  ctx.restore();
}

// Mug — print wrapped around a cylinder, ceramic body + handle.
function drawMug(ctx, W, H, print, surface) {
  const col = variantColor(surface.variant === 'white' ? 'white' : surface.variant);
  const bodyW = Math.min(W, H * 1.25) * 0.5;
  const bodyH = bodyW * 1.02;
  const cx = W / 2 - bodyW * 0.08, cy = H / 2;
  const left = cx - bodyW / 2, top = cy - bodyH / 2;
  if (surface.shadow !== false) contactShadow(ctx, cx, cy + bodyH / 2 + 4, bodyW * 0.62, bodyH * 0.1);

  // Handle (behind body).
  ctx.save();
  ctx.lineWidth = bodyW * 0.12;
  ctx.strokeStyle = shade(col, -0.12);
  ctx.beginPath();
  ctx.ellipse(left + bodyW + bodyW * 0.05, cy, bodyW * 0.2, bodyH * 0.26, 0, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.stroke();
  ctx.restore();

  // Body with cylindrical shading.
  ctx.save();
  rr(ctx, left, top, bodyW, bodyH, bodyW * 0.1);
  const bg = ctx.createLinearGradient(left, 0, left + bodyW, 0);
  bg.addColorStop(0, shade(col, -0.3));
  bg.addColorStop(0.22, shade(col, 0.08));
  bg.addColorStop(0.5, shade(col, 0.14));
  bg.addColorStop(0.8, shade(col, -0.08));
  bg.addColorStop(1, shade(col, -0.34));
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();

  // Wrap the print around the front ~150° of the cylinder.
  const arc = (150 * Math.PI) / 180;
  const R = bodyW / 2;
  const printH = bodyH * 0.62, printTop = cy - printH / 2;
  const wrap = (u, v) => {
    const theta = (u - 0.5) * arc;
    return { x: cx + Math.sin(theta) * R * 0.96, y: printTop + v * printH };
  };
  warpGrid(ctx, print, wrap, 28);

  // Rim highlight + inner top ellipse.
  ctx.fillStyle = shade(col, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, top + bodyW * 0.05, bodyW / 2, bodyW * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(col, -0.4);
  ctx.beginPath();
  ctx.ellipse(cx, top + bodyW * 0.05, bodyW * 0.42, bodyW * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return { x: cx - R * 0.7, y: printTop, w: R * 1.4, h: printH };
}

// Planar paper goods (poster / framed print / business card).
function drawPlanar(ctx, W, H, print, surface, type) {
  const margin = Math.min(W, H) * 0.12;
  const availW = W - margin * 2, availH = H - margin * 2;
  const ar = print.width / print.height;
  let w = availW, h = w / ar;
  if (h > availH) { h = availH; w = h * ar; }
  // a slight rightward perspective tilt for life
  const cx = W / 2, cy = H / 2;
  const tilt = type === 'businesscard' ? 0.0 : 0.06;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const tl = { x: x0, y: y0 + h * tilt * 0.5 };
  const tr = { x: x1, y: y0 };
  const br = { x: x1, y: y1 };
  const bl = { x: x0, y: y1 - h * tilt * 0.5 };

  if (type === 'framedprint') {
    const fw = Math.max(10, w * 0.05), mat = Math.max(10, w * 0.06);
    // drop shadow
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = w * 0.06; ctx.shadowOffsetY = h * 0.04;
    ctx.fillStyle = '#2a2622';
    rr(ctx, x0 - fw, y0 - fw, w + fw * 2, h + fw * 2, 6); ctx.fill();
    ctx.restore();
    // frame bevel
    const fg = ctx.createLinearGradient(x0 - fw, y0 - fw, x0, y0);
    fg.addColorStop(0, '#3a352e'); fg.addColorStop(1, '#1d1a16');
    ctx.fillStyle = fg; rr(ctx, x0 - fw, y0 - fw, w + fw * 2, h + fw * 2, 6); ctx.fill();
    // mat
    ctx.fillStyle = '#f7f5f0'; ctx.fillRect(x0, y0, w, h);
    // artwork inside the mat
    ctx.drawImage(print, x0 + mat, y0 + mat, w - mat * 2, h - mat * 2);
    glassGlare(ctx, x0, y0, w, h);
    return { x: x0 + mat, y: y0 + mat, w: w - mat * 2, h: h - mat * 2 };
  }

  if (type === 'businesscard') {
    // a pair: one flat, one angled behind for depth
    ctx.save();
    ctx.translate(cx + w * 0.18, cy - h * 0.34);
    ctx.rotate(-0.22);
    cardFace(ctx, -w / 2, -h / 2, w, h, print, true);
    ctx.restore();
    ctx.save();
    ctx.translate(cx - w * 0.16, cy + h * 0.18);
    ctx.rotate(0.05);
    const r = cardFace(ctx, -w / 2, -h / 2, w, h, print, false);
    ctx.restore();
    return r;
  }

  // poster on a wall: contact shadow + warped print + paper edge
  if (surface.shadow !== false) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = w * 0.05; ctx.shadowOffsetY = h * 0.03;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  warpGrid(ctx, print, quadMap(tl, tr, br, bl), 16);
  // subtle paper sheen
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
  ctx.clip();
  const sheen = ctx.createLinearGradient(x0, y0, x1, y1);
  sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = sheen; ctx.fillRect(x0, y0, w, h);
  ctx.restore();
  return { x: x0, y: y0, w, h };
}

function cardFace(ctx, x, y, w, h, print, dim) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = w * 0.05; ctx.shadowOffsetY = h * 0.06;
  ctx.fillStyle = '#ffffff';
  rr(ctx, x, y, w, h, Math.min(w, h) * 0.06); ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, Math.min(w, h) * 0.06); ctx.clip();
  const s = Math.max(w / print.width, h / print.height);
  ctx.drawImage(print, x + (w - print.width * s) / 2, y + (h - print.height * s) / 2, print.width * s, print.height * s);
  if (dim) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
  return { x, y, w, h };
}

// Packaging box — three visible faces sharing one isometric setup.
function drawBox(ctx, W, H, print, surface) {
  const s = Math.min(W, H) * 0.34;
  const cx = W / 2, cy = H / 2 + s * 0.1;
  const dx = s * 0.5, dy = s * 0.28;       // depth offset
  // corners
  const fTL = { x: cx - s / 2, y: cy - s / 2 };
  const fTR = { x: cx + s / 2, y: cy - s / 2 };
  const fBR = { x: cx + s / 2, y: cy + s / 2 };
  const fBL = { x: cx - s / 2, y: cy + s / 2 };
  const sTR = { x: fTR.x + dx, y: fTR.y - dy };
  const sBR = { x: fBR.x + dx, y: fBR.y - dy };
  const tTL = { x: fTL.x + dx, y: fTL.y - dy };

  if (surface.shadow !== false) contactShadow(ctx, cx + dx * 0.4, fBR.y + 8, s * 0.7, s * 0.12);

  // top face
  warpGrid(ctx, print, quadMap(tTL, sTR, fTR, fTL), 12);
  shadeFace(ctx, [tTL, sTR, fTR, fTL], 0.18);
  // side face
  warpGrid(ctx, print, quadMap(fTR, sTR, sBR, fBR), 12);
  shadeFace(ctx, [fTR, sTR, sBR, fBR], 0.34);
  // front face (full artwork)
  warpGrid(ctx, print, quadMap(fTL, fTR, fBR, fBL), 12);
  shadeFace(ctx, [fTL, fTR, fBR, fBL], 0.0);

  return { x: fTL.x, y: fTL.y, w: s, h: s };
}

function shadeFace(ctx, pts, amt) {
  if (!amt) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(0,0,0,${amt})`;
  ctx.fill();
  ctx.restore();
}

function glassGlare(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.4, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Lighten/darken a hex colour by ratio (-1..1).
function shade(hex, r) {
  const n = parseInt(hex.slice(1), 16);
  let R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * r)));
  R = f(R); G = f(G); B = f(B);
  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

// ── entry ───────────────────────────────────────────────────────────────────

// Composite the full surface mockup into destCtx (canvas-sized). Returns
// { rect } — the print region bbox in canvas coords — for state.lastImageRect.
export function drawSurfaceMockup(destCtx, canvas, art, surface) {
  const W = canvas.width, H = canvas.height;
  const type = surface.type;
  const spec = SPEC[type] || SPEC.poster;
  const dark = type === 'tshirt' || type === 'mug' || type === 'box';
  studioBackground(destCtx, W, H, dark);
  if (!art || !art.width) return { rect: null };

  const shadeKind = type === 'tshirt' ? 'fold' : type === 'mug' ? 'cylinder' : null;
  const print = buildPrintTexture(art, spec, surface, shadeKind);
  let rect;
  switch (type) {
    case 'tshirt': rect = drawTshirt(destCtx, W, H, print, surface); break;
    case 'mug': rect = drawMug(destCtx, W, H, print, surface); break;
    case 'box': rect = drawBox(destCtx, W, H, print, surface); break;
    case 'framedprint':
    case 'businesscard':
    case 'poster':
    default: rect = drawPlanar(destCtx, W, H, print, surface, type); break;
  }
  return { rect };
}
