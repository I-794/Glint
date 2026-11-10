// v42 — Junction: print-ready PDF. DOM-free page geometry, shared by
// features/print-pdf.js and the tests. Everything is in millimetres.
//
// A printed page has three boxes. The TRIM box is the finished size after
// cutting. The BLEED box is the trim plus a few millimetres on every side that
// the picture runs into, so a slightly off cut never shows white paper. The
// PAGE (the PDF page) is larger again when crop marks are on, to make room for
// the short lines that show the printer where to cut.

export const PAPERS = {
  a3: { label: 'A3', w: 297, h: 420 },
  a4: { label: 'A4', w: 210, h: 297 },
  a5: { label: 'A5', w: 148, h: 210 },
  letter: { label: 'US Letter', w: 215.9, h: 279.4 },
  tabloid: { label: 'Tabloid', w: 279.4, h: 431.8 },
  card: { label: 'Business card', w: 50.8, h: 88.9 },
  poster: { label: 'Poster 18 x 24 in', w: 457.2, h: 609.6 },
  custom: { label: 'Custom', w: 210, h: 297 },
};

const MARK_LEN = 5;      // length of a crop mark
const MARK_GAP = 1;      // clear space between the bleed edge and a mark
const MM_PER_INCH = 25.4;

export function printDefaults() {
  return {
    paper: 'a4', customW: 210, customH: 297, orientation: 'auto',
    fit: 'fit', margin: 10, bleed: 3, marks: true,
    scope: 'page', quality: 'jpeg', upscale: 1,
  };
}

function num(v, lo, hi, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, n)) : fallback;
}

export function normalizePrint(p) {
  const d = printDefaults();
  const src = p && typeof p === 'object' ? p : {};
  return {
    paper: Object.prototype.hasOwnProperty.call(PAPERS, src.paper) ? src.paper : d.paper,
    customW: num(src.customW, 20, 2000, d.customW),
    customH: num(src.customH, 20, 2000, d.customH),
    orientation: ['auto', 'portrait', 'landscape'].includes(src.orientation) ? src.orientation : d.orientation,
    fit: src.fit === 'fill' ? 'fill' : 'fit',
    margin: num(src.margin, 0, 50, d.margin),
    bleed: num(src.bleed, 0, 10, d.bleed),
    marks: src.marks !== false,
    scope: src.scope === 'all' ? 'all' : 'page',
    quality: src.quality === 'png' ? 'png' : 'jpeg',
    upscale: [1, 2, 3].includes(Number(src.upscale)) ? Number(src.upscale) : 1,
  };
}

// The finished (trim) size for these settings and an image of imgW x imgH.
// 'auto' turns the paper to match the picture.
export function trimSize(opts, imgW, imgH) {
  const o = normalizePrint(opts);
  const base = o.paper === 'custom' ? { w: o.customW, h: o.customH } : PAPERS[o.paper];
  const short = Math.min(base.w, base.h), long = Math.max(base.w, base.h);
  const landscape = o.orientation === 'landscape' || (o.orientation === 'auto' && imgW > imgH);
  return landscape ? { w: long, h: short } : { w: short, h: long };
}

// Where everything goes on the PDF page.
//   page   { w, h }          the PDF page
//   trim   { x, y, w, h }    the finished size
//   bleed  { x, y, w, h }    trim plus the bleed
//   image  { x, y, w, h }    where the picture is placed
//   source { sx, sy, sw, sh } the part of the picture that is used (pixels);
//                             Fill crops it to the shape of the bleed box
//   marks  [{ x1, y1, x2, y2 }]  eight crop marks, outside the bleed
//   dpi    the picture's resolution at this size
export function layoutPrint(opts, imgW, imgH) {
  const o = normalizePrint(opts);
  const w = Math.max(1, Number(imgW) || 1), h = Math.max(1, Number(imgH) || 1);
  const t = trimSize(o, w, h);
  const slug = o.marks ? o.bleed + MARK_GAP + MARK_LEN + 1 : o.bleed;
  const page = { w: t.w + slug * 2, h: t.h + slug * 2 };
  const trim = { x: slug, y: slug, w: t.w, h: t.h };
  const bleed = { x: slug - o.bleed, y: slug - o.bleed, w: t.w + o.bleed * 2, h: t.h + o.bleed * 2 };

  let image, source;
  if (o.fit === 'fill') {
    // Cover the bleed box; the overflow on the long side is cropped off.
    const boxRatio = bleed.w / bleed.h, imgRatio = w / h;
    let sw = w, sh = h;
    if (imgRatio > boxRatio) sw = h * boxRatio; else sh = w / boxRatio;
    source = { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
    image = { ...bleed };
  } else {
    // Sit inside the trim with a margin, whole and centred.
    const m = Math.min(o.margin, Math.min(t.w, t.h) / 2 - 1);
    const boxW = t.w - m * 2, boxH = t.h - m * 2;
    const s = Math.min(boxW / w, boxH / h);
    const iw = w * s, ih = h * s;
    image = { x: trim.x + (t.w - iw) / 2, y: trim.y + (t.h - ih) / 2, w: iw, h: ih };
    source = { sx: 0, sy: 0, sw: w, sh: h };
  }

  const marks = [];
  if (o.marks) {
    const off = o.bleed + MARK_GAP;
    const xs = [trim.x, trim.x + trim.w], ys = [trim.y, trim.y + trim.h];
    for (const y of ys) {
      marks.push({ x1: xs[0] - off - MARK_LEN, y1: y, x2: xs[0] - off, y2: y });
      marks.push({ x1: xs[1] + off, y1: y, x2: xs[1] + off + MARK_LEN, y2: y });
    }
    for (const x of xs) {
      marks.push({ x1: x, y1: ys[0] - off - MARK_LEN, x2: x, y2: ys[0] - off });
      marks.push({ x1: x, y1: ys[1] + off, x2: x, y2: ys[1] + off + MARK_LEN });
    }
  }

  return { page, trim, bleed, image, source, marks, dpi: effectiveDpi(source.sw, image.w) };
}

// Pixels per inch when `pixels` are printed `mm` wide.
export function effectiveDpi(pixels, mm) {
  if (!(pixels > 0) || !(mm > 0)) return 0;
  return pixels / (mm / MM_PER_INCH);
}

// 300 is the usual target for print held in the hand; under 150 looks soft.
export function dpiVerdict(dpi) {
  if (dpi >= 300) return 'sharp';
  if (dpi >= 150) return 'ok';
  return 'soft';
}
