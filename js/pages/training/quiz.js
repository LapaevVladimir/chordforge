import { t } from '../../i18n/i18n.js';
import { INTERVALS, getInterval, intervalShort, intervalName } from './intervals-data.js';
import { boardCells, renderBoard } from './board.js';
import { elements, checkedValue } from './elements.js';
import { audio, playIntervalByType } from './playback.js';

export const session = {
  running: false,
  errors: 0,
  correct: 0,
  questionNumber: 0,
  current: null,
  locked: false,
  nextTimer: 0,
};

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
  if (!session.current) return;
  const { pair } = session.current;
  playIntervalByType(pair.root.midi, pair.target.midi, checkedValue('quizIntervalType', 'ascending'), button);
}

export function nextQuestion() {
  if (!session.running) return;
  const intervals = selectedIntervals();
  if (intervals.length < 2) {
    stopTraining();
    return;
  }
  session.questionNumber += 1;
  session.locked = false;
  const mode = checkedValue('trainingMode', 'visual');
  const interval = randomItem(intervals);
  session.current = makeQuestion(interval, mode);
  elements.questionNumber.textContent = t('training.quiz.questionNumber', { n: session.questionNumber });
  elements.answerFeedback.textContent = t('training.quiz.chooseOne');
  elements.answerFeedback.className = 'quiz-feedback';
  elements.questionTitle.textContent = t(mode === 'visual' ? 'training.quiz.questionVisual' : 'training.quiz.questionEar');
  elements.visualQuestion.hidden = mode !== 'visual';
  elements.earQuestion.hidden = mode !== 'ear';
  if (mode === 'visual') renderBoard(elements.quizFretboard, { quizPair: session.current.pair });
  renderAnswers(intervals);
  if (mode === 'ear') window.setTimeout(() => playCurrentQuestion(), 180);
}

export function startTraining() {
  const intervals = selectedIntervals();
  if (intervals.length < 2) {
    elements.settingsError.textContent = t('training.trainer.needTwoIntervals');
    elements.settingsError.hidden = false;
    return;
  }
  elements.settingsError.hidden = true;
  window.clearTimeout(session.nextTimer);
  Object.assign(session, { running: true, errors: 0, correct: 0, questionNumber: 0, current: null, locked: false });
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
