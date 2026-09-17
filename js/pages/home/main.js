// Landing page: no tools of its own, just the shared chrome — theme, locale and
// the intro loader — over static markup that i18n fills in.
import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange } from '../../i18n/i18n.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';

onLocaleChange(syncLocaleDock);

function finishSiteIntro() {
  const loader = document.getElementById('siteLoader');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reveal = () => {
    document.body.classList.remove('site-loading');
    document.body.classList.add('site-ready');
    loader.classList.add('is-leaving');
    setTimeout(() => loader.remove(), reduceMotion ? 20 : 850);
  };
  if (reduceMotion) reveal();
  else setTimeout(reveal, 1100);
}

i18nInit();
syncLocaleDock();
bindLocaleDock();
bindThemeDock('midnight', { bloom: true });
applyTheme(localStorage.getItem(THEME_KEY), 'midnight');
finishSiteIntro();
