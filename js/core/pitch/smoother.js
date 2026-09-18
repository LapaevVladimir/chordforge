// Turns the detector's per-frame estimates into something a human can read.
//
// Raw YIN output on a real string wobbles by a couple of cents frame to frame and
// occasionally throws an octave error while the pluck transient settles. The
// filtering here is deliberately layered so each stage has one job:
//
//   1. confidence gate   — drop frames the detector itself is unsure about
//   2. octave repair     — pull obvious 2x / 0.5x errors back to the held note
//   3. outlier rejection — ignore a lone frame that disagrees with the history
//   4. median            — remove what survives of the spikes
//   5. adaptive EMA      — smooth the remainder without adding lag on real moves
//
// Everything runs in semitone (log-frequency) space, because a fixed tolerance in
// Hz would be far stricter at E2 than at E4.

const SEMITONES_PER_OCTAVE = 12;

const toSemitones = (frequency) => SEMITONES_PER_OCTAVE * Math.log2(frequency);
const toFrequency = (semitones) => Math.pow(2, semitones / SEMITONES_PER_OCTAVE);

export const DEFAULT_SMOOTHER_OPTIONS = {
  // YIN clarity below this is treated as "no reliable pitch". Chosen from
  // measurement, not taste: bucketing estimates by clarity over a sweep of
  // levels and noise floors, everything at 0.9 and above had a median error of
  // ~0.6 cents, while the buckets below it were riddled with octave errors.
  minClarity: 0.9,
  // Median window. 5 frames at a 512-sample hop is ~53 ms of history at 48 kHz.
  medianSize: 5,
  // Steady-state smoothing factor for the exponential stage.
  smoothing: 0.25,
  // A change larger than this many semitones is treated as the player moving to
  // another note, so the filter jumps instead of gliding.
  jumpSemitones: 0.6,
  // Frames further than this from the running estimate are discarded as outliers
  // unless they keep repeating (see confirmFrames).
  outlierSemitones: 1.5,
  // How many consecutive off-estimate frames it takes to accept a real move.
  confirmFrames: 3,
  // How long a reading survives after the signal stops arriving.
  holdMs: 600,
};

export function createPitchSmoother(options = {}) {
  const config = { ...DEFAULT_SMOOTHER_OPTIONS, ...options };
  let history = [];
  let smoothed = null; // semitones
  let lastAcceptedAt = 0;
  let pendingCandidate = null;
  let pendingCount = 0;

  function reset() {
    history = [];
    smoothed = null;
    lastAcceptedAt = 0;
    pendingCandidate = null;
    pendingCount = 0;
  }

  // Brings an estimate that landed a whole number of octaves away back to the
  // note being held, which is the failure mode YIN actually exhibits.
  function repairOctave(semitones) {
    if (smoothed === null) return semitones;
    let best = semitones;
    let bestDistance = Math.abs(semitones - smoothed);
    for (const shift of [-24, -12, 12, 24]) {
      const candidate = semitones + shift;
      const distance = Math.abs(candidate - smoothed);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    // Only accept the repair if it actually lands close to what we are holding;
    // otherwise the player really has moved and we must not drag them back.
    return bestDistance <= 0.9 ? best : semitones;
  }

  // `now` is injected so the self-test can run faster than real time.
  function push(reading, now = performance.now()) {
    const clarity = reading?.clarity ?? 0;
    const frequency = reading?.frequency ?? -1;

    if (!(frequency > 0) || clarity < config.minClarity) {
      if (smoothed !== null && now - lastAcceptedAt <= config.holdMs) {
        return { frequency: toFrequency(smoothed), held: true, clarity: 0 };
      }
      reset();
      return null;
    }

    const measured = repairOctave(toSemitones(frequency));

    if (smoothed !== null) {
      const distance = Math.abs(measured - smoothed);
      if (distance > config.outlierSemitones) {
        // Could be a spike, could be a genuine jump to another string. Require it
        // to repeat before believing it, but then adopt it immediately.
        if (pendingCandidate !== null && Math.abs(measured - pendingCandidate) < 0.5) pendingCount += 1;
        else { pendingCandidate = measured; pendingCount = 1; }
        if (pendingCount < config.confirmFrames) {
          return { frequency: toFrequency(smoothed), held: true, clarity };
        }
        history = [];
        smoothed = null;
      } else {
        pendingCandidate = null;
        pendingCount = 0;
      }
    }

    history.push(measured);
    if (history.length > config.medianSize) history.shift();
    const median = medianOf(history);

    if (smoothed === null) {
      smoothed = median;
    } else {
      // Adaptive: glide when the note is holding steady, snap when it moves, so
      // stability costs nothing in responsiveness.
      const alpha = Math.abs(median - smoothed) > config.jumpSemitones ? 1 : config.smoothing;
      smoothed += (median - smoothed) * alpha;
    }

    lastAcceptedAt = now;
    return { frequency: toFrequency(smoothed), held: false, clarity, raw: frequency };
  }

  return { push, reset, config };
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
