const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const NOTE_VALUES = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7,
  'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

// More specific sonorities come first when two pitch-class sets are enharmonically equal.
// `id` doubles as the i18n key suffix under `chord.quality.<id>` for this quality's display name —
// the human-readable title lives in the locale dictionaries, not here, so this module stays language-agnostic.
export const QUALITIES = [
  { id: 'maj13', suffix: 'maj13', intervals: [0, 2, 4, 7, 9, 11], optional: [7] },
  { id: '13', suffix: '13', intervals: [0, 2, 4, 7, 9, 10], optional: [7] },
  { id: 'm13', suffix: 'm13', intervals: [0, 2, 3, 7, 9, 10], optional: [7] },
  { id: '11', suffix: '11', intervals: [0, 2, 4, 5, 7, 10], optional: [7] },
  { id: 'm11', suffix: 'm11', intervals: [0, 2, 3, 5, 7, 10], optional: [7] },
  { id: '9s11', suffix: '9♯11', intervals: [0, 2, 4, 6, 7, 10], optional: [7] },
  { id: 'maj9', suffix: 'maj9', intervals: [0, 2, 4, 7, 11], optional: [7] },
  { id: '9', suffix: '9', intervals: [0, 2, 4, 7, 10], optional: [7] },
  { id: 'm9', suffix: 'm9', intervals: [0, 2, 3, 7, 10], optional: [7] },
  { id: '7b9', suffix: '7♭9', intervals: [0, 1, 4, 7, 10], optional: [7] },
  { id: '7s9', suffix: '7♯9', intervals: [0, 3, 4, 7, 10], optional: [7] },
  { id: 'maj7s11', suffix: 'maj7♯11', intervals: [0, 4, 6, 7, 11], optional: [7] },
  { id: '7s11', suffix: '7♯11', intervals: [0, 4, 6, 7, 10], optional: [7] },
  { id: '9b5', suffix: '9♭5', intervals: [0, 2, 4, 6, 10] },
  { id: '9s5', suffix: '9♯5', intervals: [0, 2, 4, 8, 10] },
  { id: '69', suffix: '6/9', intervals: [0, 2, 4, 7, 9], optional: [7] },
  { id: 'm69', suffix: 'm6/9', intervals: [0, 2, 3, 7, 9], optional: [7] },
  { id: '9sus4', suffix: '9sus4', intervals: [0, 2, 5, 7, 10], optional: [7] },
  { id: '7sus4', suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { id: 'mmaj7', suffix: 'm(maj7)', intervals: [0, 3, 7, 11], optional: [7] },
  { id: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11], optional: [7] },
  { id: '7', suffix: '7', intervals: [0, 4, 7, 10], optional: [7] },
  { id: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10], optional: [7] },
  { id: 'dim7', suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { id: 'm7b5', suffix: 'm7♭5', intervals: [0, 3, 6, 10] },
  { id: '7b5', suffix: '7♭5', intervals: [0, 4, 6, 10] },
  { id: '7s5', suffix: '7♯5', intervals: [0, 4, 8, 10] },
  { id: 'maj7b5', suffix: 'maj7♭5', intervals: [0, 4, 6, 11] },
  { id: 'maj7s5', suffix: 'maj7♯5', intervals: [0, 4, 8, 11] },
  { id: 'm7s5', suffix: 'm7♯5', intervals: [0, 3, 8, 10] },
  { id: 'add9', suffix: 'add9', intervals: [0, 2, 4, 7], optional: [7] },
  { id: 'madd9', suffix: 'm(add9)', intervals: [0, 2, 3, 7], optional: [7] },
  { id: 'add11', suffix: 'add11', intervals: [0, 4, 5, 7], optional: [7] },
  { id: 'madd11', suffix: 'm(add11)', intervals: [0, 3, 5, 7], optional: [7] },
  // Suspended sevenths. A sus chord with a seventh on top is its own sonority, not a
  // triad plus an accident: F-G-C-E is Fmaj7sus2, and calling it Cadd11/F (the same
  // notes read from the wrong root) hides the chord the hand is actually holding.
  // They sit after add11/madd11 because those spellings share the very same pitch-class
  // sets, and the earlier entry wins when neither root is in the bass.
  { id: 'maj7sus2', suffix: 'maj7sus2', intervals: [0, 2, 7, 11] },
  { id: '7sus2', suffix: '7sus2', intervals: [0, 2, 7, 10] },
  { id: 'maj7sus4', suffix: 'maj7sus4', intervals: [0, 5, 7, 11] },
  { id: '6', suffix: '6', intervals: [0, 4, 7, 9], optional: [7] },
  { id: 'm6', suffix: 'm6', intervals: [0, 3, 7, 9], optional: [7] },
  { id: 'maj', suffix: '', intervals: [0, 4, 7], optional: [7] },
  { id: 'min', suffix: 'm', intervals: [0, 3, 7], optional: [7] },
  { id: 'sus2', suffix: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', suffix: 'sus4', intervals: [0, 5, 7] },
  { id: 'dim', suffix: 'dim', intervals: [0, 3, 6] },
  { id: 'aug', suffix: 'aug', intervals: [0, 4, 8] },
  { id: 'power', suffix: '5', intervals: [0, 7] },
];

const ALIASES = {
  '': 'maj', major: 'maj', M: 'maj', maj: 'maj', minor: 'min', min: 'min', m: 'min',
  '+': 'aug', aug: 'aug', '°': 'dim', o: 'dim', dim: 'dim', 'ø': 'm7b5', 'ø7': 'm7b5',
  m7b5: 'm7b5', 'm7♭5': 'm7b5', maj7: 'maj7', M7: 'maj7', mM7: 'mmaj7', 'm(maj7)': 'mmaj7',
  '7': '7', m7: 'm7', dim7: 'dim7', '°7': 'dim7', '7b5': '7b5', '7♭5': '7b5',
  '7#5': '7s5', '7♯5': '7s5', '7b9': '7b9', '7♭9': '7b9', '7#9': '7s9', '7♯9': '7s9',
  add9: 'add9', madd9: 'madd9', 'm(add9)': 'madd9', add11: 'add11', madd11: 'madd11',
  sus: 'sus4', sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', '5': 'power',
  '7sus2': '7sus2', 'maj7sus2': 'maj7sus2', 'M7sus2': 'maj7sus2', 'Δsus2': 'maj7sus2',
  'sus2maj7': 'maj7sus2', 'maj7sus4': 'maj7sus4', 'M7sus4': 'maj7sus4', 'Δsus4': 'maj7sus4',
  'maj7sus': 'maj7sus4', 'sus4maj7': 'maj7sus4', 'dom7sus2': '7sus2',
  '6': '6', m6: 'm6', '6/9': '69', '69': '69', 'm6/9': 'm69', maj9: 'maj9', M9: 'maj9',
  '9': '9', m9: 'm9', '11': '11', m11: 'm11', '13': '13', maj13: 'maj13', m13: 'm13',
  'maj7#11': 'maj7s11', 'maj7♯11': 'maj7s11',
  // Jazz lead-sheet shorthand: "-" for minor, "+" for augmented, "Δ" for major 7th.
  '-': 'min', '-7': 'm7', '-9': 'm9', '-11': 'm11', '-13': 'm13', '-6': 'm6',
  'm(maj9)': 'mmaj7', minmaj7: 'mmaj7', mmaj7: 'mmaj7', 'min(maj7)': 'mmaj7',
  '+7': '7s5', '7+': '7s5', '7+5': '7s5', aug7: '7s5', '7aug5': '7s5',
  '7-5': '7b5', '7-9': '7b9', '7+9': '7s9',
  'Δ': 'maj7', 'Δ7': 'maj7', 'Δ9': 'maj9', 'maj7+5': 'maj7s5',
  dom: '7', dom7: '7', dom9: '9', dom11: '11', dom13: '13',
  min6: 'm6', min7: 'm7', min9: 'm9', min11: 'm11', min13: 'm13', 'min7b5': 'm7b5',
  mi: 'min', mi6: 'm6', mi7: 'm7', mi9: 'm9', mi11: 'm11', mi13: 'm13',
  hdim: 'm7b5', halfdim: 'm7b5', 'ø9': 'm7b5',
  add2: 'add9', add4: 'add11', '2': 'add9', '4': 'sus4',
  'm(add2)': 'madd9', 'madd2': 'madd9', 'm(add4)': 'madd11', madd4: 'madd11',
  maj6: '6', M6: '6', maj69: '69', 'maj6/9': '69',
  '7sus': '7sus4', sus47: '7sus4', '9sus': '9sus4', '9sus4': '9sus4',
  '7#11': '7s11', '7♯11': '7s11', '9#11': '9s11', '9♯11': '9s11',
  '9b5': '9b5', '9♭5': '9b5', '9#5': '9s5', '9♯5': '9s5',
  'maj7b5': 'maj7b5', 'maj7♭5': 'maj7b5', M7b5: 'maj7b5',
  'maj7#5': 'maj7s5', 'maj7♯5': 'maj7s5', 'M7#5': 'maj7s5',
  'm7#5': 'm7s5', 'm7♯5': 'm7s5',
};

// Lowercases runs of two or more letters so "Maj7", "MIN7" and "Dim" all resolve,
// while a lone "M" (major) stays distinct from a lone "m" (minor).
function lowerWords(text) {
  return text.replace(/[A-Za-z]{2,}/g, (run) => run.toLowerCase());
}

// Tries the suffix as written first, then progressively more forgiving forms, so
// "CMaj7", "C(add9)" and "C maj 7" all land on the same quality as "Cmaj7".
function resolveQuality(rawSuffix) {
  const base = rawSuffix.replace(/\s+/g, '');
  const stripped = base.replace(/[()]/g, '');
  for (const attempt of [base, lowerWords(base), stripped, lowerWords(stripped)]) {
    const quality = byId[ALIASES[attempt]];
    if (quality) return quality;
  }
  return null;
}

const byId = Object.fromEntries(QUALITIES.map((quality) => [quality.id, quality]));
const mod12 = (value) => ((value % 12) + 12) % 12;
const unique = (values) => [...new Set(values)];
const sorted = (values) => [...values].sort((a, b) => a - b);
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export function noteName(pitch, preferFlats = false) {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pitch)];
}

export function soundingPitch(openPitch, position, capo) {
  return mod12(openPitch + (position === 0 ? capo : position));
}

export function pitchesForShape(shape, tuning, capo) {
  return shape.reduce((result, position, stringIndex) => {
    if (position !== null) result.push(soundingPitch(tuning[stringIndex], position, capo));
    return result;
  }, []);
}

// Returns a language-agnostic analysis: `name` is the chord symbol (e.g. "Cmaj7"),
// never a display sentence. Callers compose a localized description from `quality.id`,
// `root`, `bass` and `confidence` (see chord.* keys in the locale dictionaries).
export function analyzePitchClasses(pitches, options = {}) {
  const tones = unique(pitches.map(mod12));
  if (!tones.length) return { name: '—', tones: [], alternatives: [], root: null, confidence: 'none' };
  if (tones.length === 1) {
    const name = noteName(tones[0], options.preferFlats);
    return { name, tones, alternatives: [], root: tones[0], confidence: 'note' };
  }

  const bass = mod12(pitches[0]);
  const candidates = [];
  for (const root of tones) {
    const relative = sorted(tones.map((pitch) => mod12(pitch - root)));
    for (let qualityIndex = 0; qualityIndex < QUALITIES.length; qualityIndex += 1) {
      const quality = QUALITIES[qualityIndex];
      const expected = sorted(quality.intervals);
      const exact = same(relative, expected);
      const missing = expected.filter((interval) => !relative.includes(interval));
      const noExtras = relative.every((interval) => expected.includes(interval));
      const omittedOnly = missing.length > 0 && missing.every((interval) => (quality.optional || []).includes(interval));
      if (!exact && !(noExtras && omittedOnly && relative.length >= 2)) continue;
      const rootInBass = bass === root;
      const specificity = expected.length;
      const score = (exact ? 0 : 24) + missing.length * 7 + (rootInBass ? 0 : 5) - specificity * 0.06 + qualityIndex * 0.001;
      candidates.push({ root, quality, exact, missing, score, bass });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  if (!candidates.length) {
    const names = tones.map((pitch) => noteName(pitch, options.preferFlats));
    return { name: names.join(' · '), tones, alternatives: [], root: null, confidence: 'set' };
  }

  const format = (candidate) => {
    const rootName = noteName(candidate.root, options.preferFlats);
    const bassName = noteName(candidate.bass, options.preferFlats);
    const omitted = candidate.missing.includes(7) && candidate.quality.intervals.length === 3 ? '(no5)' : '';
    return `${rootName}${candidate.quality.suffix}${omitted}${candidate.bass !== candidate.root ? `/${bassName}` : ''}`;
  };
  const primary = candidates[0];
  const alternatives = unique(candidates.slice(1).map(format)).filter((name) => name !== format(primary)).slice(0, 4);
  return {
    name: format(primary),
    tones,
    alternatives,
    root: primary.root,
    bass,
    confidence: primary.exact ? 'exact' : 'omitted',
    quality: primary.quality,
  };
}

export function analyze(shape, tuning, capo = 0, options = {}) {
  return analyzePitchClasses(pitchesForShape(shape, tuning, capo), options);
}

export function parseChord(input) {
  const normalized = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = normalized.match(/^([A-Ga-g](?:#|b)?)(.*?)(?:\/([A-Ga-g](?:#|b)?))?$/);
  if (!match) return null;
  const rootText = match[1][0].toUpperCase() + match[1].slice(1);
  const bassText = match[3] ? match[3][0].toUpperCase() + match[3].slice(1) : null;
  if (NOTE_VALUES[rootText] === undefined || (bassText && NOTE_VALUES[bassText] === undefined)) return null;
  const quality = resolveQuality(match[2].trim());
  if (!quality) return null;
  const preferFlats = rootText.includes('b');
  return { root: NOTE_VALUES[rootText], bass: bassText ? NOTE_VALUES[bassText] : null, quality, preferFlats };
}

const MAX_FINGERS = 4;
const MAX_STRETCH = 4; // index to pinky spans five frets, i.e. a difference of four

// How many fingers a shape needs. Open and muted strings cost nothing, and the
// strings sharing the lowest fretted fret are assumed to be taken by one barre —
// which is what makes real barre chords (F: 133211) come out at four rather than six.
function fingersNeeded(shape) {
  const fretted = shape.filter((position) => position !== null && position > 0);
  if (!fretted.length) return 0;
  const lowest = Math.min(...fretted);
  const above = fretted.filter((position) => position > lowest).length;
  // One finger normally lies across everything at the lowest fret. It cannot,
  // though, if a string is meant to ring open between the outermost strings it
  // would cover — the barre would stop that string dead. Then each note at the
  // lowest fret costs a finger of its own, which is usually more than a hand has.
  const atLowest = [];
  shape.forEach((position, stringIndex) => { if (position === lowest) atLowest.push(stringIndex); });
  const first = atLowest[0];
  const last = atLowest[atLowest.length - 1];
  const openUnderBarre = shape.some((position, stringIndex) => position === 0 && stringIndex > first && stringIndex < last);
  return (openUnderBarre ? atLowest.length : 1) + above;
}

// The actual stretch the hand has to cover: open strings are not held down, so
// they must not count towards it.
function frettedSpan(shape) {
  const fretted = shape.filter((position) => position !== null && position > 0);
  if (!fretted.length) return 0;
  return Math.max(...fretted) - Math.min(...fretted);
}

// Finds the single best-scoring fingering within one fret window (capo+1..windowEnd).
// When allowOpen is false, open strings are excluded so the result is a genuine
// fretted/barre-style shape rooted at this window rather than falling back to the
// open-position voicing (which is always cheapest when it's available).
// With `strict`, shapes no hand can form are discarded outright rather than merely
// scored down; callers fall back to a non-strict pass if nothing survives.
// A position usually has two shapes worth knowing: the full one, which sounds
// every string it can, and a compact one on the top strings. They are different
// answers to the same question, so the search returns the best of each rather
// than making them compete.
const FULL_VOICING_GAP = 1; // sounding at most this many strings short of all of them

function shapesInWindow(target, targetMask, rootBit, bassTarget, tuning, capo, fretCount, windowStart, allowOpen, strict = true) {
  const windowEnd = Math.min(fretCount, windowStart + 4);
  let beam = [{ shape: [], mask: 0, sounds: 0, min: Infinity, max: -Infinity, muted: 0, internalMutes: 0, started: false, hasOpen: false, score: 0, bass: null }];
  for (let stringIndex = 0; stringIndex < tuning.length; stringIndex += 1) {
    const positions = [null];
    if (allowOpen && target.includes(soundingPitch(tuning[stringIndex], 0, capo))) positions.push(0);
    for (let fret = windowStart; fret <= windowEnd; fret += 1) {
      if (target.includes(soundingPitch(tuning[stringIndex], fret, capo))) positions.push(fret);
    }
    const next = [];
    for (const partial of beam) {
      for (const position of positions) {
        const copy = { ...partial, shape: [...partial.shape, position] };
        if (position === null) {
          copy.muted += 1;
          copy.internalMutes += partial.started ? 1 : 0;
          copy.score += partial.started ? 1.7 : 0.65;
        } else {
          const pitch = soundingPitch(tuning[stringIndex], position, capo);
          copy.mask |= 1 << pitch;
          copy.sounds += 1;
          copy.started = true;
          if (copy.bass === null) copy.bass = pitch;
          if (position === 0) {
            copy.hasOpen = true;
            copy.score -= 0.25;
          }
          else {
            copy.min = Math.min(copy.min, position);
            copy.max = Math.max(copy.max, position);
            // Relative to the window, not absolute. An absolute cost per string
            // quietly charges a shape for every string it sounds, which is how a
            // full barre used to lose to a thinner voicing at the same fret.
            copy.score += (position - windowStart) * 0.05;
            if (copy.max - copy.min > 4) copy.score += 9;
          }
        }
        next.push(copy);
      }
    }
    next.sort((a, b) => a.score - b.score);
    beam = next.slice(0, 1800);
  }
  const best = { full: null, compact: null };
  for (const candidate of beam) {
    if ((candidate.mask & targetMask) !== targetMask || !(candidate.mask & rootBit) || candidate.sounds < Math.min(3, tuning.length)) continue;
    candidate.fingers = fingersNeeded(candidate.shape);
    candidate.span = frettedSpan(candidate.shape);
    if (strict && (candidate.fingers > MAX_FINGERS || candidate.span > MAX_STRETCH || candidate.internalMutes > 1)) continue;
    // Open strings alone do not put the hand at the nut: a barre at the fifth
    // fret with two open strings is a fifth-position shape, and saying otherwise
    // made it collide with the real open chord in the list.
    const lowestFretted = candidate.min === Infinity ? 0 : candidate.min;
    candidate.position = candidate.hasOpen && lowestFretted <= 3 ? 0 : (lowestFretted || windowStart);
    // Among playable shapes, prefer the ones that ask less of the hand.
    candidate.selectionScore = candidate.score + candidate.span * 1.1 + candidate.fingers * 0.5
      + candidate.internalMutes * 1.2 + candidate.position * 0.32
      + (candidate.bass === bassTarget ? 0 : 4.5);
    candidate.bucket = candidate.sounds >= tuning.length - FULL_VOICING_GAP ? 'full' : 'compact';
    const incumbent = best[candidate.bucket];
    if (!incumbent || candidate.selectionScore < incumbent.selectionScore) best[candidate.bucket] = candidate;
    // score is finalized by the caller once the bass penalty (which depends on the
    // requested chord, not the window) has been applied.
  }
  return [best.full, best.compact].filter(Boolean);
}

// Returns up to `limit` distinct fingerings for a chord, ordered from the lowest
// neck position upward: one open/nut-position voicing (if any), plus a sliding
// scan of forced-fretted (barre-style) shapes up the neck.
export function generateShapes(parsed, tuning, capo, fretCount, limit = 8) {
  const intervals = parsed.quality.intervals;
  const target = unique(intervals.map((interval) => mod12(parsed.root + interval)));
  // Extended chords have more notes than a guitarist has strings and fingers, so
  // from five notes up the 5th may be dropped — exactly what players do. Triads
  // and sevenths still have to sound in full.
  const optional = intervals.length >= 5 ? (parsed.quality.optional || []) : [];
  const required = unique(intervals.filter((interval) => !optional.includes(interval))
    .map((interval) => mod12(parsed.root + interval)));
  const targetMask = required.reduce((mask, pitch) => mask | (1 << pitch), 0);
  const fullMask = target.reduce((mask, pitch) => mask | (1 << pitch), 0);
  const rootBit = 1 << parsed.root;
  const maxStart = Math.max(capo + 1, Math.min(fretCount, capo + 12));
  const bassTarget = parsed.bass ?? parsed.root;

  const finalize = (candidate) => {
    const bassPenalty = candidate.bass === bassTarget ? 0 : 4.5;
    // Leaving out a droppable note is allowed but never free, so complete
    // voicings still win wherever one exists.
    let dropped = 0;
    for (let pitch = 0; pitch < 12; pitch += 1) {
      if ((fullMask & (1 << pitch)) && !(candidate.mask & (1 << pitch))) dropped += 1;
    }
    candidate.score += candidate.span * 1.1 + candidate.fingers * 0.5
      + candidate.internalMutes * 1.2 + candidate.position * 0.32 + bassPenalty + dropped * 2.2;
    return candidate;
  };

  const collect = (strict) => {
    const shapes = [];
    const gather = (windowStart, allowOpen) => {
      for (const candidate of shapesInWindow(target, targetMask, rootBit, bassTarget, tuning, capo, fretCount, windowStart, allowOpen, strict)) {
        shapes.push(finalize(candidate));
      }
    };
    gather(capo + 1, true);
    for (let windowStart = capo + 1; windowStart <= maxStart; windowStart += 1) gather(windowStart, false);
    return shapes;
  };

  // An awkward shape beats no answer at all, but only as a last resort.
  const strictShapes = collect(true);
  const found = strictShapes.length ? strictShapes : collect(false);

  // Keep only the best-scoring version of each distinct shape.
  const bySignature = new Map();
  for (const candidate of found) {
    const key = candidate.shape.join(',');
    const existing = bySignature.get(key);
    if (!existing || candidate.score < existing.score) bySignature.set(key, candidate);
  }

  // At most one full and one compact shape per neck position, so the list reads as
  // distinct positions up the neck rather than a drift of near-duplicates.
  const byBucket = new Map();
  for (const candidate of bySignature.values()) {
    const key = `${candidate.position}:${candidate.bucket}`;
    const existing = byBucket.get(key);
    if (!existing || candidate.score < existing.score) byBucket.set(key, candidate);
  }

  const byPosition = new Map();
  for (const candidate of byBucket.values()) {
    const existing = byPosition.get(candidate.position);
    if (!existing || candidate.score < existing.score) byPosition.set(candidate.position, candidate);
  }

  // Half the slots go to distinct positions and half to second voicings of them,
  // so the list covers the neck and still shows both ways to play each spot.
  const positionCap = Math.max(1, Math.ceil(limit / 2));
  const primary = [...byPosition.values()].sort((a, b) => a.score - b.score).slice(0, positionCap);
  const chosen = new Set(primary);
  // A second voicing has to be a different chord shape, not the same one with a
  // string dropped: it must sound at least two strings more or fewer than the one
  // already shown at that position.
  const alternates = [...byBucket.values()]
    .filter((candidate) => {
      const main = byPosition.get(candidate.position);
      return !chosen.has(candidate) && chosen.has(main) && Math.abs(candidate.sounds - main.sounds) >= 2;
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.max(0, limit - primary.length));

  return [...primary, ...alternates]
    .sort((a, b) => a.position - b.position || a.score - b.score)
    .map((candidate) => ({ shape: candidate.shape, position: candidate.position, score: candidate.score, strings: candidate.sounds }));
}

export function generateShape(parsed, tuning, capo, fretCount) {
  // Preserve the legacy single-shape behavior: prefer the lowest available
  // position, while generateShapes still exposes the wider ranked catalogue.
  const shapes = generateShapes(parsed, tuning, capo, fretCount, 8);
  return shapes.length ? shapes[0].shape : null;
}

export { mod12 };
