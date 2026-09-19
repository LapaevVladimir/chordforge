import { t } from '../../i18n/i18n.js';
import { INTERVALS, getInterval, intervalShort, intervalName } from './intervals-data.js';
import { boardCells, renderBoard } from './board.js';
import { elements, checkedValue } from './elements.js';
import { audio, playIntervalByType } from './playback.js';
import { midiLabel } from '../../core/pitch/note.js';
import { armAttempt, pauseCapture, startMic, stopMic, isListening, waitForQuiet } from './play-quiz.js';

// The question supplies the note it starts from, so the answer is the single note
// that completes the interval: the work is finding that note, not reproducing the
// one you were just given.
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
  if (!session.current) return Promise.resolve();
  const { pair } = session.current;
  // Returned so a caller can wait for the last note to stop before it listens.
  return playIntervalByType(pair.root.midi, pair.target.midi, checkedValue('quizIntervalType', 'ascending'), button);
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
    // Deliberately not armed yet: see askPlayQuestion.
    pauseCapture();
    window.setTimeout(() => askPlayQuestion(), 180);
    return;
  }
  if (mode === 'ear') window.setTimeout(() => playCurrentQuestion(), 180);
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

// Which note the question hands over and which one it wants back. The given note
// is the one the question starts on: the lower of the pair going up, the higher
// coming down. A harmonic question sounds both at once and has no first note, so
// the lower one is given and the upper is the answer.
export function playPitches() {
  if (!session.current?.pair) return null;
  const { root, target } = session.current.pair;
  const low = Math.min(root.midi, target.midi);
  const high = Math.max(root.midi, target.midi);
  return checkedValue('quizIntervalType', 'ascending') === 'descending'
    ? { given: high, expected: low }
    : { given: low, expected: high };
}

// What was played, against what was asked. The note is judged as a pitch, not as
// a distance from wherever: the question named where to start, so there is one
// note that answers it — though it may be taken at any of the places on the neck
// that hold it.
function judgePlayed(played, expected) {
  const offBy = played - expected;
  return {
    label: midiLabel(played),
    exact: offBy === 0,
    sameNote: ((offBy % 12) + 12) % 12 === 0,
    octaves: Math.round(offBy / 12),
  };
}

// The first slot always shows the note the question gave; only the second is
// waiting to be filled.
export function resetPlayedSlots() {
  if (!elements.playedSlots) return;
  const pitches = playPitches();
  elements.givenNote.textContent = pitches ? midiLabel(pitches.given) : '—';
  elements.playedNote.textContent = '—';
  elements.playedSlots.querySelector('.played-slot.answer')?.classList.remove('filled');
  elements.playedDistance.textContent = '—';
}

function renderPlayedSlots(note) {
  const pitches = playPitches();
  elements.givenNote.textContent = pitches ? midiLabel(pitches.given) : '—';
  elements.playedNote.textContent = note ? midiLabel(note.midi) : '—';
  elements.playedSlots.querySelector('.played-slot.answer')?.classList.toggle('filled', Boolean(note));
  elements.playedDistance.textContent = note && pitches
    ? t('training.play.semitones', { n: Math.abs(note.midi - pitches.given) })
    : '—';
}

// Called for every note the microphone hears while a question is open.
export function handlePlayedNote(note) {
  if (!session.running || session.locked || !session.current) return;
  if (checkedValue('trainingMode', 'visual') !== 'play') return;
  const pitches = playPitches();

  // The note you were given is there to play against — to hear where you are and
  // measure from — so it is not taken for an answer. Unless the question is a
  // unison, where that note is the answer and there is nothing to ignore.
  if (pitches.expected !== pitches.given && note.midi === pitches.given) {
    renderPlayedSlots(null);
    elements.answerFeedback.textContent = t('training.play.referenceHeard', { played: midiLabel(note.midi) });
    elements.answerFeedback.className = 'quiz-feedback';
    return;
  }

  renderPlayedSlots(note);
  pauseCapture();
  session.locked = true;
  const verdict = judgePlayed(note.midi, pitches.expected);
  const interval = session.current.interval;

  if (verdict.exact) {
    session.correct += 1;
    elements.answerFeedback.textContent = t('training.play.correctFeedback', {
      played: verdict.label,
      name: intervalName(interval.id),
    });
    elements.answerFeedback.className = 'quiz-feedback success';
    updateStats();
    session.nextTimer = window.setTimeout(nextQuestion, 1100);
    return;
  }

  session.errors += 1;
  // The right note in the wrong octave is worth saying out loud: the interval was
  // heard correctly and only the register slipped, which is a different mistake
  // from playing the wrong note.
  elements.answerFeedback.textContent = verdict.sameNote
    ? t(verdict.octaves > 0 ? 'training.play.octaveHigh' : 'training.play.octaveLow', { played: verdict.label })
    : t('training.play.wrongFeedback', { played: verdict.label });
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

// Sounds the question, and only then starts listening.
//
// Arming before playback meant the microphone was open while the speakers were
// answering the question for you: in a room, the note the app plays is heard by
// the app. Now the attempt opens once the last note has been sounded, so the only
// thing that can be captured is the guitar.
export async function askPlayQuestion(button = null) {
  if (!session.running || !session.current) return;
  pauseCapture();
  // Say so, so the pause between hearing and playing is understood as a cue
  // rather than as the app being slow.
  elements.answerFeedback.textContent = t('training.play.listenThenPlay');
  elements.answerFeedback.className = 'quiz-feedback';
  await playCurrentQuestion(button);
  // playCurrentQuestion resolves once the notes are scheduled, not once they have
  // stopped sounding, so the wait is for silence rather than for the promise.
  await waitForQuiet();
  if (!session.running || session.locked) return;
  armAttempt();
  elements.answerFeedback.textContent = t('training.play.yourTurn');
  elements.answerFeedback.className = 'quiz-feedback';
}
