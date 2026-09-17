export const THEME_KEY = 'chordforge-theme-v1';

export const THEMES = {
  midnight: '#0b1015',
  sunset: '#160d16',
  forest: '#09120e',
  ultraviolet: '#0d0719',
  ocean: '#03121f',
  porcelain: '#e9e1d6',
};

export function applyTheme(theme, fallback = 'midnight') {
  const nextTheme = THEMES[theme] ? theme : fallback;
  document.body.dataset.theme = nextTheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEMES[nextTheme];
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === nextTheme));
  });
  try { localStorage.setItem(THEME_KEY, nextTheme); }
  catch { /* theme persistence is optional in private browsing modes */ }
  return nextTheme;
}

// Applies the theme plus a "bloom" click animation radiating from the trigger swatch.
export function switchTheme(theme, trigger, fallback = 'midnight') {
  if (!THEMES[theme] || document.body.dataset.theme === theme) return;
  const rect = trigger?.getBoundingClientRect();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  applyTheme(theme, fallback);
  if (reduceMotion || !trigger) return;

  const bloom = document.createElement('span');
  bloom.className = 'theme-bloom';
  bloom.style.left = `${rect.left + rect.width / 2}px`;
  bloom.style.top = `${rect.top + rect.height / 2}px`;
  bloom.style.setProperty('--bloom-a', trigger.style.getPropertyValue('--swatch-a'));
  bloom.style.setProperty('--bloom-b', trigger.style.getPropertyValue('--swatch-b'));
  document.body.appendChild(bloom);
  trigger.classList.add('is-switching');
  bloom.addEventListener('animationend', () => bloom.remove(), { once: true });
  setTimeout(() => trigger.classList.remove('is-switching'), 440);
}

export function bindThemeDock(fallback = 'midnight', { bloom = false } = {}) {
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      if (bloom) switchTheme(button.dataset.themeOption, button, fallback);
      else applyTheme(button.dataset.themeOption, fallback);
    });
  });
}
