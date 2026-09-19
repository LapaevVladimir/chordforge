// The note quiz: everything that is specific to naming notes on the neck.
// The session itself — the counters, start/stop, the "next question" rhythm —
// belongs to quiz.js, which drives both this and the interval quiz.

import { t } from '../../i18n/i18n.js';
import { boardCells, PITCH_NAMES, OPEN_MIDIS, noteName } from './board.js';
import { elements } from './elements.js';

const mod12 = (value) => ((value % 12) + 12) % 12;

// The flat spelling of each pitch class, or null where there is nothing to say.
// Shown under the answer button: the same fret is called D♯ in one key and E♭ in
// another, and a player who has only ever seen one of the two is stuck the first
// time a chart uses the other.
const FLAT_NAMES = [null, 'D♭', null, 'E♭', null, null, 'G♭', null, 'A♭', null, 'B♭', null];

export const FRET_RANGES = {
  first: [0, 5],
  half: [0, 12],
  whole: [0, 15],
};

export function isNoteMode(mode) {
  return mode === 'noteName' || mode === 'noteFind';
}

export function renderNoteFilterOptions() {
  if (!elements.noteChecks) return;
  elements.noteChecks.innerHTML = PITCH_NAMES.map((name, pitchClass) => `
    <label class="interval-check">
      <input type="checkbox" value="${pitchClass}" ${FLAT_NAMES[pitchClass] ? '' : 'checked'}>
      <span><strong>${name}</strong>${FLAT_NAMES[pitchClass] ? `<small>${FLAT_NAMES[pitchClass]}</small>` : ''}</span>
    </label>
  `).join('');
}

// One box per string, labelled the way a player counts them: string 1 is the
// thinnest. The open note is shown too, because in an altered tuning the number
// alone no longer says which string is which.
export function renderStringFilterOptions() {
  if (!elements.stringChecks) return;
  const count = OPEN_MIDIS.length;
  elements.stringChecks.innerHTML = Array.from({ length: count }, (_, stringIndex) => {
    const stringNumber = count - stringIndex;
    return `
      <label class="interval-check">
        <input type="checkbox" value="${stringIndex}" checked>
        <span><strong>${stringNumber}</strong><small>${noteName(OPEN_MIDIS[stringIndex])}</small></span>
      </label>
    `;
  }).reverse().join('');
}

export function selectedNotes() {
  return new Set([...elements.noteChecks.querySelectorAll('input:checked')].map((input) => Number(input.value)));
}

export function selectedStrings() {
  return new Set([...elements.stringChecks.querySelectorAll('input:checked')].map((input) => Number(input.value)));
}

export function fretRange() {
  const choice = document.querySelector('input[name="quizFretRange"]:checked')?.value;
  return FRET_RANGES[choice] || FRET_RANGES.whole;
}

// Which cells a question may be drawn from, and — in "find the note" — which
// ones the neck will accept a tap on.
export function candidateCells() {
  const notes = selectedNotes();
  const strings = selectedStrings();
  const [from, to] = fretRange();
  return boardCells.filter((cell) => strings.has(cell.stringIndex)
    && cell.fret >= from && cell.fret <= to
    && notes.has(mod12(cell.midi)));
}

export function inSelectedRange(cell) {
  const strings = selectedStrings();
  const [from, to] = fretRange();
  return strings.has(cell.stringIndex) && cell.fret >= from && cell.fret <= to;
}

// Why a quiz cannot start, or null when it can. Naming a note needs at least two
// answers to choose between; finding one needs only somewhere to look for it.
export function noteSetupProblem(mode) {
  const notes = selectedNotes();
  if (mode === 'noteName' && notes.size < 2) return t('training.noteQuiz.needTwoNotes');
  if (!notes.size) return t('training.noteQuiz.needOneNote');
  if (!selectedStrings().size) return t('training.noteQuiz.needOneString');
  if (!candidateCells().length) return t('training.noteQuiz.nothingInRange');
  return null;
}

export function makeNoteQuestion(mode) {
  const cells = candidateCells();
  if (!cells.length) return null;
  const cell = cells[Math.floor(Math.random() * cells.length)];
  return { mode, cell, pitchClass: mod12(cell.midi) };
}

export function noteLabel(pitchClass) {
  return PITCH_NAMES[mod12(pitchClass)];
}

export function renderNoteAnswers(pitchClasses) {
  elements.answerGrid.innerHTML = [...pitchClasses].sort((a, b) => a - b).map((pitchClass) => `
    <button class="answer-button" type="button" data-note-answer="${pitchClass}">
      <strong>${PITCH_NAMES[pitchClass]}</strong>${FLAT_NAMES[pitchClass] ? `<span>${FLAT_NAMES[pitchClass]}</span>` : ''}
    </button>
  `).join('');
}
