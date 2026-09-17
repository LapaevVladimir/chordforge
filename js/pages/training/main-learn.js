import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { OPEN_MIDIS, tuningLabel } from './board.js';
import { elements, checkedValue } from './elements.js';
import { audio, showToast, playNotes } from './playback.js';
import { syncLocaleDock, bindLocaleDock } from './locale-dock.js';
import {
  renderIntervalOptions, renderLearning, renderTuningControls, bindTuningActions,
  chooseLearnTarget, setLearnAnchor, learnAnchor,
} from './learn.js';

// Plays the anchor/target pair according to the selected interval type:
// ascending/descending order the two notes by pitch and play them one after another,
// harmonic plays them together.
function playLearnIntervalByType(anchorMidi, targetMidi, type, button) {
  const low = Math.min(anchorMidi, targetMidi);
  const high = Math.max(anchorMidi, targetMidi);
  if (type === 'harmonic') return playNotes(anchorMidi, targetMidi, 'simultaneous', button);
  if (type === 'descending') return playNotes(high, low, 'sequential', button);
  return playNotes(low, high, 'sequential', button);
}

onLocaleChange(() => {
  syncLocaleDock();
  renderIntervalOptions();
  renderTuningControls();
  if (elements.tuningBadge) elements.tuningBadge.textContent = tuningLabel();
  renderLearning();
});

function bindEvents() {
  elements.learnInterval.addEventListener('change', renderLearning);
  elements.learnFretboard.addEventListener('click', (event) => {
    const button = event.target.closest('[data-learn-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.learnCell.split(':').map(Number);
    setLearnAnchor({ stringIndex, fret, midi: OPEN_MIDIS[stringIndex] + fret });
    renderLearning();
  });
  elements.playLearnInterval.addEventListener('click', () => {
    const target = chooseLearnTarget();
    if (!target) {
      showToast(t('training.toast.noSecondPosition'));
      return;
    }
    const intervalType = checkedValue('learnIntervalType', 'ascending');
    playLearnIntervalByType(learnAnchor.midi, target.midi, intervalType, elements.playLearnInterval);
  });
  bindTuningActions();
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => audio?.stop());
}

function initialize() {
  i18nInit();
  syncLocaleDock();
  renderIntervalOptions();
  renderTuningControls();
  if (elements.tuningBadge) elements.tuningBadge.textContent = tuningLabel();
  renderLearning();
  bindEvents();
  applyTheme(localStorage.getItem(THEME_KEY), 'sunset');
  window.setTimeout(() => {
    document.body.classList.remove('site-loading');
    document.body.classList.add('site-ready');
    elements.loader?.classList.add('is-hidden');
    window.setTimeout(() => elements.loader?.remove(), 650);
  }, 780);
  audio.prepare([40, 47, 52]).catch(() => {
    // Audio is also retried on the first explicit play gesture.
  });
}

initialize();
