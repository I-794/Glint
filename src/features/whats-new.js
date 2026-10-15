// v15 — "What's new" toast.
//
// When a *returning* user opens the studio after a version bump, slide in a
// small, non-blocking card with the latest release's highlights, then mark the
// version seen so it shows at most once per release. Brand-new users get the
// first-run welcome tour instead (welcome.js) and never see this — the two are
// mutually exclusive.
//
// Per-release upkeep: bump CURRENT_VERSION and replace WHATS_NEW with the new
// release's highlights — same checklist step as the editor version badge and
// the changelog page.

const CURRENT_VERSION = '36.0';
const LASTSEEN_KEY = 'glint_lastseen_version';
const WELCOME_KEY  = 'glint_welcome_v1';   // set by welcome.js on dismissal

// Latest release only — the newest version’s highlights, not an accumulation.
const WHATS_NEW = {
  heading: "✨ v36 · Darkroom: Meet Glint",
  items: [
    { title: 'Same studio, new name',
      desc: 'Every tool is where you left it. Your projects, templates and brand kits moved over automatically.' },
    { title: 'A new look',
      desc: 'A calmer graphite interface with a single amber accent, in light and dark.' },
    { title: 'Update the extension',
      desc: 'The capture extension is now Glint Capture. The old version keeps working until you update.' }
  ]
};

function openWhatsNew() {
  const heading = document.getElementById('whatsnew-heading');
  const list = document.getElementById('whatsnew-list');
  if (heading) heading.textContent = WHATS_NEW.heading;
  if (list) {
    list.innerHTML = WHATS_NEW.items.map(it =>
      `<li><b>${it.title}.</b> ${it.desc}</li>`).join('');
  }
  const toast = document.getElementById('whatsnew-toast');
  if (toast) toast.classList.add('visible');
}

function closeWhatsNew() {
  const toast = document.getElementById('whatsnew-toast');
  if (toast) toast.classList.remove('visible');
}

export function bindWhatsNew() {
  const toast = document.getElementById('whatsnew-toast');
  if (!toast) return;

  document.getElementById('whatsnew-close')?.addEventListener('click', closeWhatsNew);
  document.getElementById('whatsnew-got')?.addEventListener('click', closeWhatsNew);

  // Re-openable later (e.g. from a help menu / command palette).
  window.__openWhatsNew = openWhatsNew;

  // Trigger logic — all localStorage in try/catch, matching welcome.js.
  let lastseen = null, welcomeSeen = false;
  try {
    lastseen = localStorage.getItem(LASTSEEN_KEY);
    welcomeSeen = localStorage.getItem(WELCOME_KEY) === 'dismissed';
  } catch (e) {}

  if (lastseen === CURRENT_VERSION) return;   // already saw this version's card

  // Brand-new user (no prior version seen and the welcome tour hasn't run yet):
  // the first-run tour is their intro, so silently mark seen and stay quiet.
  if (!lastseen && !welcomeSeen) {
    try { localStorage.setItem(LASTSEEN_KEY, CURRENT_VERSION); } catch (e) {}
    return;
  }

  // Returning user on a new/absent version: show the card and mark seen now, so
  // it's reliably once-per-version even if they never click.
  setTimeout(openWhatsNew, 600);   // let the studio paint first
  try { localStorage.setItem(LASTSEEN_KEY, CURRENT_VERSION); } catch (e) {}
}
