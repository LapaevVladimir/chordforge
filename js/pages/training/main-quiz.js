import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { getInterval, intervalShort, intervalName } from './intervals-data.js';
import { elements, checkedValue } from './elements.js';
import { audio } from './playback.js';
import { syncLocaleDock, bindLocaleDock } from './locale-dock.js';
import {
  session, renderIntervalFilterOptions, playCurrentQuestion, startTraining, stopTraining, handleAnswer,
} from './quiz.js';

function refreshLocaleDependentUI() {
  renderIntervalFilterOptions();
  if (session.current) {
    elements.questionNumber.textContent = t('training.quiz.questionNumber', { n: session.questionNumber });
    const mode = checkedValue('trainingMode', 'visual');
    elements.questionTitle.textContent = t(mode === 'visual' ? 'training.quiz.questionVisual' : 'training.quiz.questionEar');
    elements.answerGrid.querySelectorAll('[data-answer]').forEach((button) => {
      const interval = getInterval(button.dataset.answer);
      const strong = button.querySelector('strong');
      const span = button.querySelector('span');
      if (strong) strong.textContent = intervalShort(interval.id);
      if (span) span.textContent = intervalName(interval.id);
    });
  }
  if (session.running) elements.toggleTraining.innerHTML = `<span>■</span> ${t('common.stop')}`;
}

onLocaleChange(() => {
  syncLocaleDock();
  refreshLocaleDependentUI();
});

function bindEvents() {
  elements.selectAllIntervals.addEventListener('click', () => {
    elements.intervalChecks.querySelectorAll('input').forEach((input) => { input.checked = true; });
    elements.settingsError.hidden = true;
  });
  elements.clearIntervals.addEventListener('click', () => {
    elements.intervalChecks.querySelectorAll('input').forEach((input) => { input.checked = false; });
  });
  elements.intervalChecks.addEventListener('change', () => { elements.settingsError.hidden = true; });
  elements.toggleTraining.addEventListener('click', () => session.running ? stopTraining() : startTraining());
  elements.replayQuestion.addEventListener('click', () => playCurrentQuestion(elements.replayQuestion));
  elements.answerGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-answer]');
    if (button) handleAnswer(button);
  });
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => audio?.stop());
}

function initialize() {
  i18nInit();
  syncLocaleDock();
  renderIntervalFilterOptions();
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
