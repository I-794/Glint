// v41 — Before / After slider player, shared by the exported .html page and
// the /s/<id> viewer. It must stay import-free: compare-export.js inlines this
// file's raw text (minus the `export` keyword) into a self-contained page.
//
// d: { beforeUrl, afterUrl, w, h, rect: { x, y, w, h } (fractions of the design),
//      orientation: 'vertical' | 'horizontal', split: 0..1,
//      labels: { enabled, before, after, position: 'top' | 'bottom' },
//      divider: { color, width, handle } }
export function mountCompare(root, d) {
  var doc = root.ownerDocument;
  var V = d.orientation !== 'horizontal';
  var R = d.rect || { x: 0, y: 0, w: 1, h: 1 };
  var labels = d.labels && d.labels.enabled ? d.labels : null;
  var BOTTOM = !!(labels && labels.position === 'bottom');
  var color = /^#[0-9a-f]{6}$/i.test(d.divider && d.divider.color) ? d.divider.color : '#ffffff';
  var lineW = Math.max(0, Math.min(12, Number(d.divider && d.divider.width) || 0));
  var handle = !d.divider || d.divider.handle !== false;
  var split = Math.max(0, Math.min(1, Number(d.split)));
  if (!isFinite(split)) split = 0.5;

  function el(tag, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; return e; }
  function pct(v) { return (v * 100).toFixed(3) + '%'; }

  root.classList.add('glint-compare');
  root.innerHTML = '';
  root.style.setProperty('--gc-w', d.w + 'px');
  root.style.setProperty('--gc-ar', String(d.w / d.h));
  root.style.aspectRatio = d.w + ' / ' + d.h;
  root.style.touchAction = V ? 'pan-y' : 'pan-x';
  root.style.setProperty('--gc-color', color);

  var after = el('img', 'gc-after');
  after.src = d.afterUrl;
  after.alt = labels && labels.after ? labels.after : 'After';
  var before = el('img', 'gc-before');
  before.src = d.beforeUrl;
  before.alt = labels && labels.before ? labels.before : 'Before';

  var zone = el('div', 'gc-zone');
  zone.setAttribute('role', 'slider');
  zone.tabIndex = 0;
  zone.setAttribute('aria-label', 'Comparison divider');
  zone.setAttribute('aria-valuemin', '0');
  zone.setAttribute('aria-valuemax', '100');
  zone.style.left = pct(R.x); zone.style.top = pct(R.y);
  zone.style.width = pct(R.w); zone.style.height = pct(R.h);
  zone.style.cursor = V ? 'ew-resize' : 'ns-resize';

  var bar = el('div', 'gc-bar');
  if (V) { bar.style.top = '0'; bar.style.bottom = '0'; bar.style.width = lineW + 'px'; bar.style.transform = 'translateX(-50%)'; }
  else { bar.style.left = '0'; bar.style.right = '0'; bar.style.height = lineW + 'px'; bar.style.transform = 'translateY(-50%)'; }

  var knob = el('div', 'gc-knob' + (V ? '' : ' horizontal'));
  knob.style.display = handle ? 'flex' : 'none';
  knob.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>';
  zone.appendChild(bar);
  zone.appendChild(knob);

  var tb = null, ta = null;
  if (labels && labels.before) { tb = el('span', 'gc-tag'); tb.textContent = labels.before; zone.appendChild(tb); }
  if (labels && labels.after) { ta = el('span', 'gc-tag'); ta.textContent = labels.after; zone.appendChild(ta); }

  root.appendChild(after);
  root.appendChild(before);
  root.appendChild(zone);

  function place() {
    var p = (split * 100).toFixed(3) + '%';
    var cut = V ? (R.x + R.w * split) : (R.y + R.h * split);
    before.style.clipPath = V
      ? 'inset(' + (R.y * 100) + '% ' + ((1 - cut) * 100) + '% ' + ((1 - R.y - R.h) * 100) + '% ' + (R.x * 100) + '%)'
      : 'inset(' + (R.y * 100) + '% ' + ((1 - R.x - R.w) * 100) + '% ' + ((1 - cut) * 100) + '% ' + (R.x * 100) + '%)';
    if (V) { bar.style.left = p; knob.style.left = p; knob.style.top = '50%'; }
    else { bar.style.top = p; knob.style.top = p; knob.style.left = '50%'; }
    zone.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    var zr = zone.getBoundingClientRect(), pad = 14;
    if (tb) {
      var bw = tb.offsetWidth, bh = tb.offsetHeight;
      if (V) { tb.style.left = pad + 'px'; tb.style.top = BOTTOM ? '' : pad + 'px'; tb.style.bottom = BOTTOM ? pad + 'px' : ''; tb.style.opacity = split * zr.width > bw + pad * 2 ? 1 : 0; }
      else { tb.style.top = pad + 'px'; tb.style[BOTTOM ? 'right' : 'left'] = pad + 'px'; tb.style.opacity = split * zr.height > bh + pad * 2 ? 1 : 0; }
    }
    if (ta) {
      var aw = ta.offsetWidth, ah = ta.offsetHeight;
      if (V) { ta.style.right = pad + 'px'; ta.style.top = BOTTOM ? '' : pad + 'px'; ta.style.bottom = BOTTOM ? pad + 'px' : ''; ta.style.opacity = (1 - split) * zr.width > aw + pad * 2 ? 1 : 0; }
      else { ta.style.bottom = pad + 'px'; ta.style[BOTTOM ? 'right' : 'left'] = pad + 'px'; ta.style.opacity = (1 - split) * zr.height > ah + pad * 2 ? 1 : 0; }
    }
  }

  function fromEvent(e) {
    var r = zone.getBoundingClientRect();
    var v = V ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    split = Math.max(0, Math.min(1, v));
    place();
  }

  var dragging = false;
  zone.addEventListener('pointerdown', function (e) { dragging = true; zone.setPointerCapture(e.pointerId); fromEvent(e); });
  zone.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
  zone.addEventListener('pointerup', function () { dragging = false; });
  zone.addEventListener('pointercancel', function () { dragging = false; });
  zone.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 0.1 : 0.02, k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowUp') split = Math.max(0, split - step);
    else if (k === 'ArrowRight' || k === 'ArrowDown') split = Math.min(1, split + step);
    else if (k === 'Home') split = 0;
    else if (k === 'End') split = 1;
    else return;
    e.preventDefault();
    place();
  });
  var win = doc.defaultView;
  win.addEventListener('resize', place);
  // Label fades depend on the rendered size, which is only known after layout.
  after.addEventListener('load', place);
  place();

  return {
    destroy: function () {
      win.removeEventListener('resize', place);
      root.innerHTML = '';
      root.classList.remove('glint-compare');
    }
  };
}
