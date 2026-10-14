import { state } from '../state/state.js';
import { el } from './elements.js';

export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  if (el.themeToggleBtn) el.themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem('glint_theme', theme); } catch (e) {}
}

export function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('glint_theme');
    applyTheme(saved || 'dark');
  } catch (e) {
    applyTheme('dark');
  }
}
