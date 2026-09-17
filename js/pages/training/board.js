import { inferOpenMidis } from '../../core/guitar-audio.js';
import { t } from '../../i18n/i18n.js';

export const MAX_FRET = 15;
export const STANDARD_TUNING = [4, 9, 2, 7, 11, 4]; // low string -> high string, pitch classes (E A D G B E)
export const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NOTE_NAMES = PITCH_NAMES;
const mod12 = (value) => ((value % 12) + 12) % 12;

let tuning = [...STANDARD_TUNING];
export let OPEN_MIDIS = inferOpenMidis(tuning, 'guitar');
export let boardCells = buildBoardCells();

function buildBoardCells() {
  const cells = [];
  for (let stringIndex = 0; stringIndex < OPEN_MIDIS.length; stringIndex += 1) {
    for (let fret = 0; fret <= MAX_FRET; fret += 1) {
      cells.push({ stringIndex, fret, midi: OPEN_MIDIS[stringIndex] + fret });
    }
  }
  return cells;
}

function recomputeFromTuning() {
  OPEN_MIDIS = inferOpenMidis(tuning, 'guitar');
  boardCells = buildBoardCells();
}

export function getTuning() {
  return tuning.slice();
}

export function tuningLabel() {
  return tuning.map((pitch) => NOTE_NAMES[mod12(pitch)]).join(' · ');
}

export function setTuningString(stringIndex, pitchClass) {
  tuning[stringIndex] = mod12(pitchClass);
  recomputeFromTuning();
}

export function shiftTuningString(stringIndex, semitones) {
  tuning[stringIndex] = mod12(tuning[stringIndex] + semitones);
  recomputeFromTuning();
}

export function shiftTuningAll(semitones) {
  tuning = tuning.map((pitch) => mod12(pitch + semitones));
  recomputeFromTuning();
}

export function resetTuning() {
  tuning = [...STANDARD_TUNING];
  recomputeFromTuning();
}

export function noteName(midi) {
  const safeMidi = Math.round(Number(midi) || 0);
  return `${NOTE_NAMES[mod12(safeMidi)]}${Math.floor(safeMidi / 12) - 1}`;
}

export function fretLabel(fret) {
  return fret === 0 ? t('training.board.openString') : t('training.board.fretN', { n: fret });
}

export function cellKey(cell) {
  return `${cell.stringIndex}:${cell.fret}`;
}

// Shared fretboard grid used by both the "Learn" map and the quiz board.
// `targetMarker` is the symbol shown on matched-interval cells in learn mode
// (the caller looks it up via intervalShort() — board.js stays interval-agnostic).
export function renderBoard(container, { anchor = null, targets = [], quizPair = null, interactive = false, targetMarker = '' } = {}) {
  if (!container) return;
  const targetKeys = new Set(targets.map(cellKey));
  const pairRootKey = quizPair ? cellKey(quizPair.root) : '';
  const pairTargetKey = quizPair ? cellKey(quizPair.target) : '';
  let html = '<div class="interval-fret-numbers"><span></span>';
  for (let fret = 0; fret <= MAX_FRET; fret += 1) {
    html += `<span>${fret === 0 ? t('training.board.fretHeaderOpen') : fret}</span>`;
  }
  html += '</div>';

  for (let stringIndex = OPEN_MIDIS.length - 1; stringIndex >= 0; stringIndex -= 1) {
    const stringNumber = 6 - stringIndex;
    const stringThickness = (1.2 + (OPEN_MIDIS.length - 1 - stringIndex) * 0.45).toFixed(2);
    html += '<div class="interval-string">';
    html += `<div class="interval-string-label"><span>${stringNumber}</span><small>${noteName(OPEN_MIDIS[stringIndex])}</small></div>`;
    for (let fret = 0; fret <= MAX_FRET; fret += 1) {
      const cell = { stringIndex, fret, midi: OPEN_MIDIS[stringIndex] + fret };
      const key = cellKey(cell);
      const isAnchor = anchor && key === cellKey(anchor);
      const isTarget = targetKeys.has(key);
      const isQuizRoot = key === pairRootKey;
      const isQuizTarget = key === pairTargetKey;
      const direction = anchor && cell.midi > anchor.midi ? 'higher' : 'lower';
      const marker = isQuizRoot ? '1' : isQuizTarget ? '2' : isAnchor ? '1' : isTarget ? targetMarker : noteName(cell.midi).replace(/\d+$/, '') || '•';
      const classes = ['interval-cell'];
      if (stringNumber >= 4) classes.push('wound');
      if (isAnchor) classes.push('anchor');
      if (isQuizRoot) classes.push('quiz-first');
      if (isTarget) classes.push('target', direction);
      if (isQuizTarget) classes.push('quiz-second');
      const extra = (isAnchor || isQuizRoot ? t('training.board.firstNoteSuffix') : '') + (isTarget || isQuizTarget ? t('training.board.secondNoteSuffix') : '');
      const label = t('training.board.cellAria', { string: stringNumber, fretLabel: fretLabel(fret), note: noteName(cell.midi), extra });
      if (interactive) {
        html += `<button class="${classes.join(' ')}" type="button" data-learn-cell="${key}" style="--training-string:${stringThickness}px" aria-label="${label}"><span class="interval-note">${marker}</span></button>`;
      } else {
        html += `<div class="${classes.join(' ')}" role="img" style="--training-string:${stringThickness}px" aria-label="${label}"><span class="interval-note">${marker}</span></div>`;
      }
    }
    html += '</div>';
  }
  container.innerHTML = html;
}
