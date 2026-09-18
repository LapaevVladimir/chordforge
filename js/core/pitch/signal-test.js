// Accuracy harness for the pitch detector.
//
// A detector that nails pure sine waves can still fail on a guitar, so the
// generator here produces the things that actually break naive detectors: a
// partial series where the fundamental is *weaker* than the upper partials, a
// per-partial decay so the timbre changes as the note rings, slight inharmonicity
// from real string stiffness, and broadband room noise.
import { createYinDetector } from './yin.js';
import { midiToFrequency, centsBetween, STANDARD_GUITAR_MIDIS } from './note.js';

// Relative partial amplitudes measured-in-spirit from a plucked steel string:
// the second and third partials dominate the fundamental, which is exactly the
// case where FFT peak-picking reports the wrong octave.
const PLUCKED_PARTIALS = [0.55, 1.0, 0.85, 0.42, 0.3, 0.22, 0.15, 0.1];

export function generateTone(options) {
  const {
    frequency,
    sampleRate,
    length,
    amplitude = 0.08,
    partials = PLUCKED_PARTIALS,
    noise = 0,
    decay = 0,
    inharmonicity = 0,
    startPhaseSeconds = 0,
    pure = false,
  } = options;

  const buffer = new Float32Array(length);
  const series = pure ? [1] : partials;
  const norm = series.reduce((sum, value) => sum + value, 0);
  // Fixed phases per partial: deterministic runs, but not all partials starting
  // in phase (which would make an unrealistically peaky waveform).
  const phases = series.map((unused, index) => (index * 1.7) % (Math.PI * 2));

  for (let i = 0; i < length; i += 1) {
    const t = startPhaseSeconds + i / sampleRate;
    let value = 0;
    for (let p = 0; p < series.length; p += 1) {
      const harmonic = p + 1;
      // Real strings are stiff, so partials sit slightly sharp of exact multiples.
      const stretch = inharmonicity ? Math.sqrt(1 + inharmonicity * harmonic * harmonic) : 1;
      const partialDecay = decay ? Math.exp(-t / (decay / Math.sqrt(harmonic))) : 1;
      value += series[p] * partialDecay * Math.sin(2 * Math.PI * frequency * harmonic * stretch * t + phases[p]);
    }
    buffer[i] = (value / norm) * amplitude + (noise ? (Math.random() * 2 - 1) * noise : 0);
  }
  return buffer;
}

// Runs the detector over several frames of a generated tone and reports the
// error of the *median* estimate, which is what the smoother would show.
export function measureFrequency(targetFrequency, options = {}) {
  const sampleRate = options.sampleRate ?? 48000;
  const bufferSize = options.bufferSize ?? 2048;
  const frames = options.frames ?? 8;
  const detector = options.detector ?? createYinDetector({
    sampleRate,
    bufferSize,
    minFrequency: options.minFrequency ?? 70,
    maxFrequency: options.maxFrequency ?? 1400,
  });

  const errors = [];
  let detected = 0;
  let claritySum = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const samples = generateTone({
      ...options,
      frequency: targetFrequency,
      sampleRate,
      length: bufferSize,
      startPhaseSeconds: (frame * bufferSize) / sampleRate,
    });
    const result = detector.detect(samples);
    if (result.frequency > 0) {
      detected += 1;
      claritySum += result.clarity;
      errors.push(centsBetween(result.frequency, targetFrequency));
    }
  }

  if (!errors.length) {
    return { targetFrequency, detectionRate: 0, medianCents: null, maxAbsCents: null, meanClarity: 0 };
  }
  const sorted = [...errors].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  return {
    targetFrequency,
    detectionRate: detected / frames,
    medianCents: median,
    maxAbsCents: Math.max(...errors.map(Math.abs)),
    meanClarity: claritySum / detected,
  };
}

// The six open strings of standard tuning, derived from MIDI at A4 = 440.
export function standardStringTargets(a4 = 440) {
  return STANDARD_GUITAR_MIDIS.map((midi) => midiToFrequency(midi, a4));
}

// Sweeps every open string, plus the low E detuned by a few cents each way —
// the cases the brief calls out.
export function runAccuracySuite(options = {}) {
  const a4 = options.a4 ?? 440;
  const rows = [];

  for (const frequency of standardStringTargets(a4)) {
    rows.push({ label: `${frequency.toFixed(4)} Hz`, ...measureFrequency(frequency, options) });
  }

  const lowE = midiToFrequency(STANDARD_GUITAR_MIDIS[0], a4);
  for (const offset of [-10, -5, 0, 5, 10]) {
    const frequency = lowE * Math.pow(2, offset / 1200);
    const measurement = measureFrequency(frequency, options);
    rows.push({
      label: `E2 ${offset >= 0 ? '+' : ''}${offset}¢`,
      expectedCentsFromE2: offset,
      measuredCentsFromE2: measurement.medianCents === null ? null : centsBetween(frequency, lowE) + measurement.medianCents,
      ...measurement,
    });
  }

  return rows;
}
