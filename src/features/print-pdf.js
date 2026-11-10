// v42 — Junction: print-ready PDF. Places the design on a real paper size
// with bleed and crop marks (geometry in render/print-core.js) and writes it
// with jsPDF. Sidebar section #print-section (Export group, Pro only).
//
// What it is not: the PDF is RGB, not CMYK, and it carries the design's own
// pixels. Rendering the design at a larger size would re-lay it out (padding
// and frame insets are in pixels), so extra resolution comes from the same
// smooth upscale the export presets use, and the panel shows the real dpi.
import { state } from '../state/state.js';
import { renderInto } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { upscaleCanvas } from './export-presets.js';
import { eachPageCanvas, pageCount } from './pages.js';
import { revealSection } from './studio-nav.js';
import { PAPERS, printDefaults, normalizePrint, layoutPrint, dpiVerdict } from '../render/print-core.js';

const PREFS_KEY = 'glint_print_prefs';
const MAX_SIDE = 16384;            // the same canvas ceiling the board export uses
const MAX_AREA = 120 * 1000 * 1000;

const $ = (id) => document.getElementById(id);

let prefs = printDefaults();
let busy = false;

function loadPrefs() {
  try { prefs = normalizePrint(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')); } catch (_) { prefs = printDefaults(); }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* private mode */ }
}

// The largest upscale the canvas limits allow for a w x h design.
function safeScale(w, h, want) {
  const limit = Math.min(MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
  return Math.max(1, Math.min(want, Math.floor(limit * 100) / 100));
}

function designSize() {
  const c = state.canvas || {};
  return { w: Math.max(1, c.width | 0), h: Math.max(1, c.height | 0) };
}

const fmtMm = (n) => String(Math.round(n * 10) / 10);

function refreshPrintUI() {
  const section = $('print-section');
  if (!section) return;
  const set = (id, v) => { const n = $(id); if (n && n.value !== String(v)) n.value = String(v); };
  set('print-paper', prefs.paper);
  set('print-custom-w', prefs.customW);
  set('print-custom-h', prefs.customH);
  set('print-orientation', prefs.orientation);
  set('print-fit', prefs.fit);
  set('print-margin', prefs.margin);
  set('print-bleed', prefs.bleed);
  set('print-scope', prefs.scope);
  set('print-quality', prefs.quality);
  set('print-upscale', prefs.upscale);
  if ($('print-marks')) $('print-marks').checked = prefs.marks;
  if ($('print-custom')) $('print-custom').hidden = prefs.paper !== 'custom';
  if ($('print-margin-group')) $('print-margin-group').hidden = prefs.fit !== 'fit';
  if ($('print-margin-value')) $('print-margin-value').textContent = fmtMm(prefs.margin) + ' mm';
  if ($('print-bleed-value')) $('print-bleed-value').textContent = fmtMm(prefs.bleed) + ' mm';
  refreshReadout();
}

let lastReadout = '';
function refreshReadout() {
  const out = $('print-dpi');
  if (!out) return;
  const { w, h } = designSize();
  const scale = safeScale(w, h, prefs.upscale);
  const many = pageCount() > 1;
  const key = [w, h, scale, JSON.stringify(prefs), !!state.image, many].join('|');
  if (key === lastReadout) return;
  lastReadout = key;
  // "All pages" needs a second page.
  const all = $('print-scope') && $('print-scope').querySelector('option[value="all"]');
  if (all) all.disabled = !many;
  const L = layoutPrint(prefs, w, h);
  // The upscale adds pixels but no detail, so the verdict goes by the design's own.
  const real = Math.round(L.dpi), sent = Math.round(L.dpi * scale);
  const verdict = dpiVerdict(real);
  out.dataset.verdict = verdict;
  const size = `${fmtMm(L.trim.w)} x ${fmtMm(L.trim.h)} mm`;
  const tail = verdict === 'sharp' ? 'Sharp in print.'
    : verdict === 'ok' ? 'Fine for posters and flyers; 300 dpi is the target for small print.'
      : 'This will look soft. Use a larger canvas, a smaller paper size, or Fit with a wider margin.';
  out.textContent = `${size}. Your design prints at ${real} dpi${scale > 1 ? ` (${sent} dpi after the ${scale}x upscale, which smooths but adds no detail)` : ''}. ${tail}`;
  const btn = $('print-export-btn');
  if (btn && !busy) btn.disabled = !state.image;
}

function setStatus(msg) {
  const s = $('print-status');
  if (s) s.textContent = msg || '';
}

// One PDF page from a rendered design canvas.
function addDesign(pdf, canvas, first) {
  const scale = safeScale(canvas.width, canvas.height, prefs.upscale);
  const L = layoutPrint(prefs, canvas.width, canvas.height);
  const orient = L.page.w > L.page.h ? 'landscape' : 'portrait';
  if (!first) pdf.addPage([L.page.w, L.page.h], orient);

  // The part of the design that is used (Fill crops to the bleed box), upscaled.
  const s = L.source;
  const part = document.createElement('canvas');
  part.width = Math.max(1, Math.round(s.sw));
  part.height = Math.max(1, Math.round(s.sh));
  const pc = part.getContext('2d');
  if (prefs.quality === 'jpeg') { pc.fillStyle = '#fff'; pc.fillRect(0, 0, part.width, part.height); }   // JPEG has no alpha
  pc.drawImage(canvas, s.sx, s.sy, s.sw, s.sh, 0, 0, part.width, part.height);
  const out = upscaleCanvas(part, scale);
  const png = prefs.quality === 'png';
  const data = out.toDataURL(png ? 'image/png' : 'image/jpeg', 0.95);
  pdf.addImage(data, png ? 'PNG' : 'JPEG', L.image.x, L.image.y, L.image.w, L.image.h, undefined, png ? 'FAST' : undefined);

  if (L.marks.length) {
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.1);
    for (const m of L.marks) pdf.line(m.x1, m.y1, m.x2, m.y2);
  }
  return L;
}

export async function exportPrintPdf() {
  if (busy) return;
  const section = $('print-section');
  if (section) revealSection(section);
  if (!state.image) { showNotification('Load a screenshot first.', 'error'); return; }
  if (state.mode === 'board') { showNotification('Leave the board to export a print PDF.', 'error'); return; }
  busy = true;
  const btn = $('print-export-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Making the PDF…'; }
  setStatus('Rendering…');
  try {
    const { jsPDF } = await import('jspdf');
    let pdf = null, pages = 0, last = null;
    const add = (canvas) => {
      if (!pdf) {
        const L = layoutPrint(prefs, canvas.width, canvas.height);
        pdf = new jsPDF({ orientation: L.page.w > L.page.h ? 'landscape' : 'portrait', unit: 'mm', format: [L.page.w, L.page.h], compress: true });
      }
      last = addDesign(pdf, canvas, pages === 0);
      pages++;
    };
    if (prefs.scope === 'all' && pageCount() > 1) {
      await eachPageCanvas((canvas, i, n) => { setStatus(`Rendering page ${i + 1} of ${n}…`); add(canvas); });
    } else {
      const off = document.createElement('canvas');
      renderInto(off, true);
      add(off);
    }
    if (!pdf) { setStatus('Nothing to export.'); showNotification('Add a screenshot to a page first.', 'error'); return; }
    pdf.setProperties({ title: 'Glint print PDF', creator: 'Glint' });
    pdf.save(`print-${Date.now()}.pdf`);
    const what = `${pages} page${pages === 1 ? '' : 's'}, ${fmtMm(last.trim.w)} x ${fmtMm(last.trim.h)} mm`;
    setStatus(`Exported ${what}.`);
    showNotification(`Print PDF ready (${what}). It is RGB; ask your printer if they need CMYK.`, 'success');
  } catch (e) {
    console.error('[print] export failed', e);
    setStatus('Failed.');
    showNotification(`Print PDF failed: ${e.message || e}`, 'error');
  } finally {
    busy = false;
    if (btn) { btn.textContent = 'Export print PDF'; btn.disabled = !state.image; }
  }
}

export function bindPrintPdf() {
  const section = $('print-section');
  if (!section) return;
  loadPrefs();

  const paper = $('print-paper');
  if (paper && !paper.options.length) {
    for (const [id, p] of Object.entries(PAPERS)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id === 'custom' ? 'Custom size' : `${p.label} (${fmtMm(p.w)} x ${fmtMm(p.h)} mm)`;
      paper.appendChild(o);
    }
  }

  const wire = (id, key, read) => {
    const node = $(id);
    if (!node) return;
    const apply = () => {
      prefs = normalizePrint({ ...prefs, [key]: read(node) });
      savePrefs();
      refreshPrintUI();
    };
    node.addEventListener('change', apply);
    if (node.type === 'range') node.addEventListener('input', apply);
  };
  const val = (n) => n.value;
  wire('print-paper', 'paper', val);
  wire('print-custom-w', 'customW', val);
  wire('print-custom-h', 'customH', val);
  wire('print-orientation', 'orientation', val);
  wire('print-fit', 'fit', val);
  wire('print-margin', 'margin', val);
  wire('print-bleed', 'bleed', val);
  wire('print-scope', 'scope', val);
  wire('print-quality', 'quality', val);
  wire('print-upscale', 'upscale', val);
  wire('print-marks', 'marks', (n) => n.checked);
  $('print-export-btn')?.addEventListener('click', exportPrintPdf);

  refreshPrintUI();
  // render() calls this after every preview frame; it only touches the DOM
  // when the canvas size, the image or a setting changed.
  window.__printRefresh = refreshReadout;
}
