// v41 — Interactive Tour player, shared by the exported .html file and the
// /s/<id> viewer. It must stay import-free: tour-export.js inlines this file's
// raw text (minus the `export` keyword) into a self-contained page.
//
// steps: [{ img | src (URL), w, h, autoAdvanceMs, hotspots: [{ x, y, w, h, label,
//          callout: { title, body, side } }] }]  (geometry in fractions)
export function mountTour(root, steps, opts) {
  opts = opts || {};
  var doc = root.ownerDocument;
  var keyTarget = opts.keyTarget || doc;
  var list = Array.isArray(steps) ? steps : [];
  root.classList.add('glint-tour');

  if (!list.length) {
    root.innerHTML = '<p class="gt-empty">This tour has no steps yet.</p>';
    return { destroy: function () { root.innerHTML = ''; } };
  }

  root.innerHTML =
    '<div class="gt-stage"><div class="gt-screen"><img class="gt-frame" alt=""><div class="gt-auto"></div></div></div>' +
    '<div class="gt-bar">' +
      '<button class="gt-prev" type="button" aria-label="Previous step">‹ Back</button>' +
      '<div class="gt-dots"></div>' +
      '<span class="gt-count" aria-live="polite"></span>' +
      '<button class="gt-next" type="button">Next ›</button>' +
    '</div>';

  var stage = root.querySelector('.gt-stage');
  var frame = root.querySelector('.gt-frame');
  var dots = root.querySelector('.gt-dots');
  var count = root.querySelector('.gt-count');
  var prev = root.querySelector('.gt-prev');
  var next = root.querySelector('.gt-next');
  var auto = root.querySelector('.gt-auto');
  var i = 0, timer = null, rafId = 0;

  function srcOf(s) { return s.img || s.src; }

  list.forEach(function (s, n) {
    var d = doc.createElement('button');
    d.type = 'button';
    d.className = 'gt-dot';
    d.title = 'Step ' + (n + 1);
    d.setAttribute('aria-label', 'Go to step ' + (n + 1));
    d.onclick = function () { go(n); };
    dots.appendChild(d);
  });

  function clearOverlays() {
    [].slice.call(stage.querySelectorAll('.gt-hs,.gt-callout')).forEach(function (e) { e.remove(); });
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    auto.style.width = '0';
  }

  function place(callout, hs) {
    // Pin the callout to the chosen side of the hotspot, in % of the stage, and
    // flip it toward the interior so it never points off the frame edge.
    var cx = hs.x + hs.w / 2, cy = hs.y + hs.h / 2, side = (hs.callout && hs.callout.side) || 'bottom';
    if (side === 'bottom' && hs.y + hs.h > 0.74) side = 'top';
    else if (side === 'top' && hs.y < 0.26) side = 'bottom';
    else if (side === 'right' && hs.x + hs.w > 0.7) side = 'left';
    else if (side === 'left' && hs.x < 0.3) side = 'right';
    callout.className = 'gt-callout ' + side;
    var st = callout.style;
    if (side === 'top') { st.left = (cx * 100) + '%'; st.top = (hs.y * 100) + '%'; st.transform = 'translate(-50%,calc(-100% - 12px))'; }
    else if (side === 'bottom') { st.left = (cx * 100) + '%'; st.top = ((hs.y + hs.h) * 100) + '%'; st.transform = 'translate(-50%,12px)'; }
    else if (side === 'left') { st.left = (hs.x * 100) + '%'; st.top = (cy * 100) + '%'; st.transform = 'translate(calc(-100% - 12px),-50%)'; }
    else { st.left = ((hs.x + hs.w) * 100) + '%'; st.top = (cy * 100) + '%'; st.transform = 'translate(12px,-50%)'; }
  }

  function go(n) {
    i = Math.max(0, Math.min(list.length - 1, n));
    var s = list[i];
    clearOverlays();
    frame.src = srcOf(s);
    if (s.w && s.h) { frame.width = s.w; frame.height = s.h; }
    frame.alt = 'Tour step ' + (i + 1) + ' of ' + list.length;
    (s.hotspots || []).forEach(function (hs) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'gt-hs';
      b.style.left = (hs.x * 100) + '%'; b.style.top = (hs.y * 100) + '%';
      b.style.width = (hs.w * 100) + '%'; b.style.height = (hs.h * 100) + '%';
      b.setAttribute('aria-label', hs.label || 'Next step');
      if (hs.label) b.title = hs.label;
      b.onclick = function () { advance(); };
      stage.appendChild(b);
      if (hs.callout && (hs.callout.title || hs.callout.body)) {
        var c = doc.createElement('div');
        if (hs.callout.title) { var t = doc.createElement('b'); t.textContent = hs.callout.title; c.appendChild(t); }
        if (hs.callout.body) { var p = doc.createElement('span'); p.textContent = hs.callout.body; c.appendChild(p); }
        stage.appendChild(c);
        place(c, hs);
      }
    });
    [].slice.call(dots.children).forEach(function (d, n2) {
      d.className = 'gt-dot' + (n2 === i ? ' on' : '');
      if (n2 === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    count.textContent = (i + 1) + ' / ' + list.length;
    prev.disabled = i === 0;
    next.textContent = i === list.length - 1 ? '↺ Replay' : 'Next ›';
    // Warm the next frame so stepping forward never waits on the network.
    if (i + 1 < list.length) { var pre = new Image(); pre.src = srcOf(list[i + 1]); }
    if (s.autoAdvanceMs > 0 && i < list.length - 1) startAuto(s.autoAdvanceMs);
  }

  function startAuto(ms) {
    var t0 = null;
    function tick(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / ms);
      auto.style.width = (p * 100) + '%';
      if (p < 1) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    timer = setTimeout(advance, ms);
  }

  function advance() { if (i >= list.length - 1) go(0); else go(i + 1); }

  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || (e.key === ' ' && tag !== 'BUTTON')) { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
  }

  prev.onclick = function () { go(i - 1); };
  next.onclick = function () { advance(); };
  keyTarget.addEventListener('keydown', onKey);
  go(0);

  return {
    go: go,
    destroy: function () {
      clearOverlays();
      keyTarget.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      root.classList.remove('glint-tour');
    }
  };
}
