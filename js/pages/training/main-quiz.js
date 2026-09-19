import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { getInterval, intervalShort, intervalName } from './intervals-data.js';
import { elements, checkedValue } from './elements.js';
import { audio } from './playback.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import { initOrientation, bindOrientationToggle, onOrientationChange } from '../../core/board-orientation.js';
import {
  session, renderIntervalFilterOptions, playCurrentQuestion, startTraining, stopTraining,
  handleAnswer, handleNoteAnswer, handleBoardAnswer, drawQuestionBoard, currentMode,
} from './quiz.js';
import {
  isNoteMode, renderNoteFilterOptions, renderStringFilterOptions, renderNoteAnswers,
  selectedNotes, noteLabel,
} from './note-quiz.js';

// Which settings are on screen: the interval filters mean nothing to a note
// question, and the note filters mean nothing to an interval one.
function applyModePanels() {
  const notes = isNoteMode(currentMode());
  elements.quizPanels.forEach((panel) => {
    panel.hidden = panel.dataset.quizPanel !== (notes ? 'notes' : 'intervals');
  });
  elements.settingsError.hidden = true;
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
  elements.toggleTraining.addEventListener('click', () => session.running ? stopTraining() : startTraining());
  elements.replayQuestion.addEventListener('click', () => playCurrentQuestion(elements.replayQuestion));
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
  window.addEventListener('beforeunload', () => audio?.stop());
}

function initialize() {
  i18nInit();
  initOrientation();
  syncLocaleDock();
  renderIntervalFilterOptions();
  renderNoteFilterOptions();
  renderStringFilterOptions();
  applyModePanels();
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
