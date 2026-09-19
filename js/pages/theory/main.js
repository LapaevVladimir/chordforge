// The theory page: three stages of curriculum, each one explained and then put
// straight onto the neck.
//
// Nothing here draws a fretboard, defines a note, works out an interval or makes
// a sound of its own. Those all exist already and are imported:
//
//   core/pitch/note.js        pitch <-> frequency, note names, the open strings
//   core/tuning.js            PITCH_NAMES, the tuning model
//   training/board.js         every fretboard on the site
//   training/intervals-data.js the thirteen intervals
//   training/learn.js         findTargets(), which maps an interval onto the neck
//   training/playback.js      the sampled guitar
//
// What this module owns is the lesson flow: which stage is open, what the figures
// show, and the two small exercises.

import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t, pluralize } from '../../i18n/i18n.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import { initOrientation, bindOrientationToggle, onOrientationChange } from '../../core/board-orientation.js';
import {
  A4_FREQUENCY, SHARP_NAMES, FLAT_NAMES, midiToFrequency, midiLabel, midiNoteName,
  frequencyToMidi, buildStrings, STANDARD_GUITAR_MIDIS,
} from '../../core/pitch/note.js';
import { PITCH_NAMES } from '../../core/tuning.js';
import {
  OPEN_MIDIS, MAX_FRET, boardCells, cellKey, noteName, fretLabel,
  renderBoard, renderNoteBoard, tuningLabel,
} from '../training/board.js';
import { INTERVALS, getInterval, intervalShort, intervalName, intervalDescription } from '../training/intervals-data.js';
import { findTargets } from '../training/learn.js';
import { audio, showToast, playSequence, playIntervalByType } from '../training/playback.js';

const $ = (id) => document.getElementById(id);
const mod12 = (value) => ((value % 12) + 12) % 12;

const STAGES = ['basics', 'fretboard', 'intervals', 'shapes'];
const MARKER_FRETS = [3, 5, 7, 9, 12, 15];
// The seven letters, and the gap to the next one. Two of them are a single fret,
// which is the whole lesson.
const LETTERS = [0, 2, 4, 5, 7, 9, 11];

const state = {
  stage: 'basics',
  visited: new Set(['basics']),
  waveFrequency: 220,
  waveAmplitude: 40,
  ringPitchClass: 0,
  stepFret: 0,
  neckCell: { stringIndex: 0, fret: 5, midi: OPEN_MIDIS[0] + 5 },
  focusString: 0,
  showOctaves: false,
  showMarkers: false,
  intervalId: 'M3',
  shapeId: 'octave-two-two',
  shapeRoot: { stringIndex: 0, fret: 5, midi: OPEN_MIDIS[0] + 5 },
  ear: { current: null, correct: 0, wrong: 0, locked: false },
};

/* --------------------------------------------------------------- shared bits */

// Every "listen" button on the page goes through the sampled guitar the rest of
// the site uses, so the theory sounds like the tool it is teaching.
function playMidi(midi, button = null, velocity = 0.62) {
  return playSequence([Math.round(midi)], button, { velocity });
}

function formatHz(frequency) {
  return t('theory.hzValue', { n: frequency >= 100 ? frequency.toFixed(0) : frequency.toFixed(1) });
}

function cellAt(stringIndex, fret) {
  return { stringIndex, fret, midi: OPEN_MIDIS[stringIndex] + fret };
}

/* ------------------------------------------------------------- stage routing */

function renderStageList() {
  const list = $('stageList');
  list.innerHTML = STAGES.map((stage, index) => {
    const active = stage === state.stage;
    const done = state.visited.has(stage) && !active;
    return `<li>
      <button type="button" role="tab" class="stage-item${active ? ' active' : ''}${done ? ' seen' : ''}"
        aria-selected="${active}" data-stage-go="${stage}">
        <span class="stage-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="stage-copy">
          <strong>${t(`theory.${stage}.eyebrowShort`)}</strong>
          <small>${t(`theory.${stage}.tagline`)}</small>
        </span>
        <span class="stage-state" aria-hidden="true">${active ? '●' : done ? '✓' : ''}</span>
      </button>
    </li>`;
  }).join('');
  $('stageCounter').textContent = t('theory.stageCounter', { n: STAGES.indexOf(state.stage) + 1, total: STAGES.length });
}

// The contents list doubles as the reader's place in the stage: it is built from
// the lesson headings actually present, so it cannot drift from the page.
function renderLessonList() {
  const panel = document.querySelector(`[data-stage="${state.stage}"]`);
  const lessons = [...panel.querySelectorAll('.lesson')];
  $('lessonList').innerHTML = lessons.map((lesson, index) => {
    const title = lesson.querySelector('h2 span:last-child')?.textContent ?? '';
    return `<li><a href="#${lesson.id}" data-lesson-link="${lesson.id}"><span>${index + 1}</span>${title}</a></li>`;
  }).join('');
}

function showStage(stage, { scroll = true } = {}) {
  if (!STAGES.includes(stage)) return;
  state.stage = stage;
  state.visited.add(stage);
  document.querySelectorAll('.theory-stage').forEach((panel) => {
    panel.hidden = panel.dataset.stage !== stage;
  });
  renderStageList();
  renderLessonList();
  // A board laid out while its panel was hidden has no width to measure, so
  // whichever one just came on screen is drawn again.
  if (stage === 'fretboard') renderNeck();
  if (stage === 'intervals') renderIntervalStage();
  if (stage === 'shapes') renderShapeStage();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------- 01.1  what is sound */

function renderWave() {
  const frequency = state.waveFrequency;
  const amplitude = state.waveAmplitude;
  // Cycles across the drawing, not real time: the picture is about the shape of
  // the wave, and a real 220 Hz would be a solid block of ink.
  const cycles = Math.max(1, Math.round(frequency / 55));
  const points = [];
  for (let x = 0; x <= 640; x += 4) {
    const phase = (x / 640) * cycles * Math.PI * 2;
    points.push(`${x},${(75 - Math.sin(phase) * amplitude).toFixed(1)}`);
  }
  $('wavePath').setAttribute('d', `M${points.join('L')}`);
  $('waveFrequencyValue').textContent = formatHz(frequency);
  $('waveAmplitudeValue').textContent = t('theory.percentValue', { n: Math.round((amplitude / 64) * 100) });
  $('waveNote').textContent = midiLabel(Math.round(frequencyToMidi(frequency)));
}

// The amplitude slider was drawing a taller wave and nothing else, which made
// the lesson's own point ("amplitude is loudness") impossible to hear. The
// slider's range is mapped onto the sampler's velocity, so pressing Listen at
// each end is quiet and loud.
function waveVelocity() {
  const range = (state.waveAmplitude - 8) / (64 - 8);
  return 0.14 + range * 0.8;
}

function bindWave() {
  $('waveFrequency').addEventListener('input', (event) => {
    state.waveFrequency = Number(event.target.value);
    renderWave();
  });
  $('waveAmplitude').addEventListener('input', (event) => {
    state.waveAmplitude = Number(event.target.value);
    renderWave();
  });
  $('wavePlay').addEventListener('click', (event) => {
    playMidi(frequencyToMidi(state.waveFrequency), event.currentTarget, waveVelocity());
  });
}

/* ------------------------------------------------------- 01.2  the twelve notes */

function renderNoteRing() {
  $('noteRing').innerHTML = PITCH_NAMES.map((name, pitchClass) => {
    const accidental = name.length > 1;
    const active = pitchClass === state.ringPitchClass;
    return `<button type="button" class="ring-note${accidental ? ' accidental' : ''}${active ? ' active' : ''}"
      data-ring="${pitchClass}" aria-pressed="${active}">
      <strong>${name}</strong>${accidental ? `<small>${FLAT_NAMES[pitchClass]}</small>` : ''}
    </button>`;
  }).join('');
  const pitchClass = state.ringPitchClass;
  const accidental = PITCH_NAMES[pitchClass].length > 1;
  $('ringSharp').textContent = SHARP_NAMES[pitchClass];
  $('ringFlat').textContent = FLAT_NAMES[pitchClass];
  $('ringExplain').textContent = t(accidental ? 'theory.notes.enharmonic' : 'theory.notes.natural');
  document.querySelector('.figure-readout .equals').hidden = !accidental;
  $('ringFlat').hidden = !accidental;
}

/* -------------------------------------------------------------- 01.3  pitch */

function renderStringTable() {
  const strings = buildStrings(STANDARD_GUITAR_MIDIS);
  $('stringTable').querySelector('tbody').innerHTML = strings.slice().reverse().map((string) => `
    <tr>
      <th scope="row">${t('theory.pitch.stringN', { n: string.stringNumber })}</th>
      <td class="mono">${string.label}</td>
      <td class="mono">${formatHz(string.frequency)}</td>
      <td><button type="button" class="ghost-button tiny" data-play-midi="${string.midi}"
        aria-label="${t('theory.playAria', { note: string.label })}">${t('theory.listen')}</button></td>
    </tr>`).join('');
}

/* ------------------------------------------------------------ 01.4  octaves */

function renderOctaveLadder() {
  // A1 to A6: six rungs, each double the one below it.
  const midis = [33, 45, 57, 69, 81, 93];
  $('octaveLadder').innerHTML = midis.map((midi) => {
    const frequency = midiToFrequency(midi);
    const reference = midi === 69;
    return `<button type="button" class="ladder-step${reference ? ' reference' : ''}" data-play-midi="${midi}"
      aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">
      <strong>${midiLabel(midi)}</strong>
      <span class="mono">${formatHz(frequency)}</span>
      ${reference ? `<small>${t('theory.octaves.reference')}</small>` : ''}
    </button>`;
  }).join('');
}

/* ------------------------------------------------- 01.5  naming the octaves */

// Seven octaves, each named twice: by the number that follows a note name, and
// by the older word a piano teacher would use. The guitar occupies four of them.
const OCTAVE_ROWS = [0, 1, 2, 3, 4, 5, 6];
// Below this the sampled guitar has nothing near enough to stretch to, so those
// rows are read rather than heard — which is also the truth about the instrument.
const OCTAVE_AUDIBLE_FROM = 2;

function renderOctaveTable() {
  $('octaveTable').querySelector('tbody').innerHTML = OCTAVE_ROWS.map((number) => {
    const cMidi = 12 + number * 12;
    const guitar = number >= 2 && number <= 5;
    const listen = number >= OCTAVE_AUDIBLE_FROM
      ? `<button type="button" class="ghost-button tiny" data-play-midi="${cMidi}"
          aria-label="${t('theory.playAria', { note: midiLabel(cMidi) })}">${t('theory.listen')}</button>`
      : '';
    return `
    <tr class="${guitar ? 'octave-row-guitar' : ''}">
      <th scope="row" class="mono">${number}</th>
      <td>${t(`theory.octavenames.name${number}`)}</td>
      <td class="mono">${midiLabel(cMidi)} — ${midiLabel(cMidi + 11)}</td>
      <td class="octave-where">${t(`theory.octavenames.where${number}`)}</td>
      <td>${listen}</td>
    </tr>`;
  }).join('');
}

// G3 up to E4: an ordinary run of notes that happens to cross the place where
// the octave number changes. Seeing it land on C rather than on A is the lesson.
function renderOctaveBorder() {
  // A3 up to E4: short enough to stay on one line, long enough to show that the
  // number changes in the middle of an ordinary run.
  const midis = Array.from({ length: 8 }, (_, index) => 57 + index);
  $('octaveBorder').innerHTML = midis.map((midi) => {
    const turn = mod12(midi) === 0;
    return `${turn ? `<span class="border-split"><i aria-hidden="true">|</i><small>${t('theory.octavenames.borderMark')}</small></span>` : ''}
      <button type="button" class="border-note${turn ? ' turn' : ''}" data-play-midi="${midi}"
        aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">
        <strong>${SHARP_NAMES[mod12(midi)]}</strong><small>${Math.floor(midi / 12) - 1}</small>
      </button>`;
  }).join('');
}

/* ------------------------------------------------- 01.5  sharps and flats */

function renderKeyboard() {
  // One octave of keys, C to C. The missing black keys are the lesson, so the
  // white keys carry a class saying whether a black one follows.
  const whites = [0, 2, 4, 5, 7, 9, 11, 12];
  $('keyboardStrip').innerHTML = whites.map((pitchClass, index) => {
    const base = 60 + pitchClass;
    const last = index === whites.length - 1;
    const hasSharp = !last && whites[index + 1] - pitchClass === 2;
    const sharpName = hasSharp ? `${SHARP_NAMES[mod12(pitchClass + 1)]} / ${FLAT_NAMES[mod12(pitchClass + 1)]}` : '';
    return `<div class="key-slot">
      <button type="button" class="key white" data-play-midi="${base}"
        aria-label="${t('theory.playAria', { note: midiLabel(base) })}"><span>${SHARP_NAMES[mod12(pitchClass)]}</span></button>
      ${hasSharp
        ? `<button type="button" class="key black" data-play-midi="${base + 1}"
             aria-label="${t('theory.playAria', { note: midiLabel(base + 1) })}"><span>${sharpName}</span></button>`
        : last
          ? '<span class="key-end" aria-hidden="true"></span>'
          : `<span class="key-gap" title="${t('theory.accidentals.gapTitle')}">${t('theory.accidentals.gapMark')}</span>`}
    </div>`;
  }).join('');
}

/* --------------------------------------------- 01.6  semitones and whole tones */

function renderStepWalk() {
  const upTo = 12;
  $('stepWalk').innerHTML = Array.from({ length: upTo + 1 }, (_, fret) => {
    const midi = OPEN_MIDIS[0] + fret;
    const previous = OPEN_MIDIS[0] + fret - 1;
    // A "tight" step is one where the two letters have no sharp between them.
    const tight = fret > 0 && SHARP_NAMES[mod12(midi)].length === 1 && SHARP_NAMES[mod12(previous)].length === 1;
    const active = fret === state.stepFret;
    return `<button type="button" class="walk-step${active ? ' active' : ''}${tight ? ' tight' : ''}"
      data-walk="${fret}" aria-pressed="${active}">
      <strong>${SHARP_NAMES[mod12(midi)]}</strong>
      <small>${fret === 0 ? t('theory.steps.openShort') : fret}</small>
    </button>`;
  }).join('');

  const midi = OPEN_MIDIS[0] + state.stepFret;
  $('stepNote').textContent = midiLabel(midi);
  if (state.stepFret === 0) {
    $('stepGap').textContent = t('theory.steps.openString');
  } else {
    const previousName = SHARP_NAMES[mod12(midi - 1)];
    const tight = previousName.length === 1 && SHARP_NAMES[mod12(midi)].length === 1;
    $('stepGap').textContent = t(tight ? 'theory.steps.fromTight' : 'theory.steps.fromNormal', {
      from: previousName, to: SHARP_NAMES[mod12(midi)],
    });
  }
}

function setStepFret(fret) {
  state.stepFret = Math.max(0, Math.min(12, fret));
  renderStepWalk();
  void playMidi(OPEN_MIDIS[0] + state.stepFret);
}

/* -------------------------------------------------------- 02  the fretboard */

// Standard tuning is a chain, not a list: E2, then a perfect fourth at a time —
// except for the one step to the B string, which is a major third. The odd step
// is the reason for most of what is strange about the neck, so it is drawn.
function renderTuningChain() {
  $('tuningChain').innerHTML = OPEN_MIDIS.map((midi, stringIndex) => {
    const stringNumber = OPEN_MIDIS.length - stringIndex;
    const node = `<button type="button" class="chain-node" data-play-midi="${midi}"
      aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">
      <small>${t('theory.tuning.stringShort', { n: stringNumber })}</small>
      <strong>${midiLabel(midi)}</strong>
      <span class="mono">${formatHz(midiToFrequency(midi))}</span>
    </button>`;
    if (stringIndex === 0) return node;
    const step = midi - OPEN_MIDIS[stringIndex - 1];
    const interval = INTERVALS.find((entry) => entry.semitones === step);
    // Whatever is not a fourth is the exception, whichever tuning is loaded.
    const odd = step !== 5;
    return `<span class="chain-link${odd ? ' odd' : ''}">
      <i aria-hidden="true">→</i>
      <b>${interval ? intervalName(interval.id) : ''}</b>
      <small>${t('theory.tuning.chainFrets', { n: step, frets: pluralize('interval.unit.fret', step) })}</small>
    </span>${node}`;
  }).join('');
}

function renderStringPicker() {
  $('stringPicker').innerHTML = OPEN_MIDIS.map((midi, stringIndex) => {
    const stringNumber = OPEN_MIDIS.length - stringIndex;
    const active = stringIndex === state.focusString;
    return `<button type="button" role="radio" class="toggle-chip${active ? ' active' : ''}"
      aria-checked="${active}" data-focus-string="${stringIndex}">
      <strong>${stringNumber}</strong> ${midiNoteName(midi)}
    </button>`;
  }).reverse().join('');
}

function renderNeckReadout() {
  const cell = state.neckCell;
  const frequency = midiToFrequency(cell.midi);
  const octaves = findTargets(cell, getInterval('p8'));
  $('neckReadout').innerHTML = `
    <span class="readout-note">${midiLabel(cell.midi)}</span>
    <span class="readout-facts">
      <span>${t('theory.frets.readoutPlace', { string: OPEN_MIDIS.length - cell.stringIndex, fretLabel: fretLabel(cell.fret) })}</span>
      <span class="mono">${formatHz(frequency)}</span>
      <span>${t('theory.frets.readoutOctaves', { n: octaves.length, positions: pluralize('interval.unit.position', octaves.length) })}</span>
    </span>
    <button type="button" class="ghost-button" data-play-midi="${cell.midi}"
      aria-label="${t('theory.playAria', { note: midiLabel(cell.midi) })}">${t('theory.listen')}</button>`;
}

function renderRunStrip() {
  const stringIndex = state.focusString;
  $('runStrip').innerHTML = Array.from({ length: 13 }, (_, fret) => {
    const midi = OPEN_MIDIS[stringIndex] + fret;
    const tight = fret > 0
      && SHARP_NAMES[mod12(midi)].length === 1
      && SHARP_NAMES[mod12(midi - 1)].length === 1;
    return `<button type="button" class="run-step${tight ? ' tight' : ''}" data-run="${fret}"
      aria-label="${t('theory.finding.stepAria', { fretLabel: fretLabel(fret), note: midiLabel(midi) })}">
      <small>${fret}</small><strong>${SHARP_NAMES[mod12(midi)]}</strong>
    </button>`;
  }).join('');
}

// An inlay is a whole column of the neck, not six separate notes: ringing each
// note in the column read as "here are more notes", which is the opposite of
// what a marker is for. The column — the fret number above it included — is
// tinted instead, straight from the fret list rather than from a second copy of
// it in the stylesheet.
function paintMarkerFrets(container) {
  container.querySelectorAll('.marker-fret').forEach((element) => element.classList.remove('marker-fret'));
  if (!state.showMarkers) return;
  const numbers = container.querySelector('.interval-fret-numbers');
  const rows = [...container.querySelectorAll('.interval-string')];
  for (const fret of MARKER_FRETS) {
    if (fret > MAX_FRET) continue;
    // Every row starts with a header cell, so the column for fret N is child N+1.
    numbers?.children[fret + 1]?.classList.add('marker-fret');
    if (fret === 12) numbers?.children[fret + 1]?.classList.add('marker-double');
    rows.forEach((row) => {
      const cell = row.children[fret + 1];
      if (!cell) return;
      cell.classList.add('marker-fret');
      if (fret === 12) cell.classList.add('marker-double');
    });
  }
}

function renderNeck() {
  // Octaves mark individual notes; the fret markers are whole columns of the
  // neck, and ringing each note in them one by one read as more notes rather
  // than as an inlay. The columns are tinted in CSS from this one class.
  const highlight = state.showOctaves ? findTargets(state.neckCell, getInterval('p8')) : [];
  renderNoteBoard($('neckBoard'), {
    interactive: true,
    selected: state.neckCell,
    focusString: state.focusString,
    highlight,
    cellAttr: 'data-neck-cell',
  });
  paintMarkerFrets($('neckBoard'));
  $('neckTuningBadge').textContent = tuningLabel();
  renderStringPicker();
  renderNeckReadout();
  renderRunStrip();
}

function renderGapMap() {
  $('gapMap').innerHTML = LETTERS.map((pitchClass, index) => {
    const next = LETTERS[(index + 1) % LETTERS.length];
    const gap = mod12(next - pitchClass);
    return `<span class="gap-pair${gap === 1 ? ' tight' : ''}">
      <b>${SHARP_NAMES[pitchClass]}</b><i aria-hidden="true">→</i><b>${SHARP_NAMES[next]}</b>
      <small>${t(gap === 1 ? 'theory.halfsteps.oneFret' : 'theory.halfsteps.twoFrets')}</small>
    </span>`;
  }).join('');
}

/* ----------------------------------------------------------- 03  intervals */

function renderIntervalTable() {
  const root = 45; // the open A string, which every example is measured from
  $('intervalTable').querySelector('tbody').innerHTML = INTERVALS.map((interval) => `
    <tr>
      <th scope="row">${intervalName(interval.id)}</th>
      <td class="mono">${intervalShort(interval.id)}</td>
      <td class="mono">${interval.semitones}</td>
      <td class="mono">${midiNoteName(root)} → ${midiNoteName(root + interval.semitones)}</td>
      <td><button type="button" class="ghost-button tiny" data-play-interval="${interval.id}"
        aria-label="${t('theory.playIntervalAria', { name: intervalName(interval.id) })}">${t('theory.listen')}</button></td>
    </tr>`).join('');
}

function renderRuler() {
  $('intervalRuler').innerHTML = INTERVALS.map((interval) => {
    const active = interval.id === state.intervalId;
    return `<button type="button" class="ruler-step${active ? ' active' : ''}" data-ruler="${interval.id}"
      aria-pressed="${active}" title="${intervalName(interval.id)}">
      <strong>${interval.semitones}</strong><small>${intervalShort(interval.id)}</small>
    </button>`;
  }).join('');
}

function intervalFamily(id) {
  if (id === 'tt') return 'tritone';
  if (id.startsWith('p')) return 'perfect';
  return id.startsWith('m') ? 'minor' : 'major';
}

function renderIntervalRail() {
  $('theoryIntervalRail').innerHTML = INTERVALS.map((interval) => {
    const active = interval.id === state.intervalId;
    return `<button type="button" role="radio" class="interval-chip ${intervalFamily(interval.id)}${active ? ' active' : ''}"
      aria-checked="${active}" data-interval="${interval.id}"
      title="${intervalName(interval.id)}" aria-label="${intervalName(interval.id)}">
      <strong>${intervalShort(interval.id)}</strong><small>${interval.semitones}</small>
    </button>`;
  }).join('');
}

function renderCharacterList() {
  $('characterList').innerHTML = INTERVALS.map((interval) => `
    <li>
      <span class="character-mark ${intervalFamily(interval.id)}">${intervalShort(interval.id)}</span>
      <span class="character-copy">
        <strong>${intervalName(interval.id)}</strong>
        <span>${intervalDescription(interval.id)}</span>
      </span>
      <button type="button" class="ghost-button tiny" data-play-interval="${interval.id}"
        aria-label="${t('theory.playIntervalAria', { name: intervalName(interval.id) })}">${t('theory.listen')}</button>
    </li>`).join('');
}

function renderIntervalBoard() {
  const interval = getInterval(state.intervalId);
  const targets = findTargets(state.neckCell, interval);
  renderBoard($('intervalBoard'), {
    anchor: state.neckCell,
    targets,
    interactive: true,
    targetMarker: intervalShort(interval.id),
  });
  $('intervalBadge').textContent = intervalName(interval.id);
  $('intervalExplainer').innerHTML = `
    <span class="interval-symbol">${intervalShort(interval.id)}</span>
    <span class="interval-copy">
      <strong>${t('theory.onneck.fromTo', {
        from: midiLabel(state.neckCell.midi),
        to: midiLabel(state.neckCell.midi + interval.semitones),
        name: intervalName(interval.id),
      })}</strong>
      <span>${intervalDescription(interval.id)}</span>
    </span>
    <span class="interval-distance">${t('theory.onneck.distance', { n: interval.semitones, semitones: pluralize('interval.unit.semitone', interval.semitones), count: targets.length, positions: pluralize('interval.unit.position', targets.length) })}</span>`;
}

function renderIntervalStage() {
  renderIntervalTable();
  renderRuler();
  renderIntervalRail();
  renderCharacterList();
  renderIntervalBoard();
  renderEarAnswers();
}

function renderShapeStage() {
  renderStringSteps();
  settleShapeRoot();
  renderShapePicker();
  renderShapeMath();
  renderShapeBoard();
}

/* ------------------------------------------------- 04  shapes on the neck */

// A shape is "cross this many strings, move this many frets". Which strings it
// works on is not written down here: it is worked out from the tuning, because
// the whole point of the lesson is that the tuning is what decides.
const NECK_SHAPES = [
  { id: 'octave-two-two', interval: 'p8', stringDelta: 2, fretDelta: 2 },
  { id: 'octave-two-three', interval: 'p8', stringDelta: 2, fretDelta: 3 },
  { id: 'octave-same', interval: 'p8', stringDelta: 0, fretDelta: 12 },
  { id: 'fourth-flat', interval: 'p4', stringDelta: 1, fretDelta: 0 },
  { id: 'fifth-up', interval: 'p5', stringDelta: 1, fretDelta: 2 },
  { id: 'third-back', interval: 'M3', stringDelta: 1, fretDelta: -1 },
];

const shapeById = (id) => NECK_SHAPES.find((shape) => shape.id === id) ?? NECK_SHAPES[0];

// What each string crossing is worth in frets. Read off the tuning rather than
// written down, so a reader in DADGAD is not being told a comfortable lie.
function stringStepsFrom(stringIndex, count) {
  return Array.from({ length: count }, (_, step) => OPEN_MIDIS[stringIndex + step + 1] - OPEN_MIDIS[stringIndex + step]);
}

function renderStringSteps() {
  $('stringSteps').innerHTML = OPEN_MIDIS.slice(0, -1).map((midi, stringIndex) => {
    const step = OPEN_MIDIS[stringIndex + 1] - midi;
    const odd = step !== 5;
    return `<span class="string-step${odd ? ' odd' : ''}">
      <b>${OPEN_MIDIS.length - stringIndex}<i aria-hidden="true">→</i>${OPEN_MIDIS.length - stringIndex - 1}</b>
      <strong>+${step}</strong>
      <small>${pluralize('interval.unit.fret', step)}</small>
    </span>`;
  }).join('');
}

// The whole point of the stage, drawn: the move split into the part that comes
// from crossing strings and the part that comes from sliding frets, each labelled
// with what it is worth, adding up to the interval.
// A minus sign, not a hyphen: these are read as arithmetic.
const signed = (value) => (value === 0 ? '' : `${value > 0 ? '+' : '−'}${Math.abs(value)}`);

function renderShapeMath() {
  const shape = shapeById(state.shapeId);
  const strings = OPEN_MIDIS.length;
  // Drawn from a string the shape actually exists on, which is not necessarily
  // the one the reader last tapped: the board below is allowed to show the shape
  // failing to fit, but a sum that does not add up to its own interval would be
  // teaching the wrong thing.
  const valid = shapeStrings(shape);
  if (!valid.length) return;
  const fromString = valid.includes(state.shapeRoot.stringIndex) ? state.shapeRoot.stringIndex : valid[0];
  const targetString = fromString + shape.stringDelta;
  if (targetString < 0 || targetString >= strings) return;
  const steps = stringStepsFrom(fromString, shape.stringDelta);
  const stringPart = steps.reduce((sum, step) => sum + step, 0);
  const total = stringPart + shape.fretDelta;
  const interval = getInterval(shape.interval);

  // Frets are numbered from the start of the move, not from the nut: the shape is
  // the same everywhere, so where on the neck it is drawn would be a distraction.
  const startFret = Math.max(1, 1 - shape.fretDelta);
  const endFret = startFret + shape.fretDelta;
  const lastFret = Math.max(startFret, endFret) + 1;
  const fretWidth = lastFret > 8 ? 30 : 46;
  const rowHeight = 22;
  const padX = 30;
  const padY = 34;
  const width = padX + (lastFret + 1) * fretWidth + 14;
  const height = padY + strings * rowHeight;
  const x = (fret) => padX + fret * fretWidth + fretWidth / 2;
  const y = (stringIndex) => padY + (strings - 1 - stringIndex) * rowHeight;

  const parts = [];
  for (let fret = 0; fret <= lastFret + 1; fret += 1) {
    const lineX = padX + fret * fretWidth;
    parts.push(`<line class="math-fretline" x1="${lineX}" y1="${y(strings - 1) - 9}" x2="${lineX}" y2="${y(0) + 9}" />`);
  }
  for (let stringIndex = 0; stringIndex < strings; stringIndex += 1) {
    parts.push(`<line class="math-string" x1="${padX}" y1="${y(stringIndex)}" x2="${padX + (lastFret + 1) * fretWidth}" y2="${y(stringIndex)}" />`);
    parts.push(`<text class="math-side" x="${padX - 9}" y="${y(stringIndex) + 3.5}" text-anchor="end">${strings - stringIndex}</text>`);
  }

  // One arrow per string crossed, each carrying what that crossing costs — which
  // is where the odd one out becomes visible rather than merely stated.
  for (let step = 0; step < shape.stringDelta; step += 1) {
    const from = fromString + step;
    const plain = steps[step] === 5;
    parts.push(`<line class="math-arrow${plain ? '' : ' odd'}" x1="${x(startFret)}" y1="${y(from) - 9}" x2="${x(startFret)}" y2="${y(from + 1) + 11}" marker-end="url(#${plain ? 'mathHead' : 'mathHeadOdd'})" />`);
    parts.push(`<text class="math-label${plain ? '' : ' odd'}" x="${x(startFret) - 9}" y="${(y(from) + y(from + 1)) / 2 + 3.5}" text-anchor="end">+${steps[step]}</text>`);
  }
  if (shape.fretDelta !== 0) {
    const lineY = y(targetString);
    const back = shape.fretDelta > 0 ? -11 : 11;
    parts.push(`<line class="math-arrow" x1="${x(startFret) + (shape.fretDelta > 0 ? 11 : -11)}" y1="${lineY}" x2="${x(endFret) + back}" y2="${lineY}" marker-end="url(#mathHead)" />`);
    parts.push(`<text class="math-label" x="${(x(startFret) + x(endFret)) / 2}" y="${lineY - 11}" text-anchor="middle">${signed(shape.fretDelta)}</text>`);
  }

  parts.push(`<g class="math-dot start"><circle cx="${x(startFret)}" cy="${y(fromString)}" r="10" /><text x="${x(startFret)}" y="${y(fromString) + 4}" text-anchor="middle">1</text></g>`);
  parts.push(`<g class="math-dot end"><circle cx="${x(endFret)}" cy="${y(targetString)}" r="10" /><text x="${x(endFret)}" y="${y(targetString) + 4}" text-anchor="middle">${intervalShort(shape.interval)}</text></g>`);

  const sum = [...steps.map((step) => `+${step}`), signed(shape.fretDelta)].filter(Boolean).join(' ');
  $('shapeMath').innerHTML = `
    <div class="math-sum">
      <span class="math-terms">${sum}</span>
      <i aria-hidden="true">=</i>
      <span class="math-total">${t('theory.shapes.math.semitones', { n: total, semitones: pluralize('interval.unit.semitone', total) })}</span>
      <span class="math-name">${intervalName(shape.interval)}</span>
    </div>
    <div class="math-legend">
      ${shape.stringDelta ? `<span>${t('theory.shapes.math.stringsLabel', { n: signed(stringPart) })}</span>` : ''}
      ${shape.fretDelta ? `<span>${t('theory.shapes.math.fretsLabel', { n: signed(shape.fretDelta) })}</span>` : ''}
    </div>
    <svg class="math-neck" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="${t('theory.shapes.math.figureAria', { name: intervalName(shape.interval), n: total })}">
      <defs>
        <marker id="mathHead" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" /></marker>
        <marker id="mathHeadOdd" class="odd" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" /></marker>
      </defs>
      ${parts.join('')}
    </svg>`;
  $('shapeBadge').textContent = `${intervalShort(shape.interval)} · ${interval.semitones}`;
}

// The strings the shape holds on, given how the instrument is tuned right now.
function shapeStrings(shape) {
  const wanted = getInterval(shape.interval).semitones;
  const strings = [];
  for (let stringIndex = 0; stringIndex < OPEN_MIDIS.length; stringIndex += 1) {
    const other = stringIndex + shape.stringDelta;
    if (other < 0 || other >= OPEN_MIDIS.length) continue;
    if (OPEN_MIDIS[other] + shape.fretDelta - OPEN_MIDIS[stringIndex] === wanted) strings.push(stringIndex);
  }
  return strings;
}

// A shape that stays on one string works everywhere, so listing "6→6, 5→5, …"
// would be noise; it gets a sentence of its own instead of a list.
function shapeWhere(shape) {
  if (shape.stringDelta === 0) return t('theory.shapes.worksAnywhere');
  const pairs = shapeStrings(shape)
    .map((stringIndex) => `${OPEN_MIDIS.length - stringIndex}→${OPEN_MIDIS.length - stringIndex - shape.stringDelta}`)
    .join(' · ');
  return t('theory.shapes.worksOn', { pairs });
}

function shapePartner(shape, cell) {
  const stringIndex = cell.stringIndex + shape.stringDelta;
  const fret = cell.fret + shape.fretDelta;
  if (stringIndex < 0 || stringIndex >= OPEN_MIDIS.length) return null;
  if (fret < 0 || fret > MAX_FRET) return null;
  const partner = cellAt(stringIndex, fret);
  return partner.midi - cell.midi === getInterval(shape.interval).semitones ? partner : null;
}

// Choosing a shape that does not exist where the reader last tapped would answer
// with an empty neck, so the first note slides to a string where the shape lives.
function settleShapeRoot() {
  const shape = shapeById(state.shapeId);
  if (shapePartner(shape, state.shapeRoot)) return;
  const strings = shapeStrings(shape);
  if (!strings.length) return;
  const fret = Math.max(Math.max(0, -shape.fretDelta), Math.min(state.shapeRoot.fret, MAX_FRET - Math.max(0, shape.fretDelta)));
  const stringIndex = strings.includes(state.shapeRoot.stringIndex) ? state.shapeRoot.stringIndex : strings[0];
  state.shapeRoot = cellAt(stringIndex, fret);
}

function renderShapePicker() {
  $('shapePicker').innerHTML = NECK_SHAPES.map((shape) => {
    const active = shape.id === state.shapeId;
    return `<button type="button" role="radio" class="toggle-chip shape-chip${active ? ' active' : ''}"
      aria-checked="${active}" data-shape="${shape.id}">
      <strong>${intervalShort(shape.interval)}</strong> ${t(`theory.shapes.${shape.id}`)}
    </button>`;
  }).join('');
}

function renderShapeBoard() {
  const shape = shapeById(state.shapeId);
  const partner = shapePartner(shape, state.shapeRoot);
  renderBoard($('shapeBoard'), {
    anchor: state.shapeRoot,
    targets: partner ? [partner] : [],
    interactive: true,
    targetMarker: intervalShort(shape.interval),
  });
  $('shapeReadout').innerHTML = partner
    ? `<span class="readout-note">${midiLabel(state.shapeRoot.midi)} → ${midiLabel(partner.midi)}</span>
       <span class="readout-facts">
         <span>${intervalName(shape.interval)}</span>
         <span>${shapeWhere(shape)}</span>
       </span>
       <button type="button" class="ghost-button" data-play-pair="${state.shapeRoot.midi}:${partner.midi}"
         aria-label="${t('theory.playIntervalAria', { name: intervalName(shape.interval) })}">${t('theory.listen')}</button>`
    : `<span class="readout-facts"><span>${t('theory.shapes.notHere', { where: shapeWhere(shape) })}</span></span>`;
}

/* ------------------------------------------------------ 03.6  ear training */

// A beginner set: the intervals worth telling apart first. Deliberately not all
// thirteen — the full drill lives on the quiz page.
const EAR_SET = ['m2', 'M2', 'm3', 'M3', 'p4', 'p5', 'p8'];

function renderEarAnswers() {
  $('earAnswers').innerHTML = EAR_SET.map((id) => `
    <button type="button" class="answer-button" data-ear-answer="${id}">
      <strong>${intervalShort(id)}</strong><span>${intervalName(id)}</span>
    </button>`).join('');
  $('earCorrect').textContent = String(state.ear.correct);
  $('earWrong').textContent = String(state.ear.wrong);
}

function newEarQuestion() {
  const id = EAR_SET[Math.floor(Math.random() * EAR_SET.length)];
  // A comfortable register rather than wherever the neck happens to be.
  const root = 48 + Math.floor(Math.random() * 12);
  state.ear.current = { id, root };
  state.ear.locked = false;
  renderEarAnswers();
}

function playEarQuestion(button = null) {
  if (!state.ear.current) newEarQuestion();
  const { id, root } = state.ear.current;
  return playIntervalByType(root, root + getInterval(id).semitones, 'ascending', button);
}

function answerEar(button) {
  if (!state.ear.current || state.ear.locked || button.disabled) return;
  const chosen = button.dataset.earAnswer;
  const feedback = $('earFeedback');
  if (chosen === state.ear.current.id) {
    state.ear.correct += 1;
    state.ear.locked = true;
    button.classList.add('correct');
    $('earAnswers').querySelectorAll('button').forEach((item) => { item.disabled = true; });
    feedback.textContent = t('theory.ear.right', { name: intervalName(chosen) });
    feedback.className = 'quiz-feedback success';
    $('earCorrect').textContent = String(state.ear.correct);
    window.setTimeout(() => {
      newEarQuestion();
      feedback.textContent = t('theory.ear.next');
      feedback.className = 'quiz-feedback';
      void playEarQuestion();
    }, 1100);
    return;
  }
  state.ear.wrong += 1;
  button.classList.add('wrong');
  button.disabled = true;
  feedback.textContent = t('theory.ear.wrongAnswer', { name: intervalName(chosen) });
  feedback.className = 'quiz-feedback error';
  $('earWrong').textContent = String(state.ear.wrong);
}

/* ---------------------------------------------------------------- rendering */

function renderChromaticStrip() {
  $('chromaticStrip').innerHTML = PITCH_NAMES.map((name) => `
    <span class="chromatic-note${name.length > 1 ? ' accidental' : ''}">${name}</span>`).join('');
}

function renderAll() {
  renderStageList();
  renderLessonList();
  renderChromaticStrip();
  renderWave();
  renderNoteRing();
  renderStringTable();
  renderOctaveLadder();
  renderOctaveTable();
  renderOctaveBorder();
  renderKeyboard();
  renderStepWalk();
  renderGapMap();
  renderTuningChain();
  renderNeck();
  renderIntervalStage();
  renderShapeStage();
}

/* ------------------------------------------------------------------- events */

function bindEvents() {
  bindWave();

  // One delegated handler for every "listen" button on the page, whatever drew it.
  document.addEventListener('click', (event) => {
    const noteButton = event.target.closest('[data-play-midi]');
    if (noteButton) { void playMidi(Number(noteButton.dataset.playMidi), noteButton); return; }
    const intervalButton = event.target.closest('[data-play-interval]');
    if (intervalButton) {
      const interval = getInterval(intervalButton.dataset.playInterval);
      void playIntervalByType(45, 45 + interval.semitones, 'ascending', intervalButton);
      return;
    }
    const pairButton = event.target.closest('[data-play-pair]');
    if (pairButton) {
      const [low, high] = pairButton.dataset.playPair.split(':').map(Number);
      void playIntervalByType(low, high, 'ascending', pairButton);
    }
  });

  $('stageList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-stage-go]');
    if (button) showStage(button.dataset.stageGo);
  });
  document.querySelectorAll('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => showStage(button.dataset.goto));
  });
  $('lessonList').addEventListener('click', (event) => {
    const link = event.target.closest('[data-lesson-link]');
    if (!link) return;
    event.preventDefault();
    document.getElementById(link.dataset.lessonLink)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelectorAll('[data-scroll-to]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById(button.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('noteRing').addEventListener('click', (event) => {
    const button = event.target.closest('[data-ring]');
    if (!button) return;
    state.ringPitchClass = Number(button.dataset.ring);
    renderNoteRing();
    void playMidi(60 + state.ringPitchClass);
  });

  $('stepWalk').addEventListener('click', (event) => {
    const button = event.target.closest('[data-walk]');
    if (button) setStepFret(Number(button.dataset.walk));
  });
  $('stepUp').addEventListener('click', () => setStepFret(state.stepFret + 1));
  $('stepDown').addEventListener('click', () => setStepFret(state.stepFret - 1));

  $('neckBoard').addEventListener('click', (event) => {
    const button = event.target.closest('[data-neck-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.neckCell.split(':').map(Number);
    state.neckCell = cellAt(stringIndex, fret);
    state.focusString = stringIndex;
    renderNeck();
    renderIntervalBoard();
    void playMidi(state.neckCell.midi);
  });
  $('stringPicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-focus-string]');
    if (!button) return;
    state.focusString = Number(button.dataset.focusString);
    renderNeck();
  });
  $('runStrip').addEventListener('click', (event) => {
    const button = event.target.closest('[data-run]');
    if (!button) return;
    state.neckCell = cellAt(state.focusString, Number(button.dataset.run));
    renderNeck();
    renderIntervalBoard();
    void playMidi(state.neckCell.midi);
  });
  $('showOctaves').addEventListener('click', (event) => {
    state.showOctaves = !state.showOctaves;
    event.currentTarget.setAttribute('aria-pressed', String(state.showOctaves));
    event.currentTarget.classList.toggle('active', state.showOctaves);
    renderNeck();
  });
  $('showMarkers').addEventListener('click', (event) => {
    state.showMarkers = !state.showMarkers;
    event.currentTarget.setAttribute('aria-pressed', String(state.showMarkers));
    event.currentTarget.classList.toggle('active', state.showMarkers);
    renderNeck();
  });

  const chooseInterval = (id) => {
    state.intervalId = getInterval(id).id;
    renderRuler();
    renderIntervalRail();
    renderIntervalBoard();
  };
  $('theoryIntervalRail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-interval]');
    if (button) chooseInterval(button.dataset.interval);
  });
  $('intervalRuler').addEventListener('click', (event) => {
    const button = event.target.closest('[data-ruler]');
    if (!button) return;
    chooseInterval(button.dataset.ruler);
    $('lesson-onneck').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('intervalBoard').addEventListener('click', (event) => {
    const button = event.target.closest('[data-learn-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.learnCell.split(':').map(Number);
    state.neckCell = cellAt(stringIndex, fret);
    renderIntervalBoard();
    renderNeck();
    void playMidi(state.neckCell.midi);
  });

  $('shapePicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-shape]');
    if (!button) return;
    state.shapeId = shapeById(button.dataset.shape).id;
    settleShapeRoot();
    renderShapePicker();
    renderShapeMath();
    renderShapeBoard();
  });
  $('shapeBoard').addEventListener('click', (event) => {
    const button = event.target.closest('[data-learn-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.learnCell.split(':').map(Number);
    state.shapeRoot = cellAt(stringIndex, fret);
    renderShapeMath();
    renderShapeBoard();
    void playMidi(state.shapeRoot.midi);
  });

  $('earPlay').addEventListener('click', (event) => { void playEarQuestion(event.currentTarget); });
  $('earAnswers').addEventListener('click', (event) => {
    const button = event.target.closest('[data-ear-answer]');
    if (button) answerEar(button);
  });

  const flipLabels = { vertical: t('common.boardFlipVertical'), horizontal: t('common.boardFlipHorizontal') };
  bindOrientationToggle($('neckFlip'), flipLabels);
  bindOrientationToggle($('intervalFlip'), flipLabels);
  bindOrientationToggle($('shapeFlip'), flipLabels);
  // Both boards are laid out from the same tuning, so both are redrawn when the
  // neck turns or the window changes shape.
  const redraw = () => { renderNeck(); renderIntervalBoard(); renderShapeBoard(); };
  onOrientationChange(redraw);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redraw, 160);
  });

  bindThemeDock('midnight', { bloom: true });
  bindLocaleDock();
  window.addEventListener('beforeunload', () => audio?.stop());
}

onLocaleChange(() => {
  syncLocaleDock();
  renderAll();
});

function initialize() {
  i18nInit();
  initOrientation();
  syncLocaleDock();
  applyTheme(localStorage.getItem(THEME_KEY), 'midnight');
  renderAll();
  newEarQuestion();
  bindEvents();
  showStage('basics', { scroll: false });
  // Warm the samples the first figures are most likely to ask for.
  audio.prepare([40, 45, 52, 57, 60, 69]).catch(() => {
    showToast(t('training.toast.samplesLoadFailed'));
  });
}

initialize();
