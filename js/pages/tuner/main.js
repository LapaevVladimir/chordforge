// Tuner page: presentation only. Every measurement decision lives in
// js/core/tuner/tuner-engine.js, which knows nothing about this file.
import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import { createTuning, STANDARD_TUNING, PITCH_NAMES } from '../../core/tuning.js';
import { GuitarEngine } from '../../core/guitar-audio.js';
import { createTunerEngine, TUNER_STATES, TUNING_VERDICTS } from '../../core/tuner/tuner-engine.js';
import { runAccuracySuite } from '../../core/pitch/signal-test.js';
import { elements } from './elements.js';

const PRESETS = {
  standard: STANDARD_TUNING,
  dropd: [2, 9, 2, 7, 11, 4],
  dadgad: [2, 9, 2, 7, 9, 2],
  openg: [2, 7, 2, 7, 11, 2],
};

const GAUGE_SWEEP = 120; // degrees of arc that ±50 cents maps to
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 96; // must match r= in tuner.html
const CENTS_RANGE = 50;

const tuning = createTuning(STANDARD_TUNING, 'guitar');
const audio = new GuitarEngine();
const engine = createTunerEngine({ stringMidis: tuning.openMidis });

let toastTimer = 0;
let selfTestRunning = false;

const mod12 = (value) => ((value % 12) + 12) % 12;

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 3600);
}

/* ---------------------------------------------------------------- sidebar */

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

function renderStringPicker() {
  const strings = engine.strings;
  const selected = engine.selectedStringIndex;
  const auto = `<button type="button" class="string-chip ${selected === null ? 'active' : ''}" data-string-select="auto">${t('tuner.stringAuto')}</button>`;
  const chips = strings.map((string) => `<button type="button" class="string-chip ${selected === string.index ? 'active' : ''}" data-string-select="${string.index}">${string.stringNumber} · ${string.label}</button>`).join('');
  elements.stringPicker.innerHTML = auto + chips;
  elements.stringPicker.querySelectorAll('[data-string-select]').forEach((button) => button.addEventListener('click', () => {
    const value = button.dataset.stringSelect;
    engine.selectString(value === 'auto' ? null : Number(value));
    renderStringPicker();
    renderTargetReadout();
  }));
}

function renderTargetReadout() {
  const index = engine.selectedStringIndex;
  if (engine.config.mode === 'chromatic') {
    elements.targetReadout.textContent = t('tuner.targetChromatic');
    return;
  }
  if (index === null) {
    elements.targetReadout.textContent = t('tuner.targetAuto');
    return;
  }
  const string = engine.strings[index];
  elements.targetReadout.innerHTML = `<strong>${t('tuner.stringOrdinal', { n: string.stringNumber })}</strong>
    <span>${t('tuner.targetLabel')} ${string.label} · ${string.frequency.toFixed(4)} Hz</span>`;
}

function renderStrings() {
  const strings = engine.strings;
  elements.strings.innerHTML = strings.map((string) => {
    const aria = t('tuner.stringAria', { n: string.stringNumber, note: string.label });
    return `<button type="button" class="tuner-string" data-string="${string.index}" aria-label="${aria}">
      <span class="string-check" aria-hidden="true">✓</span>
      <strong>${PITCH_NAMES[mod12(string.midi)]}</strong>
      <small>${string.stringNumber}</small>
    </button>`;
  }).join('');
  elements.strings.querySelectorAll('[data-string]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.string);
    if (engine.config.mode === 'guitar') {
      engine.selectString(index);
      renderStringPicker();
      renderTargetReadout();
    }
    playReference(index);
  }));
  updateStringStates(null);
}

async function playReference(stringIndex) {
  const openMidis = tuning.openMidis;
  try {
    await audio.pluck({ midi: openMidis[stringIndex], stringIndex }, openMidis.length);
  } catch {
    showToast(t('builder.toast.sampleLoadFailed'));
  }
}

const tunedStrings = new Set();

function updateStringStates(activeIndex) {
  elements.strings.querySelectorAll('[data-string]').forEach((button) => {
    const index = Number(button.dataset.string);
    button.classList.toggle('active', index === activeIndex);
    button.classList.toggle('selected', engine.config.mode === 'guitar' && index === engine.selectedStringIndex);
    button.classList.toggle('tuned', tunedStrings.has(index));
  });
}

function renderGaugeTicks() {
  const steps = 20;
  elements.gaugeTicks.innerHTML = Array.from({ length: steps + 1 }, (unused, index) => {
    const cents = -CENTS_RANGE + index * ((CENTS_RANGE * 2) / steps);
    const angle = (cents / CENTS_RANGE) * GAUGE_SWEEP;
    const major = Math.abs(cents % 25) < 0.001;
    return `<line class="gauge-tick${major ? ' major' : ''}" x1="130" y1="${major ? 13 : 18}" x2="130" y2="26" transform="rotate(${angle.toFixed(2)} 130 130)"></line>`;
  }).join('');
}

/* ------------------------------------------------------------------ meter */

function setGauge(cents) {
  const clamped = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents));
  const degrees = (clamped / CENTS_RANGE) * GAUGE_SWEEP;
  const length = (Math.abs(degrees) / 360) * GAUGE_CIRCUMFERENCE;
  elements.gaugeArc.style.setProperty('--arc-length', length.toFixed(2));
  elements.gaugeArc.style.setProperty('--arc-rotate', `${(degrees < 0 ? -90 + degrees : -90).toFixed(2)}deg`);
  elements.scalePointer.style.setProperty('--pointer', `${(50 + (clamped / CENTS_RANGE) * 50).toFixed(2)}%`);
}

function setLevel(level) {
  // Square-rooted so the quiet end of the range, where the feedback matters,
  // occupies more of the bar.
  const filled = Math.min(1, Math.sqrt(Math.max(0, level) / 0.25));
  elements.micLevel.style.setProperty('--level', filled.toFixed(3));
}

function clearReadout(statusKey) {
  elements.note.textContent = '—';
  elements.octave.textContent = '';
  elements.cents.textContent = '';
  elements.readoutDetected.textContent = '—';
  elements.readoutTarget.textContent = '—';
  elements.readoutCents.textContent = '—';
  elements.statusText.textContent = t(statusKey);
  elements.stage.classList.remove('in-tune', 'flat', 'sharp');
  setGauge(0);
  updateStringStates(null);
}

const VERDICT_KEYS = {
  [TUNING_VERDICTS.FLAT]: 'tuner.statusFlat',
  [TUNING_VERDICTS.SHARP]: 'tuner.statusSharp',
  [TUNING_VERDICTS.IN_TUNE]: 'tuner.statusInTune',
};

function render(reading) {
  setLevel(reading.signalLevel);
  elements.diagConfidence.textContent = reading.confidence ? reading.confidence.toFixed(3) : '—';
  elements.diagCompute.textContent = reading.computeMs ? `${reading.computeMs.toFixed(2)} ms` : '—';

  if (reading.clipping) showClipWarning();

  if (reading.state === TUNER_STATES.ERROR) {
    clearReadout(`tuner.error.${reading.error}`);
    return;
  }
  if (reading.state === TUNER_STATES.IDLE) {
    clearReadout('tuner.micStatus.idle');
    return;
  }
  if (reading.state === TUNER_STATES.NO_SIGNAL) {
    clearReadout('tuner.stateNoSignal');
    return;
  }
  if (reading.state === TUNER_STATES.DETECTING) {
    clearReadout(reading.detail === 'wrong-string' ? 'tuner.stateWrongString' : 'tuner.stateDetecting');
    if (reading.detail === 'wrong-string') updateStringStates(null);
    return;
  }

  const inTune = reading.verdict === TUNING_VERDICTS.IN_TUNE;
  elements.note.textContent = reading.noteName;
  elements.octave.textContent = reading.octave;
  const rounded = reading.cents;
  const sign = rounded > 0.05 ? '+' : rounded < -0.05 ? '−' : '';
  elements.cents.textContent = `${sign}${Math.abs(rounded).toFixed(1)}¢`;
  elements.readoutDetected.textContent = `${reading.frequency.toFixed(2)} Hz`;
  elements.readoutTarget.textContent = `${reading.targetFrequency.toFixed(4)} Hz`;
  elements.readoutCents.textContent = `${sign}${Math.abs(rounded).toFixed(2)} ¢`;
  elements.statusText.textContent = t(VERDICT_KEYS[reading.verdict]);
  elements.stage.classList.toggle('in-tune', inTune);
  elements.stage.classList.toggle('flat', reading.verdict === TUNING_VERDICTS.FLAT);
  elements.stage.classList.toggle('sharp', reading.verdict === TUNING_VERDICTS.SHARP);
  setGauge(reading.cents);

  if (inTune && reading.stringIndex !== null) tunedStrings.add(reading.stringIndex);
  updateStringStates(reading.stringIndex);
}

let clipWarnedAt = 0;
function showClipWarning() {
  const now = performance.now();
  if (now - clipWarnedAt < 4000) return;
  clipWarnedAt = now;
  showToast(t('tuner.clipping'));
}

/* ----------------------------------------------------------------- events */

function onTuningChanged() {
  tunedStrings.clear();
  engine.setStringMidis(tuning.openMidis);
  renderTuningControls();
  renderStringPicker();
  renderTargetReadout();
  renderStrings();
  elements.tuningBadge.textContent = tuning.label();
  clearReadout(engine.running ? 'tuner.stateNoSignal' : 'tuner.micStatus.idle');
}

async function toggleMic() {
  if (engine.running) {
    await engine.stop();
    elements.micToggle.classList.remove('listening');
    elements.micToggle.querySelector('span:last-child').textContent = t('tuner.micStart');
    elements.micStatus.textContent = t('tuner.micStatus.idle');
    elements.diagEngine.textContent = '—';
    elements.diagSampleRate.textContent = '—';
    elements.diagFrame.textContent = '—';
    setLevel(0);
    return;
  }

  elements.micToggle.classList.add('pending');
  const started = await engine.start();
  elements.micToggle.classList.remove('pending');

  if (!started.ok) {
    const message = t(`tuner.error.${started.reason}`);
    elements.micStatus.textContent = message;
    showToast(message);
    return;
  }

  elements.micToggle.classList.add('listening');
  elements.micToggle.querySelector('span:last-child').textContent = t('tuner.micStop');
  elements.micStatus.textContent = t('tuner.micStatus.listening');
  elements.diagEngine.textContent = started.usingWorker ? t('tuner.diag.worker') : t('tuner.diag.inline');
  elements.diagSampleRate.textContent = `${Math.round(started.sampleRate)} Hz`;
  elements.diagFrame.textContent = `${engine.config.frameSize} · ${started.frameLatencyMs.toFixed(0)} ms`;
}

async function runSelfTest() {
  if (selfTestRunning) return;
  selfTestRunning = true;
  elements.runSelfTest.disabled = true;
  elements.selfTestOutput.innerHTML = `<p class="self-test-status">${t('tuner.selfTest.running')}</p>`;
  // Yield once so the button state paints before the synchronous sweep.
  await new Promise((resolve) => window.setTimeout(resolve, 30));

  const rows = runAccuracySuite({
    sampleRate: 48000,
    bufferSize: engine.config.frameSize,
    frames: 10,
    amplitude: 0.05,
    decay: 1.2,
    noise: 0.002,
    inharmonicity: 0.00003,
  });

  elements.selfTestOutput.innerHTML = `<table class="self-test-table">
    <thead><tr><th>${t('tuner.selfTest.signal')}</th><th>${t('tuner.selfTest.error')}</th><th>${t('tuner.selfTest.rate')}</th></tr></thead>
    <tbody>${rows.map((row) => {
      const cents = row.medianCents === null ? '—' : `${row.medianCents >= 0 ? '+' : '−'}${Math.abs(row.medianCents).toFixed(2)}¢`;
      const ok = row.medianCents !== null && Math.abs(row.medianCents) <= 5 && row.detectionRate >= 0.8;
      return `<tr class="${ok ? 'pass' : 'warn'}"><td>${row.label}</td><td>${cents}</td><td>${Math.round(row.detectionRate * 100)}%</td></tr>`;
    }).join('')}</tbody></table>`;

  elements.runSelfTest.disabled = false;
  selfTestRunning = false;
}

function applyMode(mode) {
  engine.setMode(mode);
  elements.stringSection.hidden = mode === 'chromatic';
  renderStringPicker();
  renderTargetReadout();
  updateStringStates(null);
  clearReadout(engine.running ? 'tuner.stateNoSignal' : 'tuner.micStatus.idle');
}

function bindEvents() {
  elements.modeInputs.forEach((input) => input.addEventListener('change', () => {
    if (input.checked) applyMode(input.value);
  }));
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
  elements.micToggle.addEventListener('click', () => { toggleMic(); });
  elements.runSelfTest.addEventListener('click', () => { runSelfTest(); });
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => { engine.stop(); audio.stop(); });
}

onLocaleChange(() => {
  syncLocaleDock();
  renderTuningControls();
  renderStringPicker();
  renderTargetReadout();
  renderStrings();
  elements.micToggle.querySelector('span:last-child').textContent = t(engine.running ? 'tuner.micStop' : 'tuner.micStart');
  elements.micStatus.textContent = t(engine.running ? 'tuner.micStatus.listening' : 'tuner.micStatus.idle');
  if (!engine.running) clearReadout('tuner.micStatus.idle');
});

function initialize() {
  i18nInit();
  syncLocaleDock();
  renderGaugeTicks();
  renderTuningControls();
  renderStringPicker();
  renderTargetReadout();
  renderStrings();
  elements.tuningBadge.textContent = tuning.label();
  elements.stringSection.hidden = false;
  setLevel(0);
  clearReadout('tuner.micStatus.idle');
  engine.onReading(render);
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
