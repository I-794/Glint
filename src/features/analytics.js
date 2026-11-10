// Usage analytics for the editor (Vercel Web Analytics, no cookies). It answers
// one question: which parts of Glint do people actually use? Events carry a
// feature name and a choice (a section id, an export format, a share kind),
// never an image, a file name, a color or anything a person typed.
import { inject, track as send } from '@vercel/analytics';

export function track(name, data) {
  if (typeof window === 'undefined') return;
  try { send(name, data); } catch (e) { /* analytics must never break a feature */ }
}

const seen = new Set();

// One event per sidebar section per visit, the first time a control in it is
// used. Opening or collapsing a section does not count.
function noteSection(e) {
  const t = e.target;
  if (!t || !t.closest || t.closest('.section-title')) return;
  if (e.type === 'click' && !t.closest('button, .preset-button, .size-preset-btn, .shadow-preset-btn, .scene-tile')) return;
  const section = t.closest('.sidebar-section');
  if (!section) return;
  const title = section.querySelector('.section-title');
  const name = section.id || (title ? title.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) : '');
  if (!name || seen.has(name)) return;
  seen.add(name);
  track('section_used', { section: name, group: section.dataset.group || '' });
}

export function bindAnalytics() {
  inject();
  document.addEventListener('change', noteSection, true);
  document.addEventListener('click', noteSection, true);
}
