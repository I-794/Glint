// Glint Capture — quick editor.
//
// Loads the capture stashed by the background (by ?n=<nonce>) and offers a
// minimal edit set: crop, padding + background, and arrow/text annotations, then
// Download PNG or hand off to the full web studio. Everything composites onto one
// output-resolution canvas that CSS scales to fit; pointer events map back to the
// image's content coordinates so edits stay aligned through padding and crop.

const params = new URLSearchParams(location.search);
const nonce = params.get('n');
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const stage = document.getElementById('stage');

const BG_SWATCHES = [
  { type: 'transparent', label: 'none' },
  { type: 'solid', color: '#0b0e1a' },
  { type: 'solid', color: '#ffffff' },
  { type: 'solid', color: '#f1f1ee' },
  { type: 'grad', c1: '#667eea', c2: '#764ba2' },
  { type: 'grad', c1: '#2bd4c4', c2: '#2348ff' },
  { type: 'grad', c1: '#ff8a5c', c2: '#c5318f' },
];
const ANNO_COLORS = ['#ff4d4f', '#ffd400', '#22c55e', '#2348ff', '#ffffff', '#0b0e1a'];

const state = {
  base: null, bw: 0, bh: 0,
  padding: 0,
  bg: { type: 'transparent' },
  annos: [],          // {type:'arrow',x1,y1,x2,y2,color} | {type:'text',x,y,text,color,size} in base coords
  color: ANNO_COLORS[0],
  tool: 'select',
  drag: null,
  cropRect: null,
};

// ── Load the capture ──────────────────────────────────────────────────────────
chrome.storage.local.get('pending').then(({ pending }) => {
  const rec = pending && nonce && pending[nonce];
  if (!rec) { document.getElementById('empty').style.display = 'flex'; cv.style.display = 'none'; return; }
  const img = new Image();
  img.onload = () => {
    state.base = img; state.bw = img.naturalWidth; state.bh = img.naturalHeight;
    render();
    delete pending[nonce]; chrome.storage.local.set({ pending });   // one-time
  };
  img.src = rec.dataUrl;
});

// ── Compose ───────────────────────────────────────────────────────────────────
function outW() { return state.bw + state.padding * 2; }
function outH() { return state.bh + state.padding * 2; }

function paintBg(w, h) {
  const bg = state.bg;
  if (bg.type === 'solid') { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, w, h); }
  else if (bg.type === 'grad') { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, bg.c1); g.addColorStop(1, bg.c2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  else ctx.clearRect(0, 0, w, h);
}

function drawArrow(x1, y1, x2, y2, color) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const head = Math.max(12, len * 0.18);
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(3, head * 0.26); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
  ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
  ctx.closePath(); ctx.fill();
}

function render() {
  if (!state.base) return;
  const w = outW(), h = outH(), p = state.padding;
  cv.width = w; cv.height = h;
  paintBg(w, h);
  ctx.drawImage(state.base, p, p, state.bw, state.bh);
  for (const a of state.annos) {
    if (a.type === 'arrow') drawArrow(p + a.x1, p + a.y1, p + a.x2, p + a.y2, a.color);
    else { ctx.fillStyle = a.color; ctx.font = `700 ${a.size}px -apple-system,Segoe UI,sans-serif`; ctx.textBaseline = 'top'; ctx.fillText(a.text, p + a.x, p + a.y); }
  }
  // transient (in-progress) overlays
  const d = state.drag;
  if (d && d.type === 'arrow') drawArrow(p + d.x1, p + d.y1, p + d.x2, p + d.y2, state.color);
  if (state.cropRect) {
    const r = state.cropRect;
    ctx.save();
    ctx.fillStyle = 'rgba(13,13,15,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(p + r.x, p + r.y, r.w, r.h);
    ctx.drawImage(state.base, r.x, r.y, r.w, r.h, p + r.x, p + r.y, r.w, r.h);
    ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 2; ctx.strokeRect(p + r.x, p + r.y, r.w, r.h);
    ctx.restore();
  }
  fitDisplay();
}

function fitDisplay() {
  const scale = Math.min((stage.clientWidth - 40) / cv.width, (stage.clientHeight - 40) / cv.height, 1);
  cv.style.width = (cv.width * scale) + 'px';
  cv.style.height = (cv.height * scale) + 'px';
}
window.addEventListener('resize', () => state.base && fitDisplay());

// ── Pointer mapping (client → base-content coords) ─────────────────────────────
function toBase(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (cv.width / r.width) - state.padding;
  const y = (e.clientY - r.top) * (cv.height / r.height) - state.padding;
  return { x, y };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

cv.addEventListener('pointerdown', (e) => {
  if (!state.base || state.tool === 'select') return;
  const pt = toBase(e);
  if (state.tool === 'text') { startText(e, pt); return; }
  cv.setPointerCapture(e.pointerId);
  if (state.tool === 'crop') state.drag = { type: 'crop', x0: clamp(pt.x, 0, state.bw), y0: clamp(pt.y, 0, state.bh) };
  else state.drag = { type: 'arrow', x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
});
cv.addEventListener('pointermove', (e) => {
  if (!state.drag) return;
  const pt = toBase(e);
  if (state.drag.type === 'crop') {
    const x0 = state.drag.x0, y0 = state.drag.y0;
    const x = clamp(pt.x, 0, state.bw), y = clamp(pt.y, 0, state.bh);
    state.cropRect = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
  } else { state.drag.x2 = pt.x; state.drag.y2 = pt.y; }
  render();
});
cv.addEventListener('pointerup', () => {
  const d = state.drag; state.drag = null;
  if (!d) return;
  if (d.type === 'arrow' && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 6) {
    state.annos.push({ type: 'arrow', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, color: state.color });
  }
  if (d.type === 'crop' && state.cropRect && state.cropRect.w > 4 && state.cropRect.h > 4) {
    document.getElementById('crop-actions').style.display = 'flex';
  } else if (d.type === 'crop') { state.cropRect = null; }
  render();
});

// ── Text annotation (inline input) ─────────────────────────────────────────────
function startText(e, pt) {
  const input = document.createElement('input');
  input.className = 'text-input';
  const scale = cv.clientWidth / cv.width;
  const size = Math.max(18, Math.round(state.bw * 0.045));
  input.style.left = e.clientX + 'px';
  input.style.top = e.clientY + 'px';
  input.style.color = state.color;
  input.style.fontSize = (size * scale) + 'px';
  document.body.appendChild(input);
  input.focus();
  const commit = () => {
    const text = input.value.trim();
    input.remove();
    if (text) { state.annos.push({ type: 'text', x: pt.x, y: pt.y, text, color: state.color, size }); render(); }
  };
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') input.remove(); });
  input.addEventListener('blur', commit);
}

// ── Crop apply / cancel ────────────────────────────────────────────────────────
document.getElementById('crop-apply').addEventListener('click', () => {
  const r = state.cropRect; if (!r) return;
  const c = document.createElement('canvas'); c.width = Math.round(r.w); c.height = Math.round(r.h);
  c.getContext('2d').drawImage(state.base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  state.annos = state.annos.map((a) => a.type === 'arrow'
    ? { ...a, x1: a.x1 - r.x, y1: a.y1 - r.y, x2: a.x2 - r.x, y2: a.y2 - r.y }
    : { ...a, x: a.x - r.x, y: a.y - r.y });
  state.base = c; state.bw = c.width; state.bh = c.height; state.cropRect = null;
  document.getElementById('crop-actions').style.display = 'none';
  render();
});
document.getElementById('crop-cancel').addEventListener('click', () => {
  state.cropRect = null; document.getElementById('crop-actions').style.display = 'none'; render();
});

// ── Tool + option wiring ───────────────────────────────────────────────────────
document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tool').forEach((t) => t.classList.remove('active'));
  b.classList.add('active');
  state.tool = b.dataset.tool;
  stage.classList.toggle('select', state.tool === 'select');
  if (state.tool !== 'crop') { state.cropRect = null; document.getElementById('crop-actions').style.display = 'none'; render(); }
  document.getElementById('hint').textContent = ({
    select: 'View mode. Pick a tool to edit.',
    crop: 'Drag a box, then Apply crop.',
    arrow: 'Drag to draw an arrow.',
    text: 'Click where you want text, then type.',
  })[state.tool];
}));

const padding = document.getElementById('padding'), padVal = document.getElementById('pad-val');
padding.addEventListener('input', () => { state.padding = parseInt(padding.value, 10) || 0; padVal.textContent = state.padding; render(); });

const bgWrap = document.getElementById('bg-swatches');
BG_SWATCHES.forEach((bg, i) => {
  const s = document.createElement('div');
  s.className = 'swatch' + (i === 0 ? ' on' : '');
  s.style.background = bg.type === 'transparent'
    ? 'repeating-conic-gradient(#888 0% 25%, #ccc 0% 50%) 50% / 10px 10px'
    : bg.type === 'grad' ? `linear-gradient(135deg, ${bg.c1}, ${bg.c2})` : bg.color;
  s.addEventListener('click', () => {
    bgWrap.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
    s.classList.add('on'); state.bg = bg; render();
  });
  bgWrap.appendChild(s);
});

const colorWrap = document.getElementById('anno-colors');
ANNO_COLORS.forEach((c, i) => {
  const s = document.createElement('div');
  s.className = 'swatch' + (i === 0 ? ' on' : '');
  s.style.background = c;
  s.addEventListener('click', () => {
    colorWrap.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
    s.classList.add('on'); state.color = c;
  });
  colorWrap.appendChild(s);
});

// ── Output ─────────────────────────────────────────────────────────────────────
document.getElementById('download').addEventListener('click', () => {
  if (!state.base) return;
  cv.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'snapshot-' + Date.now() + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
});
document.getElementById('studio').addEventListener('click', () => {
  if (!state.base) return;
  chrome.runtime.sendMessage({ cmd: 'openStudio', dataUrl: cv.toDataURL('image/png') });
});
