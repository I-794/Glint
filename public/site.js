// Shared behavior for every SnapShotPro marketing page (landing + content
// pages). All effects are IntersectionObserver or pointer-driven CSS-variable
// writes — no scroll listeners, no per-frame state loops. Cinematic motion
// (cursor glass + 3D tilt) is gated on prefers-reduced-motion.
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1) Nav border once the page scrolls past a 1px sentinel.
  const nav = document.getElementById('nav');
  if (nav) {
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;';
    document.body.prepend(sentinel);
    new IntersectionObserver(([e]) => nav.classList.toggle('scrolled', !e.isIntersecting),
      { rootMargin: '-8px 0px 0px 0px' }).observe(sentinel);
  }

  // 1b) Mark the current section in the nav, and the phone menu toggle.
  if (nav) {
    const here = location.pathname.replace(/index\.html$/, '');
    nav.querySelectorAll('.nav-link').forEach((a) => {
      if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
    });
    const toggle = nav.querySelector('.nav-toggle');
    if (toggle) {
      const setOpen = (open) => { nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
      toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); } });
      document.addEventListener('click', (e) => { if (nav.classList.contains('open') && !nav.contains(e.target)) setOpen(false); });
    }
  }

  // 2) Scroll reveal with sibling stagger.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const sibs = Array.from(e.target.parentElement.querySelectorAll(':scope > .reveal'));
      const i = Math.max(0, sibs.indexOf(e.target));
      e.target.style.transitionDelay = (i * 70) + 'ms';
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  if (reduce) return;   // everything below is cinematic motion

  // 3) Cursor-reactive glass: a specular highlight tracks the pointer across any
  // .glass-interactive surface. .cell and .glass-card opt in automatically.
  document.querySelectorAll('.glass-interactive, .cell, .glass-card').forEach((card) => {
    card.classList.add('glass-interactive');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      card.style.setProperty('--ga', '1');
    });
    card.addEventListener('pointerleave', () => card.style.setProperty('--ga', '0'));
  });

  // 4) Pointer parallax / 3D tilt for [data-tilt] (hero showpiece, etc.). The
  // pointer position maps to small rotateX/rotateY via CSS vars; CSS does the
  // transform. Tracks the pointer across the whole viewport so it reacts before
  // you reach the element.
  const tilts = Array.from(document.querySelectorAll('[data-tilt]'));
  if (tilts.length) {
    const max = 7;   // degrees
    window.addEventListener('pointermove', (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;   // -1..1
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      tilts.forEach((el) => {
        el.style.setProperty('--ry', (nx * max).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-ny * max).toFixed(2) + 'deg');
      });
    }, { passive: true });
  }
})();
