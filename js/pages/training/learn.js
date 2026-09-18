import { t, pluralize } from '../../i18n/i18n.js';
import { INTERVALS, getInterval, intervalShort, intervalName, intervalDescription } from './intervals-data.js';
import {
  boardCells, cellKey, fretLabel, noteName, renderBoard,
  OPEN_MIDIS, PITCH_NAMES, getTuning, tuningLabel, setTuningString, shiftTuningString, shiftTuningAll, resetTuning,
} from './board.js';
import { elements } from './elements.js';

export let learnAnchor = { stringIndex: 0, fret: 0, midi: 40 };

export function setLearnAnchor(anchor) {
  learnAnchor = anchor;
}

function syncAnchorToTuning() {
  learnAnchor = { ...learnAnchor, midi: OPEN_MIDIS[learnAnchor.stringIndex] + learnAnchor.fret };
}

// The tuning controls live in this module but the scale board is drawn from the
// same open strings, so anything else that depends on the tuning subscribes here
// rather than duplicating the wiring.
const tuningListeners = [];

export function onTuningChange(listener) {
  tuningListeners.push(listener);
}

function onTuningChanged() {
  syncAnchorToTuning();
  if (elements.tuningBadge) elements.tuningBadge.textContent = tuningLabel();
  renderTuningControls();
  renderLearning();
  tuningListeners.forEach((listener) => listener());
}

export function renderTuningControls() {
  if (!elements.tuning) return;
  const tuning = getTuning();
  elements.tuning.innerHTML = tuning.map((pitch, index) => {
    const stringNumber = tuning.length - index;
    const descriptor = index === 0 ? t('builder.tuning.bassDescriptor') : index === tuning.length - 1 ? t('builder.tuning.firstDescriptor') : '';
    return `<div class="tune-row">
      <span class="string-number">${stringNumber}</span>
      <select data-tune="${index}" aria-label="${t('builder.tuning.stringAria', { n: stringNumber })}">
        ${PITCH_NAMES.map((name, value) => `<option value="${value}" ${pitch === value ? 'selected' : ''}>${name}</option>`).join('')}
      </select>
      <span class="tune-stepper">
        <button type="button" class="tune-step" data-tune-step="${index}" data-dir="1" aria-label="${t('builder.tuning.raiseAria', { n: stringNumber })}">▲</button>
        <button type="button" class="tune-step" data-tune-step="${index}" data-dir="-1" aria-label="${t('builder.tuning.lowerAria', { n: stringNumber })}">▼</button>
      </span>
      <b>${descriptor}</b>
    </div>`;
  }).join('');

  elements.tuning.querySelectorAll('[data-tune]').forEach((select) => select.addEventListener('change', (event) => {
    setTuningString(Number(event.target.dataset.tune), Number(event.target.value));
    onTuningChanged();
  }));
  elements.tuning.querySelectorAll('[data-tune-step]').forEach((button) => button.addEventListener('click', () => {
    shiftTuningString(Number(button.dataset.tuneStep), Number(button.dataset.dir));
    onTuningChanged();
  }));
}

export function bindTuningActions() {
  elements.tuningDown?.addEventListener('click', () => { shiftTuningAll(-1); onTuningChanged(); });
  elements.tuningUp?.addEventListener('click', () => { shiftTuningAll(1); onTuningChanged(); });
  elements.resetTuning?.addEventListener('click', () => { resetTuning(); onTuningChanged(); });
}

// The chosen interval lives here rather than in a form control, because the rail
// is a set of buttons: one click, everything visible at once, no list to open.
let selectedIntervalId = 'p8';

export function getLearnInterval() {
  return getInterval(selectedIntervalId);
}

export function setLearnInterval(id) {
  selectedIntervalId = getInterval(id).id;
}

export function findTargets(anchor, interval) {
  return boardCells.filter((cell) => {
    if (cellKey(cell) === cellKey(anchor)) return false;
    return Math.abs(cell.midi - anchor.midi) === interval.semitones;
  });
}

export function renderLearning() {
  const interval = getLearnInterval();
  const targets = findTargets(learnAnchor, interval);
  elements.anchorNote.textContent = noteName(learnAnchor.midi);
  elements.anchorPosition.textContent = t('training.learn.anchorPositionTemplate', { string: 6 - learnAnchor.stringIndex, fretLabel: fretLabel(learnAnchor.fret) });
  const distance = `${interval.semitones} ${pluralize('interval.unit.semitone', interval.semitones)} · ${targets.length} ${pluralize('interval.unit.position', targets.length)}`;
  elements.intervalExplainer.innerHTML = `<span class="interval-symbol">${intervalShort(interval.id)}</span><span class="interval-copy"><strong>${intervalName(interval.id)}</strong><span>${intervalDescription(interval.id)}</span></span><span class="interval-distance">${distance}</span>`;
  renderBoard(elements.learnFretboard, { anchor: learnAnchor, targets, interactive: true, targetMarker: intervalShort(interval.id) });
}

export function chooseLearnTarget() {
  const targets = findTargets(learnAnchor, getLearnInterval());
  if (!targets.length) return null;
  return targets
    .slice()
    .sort((a, b) => {
      const aHigher = a.midi >= learnAnchor.midi ? 0 : 1;
      const bHigher = b.midi >= learnAnchor.midi ? 0 : 1;
      return aHigher - bHigher || Math.abs(a.fret - learnAnchor.fret) - Math.abs(b.fret - learnAnchor.fret);
    })[0];
}

// Interval families, used only to tint the rail: perfect intervals read as one
// group, major and minor as their own, and the tritone stands alone — which is
// roughly how they sound, and makes the row scannable without reading every label.
function intervalFamily(id) {
  if (id === 'tt') return 'tritone';
  if (id.startsWith('p')) return 'perfect';
  return id.startsWith('m') ? 'minor' : 'major';
}

export function renderIntervalRail() {
  if (!elements.intervalRail) return;
  elements.intervalRail.innerHTML = INTERVALS.map((interval) => {
    const active = interval.id === selectedIntervalId;
    return `<button type="button" role="radio" class="interval-chip ${intervalFamily(interval.id)}${active ? ' active' : ''}"
      aria-checked="${active}" data-interval="${interval.id}"
      title="${intervalName(interval.id)}" aria-label="${intervalName(interval.id)}">
      <strong>${intervalShort(interval.id)}</strong>
      <small>${interval.semitones}</small>
    </button>`;
  }).join('');
}
