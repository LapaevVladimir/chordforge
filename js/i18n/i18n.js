import ru from './locales/ru.js';
import en from './locales/en.js';

export const LOCALE_KEY = 'chordforge-locale-v1';
const LOCALES = { ru, en };
const listeners = new Set();
// English is the base language of the source — it is what the markup says before
// any dictionary is applied, so it is also what an unrecognised locale falls back to.
export const DEFAULT_LOCALE = 'en';
let currentLocale = DEFAULT_LOCALE;

function getFromDict(dict, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}

export function t(key, params) {
  const value = getFromDict(LOCALES[currentLocale], key);
  const fallback = value === undefined ? getFromDict(LOCALES[DEFAULT_LOCALE], key) : value;
  const text = fallback === undefined ? key : fallback;
  return interpolate(text, params);
}

const RU_PLURAL = (count, forms) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
};
const EN_PLURAL = (count, forms) => (count === 1 ? forms.one : forms.other);

// forms: { one, few, many } for ru locales, { one, other } for everything else.
export function plural(count, forms) {
  const picked = currentLocale === 'ru' ? RU_PLURAL(count, forms) : EN_PLURAL(count, forms);
  // A form borrowed from the other locale has the other locale's shape — ru has no
  // `other`, en has no `few`/`many` — so fall back within the forms we were given
  // rather than printing "undefined".
  return picked ?? forms.other ?? forms.many ?? forms.one;
}

// Looks up a { one, few?, many?, other? } forms object at `key` in the active locale
// (falling back to the base language if the key is missing there) and picks the
// right form for `count`.
export function pluralize(key, count) {
  const forms = getFromDict(LOCALES[currentLocale], key) || getFromDict(LOCALES[DEFAULT_LOCALE], key);
  return forms ? plural(count, forms) : String(count);
}

export function getLocale() {
  return currentLocale;
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  // Opt-in rich text, for prose that needs a <b> around the term it is defining.
  // The source is always a locale module in this repo, never anything a reader can
  // supply, and the only markup used is inline emphasis — so this does not open a
  // door that `data-i18n` deliberately keeps shut. Anything carrying interpolated
  // values still goes through textContent.
  root.querySelectorAll('[data-i18n-html]').forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((element) => {
    let map;
    try { map = JSON.parse(element.dataset.i18nAttr); }
    catch { return; }
    Object.entries(map).forEach(([attribute, key]) => element.setAttribute(attribute, t(key)));
  });
}

export function onChange(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function setLocale(code, { persist = true } = {}) {
  currentLocale = LOCALES[code] ? code : DEFAULT_LOCALE;
  document.documentElement.lang = currentLocale;
  if (persist) {
    try { localStorage.setItem(LOCALE_KEY, currentLocale); }
    catch { /* locale persistence is optional in private browsing modes */ }
  }
  applyStatic();
  listeners.forEach((handler) => handler(currentLocale));
  return currentLocale;
}

export function init() {
  let saved = null;
  try { saved = localStorage.getItem(LOCALE_KEY); }
  catch { /* storage may be unavailable */ }
  const browserLocale = (navigator.language || '').slice(0, 2).toLowerCase();
  currentLocale = LOCALES[saved] ? saved : (LOCALES[browserLocale] ? browserLocale : DEFAULT_LOCALE);
  document.documentElement.lang = currentLocale;
  applyStatic();
  return currentLocale;
}
