// Pitch detection for the tuner, built on the McLeod Pitch Method (MPM).
//
// MPM works on the *normalised* square difference function (NSDF) rather than a
// raw autocorrelation, which is what makes it usable at realistic playing
// volume: the NSDF divides out the signal's own energy at every lag, so a softly
// plucked string scores just as highly as a hard one. Detection is then gated on
// how periodic the signal looks ("clarity", 0…1) instead of on how loud it is.
//
// Choosing the *first* peak that comes close to the tallest one — rather than the
// tallest outright — is what stops a guitar's strong overtones from making the
// detector report the octave above the note actually being played.

const MIN_FREQUENCY = 60; // a step below the lowest note a 6-string reaches
const MAX_FREQUENCY = 1400; // a little above the 1st string at the 12th fret
const RMS_GATE = 0.002; // only skips a genuinely silent room
// How close to the tallest peak still counts as "the" peak. Kept deliberately
// low: when a string rings sympathetically with the one being played (the 1st
// and 5th strings drive each other, since E4 is A2's third harmonic) the
// combined waveform really does repeat at the lower string's period, and its
// peak really is the tallest. Only a generous threshold lets the shorter,
// slightly-shorter-scoring period of the string actually being played win.
const PEAK_RATIO = 0.7;

// Returns { frequency, clarity, level }: frequency in Hz (-1 when nothing
// periodic was found), clarity in 0…1, and level as the window's RMS amplitude
// so callers can tell "silence" apart from "loud but unpitched".
export function detectPitch(buffer, sampleRate, options = {}) {
  const minFrequency = options.minFrequency ?? MIN_FREQUENCY;
  const maxFrequency = options.maxFrequency ?? MAX_FREQUENCY;

  const maxLag = Math.min(buffer.length - 1, Math.ceil(sampleRate / minFrequency));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  // Two periods of the lowest note we look for is all MPM needs; analysing more
  // than that costs time without making the estimate any better.
  const size = Math.min(buffer.length, maxLag * 2);
  if (maxLag <= minLag || size <= maxLag) return { frequency: -1, clarity: 0, level: 0 };

  let level = 0;
  for (let i = 0; i < size; i += 1) level += buffer[i] * buffer[i];
  level = Math.sqrt(level / size);
  if (level < (options.rmsGate ?? RMS_GATE)) return { frequency: -1, clarity: 0, level };

  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energy = 0;
    for (let i = 0; i < size - lag; i += 1) {
      const a = buffer[i];
      const b = buffer[i + lag];
      correlation += a * b;
      energy += a * a + b * b;
    }
    nsdf[lag] = energy > 0 ? (2 * correlation) / energy : 0;
  }

  // Each stretch where the NSDF is positive contributes one "key maximum"; the
  // period we want is among them. Skip the lobe around lag 0, which is just the
  // signal correlating with itself.
  let lag = 0;
  while (lag < maxLag && nsdf[lag] > 0) lag += 1;

  const peaks = [];
  while (lag < maxLag) {
    if (nsdf[lag] <= 0) {
      lag += 1;
      continue;
    }
    let best = lag;
    while (lag < maxLag && nsdf[lag] > 0) {
      if (nsdf[lag] > nsdf[best]) best = lag;
      lag += 1;
    }
    if (best >= minLag) peaks.push(best);
  }
  if (!peaks.length) return { frequency: -1, clarity: 0, level };

  let tallest = 0;
  for (const peak of peaks) if (nsdf[peak] > tallest) tallest = nsdf[peak];
  const chosen = peaks.find((peak) => nsdf[peak] >= tallest * PEAK_RATIO);
  if (chosen === undefined || chosen <= 0 || chosen >= maxLag) {
    return { frequency: -1, clarity: 0, level };
  }

  // Refine the period to sub-sample accuracy with a parabola through the peak
  // and its two neighbours — a whole sample is several cents at guitar pitches.
  const y1 = nsdf[chosen - 1];
  const y2 = nsdf[chosen];
  const y3 = nsdf[chosen + 1];
  const curvature = (y1 + y3 - 2 * y2) / 2;
  const slope = (y3 - y1) / 2;
  const period = curvature < 0 ? chosen - slope / (2 * curvature) : chosen;
  const clarity = curvature < 0 ? y2 - (slope * slope) / (4 * curvature) : y2;
  if (!(period > 0)) return { frequency: -1, clarity: 0, level };

  return { frequency: sampleRate / period, clarity: Math.min(1, Math.max(0, clarity)), level };
}

export function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// How many cents `frequency` is above (+) or below (-) the given target MIDI note.
export function centsOffPitch(frequency, midi) {
  return 1200 * Math.log2(frequency / midiToFrequency(midi));
}
