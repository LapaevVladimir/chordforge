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
  // 02.7 — which note the neck is being searched for, as a pitch class.
  findPitchClass: 0,
  // 03.8 — the interval the inversion figure is currently showing.
  inversionId: 'M3',
  shapeId: 'octave-two-two',
  // The two notes the shapes stage measures between. `second` is null while the
  // reader is halfway through choosing them.
  pair: { first: { stringIndex: 0, fret: 5, midi: OPEN_MIDIS[0] + 5 }, second: null },
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
  if (stage === 'fretboard') renderFretboardStage();
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

/* ---------------------------------------------------- 01.2  the alphabet */

// A3 up to G4: the seven letters in order, ending where they started. The eighth
// button is the A they wrap round to, which is the whole point of the figure —
// seven names, then the same names an octave higher.
const ALPHABET_MIDIS = [57, 59, 60, 62, 64, 65, 67];

function renderAlphabet() {
  const letter = (midi, repeat) => `<button type="button" class="alphabet-letter${repeat ? ' repeat' : ''}"
    data-play-midi="${midi}" aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">
    <strong>${midiNoteName(midi)}</strong><small>${midiLabel(midi)}</small>
  </button>`;
  $('alphabetStrip').innerHTML = ALPHABET_MIDIS.map((midi) => letter(midi, false)).join('')
    + `<span class="alphabet-wrap"><i aria-hidden="true">↻</i><small>${t('theory.alphabet.wrap')}</small></span>`
    + letter(ALPHABET_MIDIS[0] + 12, true);
}

/* ------------------------------------------------------- 01.3  the twelve notes */

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
  // One octave of a real keyboard, C to C: white keys in a row, black ones laid
  // over the joins between them. Drawn as a piano rather than as two rows of
  // boxes because the lesson is about a shape you already know how to read —
  // and because where a black key is missing has to look like an absence.
  const whites = [0, 2, 4, 5, 7, 9, 11, 12];
  const unit = 100 / whites.length;
  const blackWidth = unit * 0.62;

  const keys = whites.map((pitchClass, index) => {
    const midi = 60 + pitchClass;
    // The two pairs with nothing between them: E–F and B–C.
    const tight = index === 2 || index === 3 || index === 6 || index === 7;
    return `<button type="button" class="piano-key white${tight ? ' tight' : ''}" data-play-midi="${midi}"
      aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">${SHARP_NAMES[mod12(pitchClass)]}</button>`;
  }).join('');

  const overlay = whites.slice(0, -1).map((pitchClass, index) => {
    const left = unit * (index + 1) - blackWidth / 2;
    const style = `left:${left.toFixed(3)}%;width:${blackWidth.toFixed(3)}%`;
    if (whites[index + 1] - pitchClass !== 2) {
      return `<span class="piano-gap" style="${style}" title="${t('theory.accidentals.gapTitle')}"></span>`;
    }
    const midi = 61 + pitchClass;
    return `<button type="button" class="piano-key black" style="${style}" data-play-midi="${midi}"
      aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">
      <b>${SHARP_NAMES[mod12(pitchClass + 1)]}</b><i>${FLAT_NAMES[mod12(pitchClass + 1)]}</i></button>`;
  }).join('');

  $('keyboardStrip').innerHTML = `<div class="piano-whites">${keys}</div><div class="piano-blacks">${overlay}</div>`;
}

// The same pitch under two names. The five between the letters are the pairs
// every player meets; the four below them are the ones that catch people out,
// because the second name is a letter that already exists. Both lists are real
// spellings — the point of the figure is that none of them is a trick.
const THEORETICAL_ENHARMONICS = [
  { name: 'E♯', same: 'F', midi: 65 },
  { name: 'B♯', same: 'C', midi: 72 },
  { name: 'C♭', same: 'B', midi: 59 },
  { name: 'F♭', same: 'E', midi: 64 },
];

function enharmonicCard(left, right, midi, theoretical) {
  return `<button type="button" class="enharmonic-card${theoretical ? ' theoretical' : ''}" data-play-midi="${midi}"
    aria-label="${t('theory.playAria', { note: midiLabel(midi) })}">
    <strong>${left}</strong><i aria-hidden="true">=</i><strong>${right}</strong>
  </button>`;
}

function renderEnharmonics() {
  $('enharmonicPairs').innerHTML = SHARP_NAMES
    .map((name, pitchClass) => ({ name, pitchClass }))
    .filter((entry) => entry.name.length > 1)
    .map((entry) => enharmonicCard(entry.name, FLAT_NAMES[entry.pitchClass], 60 + entry.pitchClass, false))
    .join('');
  $('enharmonicTheoretical').innerHTML = THEORETICAL_ENHARMONICS
    .map((entry) => enharmonicCard(entry.name, entry.same, entry.midi, true))
    .join('');
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

/* ------------------------------------------------------ 02.6  the twelfth fret */

// One row per string: the open note, and the same note twelve frets up. Pressing
// a row plays both in turn, which is the only way the claim "it is the same note"
// can actually be checked.
function renderTwelfth() {
  $('twelfthPairs').innerHTML = OPEN_MIDIS.map((midi, stringIndex) => {
    const stringNumber = OPEN_MIDIS.length - stringIndex;
    return `<button type="button" class="octave-pair" data-play-octave="${midi}"
      aria-label="${t('theory.playIntervalAria', { name: intervalName('p8') })}">
      <small>${t('theory.twelfth.stringN', { n: stringNumber })}</small>
      <span class="octave-pair-notes">
        <b>${midiLabel(midi)}</b><i aria-hidden="true">→</i><b>${midiLabel(midi + 12)}</b>
      </span>
      <span class="octave-pair-where">
        <span>${t('theory.twelfth.openLabel')}</span><span>${t('theory.twelfth.fretLabel')}</span>
      </span>
      <span class="mono">${formatHz(midiToFrequency(midi))} → ${formatHz(midiToFrequency(midi + 12))}</span>
    </button>`;
  }).reverse().join('');
}

/* ------------------------------------------------------ 02.7  find every note */

// Every place one pitch class sits on the neck, found by filtering the board the
// rest of the site is built from rather than by a rule about where notes repeat —
// so the count stays true if the tuning or the number of frets ever changes.
function findPositions() {
  return boardCells.filter((cell) => mod12(cell.midi) === state.findPitchClass);
}

function renderFindPicker() {
  $('findPicker').innerHTML = PITCH_NAMES.map((name, pitchClass) => {
    const active = pitchClass === state.findPitchClass;
    return `<button type="button" role="radio" class="toggle-chip find-chip${active ? ' active' : ''}"
      aria-checked="${active}" data-find-note="${pitchClass}"><strong>${name}</strong></button>`;
  }).join('');
}

function renderFindBoard() {
  const positions = findPositions();
  const name = PITCH_NAMES[state.findPitchClass];
  renderNoteBoard($('findBoard'), { interactive: true, highlight: positions, cellAttr: 'data-find-cell' });
  $('findReadout').innerHTML = `
    <span class="readout-note">${name}</span>
    <span class="readout-facts">
      <span>${t('theory.everynote.count', {
        note: name,
        n: positions.length,
        times: pluralize('theory.everynote.times', positions.length),
        frets: MAX_FRET,
      })}</span>
      <span>${t('theory.everynote.hint')}</span>
    </span>`;
}

function renderFretboardStage() {
  renderNeck();
  renderFindPicker();
  renderFindBoard();
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

/* --------------------------------------- 03.4  perfect, major and minor */

// Every example is measured up from C, so the two columns can be read side by
// side. The note the interval lands on is spelled the way its own name implies:
// a minor interval reaches a flat, a major one a natural or a sharp.
const QUALITY_ROOT = 60; // C4
const QUALITY_PERFECT = ['p1', 'p4', 'p5', 'p8'];
const QUALITY_PAIRED = ['m2', 'M2', 'm3', 'M3', 'm6', 'M6', 'm7', 'M7'];

function qualityRow(id) {
  const { semitones } = getInterval(id);
  const target = midiNoteName(QUALITY_ROOT + semitones, id.startsWith('m'));
  return `<button type="button" class="quality-row" data-play-pair="${QUALITY_ROOT}:${QUALITY_ROOT + semitones}"
    aria-label="${t('theory.playIntervalAria', { name: intervalName(id) })}">
    <span class="character-mark ${intervalFamily(id)}">${intervalShort(id)}</span>
    <span class="quality-copy"><strong>${intervalName(id)}</strong><small>${midiNoteName(QUALITY_ROOT)} → ${target}</small></span>
    <span class="quality-count mono">${semitones}</span>
  </button>`;
}

function renderQualitySplit() {
  const column = (titleKey, noteKey, ids) => `<div class="quality-card">
    <span class="control-label">${t(titleKey)}</span>
    <div class="quality-rows">${ids.map(qualityRow).join('')}</div>
    <p class="theory-note">${t(noteKey)}</p>
  </div>`;
  $('qualitySplit').innerHTML = column('theory.quality.perfectTitle', 'theory.quality.perfectNote', QUALITY_PERFECT)
    + column('theory.quality.pairedTitle', 'theory.quality.pairedNote', QUALITY_PAIRED);
}

/* ------------------------------------- 03.5  augmented and diminished */

// Five spellings that are one semitone off a known interval. `same` is what the
// distance is more usually called — for the two tritone rows that is each other,
// which is exactly the point being made.
const ALTERED = [
  { key: 'aug2', semitones: 3, target: 'D♯', same: () => intervalName('m3') },
  { key: 'aug4', semitones: 6, target: 'F♯', same: () => t('theory.altered.dim5') },
  { key: 'dim5', semitones: 6, target: 'G♭', same: () => t('theory.altered.aug4') },
  { key: 'aug5', semitones: 8, target: 'G♯', same: () => intervalName('m6') },
  { key: 'dim7', semitones: 9, target: 'B♭♭', same: () => intervalName('M6') },
];

function renderAlteredTable() {
  $('alteredTable').querySelector('tbody').innerHTML = ALTERED.map((row) => {
    const name = t(`theory.altered.${row.key}`);
    return `<tr>
      <th scope="row">${name}</th>
      <td class="mono">${midiNoteName(QUALITY_ROOT)} → ${row.target}</td>
      <td class="mono">${row.semitones}</td>
      <td>${row.same()}</td>
      <td><button type="button" class="ghost-button tiny" data-play-pair="${QUALITY_ROOT}:${QUALITY_ROOT + row.semitones}"
        aria-label="${t('theory.playIntervalAria', { name })}">${t('theory.listen')}</button></td>
    </tr>`;
  }).join('');
}

/* ------------------------------------------------------ 03.6  the tritone */

function renderTritonePair() {
  $('tritonePair').innerHTML = [['aug4', 'F♯'], ['dim5', 'G♭']].map(([key, target]) => {
    const name = t(`theory.altered.${key}`);
    return `<button type="button" class="tritone-card" data-play-pair="${QUALITY_ROOT}:${QUALITY_ROOT + 6}"
      aria-label="${t('theory.playIntervalAria', { name })}">
      <strong>${midiNoteName(QUALITY_ROOT)} → ${target}</strong>
      <span>${name}</span>
      <small class="mono">${t('theory.shapes.math.semitones', { n: 6, semitones: pluralize('interval.unit.semitone', 6) })}</small>
    </button>`;
  }).join('');
}

/* ------------------------------------------------ 03.8  interval inversion */

// Turning an interval over is the same sum every time: what is left of an octave.
// Both sides are worked out from that rather than from a table of pairs, so the
// figure and the table below it cannot disagree.
const INVERSION_ROOT = 60; // C4
const INVERSION_ROWS = ['p1', 'm2', 'M2', 'm3', 'M3', 'p4', 'tt'];

function invertId(id) {
  const semitones = 12 - getInterval(id).semitones;
  return INTERVALS.find((interval) => interval.semitones === semitones).id;
}

// The note in the middle is spelled by the quality of the interval that reaches
// it — a minor interval lands on a flat — and it keeps that spelling on the way
// back up. Anything else would contradict the two lessons above.
function inversionSide(id, from, to, fromLabel, toLabel) {
  const { semitones } = getInterval(id);
  return `<div class="inversion-side">
    <span class="inversion-notes">${fromLabel} → ${toLabel}</span>
    <strong>${intervalName(id)}</strong>
    <span class="inversion-count mono">${t('theory.shapes.math.semitones', { n: semitones, semitones: pluralize('interval.unit.semitone', semitones) })}</span>
    <button type="button" class="ghost-button tiny" data-play-pair="${from}:${to}"
      aria-label="${t('theory.playIntervalAria', { name: intervalName(id) })}">${t('theory.listen')}</button>
  </div>`;
}

function renderInversion() {
  const id = state.inversionId;
  const other = invertId(id);
  const middle = INVERSION_ROOT + getInterval(id).semitones;
  const middleLabel = midiLabel(middle, id.startsWith('m'));
  $('inversionLab').innerHTML = inversionSide(id, INVERSION_ROOT, middle, midiLabel(INVERSION_ROOT), middleLabel)
    + `<button type="button" class="ghost-button invert-button" data-invert>${t('theory.inversion.invert')}</button>`
    + inversionSide(other, middle, INVERSION_ROOT + 12, middleLabel, midiLabel(INVERSION_ROOT + 12))
    + `<div class="inversion-sum">${t('theory.inversion.sum', { a: getInterval(id).semitones, b: getInterval(other).semitones })}</div>`;

  $('inversionTable').querySelector('tbody').innerHTML = INVERSION_ROWS.map((rowId) => {
    const pair = invertId(rowId);
    const active = rowId === id || pair === id;
    return `<tr class="${active ? 'inversion-active' : ''}">
      <th scope="row"><button type="button" class="link-button" data-invert-pick="${rowId}">${intervalName(rowId)}</button></th>
      <td>${intervalName(pair)}</td>
      <td class="mono">${getInterval(rowId).semitones} + ${getInterval(pair).semitones} = 12</td>
    </tr>`;
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
  renderQualitySplit();
  renderAlteredTable();
  renderTritonePair();
  renderIntervalRail();
  renderInversion();
  renderCharacterList();
  renderIntervalBoard();
  renderEarAnswers();
}

function renderShapeStage() {
  renderStringSteps();
  renderShapePicker();
  renderShapeSum();
  renderShapeBoard();
}

/* ------------------------------------------------- 04  shapes on the neck */

// A shape is "cross this many strings, move this many frets". Which strings it
// works on is not written down here: it is worked out from the tuning, because
// the whole point of the lesson is that the tuning is what decides.
const NECK_SHAPES = [
  { id: 'octave-two-two', group: 'octave', interval: 'p8', stringDelta: 2, fretDelta: 2 },
  { id: 'octave-two-three', group: 'octave', interval: 'p8', stringDelta: 2, fretDelta: 3 },
  { id: 'octave-same', group: 'octave', interval: 'p8', stringDelta: 0, fretDelta: 12 },
  { id: 'unison-back5', group: 'unison', interval: 'p1', stringDelta: 1, fretDelta: -5 },
  { id: 'unison-back4', group: 'unison', interval: 'p1', stringDelta: 1, fretDelta: -4 },
  { id: 'third-minor-back2', group: 'adjacent', interval: 'm3', stringDelta: 1, fretDelta: -2 },
  { id: 'third-back', group: 'adjacent', interval: 'M3', stringDelta: 1, fretDelta: -1 },
  { id: 'fourth-flat', group: 'adjacent', interval: 'p4', stringDelta: 1, fretDelta: 0 },
  { id: 'tritone-up1', group: 'adjacent', interval: 'tt', stringDelta: 1, fretDelta: 1 },
  { id: 'fifth-up', group: 'adjacent', interval: 'p5', stringDelta: 1, fretDelta: 2 },
  { id: 'sixth-up4', group: 'adjacent', interval: 'M6', stringDelta: 1, fretDelta: 4 },
  { id: 'fifth-across-back3', group: 'across', interval: 'p5', stringDelta: 2, fretDelta: -3 },
  { id: 'fifth-across-back2', group: 'across', interval: 'p5', stringDelta: 2, fretDelta: -2 },
  { id: 'sixth-across', group: 'across', interval: 'M6', stringDelta: 2, fretDelta: 0 },
  { id: 'seventh-across', group: 'across', interval: 'm7', stringDelta: 2, fretDelta: 0 },
];

const SHAPE_GROUPS = ['octave', 'unison', 'adjacent', 'across'];

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

// The strings a shape holds on, given how the instrument is tuned right now.
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

// Picking a shape sets the pair. If it does not exist from where the reader last
// tapped, the first note slides to a string where it does.
function applyShape(id) {
  const shape = shapeById(id);
  const strings = shapeStrings(shape);
  if (!strings.length) return;
  let first = state.pair.first;
  if (!shapePartner(shape, first)) {
    const fret = Math.max(Math.max(0, -shape.fretDelta), Math.min(first.fret, MAX_FRET - Math.max(0, shape.fretDelta)));
    const stringIndex = strings.includes(first.stringIndex) ? first.stringIndex : strings[0];
    first = cellAt(stringIndex, fret);
  }
  state.pair = { first, second: shapePartner(shape, first) };
  state.shapeId = shape.id;
}

// …and any pair the reader picks by hand is looked up in the same list, so two
// notes chosen at random can answer "is this one of the shapes?" as well.
function matchShapeId({ first, second }) {
  if (!second) return null;
  const match = NECK_SHAPES.find((shape) => shape.stringDelta === second.stringIndex - first.stringIndex
    && shape.fretDelta === second.fret - first.fret);
  return match ? match.id : null;
}

// The distance between two notes, split the way the neck splits it: what each
// string crossing is worth, plus the frets slid. Signed throughout, so the sum
// still holds when the second note is the lower of the two.
function measurePair(first, second) {
  const direction = Math.sign(second.stringIndex - first.stringIndex);
  const steps = [];
  for (let stringIndex = first.stringIndex; stringIndex !== second.stringIndex; stringIndex += direction) {
    steps.push(OPEN_MIDIS[stringIndex + direction] - OPEN_MIDIS[stringIndex]);
  }
  const stringPart = steps.reduce((sum, step) => sum + step, 0);
  const fretPart = second.fret - first.fret;
  return { steps, direction, stringPart, fretPart, total: stringPart + fretPart };
}

// A minus sign, not a hyphen: these are read as arithmetic.
const signed = (value) => (value === 0 ? '' : `${value > 0 ? '+' : '−'}${Math.abs(value)}`);

const intervalOf = (semitones) => INTERVALS.find((interval) => interval.semitones === semitones);

// Inside an octave an interval has a name; beyond one it is an octave (or several)
// plus the rest, which is how players count it too.
function distanceName(total) {
  const abs = Math.abs(total);
  const octaves = Math.floor(abs / 12);
  const rest = abs % 12;
  let name;
  if (abs <= 12) name = intervalName(intervalOf(abs).id);
  else if (rest === 0) name = t('theory.shapes.math.octavesOnly', { n: octaves, octaves: pluralize('interval.unit.octave', octaves) });
  else {
    // Embedded after a plus sign, so it is no longer the start of a phrase.
    const rested = intervalName(intervalOf(rest).id);
    const lower = rested.charAt(0).toLowerCase() + rested.slice(1);
    name = octaves === 1
      ? t('theory.shapes.math.compoundOne', { name: lower })
      : t('theory.shapes.math.compound', { n: octaves, octaves: pluralize('interval.unit.octave', octaves), name: lower });
  }
  return total < 0 ? t('theory.shapes.math.down', { name }) : name;
}

function distanceMark(total) {
  const abs = Math.abs(total);
  return abs <= 12 ? intervalShort(intervalOf(abs).id) : String(abs);
}

function renderShapePicker() {
  $('shapePicker').innerHTML = SHAPE_GROUPS.map((group) => {
    const chips = NECK_SHAPES.filter((shape) => shape.group === group).map((shape) => {
      const active = shape.id === state.shapeId;
      return `<button type="button" role="radio" class="toggle-chip shape-chip${active ? ' active' : ''}"
        aria-checked="${active}" data-shape="${shape.id}" title="${intervalName(shape.interval)}">
        <strong>${intervalShort(shape.interval)}</strong> ${t(`theory.shapes.${shape.id}`)}
      </button>`;
    }).join('');
    return `<div class="shape-group">
      <span class="shape-group-label">${t(`theory.shapes.group.${group}`)}</span>
      <div class="chip-row">${chips}</div>
    </div>`;
  }).join('');
}

// The sum, worked out from the two notes actually on the board.
function renderShapeSum() {
  const { first, second } = state.pair;
  if (!second) {
    $('shapeMath').innerHTML = `<div class="math-waiting">${t('theory.shapes.math.pickSecond', { note: midiLabel(first.midi) })}</div>`;
    $('shapeBadge').textContent = midiLabel(first.midi);
    return;
  }
  const { steps, stringPart, fretPart, total } = measurePair(first, second);
  const sum = [...steps.map(signed), signed(fretPart)].filter(Boolean).join(' ') || '0';

  $('shapeMath').innerHTML = `
    <div class="math-sum">
      <span class="math-terms">${sum}</span>
      <i aria-hidden="true">=</i>
      <span class="math-total">${t('theory.shapes.math.semitones', { n: total < 0 ? `−${Math.abs(total)}` : String(total), semitones: pluralize('interval.unit.semitone', Math.abs(total)) })}</span>
      <span class="math-name">${distanceName(total)}</span>
    </div>
    <div class="math-legend">
      ${steps.length ? `<span>${t('theory.shapes.math.stringsLabel', { n: signed(stringPart) || '0' })}</span>` : ''}
      ${fretPart ? `<span>${t('theory.shapes.math.fretsLabel', { n: signed(fretPart) })}</span>` : ''}
    </div>`;
  $('shapeBadge').textContent = `${distanceMark(total)} · ${Math.abs(total)}`;
}

// Where a cell sits inside the board. offsetLeft/offsetTop are layout values, so
// they still answer correctly when the board has been turned on its side — which
// is the whole reason the overlay is a child of the board rather than of the
// frame around it.
function offsetWithin(board, element) {
  let x = 0;
  let y = 0;
  let node = element;
  while (node && node !== board && node !== document.body) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return { x: x + element.offsetWidth / 2, y: y + element.offsetHeight / 2 };
}

function shapeTag(x, y, text, odd) {
  const width = 16 + String(text).length * 9;
  return `<g class="shape-tag${odd ? ' odd' : ''}">
    <rect x="${x - width / 2}" y="${y - 11}" width="${width}" height="22" rx="8" />
    <text x="${x}" y="${y + 5}" text-anchor="middle">${text}</text>
  </g>`;
}

// An arrow, drawn as a line that stops where its head begins and a head that is
// its own triangle: a marker plus a round cap left a stub poking out past the
// point. Both carry a dark outline so they read over a wound string.
const HEAD_LENGTH = 13;
const HEAD_HALF = 6.5;

function shapeArrow(x1, y1, x2, y2, odd) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < HEAD_LENGTH + 2) return '';
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const baseX = x2 - ux * HEAD_LENGTH;
  const baseY = y2 - uy * HEAD_LENGTH;
  const head = `M${x2},${y2} L${baseX - uy * HEAD_HALF},${baseY + ux * HEAD_HALF} L${baseX + uy * HEAD_HALF},${baseY - ux * HEAD_HALF} Z`;
  const cls = odd ? ' odd' : '';
  return `<line class="shape-halo" x1="${x1}" y1="${y1}" x2="${baseX}" y2="${baseY}" />
    <line class="shape-arrow${cls}" x1="${x1}" y1="${y1}" x2="${baseX}" y2="${baseY}" />
    <path class="shape-head${cls}" d="${head}" />`;
}

// How far off a string an arrow running along it sits. On the string it is the
// same line as the string and disappears into it.
// Half a note marker, plus a breath. Arrows run down the middle of the notes they
// join, so they are trimmed by this much wherever a marker actually sits — at the
// note the move starts from, and at the one it ends on.
const MARKER_CLEAR = 20;

// The arithmetic drawn on the neck the reader is looking at: one arrow per string
// crossed carrying what that crossing costs, one for the fret slide. The chain
// runs centre to centre, so the last string hop and the fret slide meet exactly
// at the corner between them.
function drawShapeOverlay(board, first, second) {
  const cellElement = (cell) => board.querySelector(`[data-learn-cell="${cell.stringIndex}:${cell.fret}"]`);
  const anchorElement = cellElement(first);
  const partnerElement = cellElement(second);
  if (!anchorElement || !partnerElement || !board.offsetWidth) return;
  const { steps, direction, fretPart } = measurePair(first, second);
  const startX = offsetWithin(board, anchorElement).x;
  const { x: endX, y: rowY } = offsetWithin(board, partnerElement);
  // Beside the line, and on whichever side has room: at the nut there is none to
  // the left, and above the top string none overhead.
  const tagX = startX < 150 ? startX + 30 : startX - 30;
  const parts = [];

  for (let step = 0; step < steps.length; step += 1) {
    const from = cellElement({ stringIndex: first.stringIndex + step * direction, fret: first.fret });
    const to = cellElement({ stringIndex: first.stringIndex + (step + 1) * direction, fret: first.fret });
    if (!from || !to) return;
    const fromY = offsetWithin(board, from).y;
    const toY = offsetWithin(board, to).y;
    const lean = Math.sign(toY - fromY);
    // Only the ends of the whole move have a marker to clear; the cells passed
    // through on the way carry an ordinary note, which the arrow crosses.
    const fromTrim = step === 0 ? MARKER_CLEAR : 0;
    const toTrim = step === steps.length - 1 && fretPart === 0 ? MARKER_CLEAR : 0;
    const plain = Math.abs(steps[step]) === 5;
    parts.push(shapeArrow(startX, fromY + lean * fromTrim, startX, toY - lean * toTrim, !plain));
    parts.push(shapeTag(tagX, (fromY + toY) / 2, signed(steps[step]), !plain));
  }

  if (fretPart !== 0) {
    const lean = Math.sign(fretPart);
    // With a string hop before it the slide starts where that hop landed, which is
    // an ordinary cell; on its own it starts at the note the move began from.
    const fromX = steps.length ? startX : startX + lean * MARKER_CLEAR;
    parts.push(shapeArrow(fromX, rowY, endX - lean * MARKER_CLEAR, rowY, false));
    const labelY = rowY < 76 ? rowY + 26 : rowY - 26;
    parts.push(shapeTag((startX + endX) / 2, labelY, signed(fretPart), false));
  }

  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'shape-overlay');
  overlay.setAttribute('width', board.offsetWidth);
  overlay.setAttribute('height', board.offsetHeight);
  overlay.setAttribute('viewBox', `0 0 ${board.offsetWidth} ${board.offsetHeight}`);
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = parts.join('');
  board.appendChild(overlay);
}

// Both ends of a shape are the point of looking at it, and the neck is wider than
// the frame — so a pair that lands off the right edge is scrolled into view. Only
// sideways, and only while the neck is lying down: stood upright it is a rotated
// box, and its scroller no longer means what this arithmetic assumes.
function revealShape(board, first, second) {
  const scroller = board.closest('.training-board-scroll');
  if (!scroller || document.body.classList.contains('board-vertical')) return;
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  const xs = [first, second]
    .map((cell) => board.querySelector(`[data-learn-cell="${cell.stringIndex}:${cell.fret}"]`))
    .filter(Boolean)
    .map((element) => offsetWithin(board, element).x);
  if (xs.length < 2) return;
  const left = Math.min(...xs) - 70;
  const right = Math.max(...xs) + 70;
  if (left >= scroller.scrollLeft && right <= scroller.scrollLeft + scroller.clientWidth) return;
  const centred = (left + right) / 2 - scroller.clientWidth / 2;
  scroller.scrollLeft = Math.max(0, Math.min(centred, scroller.scrollWidth - scroller.clientWidth));
}

function renderShapeBoard() {
  const { first, second } = state.pair;
  const board = $('shapeBoard');
  const total = second ? measurePair(first, second).total : 0;
  renderBoard(board, {
    anchor: first,
    targets: second ? [second] : [],
    interactive: true,
    targetMarker: second ? distanceMark(total) : '',
  });
  if (second) {
    drawShapeOverlay(board, first, second);
    revealShape(board, first, second);
  }

  if (!second) {
    $('shapeReadout').innerHTML = `<span class="readout-note">${midiLabel(first.midi)}</span>
      <span class="readout-facts"><span>${t('theory.shapes.math.pickSecondShort')}</span></span>`;
    return;
  }
  const shape = state.shapeId ? shapeById(state.shapeId) : null;
  $('shapeReadout').innerHTML = `
    <span class="readout-note">${midiLabel(first.midi)} → ${midiLabel(second.midi)}</span>
    <span class="readout-facts">
      <span>${distanceName(total)}</span>
      <span>${shape ? shapeWhere(shape) : t('theory.shapes.noShape')}</span>
    </span>
    <button type="button" class="ghost-button" data-play-pair="${first.midi}:${second.midi}"
      aria-label="${t('theory.playIntervalAria', { name: distanceName(total) })}">${t('theory.listen')}</button>`;
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
  renderAlphabet();
  renderNoteRing();
  renderStringTable();
  renderOctaveLadder();
  renderOctaveTable();
  renderOctaveBorder();
  renderKeyboard();
  renderEnharmonics();
  renderStepWalk();
  renderGapMap();
  renderTuningChain();
  renderFretboardStage();
  renderTwelfth();
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
      return;
    }
    const octaveButton = event.target.closest('[data-play-octave]');
    if (octaveButton) {
      const open = Number(octaveButton.dataset.playOctave);
      void playIntervalByType(open, open + 12, 'ascending', octaveButton);
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
  $('findPicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-find-note]');
    if (!button) return;
    state.findPitchClass = Number(button.dataset.findNote);
    renderFindPicker();
    renderFindBoard();
  });
  $('findBoard').addEventListener('click', (event) => {
    const button = event.target.closest('[data-find-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.findCell.split(':').map(Number);
    void playMidi(OPEN_MIDIS[stringIndex] + fret);
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

  const chooseInversion = (id) => {
    state.inversionId = getInterval(id).id;
    renderInversion();
  };
  $('inversionLab').addEventListener('click', (event) => {
    if (event.target.closest('[data-invert]')) chooseInversion(invertId(state.inversionId));
  });
  $('inversionTable').addEventListener('click', (event) => {
    const button = event.target.closest('[data-invert-pick]');
    if (button) chooseInversion(button.dataset.invertPick);
  });

  $('shapePicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-shape]');
    if (!button) return;
    applyShape(button.dataset.shape);
    renderShapePicker();
    renderShapeSum();
    renderShapeBoard();
  });
  // Two taps make a measurement: the first note, then the second. A third starts
  // again, so the board never needs a reset button.
  $('shapeBoard').addEventListener('click', (event) => {
    const button = event.target.closest('[data-learn-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.learnCell.split(':').map(Number);
    const cell = cellAt(stringIndex, fret);
    if (!state.pair.second) {
      if (cellKey(cell) === cellKey(state.pair.first)) return;
      state.pair = { first: state.pair.first, second: cell };
    } else {
      state.pair = { first: cell, second: null };
    }
    state.shapeId = matchShapeId(state.pair);
    renderShapePicker();
    renderShapeSum();
    renderShapeBoard();
    void playMidi(cell.midi);
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
  const redraw = () => { renderFretboardStage(); renderIntervalBoard(); renderShapeBoard(); };
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
  applyShape(state.shapeId);
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
