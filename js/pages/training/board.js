import { createTuning, STANDARD_TUNING, PITCH_NAMES } from '../../core/tuning.js';
import { DEGREE_LABELS } from '../../core/scales.js';
import { t } from '../../i18n/i18n.js';

export const MAX_FRET = 15;
export { STANDARD_TUNING, PITCH_NAMES };
const mod12 = (value) => ((value % 12) + 12) % 12;

const tuning = createTuning(STANDARD_TUNING, 'guitar');
export let OPEN_MIDIS = tuning.openMidis;
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
  OPEN_MIDIS = tuning.openMidis;
  boardCells = buildBoardCells();
}

export function getTuning() {
  return tuning.pitches;
}

export function tuningLabel() {
  return tuning.label();
}

export function setTuningString(stringIndex, pitchClass) {
  tuning.setString(stringIndex, pitchClass);
  recomputeFromTuning();
}

export function shiftTuningString(stringIndex, semitones) {
  tuning.shiftString(stringIndex, semitones);
  recomputeFromTuning();
}

export function shiftTuningAll(semitones) {
  tuning.shiftAll(semitones);
  recomputeFromTuning();
}

export function resetTuning() {
  tuning.reset();
  recomputeFromTuning();
}

export function noteName(midi) {
  const safeMidi = Math.round(Number(midi) || 0);
  return `${PITCH_NAMES[mod12(safeMidi)]}${Math.floor(safeMidi / 12) - 1}`;
}

export function fretLabel(fret) {
  return fret === 0 ? t('training.board.openString') : t('training.board.fretN', { n: fret });
}

export function cellKey(cell) {
  return `${cell.stringIndex}:${cell.fret}`;
}

// The bare fretboard grid, shared by every board on the training pages. Callers
// supply `decorate(cell)`, which returns what to put in a cell and how to mark
// it; nothing about intervals or scales leaks in here.
function renderGrid(container, { interactive = false, cellAttr = '', decorate }) {
  if (!container) return;
  let html = '<div class="interval-fret-numbers"><span></span>';
  for (let fret = 0; fret <= MAX_FRET; fret += 1) {
    html += `<span>${fret === 0 ? t('training.board.fretHeaderOpen') : fret}</span>`;
  }
  html += '</div>';

  for (let stringIndex = OPEN_MIDIS.length - 1; stringIndex >= 0; stringIndex -= 1) {
    const stringNumber = OPEN_MIDIS.length - stringIndex;
    const stringThickness = (1.2 + (OPEN_MIDIS.length - 1 - stringIndex) * 0.45).toFixed(2);
    html += '<div class="interval-string">';
    html += `<div class="interval-string-label"><span>${stringNumber}</span><small>${noteName(OPEN_MIDIS[stringIndex])}</small></div>`;
    for (let fret = 0; fret <= MAX_FRET; fret += 1) {
      const cell = { stringIndex, fret, midi: OPEN_MIDIS[stringIndex] + fret, stringNumber };
      const { marker, classes = [], label } = decorate(cell);
      const allClasses = ['interval-cell', ...(stringNumber >= 4 ? ['wound'] : []), ...classes];
      const attrs = `class="${allClasses.join(' ')}" style="--training-string:${stringThickness}px" aria-label="${label}"`;
      html += interactive
        ? `<button ${attrs} type="button" ${cellAttr}="${cellKey(cell)}"><span class="interval-note">${marker}</span></button>`
        : `<div ${attrs} role="img"><span class="interval-note">${marker}</span></div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

// The "Learn" interval map and the quiz board. `targetMarker` is the symbol shown
// on matched-interval cells (the caller looks it up via intervalShort(), so
// board.js stays interval-agnostic).
export function renderBoard(container, { anchor = null, targets = [], quizPair = null, interactive = false, targetMarker = '' } = {}) {
  const targetKeys = new Set(targets.map(cellKey));
  const pairRootKey = quizPair ? cellKey(quizPair.root) : '';
  const pairTargetKey = quizPair ? cellKey(quizPair.target) : '';

  renderGrid(container, {
    interactive,
    cellAttr: 'data-learn-cell',
    decorate: (cell) => {
      const key = cellKey(cell);
      const isAnchor = anchor && key === cellKey(anchor);
      const isTarget = targetKeys.has(key);
      const isQuizRoot = key === pairRootKey;
      const isQuizTarget = key === pairTargetKey;
      const direction = anchor && cell.midi > anchor.midi ? 'higher' : 'lower';
      const marker = isQuizRoot ? '1' : isQuizTarget ? '2' : isAnchor ? '1' : isTarget ? targetMarker : noteName(cell.midi).replace(/\d+$/, '') || '•';
      const classes = [];
      if (isAnchor) classes.push('anchor');
      if (isQuizRoot) classes.push('quiz-first');
      if (isTarget) classes.push('target', direction);
      if (isQuizTarget) classes.push('quiz-second');
      const extra = (isAnchor || isQuizRoot ? t('training.board.firstNoteSuffix') : '') + (isTarget || isQuizTarget ? t('training.board.secondNoteSuffix') : '');
      return { marker, classes, label: t('training.board.cellAria', { string: cell.stringNumber, fretLabel: fretLabel(cell.fret), note: noteName(cell.midi), extra }) };
    },
  });
}

// The scale map. Notes of the scale carry their degree; those outside the chosen
// position stay visible but dimmed, so the box is seen in the context of the
// whole neck rather than floating on its own.
export function renderScaleBoard(container, { cells = [], position = null, showNoteNames = false } = {}) {
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell]));

  renderGrid(container, {
    cellAttr: 'data-scale-cell',
    decorate: (cell) => {
      const scaleCell = byKey.get(cellKey(cell));
      const inWindow = !position || (cell.fret >= position.from && cell.fret <= position.to);
      if (!scaleCell) {
        return {
          marker: '',
          classes: ['scale-rest'],
          label: t('training.scales.restCellAria', { string: cell.stringNumber, fretLabel: fretLabel(cell.fret), note: noteName(cell.midi) }),
        };
      }
      const classes = ['scale-note'];
      if (scaleCell.root) classes.push('scale-root');
      if (!inWindow) classes.push('scale-outside');
      const degree = DEGREE_LABELS[scaleCell.degree];
      return {
        marker: showNoteNames ? noteName(cell.midi).replace(/\d+$/, '') : degree,
        classes,
        label: t('training.scales.cellAria', {
          string: cell.stringNumber,
          fretLabel: fretLabel(cell.fret),
          note: noteName(cell.midi),
          degree,
        }),
      };
    },
  });
}
