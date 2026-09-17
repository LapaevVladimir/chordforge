import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import { createTuning, STANDARD_TUNING, PITCH_NAMES } from '../../core/tuning.js';
import { frequencyToMidi, centsOffPitch } from '../../core/pitch-detect.js';
import { GuitarEngine } from '../../core/guitar-audio.js';
import { elements } from './elements.js';
import * as mic from './mic.js';

const PRESETS = {
  standard: STANDARD_TUNING,
  dropd: [2, 9, 2, 7, 11, 4],
  dadgad: [2, 9, 2, 7, 9, 2],
  openg: [2, 7, 2, 7, 11, 2],
};
// Asymmetric on purpose: a reading has to get within 5 cents to count as in
// tune, but only drifts out past 8. As a string decays the estimate jitters by a
// few cents, and a single threshold makes the verdict flicker on the tail.
const IN_TUNE_CENTS = 5;
const OUT_OF_TUNE_CENTS = 8;
const STRING_MATCH_SEMITONES = 1.5;
// In manual mode we only listen around the chosen string. Three semitones is far
// more detuning than a playable string ever has, while still being narrower than
// the four semitones to the next string — so a neighbour ringing along is ignored.
const MANUAL_RANGE_SEMITONES = 3;
// Once locked onto a string, this many readings in a row must agree on a
// different one before the display follows. Plucking one string sets its
// neighbours ringing too, and without this the readout hops between them.
const STRING_SWITCH_FRAMES = 10;
// How long a string has to stay in tune before its tick is awarded. A stray
// frame or two from a sympathetically ringing string can't earn one.
const TUNED_HOLD_MS = 1500;

// How periodic a reading has to look before we trust it. This replaces the old
// volume threshold: it accepts a quietly plucked string but rejects room noise.
const CLARITY_THRESHOLD = 0.66;
// Loud enough that the user is clearly making a sound, even if we can't read it.
const AUDIBLE_LEVEL = 0.006;
// A plucked string decays below the clarity threshold long before it stops being
// what the user is listening to, so keep the last reading on screen this long.
const HOLD_MS = 900;
// Median over ~0.3 s of readings; shorter windows let the decaying tail of a note
// wobble the display.
const SMOOTHING = 7;

const GAUGE_SWEEP = 120; // degrees of arc that ±50 cents maps to
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 96; // must match the r= in tuner.html

const mod12 = (value) => ((value % 12) + 12) % 12;
const tuning = createTuning(STANDARD_TUNING, 'guitar');
const audio = new GuitarEngine();
const tunedStrings = new Set();
let recentPitches = [];
let lastPitchAt = 0;
let wasInTune = false;
let lastTargetMidi = null;
let toastTimer = 0;
let mode = 'auto';
let manualStringIndex = 0;
let lockedStringIndex = -1;
let candidateIndex = -1;
let candidateFrames = 0;
let inTuneSince = 0;

const noteLetter = (midi) => PITCH_NAMES[mod12(Math.round(midi))];
const noteOctave = (midi) => Math.floor(Math.round(midi) / 12) - 1;
const midiNoteName = (midi) => `${noteLetter(midi)}${noteOctave(midi)}`;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 3200);
}

function renderTuningControls() {
  const pitches = tuning.pitches;
  elements.tuning.innerHTML = pitches.map((pitch, index) => {
    const stringNumber = pitches.length - index;
    const descriptor = index === 0 ? t('builder.tuning.bassDescriptor') : index === pitches.length - 1 ? t('builder.tuning.firstDescriptor') : '';
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
    tuning.setString(Number(event.target.dataset.tune), Number(event.target.value));
    onTuningChanged();
  }));
  elements.tuning.querySelectorAll('[data-tune-step]').forEach((button) => button.addEventListener('click', () => {
    tuning.shiftString(Number(button.dataset.tuneStep), Number(button.dataset.dir));
    onTuningChanged();
  }));
}

function renderStrings() {
  const openMidis = tuning.openMidis;
  const ariaKey = mode === 'manual' ? 'tuner.stringSelectAria' : 'tuner.stringAria';
  elements.strings.innerHTML = openMidis.map((midi, index) => {
    const stringNumber = openMidis.length - index;
    const aria = t(ariaKey, { n: stringNumber, note: midiNoteName(midi) });
    return `<button type="button" class="tuner-string" data-string="${index}" aria-label="${aria}" aria-pressed="false">
      <span class="string-check" aria-hidden="true">✓</span>
      <strong>${noteLetter(midi)}</strong>
      <small>${stringNumber}</small>
    </button>`;
  }).join('');
  elements.strings.querySelectorAll('[data-string]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.string);
    // In manual mode a tap also picks the string to measure against; in auto
    // mode it stays a plain "play me the reference pitch" button.
    if (mode === 'manual') selectManualString(index);
    playReference(index);
  }));
  updateStringStates(lockedStringIndex);
}

function selectManualString(index) {
  manualStringIndex = index;
  resetTracking();
  setIdleReadout();
}

function renderGaugeTicks() {
  const steps = 20;
  elements.gaugeTicks.innerHTML = Array.from({ length: steps + 1 }, (unused, index) => {
    const cents = -50 + index * (100 / steps);
    const angle = (cents / 50) * GAUGE_SWEEP;
    const major = Math.abs(cents % 25) < 0.001;
    return `<line class="gauge-tick${major ? ' major' : ''}" x1="130" y1="${major ? 13 : 18}" x2="130" y2="26" transform="rotate(${angle.toFixed(2)} 130 130)"></line>`;
  }).join('');
}

async function playReference(stringIndex) {
  const openMidis = tuning.openMidis;
  try {
    await audio.pluck({ midi: openMidis[stringIndex], stringIndex }, openMidis.length);
  } catch {
    showToast(t('builder.toast.sampleLoadFailed'));
  }
}

function updateStringStates(activeIndex) {
  elements.strings.querySelectorAll('[data-string]').forEach((button) => {
    const index = Number(button.dataset.string);
    const selected = mode === 'manual' && index === manualStringIndex;
    button.classList.toggle('active', index === activeIndex);
    button.classList.toggle('selected', selected);
    button.classList.toggle('tuned', tunedStrings.has(index));
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setGauge(cents) {
  const clamped = Math.max(-50, Math.min(50, cents));
  const degrees = (clamped / 50) * GAUGE_SWEEP;
  const length = (Math.abs(degrees) / 360) * GAUGE_CIRCUMFERENCE;
  // The arc is always drawn clockwise, so a flat reading starts further round
  // the ring and finishes at twelve o'clock instead of starting there.
  elements.gaugeArc.style.setProperty('--arc-length', length.toFixed(2));
  elements.gaugeArc.style.setProperty('--arc-rotate', `${(degrees < 0 ? -90 + degrees : -90).toFixed(2)}deg`);
}

function setChevrons(cents, inTune) {
  elements.chevrons.querySelectorAll('[data-cent]').forEach((chevron) => {
    const threshold = Number(chevron.dataset.cent);
    const lit = !inTune && (chevron.dataset.side === 'flat' ? cents <= -threshold : cents >= threshold);
    chevron.classList.toggle('lit', lit);
  });
}

function setLevel(level) {
  // Square-rooted so the quiet end of the range, where the user actually needs
  // the feedback, takes up more of the bar.
  const filled = Math.min(1, Math.sqrt(Math.max(0, level) / 0.25));
  elements.micLevel.style.setProperty('--level', filled.toFixed(3));
}

const idleListeningKey = () => (mode === 'manual' ? 'tuner.statusPlaySelected' : 'tuner.statusListening');

// Manual-mode status lines name the string being tuned; in auto mode the
// placeholders simply go unused.
function manualStringParams() {
  const openMidis = tuning.openMidis;
  return { n: openMidis.length - manualStringIndex, note: midiNoteName(openMidis[manualStringIndex]) };
}

function setIdleReadout(statusKey) {
  elements.note.textContent = t('tuner.notePlaceholder');
  elements.octave.textContent = '';
  elements.cents.textContent = '';
  elements.frequency.textContent = '';
  elements.statusText.textContent = t(statusKey ?? (mic.isListening() ? idleListeningKey() : 'tuner.micStatus.idle'), manualStringParams());
  wasInTune = false;
  lastTargetMidi = null;
  elements.stage.classList.remove('in-tune', 'flat', 'sharp');
  setGauge(0);
  setChevrons(0, true);
  updateStringStates(-1);
}

function nearestStringIndex(midi, openMidis) {
  let best = -1;
  let bestDiff = Infinity;
  openMidis.forEach((targetMidi, index) => {
    const diff = Math.abs(midi - targetMidi);
    if (diff < bestDiff) { bestDiff = diff; best = index; }
  });
  return bestDiff <= STRING_MATCH_SEMITONES ? best : -1;
}

function resetTracking() {
  recentPitches = [];
  lockedStringIndex = -1;
  candidateIndex = -1;
  candidateFrames = 0;
  inTuneSince = 0;
  lastPitchAt = 0;
}

// Decides which string a reading belongs to. In manual mode that's whatever the
// user picked; in auto mode the display sticks to the string it is already on
// until a different one has been heard consistently, so a neighbour set ringing
// by the string being played can't steal the readout.
function resolveStringIndex(midi, openMidis) {
  if (mode === 'manual') {
    const withinRange = Math.abs(midi - openMidis[manualStringIndex]) <= MANUAL_RANGE_SEMITONES;
    return withinRange ? manualStringIndex : -1;
  }

  const detected = nearestStringIndex(midi, openMidis);
  if (detected === -1 || detected === lockedStringIndex) {
    candidateIndex = -1;
    candidateFrames = 0;
    return detected === -1 ? lockedStringIndex : detected;
  }
  if (lockedStringIndex === -1) return detected; // nothing to hold on to yet

  if (detected === candidateIndex) candidateFrames += 1;
  else { candidateIndex = detected; candidateFrames = 1; }
  return candidateFrames >= STRING_SWITCH_FRAMES ? detected : lockedStringIndex;
}

function showPitch(frequency) {
  const openMidis = tuning.openMidis;
  const midi = frequencyToMidi(frequency);
  const stringIndex = resolveStringIndex(midi, openMidis);
  if (mode === 'manual' && stringIndex === -1) {
    // Something is sounding, but not the string being tuned — say so rather than
    // measuring it against the wrong target.
    setIdleReadout('tuner.statusWrongString');
    return;
  }
  // While we're holding one string, a reading that belongs to a different one
  // must not be measured against it — that would report a wild cents value for a
  // note the user isn't even tuning. Drop the frame and keep the held reading;
  // resolveStringIndex is still counting, so a real change of string gets through.
  // (Manual mode has already applied its own, wider window, so a deliberately
  // slack string still reads out instead of being dropped here.)
  if (mode === 'auto' && stringIndex !== -1 && Math.abs(midi - openMidis[stringIndex]) > STRING_MATCH_SEMITONES) return;

  if (stringIndex !== lockedStringIndex) {
    // The median must not average across two different strings.
    recentPitches = [frequency];
    inTuneSince = 0;
    lockedStringIndex = stringIndex;
    candidateIndex = -1;
    candidateFrames = 0;
  }

  // Away from any open string we still name the nearest chromatic note, so a
  // badly detuned string reads as a note rather than as nothing at all.
  const targetMidi = stringIndex === -1 ? Math.round(midi) : openMidis[stringIndex];
  const cents = centsOffPitch(frequency, targetMidi);
  // The widened threshold only applies while we stay on the same note; moving to
  // another string starts the verdict from scratch.
  const sameNote = targetMidi === lastTargetMidi;
  const inTune = Math.abs(cents) <= (sameNote && wasInTune ? OUT_OF_TUNE_CENTS : IN_TUNE_CENTS);
  wasInTune = inTune;
  lastTargetMidi = targetMidi;

  elements.note.textContent = noteLetter(targetMidi);
  elements.octave.textContent = noteOctave(targetMidi);
  const rounded = Math.round(cents);
  elements.cents.textContent = `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}¢`;
  elements.frequency.textContent = `${frequency.toFixed(1)} Hz`;
  elements.statusText.textContent = inTune ? t('tuner.statusInTune') : t(cents < 0 ? 'tuner.statusFlat' : 'tuner.statusSharp');
  elements.stage.classList.toggle('in-tune', inTune);
  elements.stage.classList.toggle('flat', !inTune && cents < 0);
  elements.stage.classList.toggle('sharp', !inTune && cents > 0);
  setGauge(cents);
  setChevrons(cents, inTune);

  // The tick is only awarded after the string has held steady for a while, so a
  // brief brush past the right pitch doesn't tick a string off as done.
  const now = performance.now();
  if (inTune && stringIndex !== -1) {
    if (!inTuneSince) inTuneSince = now;
    if (now - inTuneSince >= TUNED_HOLD_MS) tunedStrings.add(stringIndex);
  } else {
    inTuneSince = 0;
  }
  updateStringStates(stringIndex);
}

function handleReading({ frequency, clarity, level }) {
  if (!mic.isListening()) return;
  setLevel(level);

  if (frequency > 0 && clarity >= CLARITY_THRESHOLD) {
    recentPitches.push(frequency);
    if (recentPitches.length > SMOOTHING) recentPitches.shift();
    lastPitchAt = performance.now();
    showPitch(median(recentPitches));
    return;
  }

  if (performance.now() - lastPitchAt < HOLD_MS) return;
  resetTracking();
  setIdleReadout(level >= AUDIBLE_LEVEL ? 'tuner.statusUnclear' : 'tuner.statusListening');
}

function onTuningChanged() {
  tunedStrings.clear();
  resetTracking();
  renderTuningControls();
  renderStrings();
  elements.tuningBadge.textContent = tuning.label();
  setIdleReadout();
}

async function toggleMic() {
  if (mic.isListening()) {
    mic.stopListening();
    elements.micToggle.classList.remove('listening');
    elements.micToggle.querySelector('span:last-child').textContent = t('tuner.micStart');
    elements.micStatus.textContent = t('tuner.micStatus.idle');
    setLevel(0);
    setIdleReadout();
    return;
  }
  elements.micToggle.classList.add('pending');
  const result = await mic.startListening(handleReading);
  elements.micToggle.classList.remove('pending');
  if (!result.ok) {
    elements.micStatus.textContent = t(`tuner.micStatus.${result.reason}`);
    showToast(t(`tuner.micStatus.${result.reason}`));
    return;
  }
  resetTracking();
  elements.micToggle.classList.add('listening');
  elements.micToggle.querySelector('span:last-child').textContent = t('tuner.micStop');
  elements.micStatus.textContent = t('tuner.micStatus.listening');
  setIdleReadout();
}

function bindEvents() {
  elements.presetSelect.addEventListener('change', (event) => {
    const preset = PRESETS[event.target.value];
    if (!preset) return;
    tuning.setAll(preset);
    onTuningChanged();
  });
  elements.tuningDown.addEventListener('click', () => { tuning.shiftAll(-1); onTuningChanged(); });
  elements.tuningUp.addEventListener('click', () => { tuning.shiftAll(1); onTuningChanged(); });
  elements.resetTuning.addEventListener('click', () => {
    elements.presetSelect.value = 'standard';
    tuning.reset();
    onTuningChanged();
  });
  elements.modeInputs.forEach((input) => input.addEventListener('change', () => {
    if (!input.checked) return;
    mode = input.value;
    resetTracking();
    renderStrings(); // the string buttons mean something different in each mode
    setIdleReadout();
  }));
  elements.micToggle.addEventListener('click', () => { toggleMic(); });
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => { mic.stopListening(); audio.stop(); });
}

onLocaleChange(() => {
  syncLocaleDock();
  renderTuningControls();
  renderStrings();
  const listening = mic.isListening();
  elements.micToggle.querySelector('span:last-child').textContent = t(listening ? 'tuner.micStop' : 'tuner.micStart');
  elements.micStatus.textContent = t(listening ? 'tuner.micStatus.listening' : 'tuner.micStatus.idle');
  if (!listening) setIdleReadout();
});

function initialize() {
  i18nInit();
  syncLocaleDock();
  renderGaugeTicks();
  renderTuningControls();
  renderStrings();
  elements.tuningBadge.textContent = tuning.label();
  setLevel(0);
  setIdleReadout();
  bindEvents();
  applyTheme(localStorage.getItem(THEME_KEY), 'sunset');
  window.setTimeout(() => {
    document.body.classList.remove('site-loading');
    document.body.classList.add('site-ready');
    elements.loader?.classList.add('is-hidden');
    window.setTimeout(() => elements.loader?.remove(), 650);
  }, 780);
}

initialize();
