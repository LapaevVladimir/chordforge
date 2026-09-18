// Equal-temperament note maths. Pure functions, no audio and no DOM, so the same
// module backs the tuner, the fretboard pages and the accuracy self-test.

export const A4_FREQUENCY = 440;
export const A4_MIDI = 69;

export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function frequencyToMidi(frequency, a4 = A4_FREQUENCY) {
  return A4_MIDI + 12 * Math.log2(frequency / a4);
}

export function midiToFrequency(midi, a4 = A4_FREQUENCY) {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

// Signed distance in cents from `frequency` to `targetFrequency`.
// Positive means sharp. 1200 cents to the octave, hence the constant.
export function centsBetween(frequency, targetFrequency) {
  return 1200 * Math.log2(frequency / targetFrequency);
}

export function midiNoteName(midi, preferFlats = false) {
  const rounded = Math.round(midi);
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[((rounded % 12) + 12) % 12];
}

export function midiOctave(midi) {
  return Math.floor(Math.round(midi) / 12) - 1;
}

export function midiLabel(midi, preferFlats = false) {
  return `${midiNoteName(midi, preferFlats)}${midiOctave(midi)}`;
}

// Describes a measured frequency against the nearest equal-tempered note.
// The un-rounded midi value is kept: rounding is only ever used to pick the
// note's *name*, never to compute the deviation.
export function describeFrequency(frequency, options = {}) {
  const a4 = options.a4 ?? A4_FREQUENCY;
  const preferFlats = Boolean(options.preferFlats);
  const midi = frequencyToMidi(frequency, a4);
  const nearestMidi = Math.round(midi);
  const targetFrequency = midiToFrequency(nearestMidi, a4);
  return {
    frequency,
    midi,
    nearestMidi,
    noteName: midiNoteName(nearestMidi, preferFlats),
    octave: midiOctave(nearestMidi),
    label: midiLabel(nearestMidi, preferFlats),
    targetFrequency,
    cents: centsBetween(frequency, targetFrequency),
  };
}

// Describes a measured frequency against one specific target note, which is what
// guitar mode needs once a string has been chosen.
export function describeAgainstMidi(frequency, targetMidi, options = {}) {
  const a4 = options.a4 ?? A4_FREQUENCY;
  const preferFlats = Boolean(options.preferFlats);
  const targetFrequency = midiToFrequency(targetMidi, a4);
  return {
    frequency,
    midi: frequencyToMidi(frequency, a4),
    nearestMidi: targetMidi,
    noteName: midiNoteName(targetMidi, preferFlats),
    octave: midiOctave(targetMidi),
    label: midiLabel(targetMidi, preferFlats),
    targetFrequency,
    cents: centsBetween(frequency, targetFrequency),
  };
}

// Standard tuning, low to high. Frequencies are derived from the MIDI numbers at
// A4 = 440 rather than typed in, so they cannot drift from the maths.
export const STANDARD_GUITAR_MIDIS = [40, 45, 50, 55, 59, 64];

export function buildStrings(midis = STANDARD_GUITAR_MIDIS, a4 = A4_FREQUENCY) {
  const count = midis.length;
  return midis.map((midi, index) => ({
    index,
    stringNumber: count - index,
    midi,
    label: midiLabel(midi),
    frequency: midiToFrequency(midi, a4),
  }));
}

// Nearest string by pitch distance, in semitones, or -1 when nothing is close.
export function nearestStringIndex(frequency, strings, toleranceSemitones = 3, a4 = A4_FREQUENCY) {
  const midi = frequencyToMidi(frequency, a4);
  let best = -1;
  let bestDistance = Infinity;
  for (const string of strings) {
    const distance = Math.abs(midi - string.midi);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = string.index;
    }
  }
  return bestDistance <= toleranceSemitones ? best : -1;
}
