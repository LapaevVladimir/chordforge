// TunerEngine — the whole tuner minus the pixels.
//
//   AudioInput -> PitchAnalyzer (YIN) -> PitchSmoother -> note detection -> reading
//
// It owns no DOM and imports nothing from the pages layer, so it can be reused
// anywhere on the site: hand it a callback and it emits a reading object several
// times a second. `analyzeFrame` exposes the same pipeline for offline callers
// such as the accuracy self-test.
import { createAudioInput, INPUT_ERRORS } from './audio-input.js';
import { createPitchAnalyzer } from './pitch-analyzer.js';
import { createYinDetector } from '../pitch/yin.js';
import { createPitchSmoother, DEFAULT_SMOOTHER_OPTIONS } from '../pitch/smoother.js';
import {
  A4_FREQUENCY, describeFrequency, describeAgainstMidi,
  buildStrings, nearestStringIndex, STANDARD_GUITAR_MIDIS,
} from '../pitch/note.js';

export { INPUT_ERRORS };

export const TUNER_STATES = {
  IDLE: 'idle',
  NO_SIGNAL: 'no-signal',
  DETECTING: 'detecting',
  ACTIVE: 'active',
  ERROR: 'error',
};

export const TUNING_VERDICTS = {
  FLAT: 'flat',
  IN_TUNE: 'in-tune',
  SHARP: 'sharp',
};

export const DEFAULT_TUNER_CONFIG = {
  // 3072 samples is 64 ms at 48 kHz, and the difference function integrates over
  // half of that — 2.6 periods of the low E. Chosen by measurement: under a
  // deliberately quiet and noisy test condition, a 1024-sample frame failed to
  // detect E2 at all, 2048 managed 55% of frames at ~12 cents, and 3072 reached
  // 75% at ~4.5 cents. 4096 bought nothing further and cost 21 ms more latency.
  frameSize: 3072,
  // A new estimate every 512 samples, ~10.7 ms, independent of the frame length.
  hopSize: 512,
  minFrequency: 70,
  maxFrequency: 1400,
  a4: A4_FREQUENCY,
  // Below this RMS the input counts as silence and no note is shown.
  noiseFloor: 0.004,
  // Loud enough to be worth mentioning that we heard *something*.
  signalFloor: 0.008,
  // Anything at or above this is clipping the input.
  clipThreshold: 0.985,
  inTuneCents: 5,
  // When a string is pinned by hand, a reading further than this from it is
  // another string rather than a badly detuned one: two semitones is far more
  // than any playable string drifts, and less than the four to its neighbour.
  lockedRangeCents: 200,
  mode: 'guitar', // 'guitar' | 'chromatic'
  stringMidis: STANDARD_GUITAR_MIDIS,
  preferFlats: false,
  smoother: {},
};

export function createTunerEngine(userConfig = {}) {
  const config = { ...DEFAULT_TUNER_CONFIG, ...userConfig };
  config.smoother = { ...DEFAULT_SMOOTHER_OPTIONS, ...(userConfig.smoother || {}) };

  let strings = buildStrings(config.stringMidis, config.a4);
  let selectedStringIndex = null; // null = follow whichever string is playing
  let listeners = [];
  let input = null;
  let analyzer = null;
  let smoother = createPitchSmoother(config.smoother);
  let running = false;
  let lastComputeMs = 0;

  const emit = (reading) => { for (const listener of listeners) listener(reading); };

  function onReading(listener) {
    listeners.push(listener);
    return () => { listeners = listeners.filter((entry) => entry !== listener); };
  }

  function baseReading(extra) {
    return {
      frequency: null,
      noteName: null,
      octave: null,
      midi: null,
      targetFrequency: null,
      cents: null,
      verdict: null,
      confidence: 0,
      signalLevel: 0,
      peakLevel: 0,
      clipping: false,
      stringIndex: null,
      state: TUNER_STATES.NO_SIGNAL,
      mode: config.mode,
      computeMs: lastComputeMs,
      ...extra,
    };
  }

  // The full pipeline for one detector result. Split out so `analyzeFrame` and
  // the live path cannot drift apart.
  function processPitch(message, now) {
    lastComputeMs = message.computeMs ?? lastComputeMs;
    const signalLevel = message.rms ?? 0;
    const peakLevel = message.peak ?? 0;
    const clipping = peakLevel >= config.clipThreshold;

    if (signalLevel < config.noiseFloor) {
      smoother.reset();
      return baseReading({ signalLevel, peakLevel, clipping, state: TUNER_STATES.NO_SIGNAL });
    }

    const smoothedResult = smoother.push(message, now);
    if (!smoothedResult) {
      return baseReading({
        signalLevel, peakLevel, clipping,
        confidence: message.clarity ?? 0,
        state: TUNER_STATES.DETECTING,
      });
    }

    const frequency = smoothedResult.frequency;
    let stringIndex = null;
    let described;

    if (config.mode === 'guitar') {
      const target = selectedStringIndex !== null
        ? selectedStringIndex
        : nearestStringIndex(frequency, strings, 3, config.a4);
      if (target === -1) {
        // Something is sounding, but it is not any string of this tuning.
        return baseReading({
          signalLevel, peakLevel, clipping,
          confidence: smoothedResult.clarity ?? 0,
          state: TUNER_STATES.DETECTING,
        });
      }
      stringIndex = target;
      described = describeAgainstMidi(frequency, strings[target].midi, config);
      if (selectedStringIndex !== null && Math.abs(described.cents) > config.lockedRangeCents) {
        // A pinned string plus a reading two semitones away means a different
        // string is ringing; a four-figure cents number would be useless here.
        return baseReading({
          signalLevel, peakLevel, clipping,
          confidence: smoothedResult.clarity ?? 0,
          stringIndex: selectedStringIndex,
          state: TUNER_STATES.DETECTING,
          detail: 'wrong-string',
        });
      }
    } else {
      described = describeFrequency(frequency, config);
    }

    const verdict = described.cents < -config.inTuneCents
      ? TUNING_VERDICTS.FLAT
      : described.cents > config.inTuneCents
        ? TUNING_VERDICTS.SHARP
        : TUNING_VERDICTS.IN_TUNE;

    return baseReading({
      frequency: described.frequency,
      noteName: described.noteName,
      octave: described.octave,
      midi: described.midi,
      nearestMidi: described.nearestMidi,
      label: described.label,
      targetFrequency: described.targetFrequency,
      cents: described.cents,
      verdict,
      confidence: smoothedResult.clarity ?? 0,
      signalLevel,
      peakLevel,
      clipping,
      stringIndex,
      held: Boolean(smoothedResult.held),
      state: TUNER_STATES.ACTIVE,
    });
  }

  async function start() {
    if (running) return { ok: true };
    input = createAudioInput({ frameSize: config.frameSize, hopSize: config.hopSize });

    const started = await input.start((frame) => analyzer?.push(frame));
    if (!started.ok) {
      input = null;
      emit(baseReading({ state: TUNER_STATES.ERROR, error: started.reason }));
      return started;
    }

    analyzer = createPitchAnalyzer({
      sampleRate: started.sampleRate,
      bufferSize: config.frameSize,
      minFrequency: config.minFrequency,
      maxFrequency: config.maxFrequency,
    });
    analyzer.onPitch((message) => emit(processPitch(message, performance.now())));

    smoother.reset();
    running = true;
    emit(baseReading({ state: TUNER_STATES.NO_SIGNAL }));
    return {
      ok: true,
      sampleRate: started.sampleRate,
      usingWorker: analyzer.usingWorker,
      // Frame latency is what the window costs; the rest is device-dependent.
      frameLatencyMs: (config.frameSize / started.sampleRate) * 1000,
      hopIntervalMs: (config.hopSize / started.sampleRate) * 1000,
      baseLatencyMs: (started.baseLatency ?? 0) * 1000,
    };
  }

  async function stop() {
    running = false;
    analyzer?.dispose();
    analyzer = null;
    await input?.stop();
    input = null;
    smoother.reset();
    emit(baseReading({ state: TUNER_STATES.IDLE }));
  }

  // Offline entry point: feed it a frame and a sample rate and get the same
  // reading the live path would produce. Used by the accuracy self-test.
  function analyzeFrame(samples, sampleRate, now = 0) {
    const detector = getOfflineDetector(sampleRate);
    const result = detector.detect(samples);
    return processPitch({ ...result, computeMs: 0 }, now);
  }

  let offlineDetector = null;
  let offlineRate = 0;
  function getOfflineDetector(sampleRate) {
    if (!offlineDetector || offlineRate !== sampleRate) {
      offlineRate = sampleRate;
      offlineDetector = createYinDetector({
        sampleRate,
        bufferSize: config.frameSize,
        minFrequency: config.minFrequency,
        maxFrequency: config.maxFrequency,
      });
    }
    return offlineDetector;
  }

  return {
    onReading,
    start,
    stop,
    analyzeFrame,
    resetSmoothing: () => smoother.reset(),
    get running() { return running; },
    get config() { return config; },
    get strings() { return strings; },
    get selectedStringIndex() { return selectedStringIndex; },
    setMode(mode) {
      config.mode = mode === 'chromatic' ? 'chromatic' : 'guitar';
      smoother.reset();
    },
    setStringMidis(midis) {
      config.stringMidis = midis;
      strings = buildStrings(midis, config.a4);
      if (selectedStringIndex !== null && selectedStringIndex >= strings.length) selectedStringIndex = null;
      smoother.reset();
    },
    selectString(index) {
      selectedStringIndex = index === null || index === undefined || index < 0 ? null : index;
      smoother.reset();
    },
    setInTuneCents(cents) { config.inTuneCents = cents; },
    setNoiseFloor(level) { config.noiseFloor = level; },
    setMinClarity(value) {
      config.smoother.minClarity = value;
      smoother = createPitchSmoother(config.smoother);
    },
  };
}
