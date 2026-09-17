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
  { id: 'maj9', suffix: 'maj9', intervals: [0, 2, 4, 7, 11], optional: [7] },
  { id: '9', suffix: '9', intervals: [0, 2, 4, 7, 10], optional: [7] },
  { id: 'm9', suffix: 'm9', intervals: [0, 2, 3, 7, 10], optional: [7] },
  { id: '7b9', suffix: '7♭9', intervals: [0, 1, 4, 7, 10], optional: [7] },
  { id: '7s9', suffix: '7♯9', intervals: [0, 3, 4, 7, 10], optional: [7] },
  { id: 'maj7s11', suffix: 'maj7♯11', intervals: [0, 4, 6, 7, 11], optional: [7] },
  { id: '69', suffix: '6/9', intervals: [0, 2, 4, 7, 9], optional: [7] },
  { id: 'm69', suffix: 'm6/9', intervals: [0, 2, 3, 7, 9], optional: [7] },
  { id: '7sus4', suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { id: 'mmaj7', suffix: 'm(maj7)', intervals: [0, 3, 7, 11], optional: [7] },
  { id: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11], optional: [7] },
  { id: '7', suffix: '7', intervals: [0, 4, 7, 10], optional: [7] },
  { id: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10], optional: [7] },
  { id: 'dim7', suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { id: 'm7b5', suffix: 'm7♭5', intervals: [0, 3, 6, 10] },
  { id: '7b5', suffix: '7♭5', intervals: [0, 4, 6, 10] },
  { id: '7s5', suffix: '7♯5', intervals: [0, 4, 8, 10] },
  { id: 'add9', suffix: 'add9', intervals: [0, 2, 4, 7], optional: [7] },
  { id: 'madd9', suffix: 'm(add9)', intervals: [0, 2, 3, 7], optional: [7] },
  { id: 'add11', suffix: 'add11', intervals: [0, 4, 5, 7], optional: [7] },
  { id: 'madd11', suffix: 'm(add11)', intervals: [0, 3, 5, 7], optional: [7] },
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
  '6': '6', m6: 'm6', '6/9': '69', '69': '69', 'm6/9': 'm69', maj9: 'maj9', M9: 'maj9',
  '9': '9', m9: 'm9', '11': '11', m11: 'm11', '13': '13', maj13: 'maj13', m13: 'm13',
  'maj7#11': 'maj7s11', 'maj7♯11': 'maj7s11',
};

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
  let suffix = match[2].trim();
  if (suffix === 'min') suffix = 'm';
  const qualityId = ALIASES[suffix];
  const quality = byId[qualityId];
  if (!quality) return null;
  const preferFlats = rootText.includes('b');
  return { root: NOTE_VALUES[rootText], bass: bassText ? NOTE_VALUES[bassText] : null, quality, preferFlats };
}

// Finds the single best-scoring fingering within one fret window (capo+1..windowEnd).
// When allowOpen is false, open strings are excluded so the result is a genuine
// fretted/barre-style shape rooted at this window rather than falling back to the
// open-position voicing (which is always cheapest when it's available).
function bestShapeInWindow(target, targetMask, rootBit, bassTarget, tuning, capo, fretCount, windowStart, allowOpen) {
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
            copy.score += position * 0.07;
            if (copy.max - copy.min > 4) copy.score += 9;
          }
        }
        next.push(copy);
      }
    }
    next.sort((a, b) => a.score - b.score);
    beam = next.slice(0, 1800);
  }
  let best = null;
  for (const candidate of beam) {
    if ((candidate.mask & targetMask) !== targetMask || !(candidate.mask & rootBit) || candidate.sounds < Math.min(3, tuning.length)) continue;
    const lowestPosition = candidate.hasOpen ? capo : candidate.min;
    candidate.span = candidate.max === -Infinity ? 0 : candidate.max - lowestPosition;
    candidate.position = candidate.hasOpen ? 0 : (candidate.min === Infinity ? windowStart : candidate.min);
    candidate.selectionScore = candidate.score + candidate.span * 1.1 + candidate.internalMutes * 1.2 + (candidate.bass === bassTarget ? 0 : 4.5);
    if (!best || candidate.selectionScore < best.selectionScore) best = candidate;
    // score is finalized by the caller once the bass penalty (which depends on the
    // requested chord, not the window) has been applied.
  }
  return best;
}

// Returns up to `limit` distinct fingerings for a chord, ordered from the lowest
// neck position upward: one open/nut-position voicing (if any), plus a sliding
// scan of forced-fretted (barre-style) shapes up the neck.
export function generateShapes(parsed, tuning, capo, fretCount, limit = 8) {
  const target = unique(parsed.quality.intervals.map((interval) => mod12(parsed.root + interval)));
  const targetMask = target.reduce((mask, pitch) => mask | (1 << pitch), 0);
  const rootBit = 1 << parsed.root;
  const maxStart = Math.max(capo + 1, Math.min(fretCount, capo + 12));
  const bassTarget = parsed.bass ?? parsed.root;
  const found = [];

  const finalize = (candidate) => {
    const bassPenalty = candidate.bass === bassTarget ? 0 : 4.5;
    candidate.score += candidate.span * 1.1 + candidate.internalMutes * 1.2 + bassPenalty;
    return candidate;
  };

  const openCandidate = bestShapeInWindow(target, targetMask, rootBit, bassTarget, tuning, capo, fretCount, capo + 1, true);
  if (openCandidate) found.push(finalize(openCandidate));

  for (let windowStart = capo + 1; windowStart <= maxStart; windowStart += 1) {
    const candidate = bestShapeInWindow(target, targetMask, rootBit, bassTarget, tuning, capo, fretCount, windowStart, false);
    if (!candidate) continue;
    found.push(finalize(candidate));
  }

  // Keep only the best-scoring version of each distinct shape.
  const bySignature = new Map();
  for (const candidate of found) {
    const key = candidate.shape.join(',');
    const existing = bySignature.get(key);
    if (!existing || candidate.score < existing.score) bySignature.set(key, candidate);
  }

  // Keep at most one shape per neck position (favoring the best-scoring one there)
  // so the results read as distinct positions up the neck rather than near-duplicates.
  const byPosition = new Map();
  for (const candidate of bySignature.values()) {
    const existing = byPosition.get(candidate.position);
    if (!existing || candidate.score < existing.score) byPosition.set(candidate.position, candidate);
  }

  return [...byPosition.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .sort((a, b) => a.position - b.position)
    .map((candidate) => ({ shape: candidate.shape, position: candidate.position, score: candidate.score }));
}

export function generateShape(parsed, tuning, capo, fretCount) {
  // Preserve the legacy single-shape behavior: prefer the lowest available
  // position, while generateShapes still exposes the wider ranked catalogue.
  const shapes = generateShapes(parsed, tuning, capo, fretCount, 8);
  return shapes.length ? shapes[0].shape : null;
}

export { mod12 };
