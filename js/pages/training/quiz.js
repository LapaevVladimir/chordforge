import { t } from '../../i18n/i18n.js';
import { INTERVALS, getInterval, intervalShort, intervalName } from './intervals-data.js';
import { boardCells, renderBoard, renderNoteQuizBoard, cellKey, OPEN_MIDIS } from './board.js';
import { elements, checkedValue } from './elements.js';
import { audio, playIntervalByType } from './playback.js';
import {
  isNoteMode, makeNoteQuestion, noteSetupProblem, renderNoteAnswers,
  selectedNotes, inSelectedRange, noteLabel,
} from './note-quiz.js';

export const session = {
  running: false,
  errors: 0,
  correct: 0,
  questionNumber: 0,
  current: null,
  locked: false,
  nextTimer: 0,
  // Cells already tried in a "find the note" question: key -> 'hit' | 'miss'.
  marks: new Map(),
};

export function currentMode() {
  return checkedValue('trainingMode', 'noteName');
}

export function renderIntervalFilterOptions() {
  elements.intervalChecks.innerHTML = INTERVALS.map((interval) => `
    <label class="interval-check">
      <input type="checkbox" value="${interval.id}" checked>
      <span><strong>${intervalShort(interval.id)}</strong><small>${intervalName(interval.id)}</small></span>
    </label>
  `).join('');
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function selectedIntervals() {
  return [...elements.intervalChecks.querySelectorAll('input:checked')].map((input) => getInterval(input.value));
}

function viablePairsFor(interval) {
  const pairs = [];
  for (const root of boardCells) {
    for (const target of boardCells) {
      if (root === target) continue;
      if (target.midi - root.midi === interval.semitones) pairs.push({ root, target });
      if (interval.semitones === 0 && target.midi === root.midi) pairs.push({ root, target });
    }
  }
  return pairs;
}

function makeQuestion(interval, mode) {
  const pairs = viablePairsFor(interval);
  let pair = randomItem(pairs);
  if (!pair) {
    const rootMidi = 48 + Math.floor(Math.random() * 14);
    pair = {
      root: { stringIndex: 0, fret: 0, midi: rootMidi },
      target: { stringIndex: 1, fret: 0, midi: rootMidi + interval.semitones },
    };
  }
  if (mode === 'ear') {
    const rootMidi = 48 + Math.floor(Math.random() * 14);
    pair = {
      root: { ...pair.root, midi: rootMidi },
      target: { ...pair.target, midi: rootMidi + interval.semitones },
    };
  }
  return { interval, pair };
}

function updateStats() {
  elements.correctCount.textContent = String(session.correct);
  elements.errorCount.textContent = String(session.errors);
}

function setSettingsDisabled(disabled) {
  elements.trainerSettings.querySelectorAll('fieldset').forEach((fieldset) => {
    fieldset.disabled = disabled;
  });
}

function renderAnswers(intervals) {
  elements.answerGrid.innerHTML = intervals.map((interval) => `
    <button class="answer-button" type="button" data-answer="${interval.id}">
      <strong>${intervalShort(interval.id)}</strong><span>${intervalName(interval.id)}</span>
    </button>
  `).join('');
}

export function playCurrentQuestion(button = null) {
  // Only the interval questions have two notes to play.
  if (!session.current?.pair) return;
  const { pair } = session.current;
  playIntervalByType(pair.root.midi, pair.target.midi, checkedValue('quizIntervalType', 'ascending'), button);
}

// Redraws whatever board the current question is asking about. Kept apart from
// nextQuestion so that turning the neck or resizing the window can call it too.
export function drawQuestionBoard() {
  if (!session.current) return;
  const mode = session.current.mode || 'visual';
  if (mode === 'noteName') {
    renderNoteQuizBoard(elements.quizFretboard, { target: session.current.cell, marks: session.marks });
    return;
  }
  if (mode === 'noteFind') {
    renderNoteQuizBoard(elements.quizFretboard, { interactive: true, marks: session.marks, inRange: inSelectedRange });
    return;
  }
  if (mode === 'visual') renderBoard(elements.quizFretboard, { quizPair: session.current.pair });
}

function nextNoteQuestion(mode) {
  const question = makeNoteQuestion(mode);
  if (!question) {
    stopTraining();
    return;
  }
  session.current = question;
  session.marks = new Map();
  elements.questionTitle.textContent = mode === 'noteName'
    ? t('training.noteQuiz.questionName')
    : t('training.noteQuiz.questionFind', { note: noteLabel(question.pitchClass) });
  elements.visualQuestion.hidden = false;
  elements.earQuestion.hidden = true;
  // Nothing to play: a note question is read off the neck, not heard.
  elements.replayQuestion.hidden = true;
  drawQuestionBoard();
  // Finding a note is answered on the neck, so there is nothing to list.
  if (mode === 'noteName') renderNoteAnswers(selectedNotes());
  else elements.answerGrid.innerHTML = '';
}

export function nextQuestion() {
  if (!session.running) return;
  const mode = currentMode();
  session.questionNumber += 1;
  session.locked = false;
  elements.questionNumber.textContent = t('training.quiz.questionNumber', { n: session.questionNumber });
  elements.answerFeedback.className = 'quiz-feedback';

  if (isNoteMode(mode)) {
    elements.answerFeedback.textContent = t(mode === 'noteName' ? 'training.quiz.chooseOne' : 'training.noteQuiz.tapHint');
    nextNoteQuestion(mode);
    return;
  }

  const intervals = selectedIntervals();
  if (intervals.length < 2) {
    stopTraining();
    return;
  }
  const interval = randomItem(intervals);
  session.current = { ...makeQuestion(interval, mode), mode };
  session.marks = new Map();
  elements.answerFeedback.textContent = t('training.quiz.chooseOne');
  elements.questionTitle.textContent = t(mode === 'visual' ? 'training.quiz.questionVisual' : 'training.quiz.questionEar');
  elements.visualQuestion.hidden = mode !== 'visual';
  elements.earQuestion.hidden = mode !== 'ear';
  elements.replayQuestion.hidden = false;
  drawQuestionBoard();
  renderAnswers(intervals);
  if (mode === 'ear') window.setTimeout(() => playCurrentQuestion(), 180);
}

export function startTraining() {
  const mode = currentMode();
  const problem = isNoteMode(mode)
    ? noteSetupProblem(mode)
    : (selectedIntervals().length < 2 ? t('training.trainer.needTwoIntervals') : null);
  if (problem) {
    elements.settingsError.textContent = problem;
    elements.settingsError.hidden = false;
    return;
  }
  elements.settingsError.hidden = true;
  window.clearTimeout(session.nextTimer);
  Object.assign(session, { running: true, errors: 0, correct: 0, questionNumber: 0, current: null, locked: false, marks: new Map() });
  updateStats();
  setSettingsDisabled(true);
  elements.toggleTraining.classList.add('running');
  elements.toggleTraining.innerHTML = `<span>■</span> ${t('common.stop')}`;
  elements.quizIdle.hidden = true;
  elements.quizSummary.hidden = true;
  elements.quizActive.hidden = false;
  nextQuestion();
}

export function stopTraining() {
  if (!session.running) return;
  session.running = false;
  session.locked = true;
  window.clearTimeout(session.nextTimer);
  audio?.stop();
  setSettingsDisabled(false);
  elements.toggleTraining.classList.remove('running');
  elements.toggleTraining.innerHTML = `<span>▶</span> ${t('training.trainer.startButton')}`;
  elements.quizActive.hidden = true;
  elements.quizIdle.hidden = true;
  elements.quizSummary.hidden = false;
  const attempts = session.correct + session.errors;
  const accuracy = attempts ? Math.round((session.correct / attempts) * 100) : 0;
  elements.summaryCorrect.textContent = String(session.correct);
  elements.summaryErrors.textContent = String(session.errors);
  elements.summaryAccuracy.textContent = t('common.template.percent', { n: accuracy });
}

// "Name the note": the answer comes from the button grid, and either way the
// asked cell then shows what it really was.
export function handleNoteAnswer(button) {
  if (!session.running || session.locked || !session.current || button.disabled) return;
  const answer = Number(button.dataset.noteAnswer);
  const correct = answer === session.current.pitchClass;
  // Only a right answer puts the note on the board. Showing it on the first miss
  // would answer the question the remaining buttons are still asking.
  if (correct) {
    session.marks = new Map([[cellKey(session.current.cell), 'hit']]);
    drawQuestionBoard();
    session.correct += 1;
    session.locked = true;
    button.classList.add('correct');
    elements.answerGrid.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    elements.answerFeedback.textContent = t('training.noteQuiz.correctFeedback', { note: noteLabel(answer) });
    elements.answerFeedback.className = 'quiz-feedback success';
    updateStats();
    session.nextTimer = window.setTimeout(nextQuestion, 900);
    return;
  }
  session.errors += 1;
  button.classList.add('wrong');
  button.disabled = true;
  elements.answerFeedback.textContent = t('training.noteQuiz.wrongFeedback', { note: noteLabel(answer) });
  elements.answerFeedback.className = 'quiz-feedback error';
  updateStats();
}

// "Find the note": the answer is a cell on the neck. Every cell tried keeps the
// note it actually holds, so a wrong tap is a small lesson rather than a buzzer.
export function handleBoardAnswer(button) {
  if (!session.running || session.locked || !session.current || button.disabled) return;
  const [stringIndex, fret] = button.dataset.noteCell.split(':').map(Number);
  const cell = boardCells.find((item) => item.stringIndex === stringIndex && item.fret === fret);
  if (!cell) return;
  const correct = ((cell.midi % 12) + 12) % 12 === session.current.pitchClass;
  session.marks.set(cellKey(cell), correct ? 'hit' : 'miss');
  if (correct) {
    session.correct += 1;
    session.locked = true;
    elements.answerFeedback.textContent = t('training.noteQuiz.foundFeedback', {
      note: noteLabel(session.current.pitchClass),
      string: OPEN_MIDIS.length - stringIndex,
      fret,
    });
    elements.answerFeedback.className = 'quiz-feedback success';
    updateStats();
    drawQuestionBoard();
    session.nextTimer = window.setTimeout(nextQuestion, 950);
    return;
  }
  session.errors += 1;
  elements.answerFeedback.textContent = t('training.noteQuiz.missFeedback', { note: noteLabel(cell.midi) });
  elements.answerFeedback.className = 'quiz-feedback error';
  updateStats();
  drawQuestionBoard();
}

export function handleAnswer(button) {
  if (!session.running || session.locked || !session.current || button.disabled) return;
  const answer = getInterval(button.dataset.answer);
  if (answer.id === session.current.interval.id) {
    session.correct += 1;
    session.locked = true;
    button.classList.add('correct');
    elements.answerGrid.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    elements.answerFeedback.textContent = t('training.quiz.correctFeedback', { name: intervalName(answer.id) });
    elements.answerFeedback.className = 'quiz-feedback success';
    updateStats();
    session.nextTimer = window.setTimeout(nextQuestion, 900);
    return;
  }
  session.errors += 1;
  button.classList.add('wrong');
  button.disabled = true;
  elements.answerFeedback.textContent = t('training.quiz.wrongFeedback', { name: intervalName(answer.id) });
  elements.answerFeedback.className = 'quiz-feedback error';
  updateStats();
}
