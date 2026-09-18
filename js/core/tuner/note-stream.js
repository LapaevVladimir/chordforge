// Turns the tuner's continuous readings into discrete "a note was played" events.
//
// The tuner answers "what pitch is sounding right now", ~90 times a second. A
// quiz that asks you to play something needs the other question: "which notes
// did they play, in order". That means deciding where one note ends and the next
// begins, which the pitch alone cannot tell you — two plucks of the same string
// look identical to a pitch tracker.
//
// So this listens to two things at once: the pitch, for what the note is, and
// the level, for when a new one starts. A note is reported when a pitch has been
// held steadily for a moment; the next one is only accepted after the sound has
// either died back down (a re-pluck of the same note) or moved to a different
// pitch.
//
// It takes tuner readings and knows nothing about microphones or the DOM, so any
// page that wants "what did they just play" can use it.

export const DEFAULT_NOTE_STREAM_OPTIONS = {
  // How long one pitch has to hold before it counts as a note played on purpose,
  // rather than a string being brushed or a note on its way somewhere else.
  // Shorter than a comfortable quarter note, longer than the attack transient the
  // detector needs to settle.
  minHoldMs: 150,
  // Below this RMS nothing is being played.
  minLevel: 0.012,
  // A new note is heard when the level climbs this much above the quietest it has
  // been since the last one. Measuring the rise rather than the fall is the whole
  // trick: a decaying note never rises, however far it falls, so it is reported
  // once; a second pluck of the same string jumps well clear of the floor and is
  // reported again.
  attackRatio: 2.2,
  // One pluck is one attack. The level takes a few frames to reach its peak, and
  // without this the climb would keep re-triggering on the way up.
  attackHoldoffMs: 120,
  // …or this long without any pitch at all, for a note that is damped rather than
  // left to decay.
  silenceMs: 120,
};

export function createNoteStream(options = {}) {
  const config = { ...DEFAULT_NOTE_STREAM_OPTIONS, ...options };

  let candidateMidi = null;   // nearest midi of the pitch currently being held
  let candidateSince = 0;
  let candidateSum = 0;       // for the average exact pitch over the hold
  let candidateCount = 0;
  let lastNoteMidi = null;    // what was last reported, for the re-attack rule
  let floorLevel = Infinity;  // quietest the sound has been since the last note
  let lastAttackAt = -Infinity;
  let armed = true;           // true when a new note may be reported
  let quietSince = 0;

  function reset() {
    candidateMidi = null;
    candidateSince = 0;
    candidateSum = 0;
    candidateCount = 0;
    lastNoteMidi = null;
    floorLevel = Infinity;
    lastAttackAt = -Infinity;
    armed = true;
    quietSince = 0;
  }

  // Returns a note event, or null. Feed it every reading the engine emits.
  function push(reading, now = performance.now()) {
    const level = reading?.signalLevel ?? 0;
    const midi = reading?.midi;
    const hasPitch = Number.isFinite(midi) && (reading?.frequency ?? 0) > 0 && !reading?.held;

    // Quiet, or nothing the detector will vouch for: the sound has stopped, so
    // whatever comes next is a new note.
    if (!hasPitch || level < config.minLevel) {
      if (!quietSince) quietSince = now;
      if (now - quietSince >= config.silenceMs) {
        armed = true;
        lastNoteMidi = null;
        candidateMidi = null;
        floorLevel = Infinity;
      }
      return null;
    }
    quietSince = 0;

    // The floor tracks the sound down as it decays, so only a genuine new attack
    // stands out above it.
    if (level < floorLevel) floorLevel = level;
    if (level > floorLevel * config.attackRatio && now - lastAttackAt > config.attackHoldoffMs) {
      armed = true;
      lastAttackAt = now;
      floorLevel = level;
      // An attack starts a new note, so the pitch has to settle again before it
      // is reported. Without this the note still ringing from a moment ago would
      // be reported a second time, since it is what the detector still hears.
      candidateMidi = null;
    }

    // The hold restarts whenever the nearest note changes, which is also what
    // keeps a slide or a deep bend from ever being reported: it never settles.
    const nearest = Math.round(midi);
    if (nearest !== candidateMidi) {
      candidateMidi = nearest;
      candidateSince = now;
      candidateSum = midi;
      candidateCount = 1;
      return null;
    }

    candidateSum += midi;
    candidateCount += 1;
    if (now - candidateSince < config.minHoldMs) return null;

    if (!armed) {
      // A different pitch taking over while the previous note still rings is the
      // normal way an interval is played on one string, so it counts even though
      // there was no gap in the sound.
      if (candidateMidi === lastNoteMidi) return null;
      floorLevel = level;
    }

    const exactMidi = candidateSum / candidateCount;
    const heldMs = now - candidateSince;
    armed = false;
    lastNoteMidi = candidateMidi;
    // The candidate stays alive so the note that is still ringing is not reported
    // twice; only its hold clock starts again.
    candidateSince = now;
    candidateSum = exactMidi;
    candidateCount = 1;

    return { midi: lastNoteMidi, exactMidi, cents: (exactMidi - lastNoteMidi) * 100, level, heldMs, time: now };
  }

  return { push, reset, config };
}
