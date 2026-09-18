import { t } from '../../i18n/i18n.js';
import {
  SCALES, getScale, scaleCells, scalePositions, scaleFormula, positionRun, DEGREE_LABELS,
} from '../../core/scales.js';
import { MAX_FRET, OPEN_MIDIS, PITCH_NAMES, renderScaleBoard } from './board.js';
import { elements } from './elements.js';
import { playSequence, showToast } from './playback.js';

const mod12 = (value) => ((value % 12) + 12) % 12;

// A minor pentatonic in first position: the shape almost everyone learns first,
// so the page opens on something recognisable rather than on an empty state.
const state = {
  rootPitchClass: 9,
  scaleId: 'minorPentatonic',
  positionNumber: 1,
  showNoteNames: false,
};

const scaleName = (id) => t(`scale.${id}.name`);
const scaleDescription = (id) => t(`scale.${id}.description`);

function currentScale() {
  return getScale(state.scaleId);
}

function currentPositions() {
  return scalePositions(currentScale(), state.rootPitchClass, OPEN_MIDIS, MAX_FRET);
}

function currentPosition(positions) {
  if (state.positionNumber === 0) return null;
  return positions.find((position) => position.number === state.positionNumber) || positions[0] || null;
}

/* ---------------------------------------------------------------- sidebar */

function renderRootPicker() {
  if (!elements.scaleRoot) return;
  elements.scaleRoot.innerHTML = PITCH_NAMES.map((name, pitchClass) => `
    <button type="button" role="radio" class="pitch-chip${pitchClass === state.rootPitchClass ? ' active' : ''}"
      aria-checked="${pitchClass === state.rootPitchClass}" data-scale-root="${pitchClass}">${name}</button>`).join('');
}

function renderScalePicker() {
  if (!elements.scaleType) return;
  elements.scaleType.innerHTML = SCALES.map((scale) => `
    <button type="button" role="radio" class="scale-option${scale.id === state.scaleId ? ' active' : ''}"
      aria-checked="${scale.id === state.scaleId}" data-scale-type="${scale.id}">
      <strong>${scaleName(scale.id)}</strong>
      <small>${scaleFormula(scale).join(' ')}</small>
    </button>`).join('');
}

function renderPositionPicker(positions) {
  if (!elements.scalePosition) return;
  const whole = `<button type="button" role="radio" class="position-chip wide${state.positionNumber === 0 ? ' active' : ''}"
    aria-checked="${state.positionNumber === 0}" data-scale-position="0">${t('training.scales.wholeNeck')}</button>`;
  const chips = positions.map((position) => `
    <button type="button" role="radio" class="position-chip${position.number === state.positionNumber ? ' active' : ''}"
      aria-checked="${position.number === state.positionNumber}" data-scale-position="${position.number}"
      aria-label="${t('training.scales.positionAria', { n: position.number, from: position.from, to: position.to })}">
      <strong>${position.number}</strong>
      <small>${position.from}–${position.to}</small>
    </button>`).join('');
  elements.scalePosition.innerHTML = whole + chips;
}

/* --------------------------------------------------------------- workspace */

function renderExplainer(scale, cells, position) {
  if (!elements.scaleExplainer) return;
  const rootName = PITCH_NAMES[state.rootPitchClass];
  const pitches = scale.intervals.map((offset) => PITCH_NAMES[mod12(state.rootPitchClass + offset)]);
  const scope = position
    ? t('training.scales.positionScope', { n: position.number, from: position.from, to: position.to })
    : t('training.scales.wholeNeckScope', { n: cells.length });

  elements.scaleExplainer.innerHTML = `
    <span class="interval-symbol">${rootName}</span>
    <span class="interval-copy">
      <strong>${rootName} ${scaleName(scale.id)}</strong>
      <span>${scaleDescription(scale.id)}</span>
    </span>
    <span class="scale-formula">
      ${scale.intervals.map((offset, index) => `<b><i>${DEGREE_LABELS[offset]}</i>${pitches[index]}</b>`).join('')}
    </span>
    <span class="interval-distance">${scope}</span>`;
}

export function renderScales() {
  if (!elements.scaleFretboard) return;
  const scale = currentScale();
  const positions = currentPositions();
  if (state.positionNumber > positions.length) state.positionNumber = positions.length ? 1 : 0;
  const position = currentPosition(positions);
  const cells = scaleCells(scale, state.rootPitchClass, OPEN_MIDIS, MAX_FRET);

  renderRootPicker();
  renderScalePicker();
  renderPositionPicker(positions);
  renderExplainer(scale, cells, position);
  renderScaleBoard(elements.scaleFretboard, { cells, position, showNoteNames: state.showNoteNames });
  if (elements.scaleNamesToggle) elements.scaleNamesToggle.checked = state.showNoteNames;
}

/* ----------------------------------------------------------------- events */

export function bindScaleEvents() {
  elements.scaleRoot?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scale-root]');
    if (!button) return;
    state.rootPitchClass = Number(button.dataset.scaleRoot);
    renderScales();
  });

  elements.scaleType?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scale-type]');
    if (!button) return;
    state.scaleId = button.dataset.scaleType;
    // Position numbers mean different boxes in a different scale, so start over
    // at the lowest one instead of keeping a number that now points elsewhere.
    state.positionNumber = 1;
    renderScales();
  });

  elements.scalePosition?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scale-position]');
    if (!button) return;
    state.positionNumber = Number(button.dataset.scalePosition);
    renderScales();
  });

  elements.scaleNamesToggle?.addEventListener('change', () => {
    state.showNoteNames = elements.scaleNamesToggle.checked;
    renderScales();
  });

  elements.playScale?.addEventListener('click', () => {
    const scale = currentScale();
    const cells = scaleCells(scale, state.rootPitchClass, OPEN_MIDIS, MAX_FRET);
    const position = currentPosition(currentPositions());
    // Playing the whole neck would be a minute of notes, so without a position
    // the run is the first box rather than everything.
    const box = position || currentPositions()[0] || null;
    const run = positionRun(cells, box);
    if (!run.length) {
      showToast(t('training.scales.nothingToPlay'));
      return;
    }
    playSequence(run, elements.playScale);
  });
}

// Lets the page title line say which scale is on screen without reaching into
// module state from elsewhere.
export function currentScaleLabel() {
  return `${PITCH_NAMES[state.rootPitchClass]} ${scaleName(state.scaleId)}`;
}
