// v13.5 — First-run welcome.
//
// On a visitor's first time in the studio, show a small carousel of tips with
// illustrative visuals. A "Don't show this again" checkbox (checked by default)
// persists dismissal in localStorage so it only ever appears once.

const SEEN_KEY = 'glint_welcome_v1';

// Each slide: a brand-gradient visual (icon) + a title + a one-line tip.
const SLIDES = [
  {
    grad: 'linear-gradient(135deg,#f6bb5e,#e8913a)',
    icon: '<path d="M4 7a2 2 0 0 1 2-2h2.2l1.3-1.6A2 2 0 0 1 12 2.7h0a2 2 0 0 1 1.5.7L14.8 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12" r="3.4"/>',
    title: 'Welcome to Glint',
    tip: 'Drop in a screenshot, frame it with backgrounds and device mockups, then export in seconds. Everything runs in your browser, no account needed.'
  },
  {
    grad: 'linear-gradient(135deg,#f2a93b,#e8613a)',
    icon: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><path d="M11 7h10M11 12h10M11 17h6"/>',
    title: 'New: navigate from the rail',
    tip: 'The icon rail on the left groups every tool: Import, Adjust, Background, Frame, Markup, AI, Export, and Project. Click an icon to jump straight to those controls.'
  },
  {
    grad: 'linear-gradient(135deg,#f6bb5e,#f2a93b)',
    icon: '<rect x="6" y="3" width="13" height="16" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h11"/>',
    title: 'Build multi-page decks',
    tip: 'Add pages from the filmstrip under the canvas. Each page keeps its own size and design. Present them full screen or export the whole set as a PDF.'
  },
  {
    grad: 'linear-gradient(135deg,#f2a93b,#34d399)',
    icon: '<path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5a3.5 3.5 0 0 1 .5 8.5z"/><path d="M12 11v5M10 14l2 2 2-2"/>',
    title: 'Your work is always saved',
    tip: 'Projects autosave as you edit, with full version history you can roll back to. Sign in to sync across devices. Nothing gets lost.'
  }
];

let index = 0;

function buildSlides() {
  const wrap = document.getElementById('welcome-slides');
  if (!wrap) return;
  wrap.innerHTML = SLIDES.map((s, i) => `
    <div class="welcome-slide${i === 0 ? ' active' : ''}" data-i="${i}">
      <div class="welcome-visual" style="background:${s.grad};">
        <svg viewBox="0 0 24 24" fill="none" stroke="#141416" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
      </div>
      <h3 class="welcome-title">${s.title}</h3>
      <p class="welcome-tip">${s.tip}</p>
    </div>`).join('');
  const dots = document.getElementById('welcome-dots');
  if (dots) dots.innerHTML = SLIDES.map((_, i) =>
    `<button class="welcome-dot${i === 0 ? ' active' : ''}" data-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join('');
}

function show(i) {
  index = Math.max(0, Math.min(SLIDES.length - 1, i));
  document.querySelectorAll('.welcome-slide').forEach(s =>
    s.classList.toggle('active', +s.dataset.i === index));
  document.querySelectorAll('.welcome-dot').forEach(d =>
    d.classList.toggle('active', +d.dataset.dot === index));
  const back = document.getElementById('welcome-back');
  const next = document.getElementById('welcome-next');
  if (back) back.style.visibility = index === 0 ? 'hidden' : 'visible';
  if (next) next.textContent = index === SLIDES.length - 1 ? 'Get started' : 'Next';
}

function openWelcome() {
  buildSlides();
  show(0);
  const ov = document.getElementById('welcome-overlay');
  if (ov) ov.classList.add('visible');
}

function closeWelcome() {
  const ov = document.getElementById('welcome-overlay');
  if (ov) ov.classList.remove('visible');
  const cb = document.getElementById('welcome-dismiss-cb');
  if (cb && cb.checked) {
    try { localStorage.setItem(SEEN_KEY, 'dismissed'); } catch (e) {}
  }
}

// Clear the first-run flags (welcome tour + What's New toast) and replay the
// tour now, so a user can revisit onboarding from scratch. The What's New key
// belongs to whats-new.js; we clear it by name so its toast shows again too.
export function resetOnboarding() {
  try {
    localStorage.removeItem(SEEN_KEY);
    localStorage.removeItem('glint_lastseen_version');
  } catch (e) {}
  openWelcome();
}

export function bindWelcome() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;

  document.getElementById('welcome-close')?.addEventListener('click', closeWelcome);
  document.getElementById('welcome-back')?.addEventListener('click', () => show(index - 1));
  document.getElementById('welcome-next')?.addEventListener('click', () => {
    if (index === SLIDES.length - 1) closeWelcome();
    else show(index + 1);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWelcome(); });
  document.getElementById('welcome-dots')?.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-dot]');
    if (dot) show(+dot.dataset.dot);
  });

  // Re-openable later (e.g. from a help menu / command palette).
  window.__openWelcome = openWelcome;
  window.__resetOnboarding = resetOnboarding;

  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === 'dismissed'; } catch (e) {}
  if (!seen) setTimeout(openWelcome, 600); // let the studio paint first
}
