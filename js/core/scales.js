// Scale theory, with no opinion about how it is drawn.
//
// A scale here is a set of semitone offsets from its root. Everything the UI
// needs — which frets belong to the scale, what degree each one is, and where
// the playable boxes sit on the neck — is derived from that, so adding a scale
// means adding one line to SCALES and one name to the locale files.
//
// Names and descriptions live in the locale dictionaries under scale.<id>.*;
// this module stays language-agnostic, like chord-engine.js.

const mod12 = (value) => ((value % 12) + 12) % 12;

// Degree labels by semitone distance from the root. These are the numbers a
// guitarist reads off a box diagram — 1, ♭3, 5, ♭7 — not full enharmonic
// spelling, so a scale that would properly be written with a ♯4 shows ♭5. The
// simplification is deliberate: on a fretboard the two are the same fret, and
// the numbers are what make the shape memorable.
export const DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

// `span` is how many frets beyond the starting fret a position covers, chosen so
// each box is the familiar one-hand shape: four frets for the seven-note scales,
// three for the five-note pentatonics.
export const SCALES = [
  { id: 'major', intervals: [0, 2, 4, 5, 7, 9, 11], span: 4 },
  { id: 'naturalMinor', intervals: [0, 2, 3, 5, 7, 8, 10], span: 4 },
  { id: 'majorPentatonic', intervals: [0, 2, 4, 7, 9], span: 3 },
  { id: 'minorPentatonic', intervals: [0, 3, 5, 7, 10], span: 3 },
  { id: 'blues', intervals: [0, 3, 5, 6, 7, 10], span: 3 },
  { id: 'dorian', intervals: [0, 2, 3, 5, 7, 9, 10], span: 4 },
  { id: 'mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], span: 4 },
  { id: 'harmonicMinor', intervals: [0, 2, 3, 5, 7, 8, 11], span: 4 },
];

export function getScale(id) {
  return SCALES.find((scale) => scale.id === id) || SCALES[0];
}

// The formula as it is usually written out: 1 2 ♭3 4 5 ♭6 ♭7.
export function scaleFormula(scale) {
  return scale.intervals.map((offset) => DEGREE_LABELS[offset]);
}

// Semitone offset from the root, or null when the note is outside the scale.
export function degreeOf(midi, rootPitchClass, scale) {
  const offset = mod12(midi - rootPitchClass);
  return scale.intervals.includes(offset) ? offset : null;
}

// Every fret on the board that belongs to the scale, with its degree.
export function scaleCells(scale, rootPitchClass, openMidis, maxFret) {
  const cells = [];
  for (let stringIndex = 0; stringIndex < openMidis.length; stringIndex += 1) {
    for (let fret = 0; fret <= maxFret; fret += 1) {
      const midi = openMidis[stringIndex] + fret;
      const offset = degreeOf(midi, rootPitchClass, scale);
      if (offset === null) continue;
      cells.push({ stringIndex, fret, midi, degree: offset, root: offset === 0 });
    }
  }
  return cells;
}

// One position per scale degree: the box that starts where that degree falls on
// the lowest string. This is how the five pentatonic boxes and the seven
// three-note-per-string shapes are normally taught, and deriving it rather than
// hard-coding shapes means it holds for any scale and any tuning.
//
// Positions are returned ordered up the neck, so position 1 is the lowest one.
export function scalePositions(scale, rootPitchClass, openMidis, maxFret) {
  const lowest = openMidis[0];
  const span = scale.span;
  const seen = new Set();
  const positions = [];

  for (const offset of scale.intervals) {
    let start = null;
    for (let fret = 0; fret <= maxFret; fret += 1) {
      if (mod12(lowest + fret - rootPitchClass) === offset) { start = fret; break; }
    }
    if (start === null) continue;
    // A box that would run off the end of the board slides back onto it rather
    // than being dropped: the shape is still playable, just not open-ended.
    const from = Math.max(0, Math.min(start, maxFret - span));
    const to = Math.min(maxFret, from + span);
    const key = `${from}:${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    positions.push({ from, to, degree: offset, rootMidi: lowest + start });
  }

  return positions
    .sort((a, b) => a.from - b.from)
    .map((position, index) => ({ ...position, number: index + 1 }));
}

export function inPosition(cell, position) {
  return !position || (cell.fret >= position.from && cell.fret <= position.to);
}

// The scale run for a position, low to high: the order you would practise it in,
// walking up each string from the lowest before moving to the next.
export function positionRun(cells, position) {
  return cells
    .filter((cell) => inPosition(cell, position))
    .sort((a, b) => a.stringIndex - b.stringIndex || a.fret - b.fret)
    .map((cell) => cell.midi);
}
