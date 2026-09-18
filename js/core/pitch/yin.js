// YIN fundamental-frequency estimator — de Cheveigné & Kawahara (2002),
// "YIN, a fundamental frequency estimator for speech and music".
// This is the same algorithm aubio exposes as `yin`; see docs/TUNER.md for why it
// is implemented here rather than linked from aubio.
//
// Why not peak-pick an FFT: on a plucked steel string the fundamental is often
// weaker than the second or third partial, so the tallest spectral peak is
// frequently an octave or a twelfth above the note actually played. YIN works on
// the squared-difference function of the waveform instead, which is periodic at
// the period of the note regardless of how the energy is spread across partials.
//
// Steps below are numbered as in the paper.

export const DEFAULT_THRESHOLD = 0.15;

// Returns a detector that reuses its scratch buffers, so the realtime path does
// no allocation per frame.
export function createYinDetector(options = {}) {
  const sampleRate = options.sampleRate;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('createYinDetector: sampleRate is required');

  const bufferSize = options.bufferSize ?? 2048;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const minFrequency = options.minFrequency ?? 70;
  const maxFrequency = options.maxFrequency ?? 1400;

  // The difference function needs `halfBuffer` samples of integration window plus
  // `tau` samples of lag, so lags are capped at half the frame.
  const halfBuffer = bufferSize >> 1;
  const tauMax = Math.min(halfBuffer, Math.ceil(sampleRate / minFrequency));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
  if (tauMin >= tauMax) throw new Error('createYinDetector: frequency range does not fit the buffer size');

  const difference = new Float32Array(tauMax + 1);
  const normalized = new Float32Array(tauMax + 1);

  function detect(frame) {
    if (frame.length < bufferSize) return emptyResult(0, 0);

    // Signal level is measured on the same frame the pitch comes from, so the
    // caller's noise gate and the estimate can never disagree about timing.
    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < bufferSize; i += 1) {
      const sample = frame[i];
      sumSquares += sample * sample;
      const magnitude = sample < 0 ? -sample : sample;
      if (magnitude > peak) peak = magnitude;
    }
    const rms = Math.sqrt(sumSquares / bufferSize);

    // Step 1-2: squared difference function over a fixed integration window.
    difference[0] = 1;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      let sum = 0;
      for (let i = 0; i < halfBuffer; i += 1) {
        const delta = frame[i] - frame[i + tau];
        sum += delta * delta;
      }
      difference[tau] = sum;
    }

    // Step 3: cumulative mean normalisation. This is what removes the "zero lag
    // is always the best match" bias that plain autocorrelation suffers from.
    normalized[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      runningSum += difference[tau];
      normalized[tau] = runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum;
    }

    // Step 4: absolute threshold — take the first dip below it rather than the
    // deepest one overall, which is what keeps the estimate on the fundamental
    // instead of dropping to a sub-harmonic.
    let tauEstimate = -1;
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      if (normalized[tau] >= threshold) continue;
      while (tau + 1 <= tauMax && normalized[tau + 1] < normalized[tau]) tau += 1;
      tauEstimate = tau;
      break;
    }
    if (tauEstimate === -1) {
      // Nothing crossed the threshold — usually a noisy or decaying note. Rather
      // than reporting nothing (a cliff the caller cannot reason about), take the
      // deepest dip in range and let its lower clarity speak for itself, so the
      // confidence gate degrades smoothly instead of switching off.
      let best = tauMin;
      for (let tau = tauMin; tau <= tauMax; tau += 1) {
        if (normalized[tau] < normalized[best]) best = tau;
      }
      tauEstimate = best;
    }

    // Step 5: parabolic interpolation around the dip. A whole sample of period is
    // several cents at guitar pitches, so this step is not cosmetic.
    const refined = parabolicMinimum(normalized, tauEstimate, tauMax);
    const frequency = sampleRate / refined.position;
    if (!(frequency >= minFrequency && frequency <= maxFrequency)) return emptyResult(rms, peak, 1 - normalized[tauEstimate]);

    // The paper's aperiodicity measure; 1 - it reads naturally as "clarity".
    const clarity = Math.min(1, Math.max(0, 1 - refined.value));
    return { frequency, clarity, rms, peak };
  }

  return {
    detect,
    sampleRate,
    bufferSize,
    tauMin,
    tauMax,
    minFrequency,
    maxFrequency,
    threshold,
  };
}

function emptyResult(rms, peak, clarity = 0) {
  return { frequency: -1, clarity, rms, peak };
}

// Fits a parabola through the dip and its two neighbours and returns its vertex.
function parabolicMinimum(values, index, maxIndex) {
  if (index <= 0 || index >= maxIndex) return { position: index, value: values[index] };
  const left = values[index - 1];
  const middle = values[index];
  const right = values[index + 1];
  const denominator = 2 * (2 * middle - left - right);
  if (denominator === 0) return { position: index, value: middle };
  const shift = (right - left) / denominator;
  // A vertex further than half a sample away means the dip is not parabolic here;
  // trust the sample index rather than extrapolating.
  if (!(shift > -1 && shift < 1)) return { position: index, value: middle };
  return { position: index + shift, value: middle - ((right - left) * shift) / 4 };
}
