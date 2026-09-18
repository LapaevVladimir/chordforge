import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { getInterval, intervalShort, intervalName } from './intervals-data.js';
import { elements, checkedValue } from './elements.js';
import { audio } from './playback.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import {
  session, renderIntervalFilterOptions, playCurrentQuestion, startTraining, stopTraining, handleAnswer,
  handlePlayedNote, retryPlayAttempt, QUESTION_KEYS,
} from './quiz.js';
import { onPlayNote, onPlayLive, startMic, stopMic, isListening } from './play-quiz.js';
import { TUNER_STATES } from '../../core/tuner/tuner-engine.js';

const LIVE_STATE_KEYS = {
  [TUNER_STATES.NO_SIGNAL]: 'training.play.micWaiting',
  [TUNER_STATES.DETECTING]: 'training.play.micHearing',
  [TUNER_STATES.ACTIVE]: 'training.play.micHearing',
};

function renderMicButton() {
  const listening = isListening();
  elements.playMicToggle.classList.toggle('listening', listening);
  elements.playMicToggle.lastElementChild.textContent = t(listening ? 'training.play.micOff' : 'training.play.micOn');
}

function renderLive(live) {
  // The bar is square-rooted for the same reason as the tuner's: the quiet end
  // of the range is where the feedback matters.
  elements.playMicLevel.style.setProperty('--level', Math.min(1, Math.sqrt(Math.max(0, live.level) / 0.25)).toFixed(3));
  elements.playLiveNote.textContent = live.label || '—';
  if (live.state === TUNER_STATES.ERROR) {
    elements.playMicStatus.textContent = t(`tuner.error.${live.error}`);
    renderMicButton();
    return;
  }
  elements.playMicStatus.textContent = t(LIVE_STATE_KEYS[live.state] || 'training.play.micIdle');
}

async function toggleMic() {
  if (isListening()) {
    await stopMic();
    elements.playMicStatus.textContent = t('training.play.micIdle');
    elements.playLiveNote.textContent = '—';
    elements.playMicLevel.style.setProperty('--level', '0');
  } else {
    const started = await startMic();
    if (!started.ok) elements.playMicStatus.textContent = t(`tuner.error.${started.reason}`);
  }
  renderMicButton();
}

function refreshLocaleDependentUI() {
  renderIntervalFilterOptions();
  if (session.current) {
    elements.questionNumber.textContent = t('training.quiz.questionNumber', { n: session.questionNumber });
    const mode = checkedValue('trainingMode', 'visual');
    elements.questionTitle.textContent = t(QUESTION_KEYS[mode] || QUESTION_KEYS.visual);
    elements.answerGrid.querySelectorAll('[data-answer]').forEach((button) => {
      const interval = getInterval(button.dataset.answer);
      const strong = button.querySelector('strong');
      const span = button.querySelector('span');
      if (strong) strong.textContent = intervalShort(interval.id);
      if (span) span.textContent = intervalName(interval.id);
    });
  }
  if (session.running) elements.toggleTraining.innerHTML = `<span>■</span> ${t('common.stop')}`;
  renderMicButton();
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
  elements.toggleTraining.addEventListener('click', () => {
    if (session.running) stopTraining();
    else startTraining().then(renderMicButton);
  });
  elements.playMicToggle.addEventListener('click', () => { toggleMic(); });
  elements.playRetry.addEventListener('click', retryPlayAttempt);
  onPlayNote(handlePlayedNote);
  onPlayLive(renderLive);
  elements.replayQuestion.addEventListener('click', () => playCurrentQuestion(elements.replayQuestion));
  elements.answerGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-answer]');
    if (button) handleAnswer(button);
  });
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => { audio?.stop(); stopMic(); });
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
