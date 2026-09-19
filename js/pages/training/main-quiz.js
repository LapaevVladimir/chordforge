import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { getInterval, intervalShort, intervalName } from './intervals-data.js';
import { elements } from './elements.js';
import { audio } from './playback.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import { initOrientation, bindOrientationToggle, onOrientationChange } from '../../core/board-orientation.js';
import {
  session, renderIntervalFilterOptions, playCurrentQuestion, startTraining, stopTraining,
  handleAnswer, handleNoteAnswer, handleBoardAnswer, drawQuestionBoard, currentMode,
  handlePlayedNote, retryPlayAttempt, askPlayQuestion, QUESTION_KEYS,
} from './quiz.js';
import {
  isNoteMode, renderNoteFilterOptions, renderStringFilterOptions, renderNoteAnswers,
  selectedNotes, noteLabel,
} from './note-quiz.js';
import { onPlayNote, onPlayLive, startMic, stopMic, isListening } from './play-quiz.js';
import { TUNER_STATES } from '../../core/tuner/tuner-engine.js';

// Which settings are on screen. A note question has no use for the interval
// filters, and an interval question — played back on the guitar or not — has no
// use for the note ones.
function applyModePanels() {
  const notes = isNoteMode(currentMode());
  elements.quizPanels.forEach((panel) => {
    panel.hidden = panel.dataset.quizPanel !== (notes ? 'notes' : 'intervals');
  });
  elements.playQuestion.hidden = true;
  elements.settingsError.hidden = true;
}

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
  renderNoteFilterOptions();
  renderStringFilterOptions();
  if (session.current && isNoteMode(session.current.mode)) {
    elements.questionNumber.textContent = t('training.quiz.questionNumber', { n: session.questionNumber });
    elements.questionTitle.textContent = session.current.mode === 'noteName'
      ? t('training.noteQuiz.questionName')
      : t('training.noteQuiz.questionFind', { note: noteLabel(session.current.pitchClass) });
    if (session.current.mode === 'noteName') renderNoteAnswers(selectedNotes());
    if (session.running) elements.toggleTraining.innerHTML = `<span>■</span> ${t('common.stop')}`;
    return;
  }
  if (session.current) {
    elements.questionNumber.textContent = t('training.quiz.questionNumber', { n: session.questionNumber });
    const mode = currentMode();
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
  const setAll = (container, checked) => {
    container.querySelectorAll('input').forEach((input) => { input.checked = checked; });
    elements.settingsError.hidden = true;
  };
  elements.selectAllNotes.addEventListener('click', () => setAll(elements.noteChecks, true));
  elements.clearNotes.addEventListener('click', () => setAll(elements.noteChecks, false));
  elements.selectAllStrings.addEventListener('click', () => setAll(elements.stringChecks, true));
  elements.clearStrings.addEventListener('click', () => setAll(elements.stringChecks, false));
  elements.noteChecks.addEventListener('change', () => { elements.settingsError.hidden = true; });
  elements.stringChecks.addEventListener('change', () => { elements.settingsError.hidden = true; });
  document.querySelectorAll('input[name="trainingMode"]').forEach((input) => {
    input.addEventListener('change', () => { if (input.checked) applyModePanels(); });
  });
  elements.toggleTraining.addEventListener('click', () => {
    if (session.running) stopTraining();
    else startTraining().then(renderMicButton);
  });
  elements.playMicToggle.addEventListener('click', () => { toggleMic(); });
  elements.playRetry.addEventListener('click', retryPlayAttempt);
  onPlayNote(handlePlayedNote);
  onPlayLive(renderLive);
  elements.replayQuestion.addEventListener('click', () => {
    // In play mode the replay has to close the microphone while the speakers are
    // talking, and reopen it afterwards; elsewhere it is just a replay.
    if (currentMode() === 'play') askPlayQuestion(elements.replayQuestion);
    else playCurrentQuestion(elements.replayQuestion);
  });
  elements.answerGrid.addEventListener('click', (event) => {
    const noteButton = event.target.closest('[data-note-answer]');
    if (noteButton) { handleNoteAnswer(noteButton); return; }
    const button = event.target.closest('[data-answer]');
    if (button) handleAnswer(button);
  });
  // "Find the note" is answered on the neck itself.
  elements.quizFretboard.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-note-cell]');
    if (cell) handleBoardAnswer(cell);
  });
  bindOrientationToggle(document.querySelector('#boardFlip'), { vertical: t('common.boardFlipVertical'), horizontal: t('common.boardFlipHorizontal') });
  // Only a question that is on screen has a board to redraw.
  const redrawBoard = () => drawQuestionBoard();
  onOrientationChange(redrawBoard);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redrawBoard, 160);
  });
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => { audio?.stop(); stopMic(); });
}

function initialize() {
  i18nInit();
  initOrientation();
  syncLocaleDock();
  renderIntervalFilterOptions();
  renderNoteFilterOptions();
  renderStringFilterOptions();
  applyModePanels();
  renderMicButton();
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
