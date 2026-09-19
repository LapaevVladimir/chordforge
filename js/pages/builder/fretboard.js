import * as Engine from '../../core/chord-engine.js';
import * as Audio from '../../core/guitar-audio.js';
import { escapeHtml } from '../../core/utils.js';
import { t, pluralize } from '../../i18n/i18n.js';
import {
  store, PITCHES, PRESETS, normalizeState, currentAnalysis, persistState,
  matchPreset, matchSavedTuning, readSavedTunings,
} from './store.js';
import { layoutRotatedBoard, isVertical } from '../../core/board-orientation.js';
import { strumActionName, strumCountLabels, renderStrumSteps } from './strum.js';
import { audio, stopPlayback, showToast, updateSampleStatus, playString } from './playback.js';

// Reconstructs the localized description sentence from a language-agnostic chord-engine
// analysis (see js/core/chord-engine.js) — same branches/punctuation the engine used to bake in.
export function describeAnalysis(analysis) {
  if (analysis.confidence === 'none') return t('chord.noSound');
  if (analysis.confidence === 'note') return t('chord.singleNote', { name: analysis.name });
  if (analysis.confidence === 'set') return t('chord.noExactMatch');
  const preferFlats = Boolean(store.state.preferFlats);
  const rootName = Engine.noteName(analysis.root, preferFlats);
  const qualityTitle = t(`chord.quality.${analysis.quality.id}`);
  const inversion = analysis.bass !== analysis.root ? t('chord.inversionSuffix', { name: Engine.noteName(analysis.bass, preferFlats) }) : '';
  const omission = analysis.confidence === 'omitted' ? t('chord.omittedFifth') : '';
  return `${rootName} ${qualityTitle}${inversion}${omission}`;
}

function fretWidths() {
  const state = store.state;
  const weights = Array.from({ length: state.frets }, (_, index) => Math.pow(2, -index / 12));
  const viewportWidth = document.getElementById('fretScroll')?.clientWidth || Math.max(760, window.innerWidth - 380);
  // Standing upright, the neck runs down the screen, so it is the height that
  // says how long it can be. Measuring it against a phone's width instead would
  // squeeze every fret to its minimum.
  const availableWidth = isVertical()
    ? Math.max(480, window.innerHeight - 250)
    : Math.max(420, viewportWidth - 136);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => Math.max(30, Math.round(availableWidth * weight / weightTotal)));
}

export function renderTuning() {
  const state = store.state;
  document.getElementById('tuning').innerHTML = state.tuning.map((pitch, index) => {
    const descriptor = index === 0 ? t('builder.tuning.bassDescriptor') : index === state.strings - 1 ? t('builder.tuning.firstDescriptor') : '';
    const stringNumber = state.strings - index;
    return `<div class="tune-row">
      <span class="string-number">${stringNumber}</span>
      <select data-tune="${index}" aria-label="${t('builder.tuning.stringAria', { n: stringNumber })}">
        ${PITCHES.map((name, value) => `<option value="${value}" ${pitch === value ? 'selected' : ''}>${name}</option>`).join('')}
      </select>
      <span class="tune-stepper">
        <button type="button" class="tune-step" data-tune-step="${index}" data-dir="1" aria-label="${t('builder.tuning.raiseAria', { n: stringNumber })}">▲</button>
        <button type="button" class="tune-step" data-tune-step="${index}" data-dir="-1" aria-label="${t('builder.tuning.lowerAria', { n: stringNumber })}">▼</button>
      </span>
      <b>${descriptor}</b>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-tune]').forEach((select) => select.addEventListener('change', (event) => {
    state.tuning[Number(event.target.dataset.tune)] = Number(event.target.value);
    state.preset = 'custom';
    render();
  }));
  document.querySelectorAll('[data-tune-step]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.tuneStep);
    state.tuning[index] = Engine.mod12(state.tuning[index] + Number(button.dataset.dir));
    state.preset = 'custom';
    render();
  }));
}

export function renderBoard(options = {}) {
  if (options.stopAudio !== false) stopPlayback();
  const state = store.state;
  const analysis = currentAnalysis();
  const widths = fretWidths();
  const columns = widths.map((width) => `${width}px`).join(' ');
  const neckWidth = widths.reduce((sum, width) => sum + width, 0);
  const stringOrder = Array.from({ length: state.strings }, (_, index) => state.strings - 1 - index);
  const openMidis = Audio.inferOpenMidis(state.tuning, state.register);
  const numbers = widths.map((width, index) => `<span style="width:${width}px">${index + 1}</span>`).join('');
  let stringControlsHtml = '';
  let neckRowsHtml = '';

  for (const stringIndex of stringOrder) {
    const selected = state.shape[stringIndex];
    const openPitch = Engine.soundingPitch(state.tuning[stringIndex], 0, state.capo);
    const thickness = (1.2 + (state.strings - 1 - stringIndex) * (2.7 / Math.max(1, state.strings - 1))).toFixed(2);
    const isWound = state.strings === 4 || stringIndex < Math.ceil(state.strings / 2);
    const noteAtOpen = Engine.noteName(openPitch, state.preferFlats);
    const stateText = selected === null ? '×' : `○ ${noteAtOpen}`;
    const stateTitle = selected === null ? t('builder.fretboard.mutedTitle') : t('builder.fretboard.openTitle', { note: noteAtOpen });
    stringControlsHtml += `<button class="string-state ${selected === null ? 'muted' : ''}" data-string-state="${stringIndex}" data-midi="${openMidis[stringIndex] + state.capo}" title="${stateTitle}"><b>${stateText}</b></button>`;
    neckRowsHtml += `<div class="string-row ${isWound ? 'wound' : 'plain'}" style="grid-template-columns:${columns};--string-thickness:${thickness}px">`;
    for (let fret = 1; fret <= state.frets; fret += 1) {
      const pitch = Engine.soundingPitch(state.tuning[stringIndex], fret, state.capo);
      const active = selected === fret;
      const blocked = fret <= state.capo;
      const noteAtFret = Engine.noteName(pitch);
      neckRowsHtml += `<button class="fret-cell ${active ? 'active' : ''} ${blocked ? 'blocked' : ''}" data-string="${stringIndex}" data-fret="${fret}" data-midi="${openMidis[stringIndex] + fret}" ${blocked ? 'aria-disabled="true"' : ''} aria-label="${t('builder.fretboard.fretAria', { string: state.strings - stringIndex, fret, note: noteAtFret })}"><span class="finger-dot ${analysis.root === pitch ? 'root' : ''}"><b>${Engine.noteName(pitch, state.preferFlats)}</b></span></button>`;
    }
    neckRowsHtml += '</div>';
  }

  let inlays = '';
  const markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
  for (const fret of markerFrets.filter((value) => value <= state.frets)) {
    const left = widths.slice(0, fret - 1).reduce((sum, width) => sum + width, 0) + widths[fret - 1] / 2;
    inlays += `<span class="inlay ${fret % 12 === 0 ? 'double' : ''}" style="left:${left}px"><i></i>${fret % 12 === 0 ? '<i></i>' : ''}</span>`;
  }

  let capo = '';
  if (state.capo > 0) {
    const capoLeft = widths.slice(0, state.capo).reduce((sum, width) => sum + width, 0) - Math.max(9, widths[state.capo - 1] * 0.2);
    capo = `<div class="capo" style="left:${capoLeft}px" aria-label="${t('builder.fretboard.capoAria', { n: state.capo })}"><span class="capo-pad"></span><span class="capo-frame"></span><span class="capo-screw"></span><span class="capo-handle"></span><b>${state.capo}</b></div>`;
  }

  document.getElementById('fretboard').innerHTML = `<div class="fret-head"><span class="head-label">${t('builder.fretboard.headLabel')}</span><div class="fret-numbers" style="width:${neckWidth}px">${numbers}</div></div><div class="board-body"><div class="string-controls">${stringControlsHtml}</div><div class="neck-wrap" style="width:${neckWidth}px"><div class="neck-surface">${neckRowsHtml}${inlays}</div>${capo}</div></div>`;

  // The rotated board keeps its old layout box, so the frame it sits in has to be
  // resized every time the board is redrawn.
  layoutRotatedBoard(document.querySelector('.fret-scroll'), document.getElementById('fretboard'));

  document.querySelectorAll('[data-string]').forEach((cell) => cell.addEventListener('click', () => {
    const stringIndex = Number(cell.dataset.string);
    const fret = Number(cell.dataset.fret);
    if (fret <= state.capo) {
      showToast(t('builder.toast.fretBlockedByCapo', { fret: state.capo }));
      return;
    }
    state.shape[stringIndex] = state.shape[stringIndex] === fret ? 0 : fret;
    state.preset = 'custom';
    renderBoard();
    updateResult();
    persistState();
    void playString(stringIndex);
  }));
  document.querySelectorAll('[data-string-state]').forEach((button) => button.addEventListener('click', () => {
    const stringIndex = Number(button.dataset.stringState);
    state.shape[stringIndex] = state.shape[stringIndex] === null ? 0 : null;
    state.preset = 'custom';
    renderBoard();
    updateResult();
    persistState();
    if (state.shape[stringIndex] === null) audio.stopString(stringIndex);
    else void playString(stringIndex);
  }));
  document.querySelectorAll('[data-midi]').forEach((target) => {
    const warm = () => { audio.preload([Number(target.dataset.midi)]).then(updateSampleStatus); };
    target.addEventListener('pointerenter', warm, { once: true });
    target.addEventListener('pointerdown', warm, { once: true });
  });
  const currentMidis = Audio.soundingMidis(state.shape, state.tuning, state.capo, state.register).map((note) => note.midi);
  audio.preload([...openMidis.map((midi) => midi + state.capo), ...currentMidis]).then(updateSampleStatus);
  updateSampleStatus();
}

export function updateResult() {
  const state = store.state;
  const analysis = currentAnalysis();
  document.getElementById('chordName').textContent = analysis.name;
  document.getElementById('chordDesc').textContent = describeAnalysis(analysis);
  // Only the studio page's card is draggable onto the timeline.
  document.getElementById('currentChordDrag')?.setAttribute('aria-label', t('builder.current.dragAriaLabelNamed', { name: analysis.name }));
  document.getElementById('confidence').textContent = t(`builder.confidence.${analysis.confidence === 'exact' ? 'exact' : analysis.confidence === 'omitted' ? 'omitted' : 'analysis'}`);
  document.getElementById('confidence').className = `confidence ${analysis.confidence}`;
  document.getElementById('notes').innerHTML = analysis.tones.map((pitch) => `<span class="note-chip ${pitch === analysis.root ? 'root' : ''}">${Engine.noteName(pitch, state.preferFlats)}</span>`).join('');
  document.getElementById('alternatives').innerHTML = analysis.alternatives.length
    ? analysis.alternatives.map((name) => `<button class="alt" data-chord="${escapeHtml(name.replace(/\(no5\)/g, ''))}">${escapeHtml(name)}</button>`).join('')
    : `<span class="tiny-note">${t('chord.noAlternatives')}</span>`;
  document.querySelectorAll('.alt').forEach((button) => button.addEventListener('click', () => findShape(button.dataset.chord)));
}

export function renderStrumEditor(activeIndex = -1) {
  const state = store.state;
  // The chord-identifier page reuses this module but has no strum editor.
  if (!document.getElementById('strumPattern')) return;
  document.getElementById('strumStepCount').value = String(state.strumPattern.length);
  document.getElementById('strumCount').style.setProperty('--strum-steps', state.strumPattern.length);
  document.getElementById('strumPattern').style.setProperty('--strum-steps', state.strumPattern.length);
  document.getElementById('strumCount').innerHTML = strumCountLabels(state.strumPattern.length);
  renderStrumSteps(document.getElementById('strumPattern'), state.strumPattern, {
    dataAttr: 'strum-step',
    activeIndex,
    describe: (index, action) => {
      const name = strumActionName(action);
      return {
        ariaLabel: t('builder.strum.stepAria', { n: index + 1, name }),
        title: t('builder.strum.stepTitle', { n: index + 1, name }),
      };
    },
  });
}

// How many frets a chord box shows when the shape does not need more.
const VOICING_WINDOW = 5;

// Draws a shape as a chord box: a nut column saying how each string is used
// (× muted, ○ open) and a window of frets wide enough to hold every note.
//
// The window used to be pinned to the nut the moment any string rang open, which
// silently dropped every note above the fourth fret — the shape was drawn with
// blank rows where those notes should be. That is easy to hit in an altered
// tuning, where open strings often sit under a hand playing high up the neck:
// Am11 in DADGAD is x-0-0-4-3-5, and its top string simply vanished.
function renderVoicingDiagram(shape) {
  const stringOrder = Array.from({ length: shape.length }, (_, index) => shape.length - 1 - index);
  const fretted = shape.filter((position) => position !== null && position > 0);
  const lowest = fretted.length ? Math.min(...fretted) : 1;
  const highest = fretted.length ? Math.max(...fretted) : 1;
  // Stay at the nut while the notes still fit beside it; otherwise slide the
  // window up to the hand and say which fret it starts on.
  const windowStart = highest <= VOICING_WINDOW ? 1 : lowest;
  const windowEnd = Math.max(windowStart + VOICING_WINDOW - 1, highest);
  const rows = stringOrder.map((stringIndex) => {
    const value = shape[stringIndex];
    const muted = value === null;
    const open = value === 0;
    // An open string is marked at the nut wherever the window sits: up the neck
    // it is exactly the string a reader is most likely to miss.
    let cells = `<span class="voicing-nut ${muted ? 'muted' : ''} ${open ? 'open' : ''}">${muted ? '×' : open ? '○' : ''}</span>`;
    for (let fret = windowStart; fret <= windowEnd; fret += 1) {
      cells += `<span class="voicing-cell ${value === fret ? 'active' : ''}"></span>`;
    }
    return `<div class="voicing-row">${cells}</div>`;
  }).join('');
  const mark = windowStart > 1 ? `<span class="voicing-fret-mark">${t('builder.voicing.fretMark', { n: windowStart })}</span>` : '';
  // The mark sits on the left, beside the fret the window opens on.
  return `${mark}<div class="voicing-rows" style="--voicing-frets:${windowEnd - windowStart + 1}">${rows}</div>`;
}

export function closeVoicingModal() {
  document.getElementById('voicingModalOverlay').hidden = true;
  const clipEditor = document.getElementById('clipEditorOverlay');
  if (!clipEditor || clipEditor.hidden) document.body.classList.remove('modal-open');
}

export function openVoicingModal(parsed, shapes) {
  const state = store.state;
  const chordLabel = `${Engine.noteName(parsed.root, parsed.preferFlats)}${parsed.quality.suffix}${parsed.bass !== null ? `/${Engine.noteName(parsed.bass, parsed.preferFlats)}` : ''}`;
  document.getElementById('voicingModalTitle').textContent = t('builder.voicing.titleNamed', { chord: chordLabel });
  document.getElementById('voicingModalBody').innerHTML = shapes.map((candidate, index) => `<button type="button" class="voicing-card" data-voicing="${index}"><span class="voicing-position">${candidate.position === 0 ? t('builder.voicing.openPosition') : t('builder.voicing.fretPosition', { n: candidate.position })}<small>${candidate.strings} ${pluralize('builder.voicing.stringCount', candidate.strings)}</small></span><div class="voicing-diagram">${renderVoicingDiagram(candidate.shape)}</div></button>`).join('');
  document.getElementById('voicingModalBody').querySelectorAll('[data-voicing]').forEach((button) => button.addEventListener('click', () => {
    state.shape = shapes[Number(button.dataset.voicing)].shape;
    state.preset = 'custom';
    state.preferFlats = parsed.preferFlats;
    closeVoicingModal();
    render();
    showToast(t('builder.toast.shapeApplied'));
  }));
  document.getElementById('voicingModalOverlay').hidden = false;
  document.body.classList.add('modal-open');
}

export function findShape(input) {
  const state = store.state;
  const parsed = Engine.parseChord(input);
  const info = document.getElementById('shapeInfo');
  if (!parsed) {
    info.textContent = t('builder.search.parseError');
    info.classList.add('show', 'error');
    return;
  }
  // Room for six positions and a second voicing of each: the full shape and the
  // compact one are different answers, and both are worth offering.
  const shapes = Engine.generateShapes(parsed, state.tuning, state.capo, state.frets, 12);
  if (!shapes.length) {
    info.textContent = t('builder.search.noShapeFound');
    info.classList.add('show', 'error');
    return;
  }
  info.classList.remove('show', 'error');
  openVoicingModal(parsed, shapes);
}

// Fills the instrument menu and selects what the instrument actually is.
//
// The menu used to show whatever `state.preset` last said, and every fret click
// sets that to 'custom' — a value with no option behind it, so the menu fell back
// to "standard" while the neck was plainly in DADGAD. It now matches on the tuning
// itself, so the menu cannot drift away from the instrument.
//
// The saved-tunings group and the "custom" entry exist only on the chord
// identifier; where the page has neither, this keeps the previous behaviour.
function renderPresetChoice() {
  const state = store.state;
  const select = document.getElementById('preset');
  const savedGroup = document.getElementById('savedTuningGroup');
  if (savedGroup) {
    const saved = readSavedTunings();
    savedGroup.hidden = !saved.length;
    savedGroup.innerHTML = saved
      .map((entry) => `<option value="saved:${entry.id}">${escapeHtml(entry.name)}</option>`)
      .join('');
  }
  const preset = matchPreset(state);
  const savedMatch = preset ? null : (savedGroup ? matchSavedTuning(state) : null);
  const desired = preset || (savedMatch ? `saved:${savedMatch.id}` : 'custom');
  const offered = [...select.options].some((option) => option.value === desired);
  select.value = offered ? desired : (PRESETS[state.preset] ? state.preset : 'standard');
  const forget = document.getElementById('forgetTuning');
  if (forget) forget.hidden = !select.value.startsWith('saved:');
}

export function render() {
  normalizeState();
  const state = store.state;
  document.getElementById('stringCount').value = state.strings;
  document.getElementById('stringCountValue').textContent = state.strings;
  document.getElementById('fretCount').value = state.frets;
  document.getElementById('fretCountValue').textContent = state.frets;
  document.getElementById('capo').max = Math.min(12, state.frets - 1);
  document.getElementById('capo').value = state.capo;
  document.getElementById('capoValue').textContent = state.capo ? t('builder.capo.at', { n: state.capo }) : t('builder.capo.none');
  // Playback-shaping controls only exist on the studio page; the identifier
  // still keeps the values in state so its preview strum sounds the same.
  const strumInterval = document.getElementById('strumInterval');
  if (strumInterval) {
    strumInterval.value = state.strumInterval;
    document.getElementById('strumIntervalValue').textContent = state.strumInterval === 0 ? t('builder.strumInterval.together') : t('common.template.ms', { n: state.strumInterval });
  }
  const chordRelease = document.getElementById('chordRelease');
  if (chordRelease) {
    chordRelease.value = state.release;
    document.getElementById('chordReleaseValue').textContent = t('common.template.seconds', { n: state.release.toFixed(2) });
  }
  document.getElementById('capoBadge').textContent = state.capo ? t('builder.capoBadge.at', { n: state.capo }) : t('builder.capoBadge.none');
  renderPresetChoice();
  renderStrumEditor();
  renderTuning();
  renderBoard();
  updateResult();
  persistState();
}
