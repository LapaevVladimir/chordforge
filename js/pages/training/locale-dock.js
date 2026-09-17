import { getLocale, setLocale } from '../../i18n/i18n.js';

export function syncLocaleDock() {
  const current = getLocale();
  document.querySelectorAll('[data-locale-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.localeOption === current));
  });
}

export function bindLocaleDock() {
  document.querySelectorAll('[data-locale-option]').forEach((button) => {
    button.addEventListener('click', () => setLocale(button.dataset.localeOption));
  });
  syncLocaleDock();
}
