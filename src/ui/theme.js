import { storageGet, storageSet } from './storage.js';

const STORAGE_KEY = 'bho-theme';
const PREFERENCES = new Set(['system', 'light', 'dark']);

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getThemePreference() {
  const stored = storageGet(STORAGE_KEY, 'system');
  return PREFERENCES.has(stored) ? stored : 'system';
}

export function resolveTheme(preference = getThemePreference()) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(preference = getThemePreference()) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = preference;
  return resolved;
}

export function setThemePreference(preference) {
  const next = PREFERENCES.has(preference) ? preference : 'system';
  storageSet(STORAGE_KEY, next);
  applyTheme(next);
  syncThemeControls(next);
  return next;
}

export function syncThemeControls(preference = getThemePreference()) {
  document.querySelectorAll('[data-theme-option]').forEach((btn) => {
    const active = btn.getAttribute('data-theme-option') === preference;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function initTheme() {
  const preference = getThemePreference();
  applyTheme(preference);
  syncThemeControls(preference);

  document.querySelectorAll('[data-theme-option]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setThemePreference(btn.getAttribute('data-theme-option'));
    });
  });

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePreference() === 'system') applyTheme('system');
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(onChange);
  }
}
