import { t } from '../../i18n/i18n.js';
import { INTERVALS, getInterval, intervalShort, intervalName } from './intervals-data.js';
import { boardCells, renderBoard } from './board.js';
import { elements, checkedValue } from './elements.js';
import { audio, playIntervalByType } from './playback.js';
import { midiLabel } from '../../core/pitch/note.js';
import { armAttempt, pauseCapture, startMic, stopMic, isListening } from './play-quiz.js';

// How many notes an answer is made of in "play it back" mode.
const PLAY_NOTES = 2;
// Long enough to read the feedback and let the strings stop ringing before the
// next attempt starts listening again.
const PLAY_RETRY_MS = 1400;

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
  // Away from the board, the question is just two pitches, so they are put in a
  // comfortable register rather than wherever the fretboard pair happened to be.
  if (mode === 'ear' || mode === 'play') {
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

export const QUESTION_KEYS = {
  visual: 'training.quiz.questionVisual',
  ear: 'training.quiz.questionEar',
  play: 'training.quiz.questionPlay',
};

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
  elements.questionTitle.textContent = t(QUESTION_KEYS[mode] || QUESTION_KEYS.visual);
  elements.visualQuestion.hidden = mode !== 'visual';
  elements.earQuestion.hidden = mode !== 'ear';
  elements.playQuestion.hidden = mode !== 'play';
  elements.answerGrid.hidden = mode === 'play';
  if (mode === 'visual') renderBoard(elements.quizFretboard, { quizPair: session.current.pair });
  renderAnswers(intervals);
  if (mode === 'play') {
    resetPlayedSlots();
    elements.answerFeedback.textContent = t('training.play.listenThenPlay');
    armAttempt();
  }
  if (mode === 'ear' || mode === 'play') window.setTimeout(() => playCurrentQuestion(), 180);
}

export async function startTraining() {
  const intervals = selectedIntervals();
  const mode = checkedValue('trainingMode', 'visual');
  if (intervals.length < 2) {
    elements.settingsError.textContent = t('training.trainer.needTwoIntervals');
    elements.settingsError.hidden = false;
    return;
  }
  if (mode === 'play' && !isListening()) {
    // The Start click is the gesture the browser wants before it will hand over
    // a microphone, so the permission is asked for here rather than later.
    const started = await startMic();
    if (!started.ok) {
      elements.settingsError.textContent = t(`tuner.error.${started.reason}`);
      elements.settingsError.hidden = false;
      return;
    }
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
  stopMic();
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

/* ------------------------------------------------- play-it-back mode */

// The distance alone is the answer: a major third is a major third wherever you
// put it on the neck, and being able to find it in a comfortable position is the
// point of the exercise.
function describePlayed(notes) {
  const distance = Math.abs(notes[1].midi - notes[0].midi);
  const match = INTERVALS.find((interval) => interval.semitones === distance);
  return {
    distance,
    played: `${midiLabel(notes[0].midi)} → ${midiLabel(notes[1].midi)}`,
    name: match ? intervalName(match.id) : t('training.play.semitones', { n: distance }),
  };
}

export function resetPlayedSlots() {
  if (!elements.playedSlots) return;
  elements.playedSlots.querySelectorAll('strong').forEach((slot) => { slot.textContent = '—'; });
  elements.playedSlots.querySelectorAll('.played-slot').forEach((slot) => slot.classList.remove('filled'));
  elements.playedDistance.textContent = '—';
}

function renderPlayedSlots(notes) {
  const slots = elements.playedSlots.querySelectorAll('.played-slot');
  slots.forEach((slot, index) => {
    const note = notes[index];
    slot.classList.toggle('filled', Boolean(note));
    slot.querySelector('strong').textContent = note ? midiLabel(note.midi) : '—';
  });
  elements.playedDistance.textContent = notes.length >= PLAY_NOTES
    ? t('training.play.semitones', { n: Math.abs(notes[1].midi - notes[0].midi) })
    : '—';
}

// Called for every note the microphone hears while a question is open.
export function handlePlayedNote(unusedNote, notes) {
  if (!session.running || session.locked || !session.current) return;
  if (checkedValue('trainingMode', 'visual') !== 'play') return;
  renderPlayedSlots(notes);
  if (notes.length < PLAY_NOTES) return;

  pauseCapture();
  session.locked = true;
  const { distance, played, name } = describePlayed(notes);
  const expected = session.current.interval;
  const type = checkedValue('quizIntervalType', 'ascending');
  const step = notes[1].midi - notes[0].midi;
  // A harmonic question cannot be answered as a chord — the detector follows one
  // note at a time — so it is played as two notes in either order.
  const directionOk = type === 'ascending' ? step >= 0 : type === 'descending' ? step <= 0 : true;

  if (distance === expected.semitones && directionOk) {
    session.correct += 1;
    elements.answerFeedback.textContent = t('training.play.correctFeedback', { played, name: intervalName(expected.id) });
    elements.answerFeedback.className = 'quiz-feedback success';
    updateStats();
    session.nextTimer = window.setTimeout(nextQuestion, 1100);
    return;
  }

  session.errors += 1;
  elements.answerFeedback.textContent = distance === expected.semitones
    ? t('training.play.wrongDirection', { played })
    : t('training.play.wrongFeedback', { played, name });
  elements.answerFeedback.className = 'quiz-feedback error';
  updateStats();
  session.nextTimer = window.setTimeout(retryPlayAttempt, PLAY_RETRY_MS);
}

// Another go at the same question: the answer is not given away, because playing
// it is the skill being practised.
export function retryPlayAttempt() {
  if (!session.running || !session.current) return;
  window.clearTimeout(session.nextTimer);
  session.locked = false;
  resetPlayedSlots();
  elements.answerFeedback.textContent = t('training.play.tryAgain');
  elements.answerFeedback.className = 'quiz-feedback';
  armAttempt();
}
