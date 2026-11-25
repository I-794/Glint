// Beta spike: the homepage nav as a floating pane of liquid glass.
// The glass is drawn by liquidGL (MIT, vendored in /vendor/liquidgl/), a WebGL
// approximation of the Apple material, not an official one.
//
// This file loads in <head> so html.glass-on is set before first paint and the
// nav does not jump from bar to pill. The library itself (about 300 KB) loads
// only when it will be used: wide screens, transparency allowed, a GPU context
// available. Otherwise the page keeps its normal nav. Until the lens is ready,
// and if the library fails to load, the pill uses the CSS blur in
// glass-beta.css. Add ?glass=0 to see the page without any of it.
// No scroll listeners here; liquidGL runs its own render loop.
(function () {
  if (new URLSearchParams(location.search).get('glass') === '0') return;
  if (!window.matchMedia) return;
  var wide = window.matchMedia('(min-width: 981px)');
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  var probe = document.createElement('canvas');
  if (!('gpu' in navigator) && !probe.getContext('webgl2') && !probe.getContext('webgl')) return;

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lens = null;
  var pane = null;
  var loading = null;

  var loadLibrary = function () {
    if (!loading) {
      loading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = '/vendor/liquidgl/liquidGL.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return loading;
  };

  var pageLoaded = function () {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, { once: true });
    });
  };

  var stop = function () {
    root.classList.remove('glass-on', 'glass-live');
    if (lens && lens.destroy) lens.destroy();
    if (pane) pane.remove();
    lens = pane = null;
  };

  var start = function () {
    root.classList.add('glass-on');
    Promise.all([loadLibrary(), pageLoaded()]).then(function () {
      var nav = document.getElementById('nav');
      if (!nav || !wide.matches || pane || typeof window.liquidGL !== 'function') return;
      pane = document.createElement('span');
      pane.className = 'nav-glass';
      pane.setAttribute('aria-hidden', 'true');
      nav.insertBefore(pane, nav.firstChild);
      // Dark glass: a graphite dye keeps the nav text readable over the amber
      // section and over light screenshots. The bend is kept small on purpose:
      // on a pane this wide and thin, a deeper bevel pulls in pixels from far
      // above and below and shows as dark streaks along the edge. The moving
      // highlight is off under reduced motion.
      lens = window.liquidGL({
        target: '.nav-glass',
        snapshot: 'body',
        resolution: 1.5,
        refraction: 0.004,
        bevelDepth: 0.007,
        bevelWidth: 0.35,
        frost: 7,
        shadow: true,
        specular: !reduceMotion,
        tint: 'rgba(13, 13, 15, 0.42)',
        reveal: 'fade',
        on: { init: function () { if (pane) root.classList.add('glass-live'); } }
      });
    }).catch(function () { /* the CSS pill stays */ });
  };

  // Phones and tablets keep the normal nav and its full-screen menu.
  var sync = function () { if (wide.matches) start(); else stop(); };
  if (wide.addEventListener) wide.addEventListener('change', sync);
  sync();
})();
