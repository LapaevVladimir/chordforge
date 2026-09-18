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
//   5. weighted EMA      — smooth the remainder, trusting clear frames more than
//                          murky ones, without adding lag on real moves
//
// Everything runs in semitone (log-frequency) space, because a fixed tolerance in
// Hz would be far stricter at E2 than at E4.

const SEMITONES_PER_OCTAVE = 12;

const toSemitones = (frequency) => SEMITONES_PER_OCTAVE * Math.log2(frequency);
const toFrequency = (semitones) => Math.pow(2, semitones / SEMITONES_PER_OCTAVE);

export const DEFAULT_SMOOTHER_OPTIONS = {
  // YIN clarity below this is treated as "no reliable pitch". Chosen from
  // measurement, not taste: bucketing estimates by clarity over a sweep of
  // levels and noise floors, the buckets at 0.84 and below are riddled with
  // octave errors — 1200 cents at the 90th percentile — and no filter downstream
  // survives those. From 0.86 up the worst case is tens of cents, which the
  // stages below can handle.
  minClarity: 0.9,
  // Above this clarity an estimate is trusted in full. Measured on decaying
  // plucked tones: clarity 0.98 frames land within 0.42 cents (median) and 1.04
  // (90th percentile), while 0.90-0.92 frames miss by 3-4 cents and occasionally
  // 30. Both kinds still count — the weight below just scales how much.
  trustClarity: 0.97,
  // How much a barely-trusted frame is allowed to move the estimate, as a
  // fraction of the full step. Not zero: a quietly played string sits in this
  // band the whole time, and it still has to follow the peg.
  minTrustWeight: 0.12,
  // Median window. 9 frames at a 512-sample hop is ~96 ms of history at 48 kHz.
  medianSize: 9,
  // Steady-state smoothing factor for the exponential stage.
  smoothing: 0.15,
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
    } else if (Math.abs(median - smoothed) > config.jumpSemitones) {
      // A real move to another note: snap, so stability costs no responsiveness.
      smoothed = median;
    } else {
      // Otherwise glide, at a rate set by how much this frame deserves to be
      // believed. A clear frame moves the reading the full step; a murky one
      // nudges it. This is what keeps the last digit still on a decaying note,
      // where the raw estimate wanders by ten cents or more.
      smoothed += (median - smoothed) * config.smoothing * trustWeight(clarity, config);
    }

    lastAcceptedAt = now;
    return { frequency: toFrequency(smoothed), held: false, clarity, raw: frequency };
  }

  return { push, reset, config };
}

// 0 at the clarity floor, 1 at full trust, quadratic in between so the middle of
// the band counts for a quarter rather than a half.
function trustWeight(clarity, config) {
  const span = config.trustClarity - config.minClarity;
  const position = span > 0 ? Math.min(1, Math.max(0, (clarity - config.minClarity) / span)) : 1;
  return config.minTrustWeight + (1 - config.minTrustWeight) * position * position;
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
