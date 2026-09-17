import * as Audio from '../../core/guitar-audio.js';
import { t } from '../../i18n/i18n.js';

export const STRUM_ACTIONS = ['down', 'up', 'mute', 'rest'];
export const STRUM_ICONS = { down: '↓', up: '↑', mute: '×', rest: '·' };

const DEFAULT_STRUM_PATTERN = ['down', 'rest', 'down', 'up', 'rest', 'up', 'down', 'up'];
export const STRUM_PRESETS = {
  pop: DEFAULT_STRUM_PATTERN,
  eighths: ['down', 'up', 'down', 'up', 'down', 'up', 'down', 'up'],
  ballad: ['down', 'rest', 'rest', 'up', 'down', 'up', 'rest', 'up'],
};

export function strumActionName(action) {
  return t(`builder.strumName.${action}`);
}

export function resizePattern(pattern, count) {
  const size = Math.max(1, Math.min(16, Math.round(Number(count) || 8)));
  const normalized = Audio.normalizeStrumPattern(pattern);
  return Array.from({ length: size }, (_, index) => normalized[index] || 'rest');
}

export function strumCountLabels(count) {
  return Array.from({ length: count }, (_, index) => `<span>${index % 2 ? t('common.eighthAnd') : Math.floor(index / 2) + 1}</span>`).join('');
}

// Shared renderer for both the sidebar strum editor and the clip editor's strum editor —
// `describe(index, action)` returns the per-step `{ ariaLabel, title }` text, which differs
// slightly between the two call sites.
export function renderStrumSteps(container, pattern, { dataAttr, activeIndex = -1, describe }) {
  container.innerHTML = pattern.map((action, index) => {
    const { ariaLabel, title } = describe(index, action);
    const titleAttr = title ? ` title="${title}"` : '';
    return `<button type="button" class="strum-step ${action} ${index === activeIndex ? 'active' : ''}" data-${dataAttr}="${index}" aria-label="${ariaLabel}"${titleAttr}>${STRUM_ICONS[action]}</button>`;
  }).join('');
}
