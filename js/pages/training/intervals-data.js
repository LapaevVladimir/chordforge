import { t } from '../../i18n/i18n.js';

// Semitone distances are language-agnostic theory; the short code, name and
// description shown in the UI live in the locale dictionaries under interval.<id>.*.
export const INTERVALS = [
  { id: 'p1', semitones: 0 },
  { id: 'm2', semitones: 1 },
  { id: 'M2', semitones: 2 },
  { id: 'm3', semitones: 3 },
  { id: 'M3', semitones: 4 },
  { id: 'p4', semitones: 5 },
  { id: 'tt', semitones: 6 },
  { id: 'p5', semitones: 7 },
  { id: 'm6', semitones: 8 },
  { id: 'M6', semitones: 9 },
  { id: 'm7', semitones: 10 },
  { id: 'M7', semitones: 11 },
  { id: 'p8', semitones: 12 },
];

export function getInterval(id) {
  return INTERVALS.find((interval) => interval.id === id) || INTERVALS[7];
}

export const intervalShort = (id) => t(`interval.${id}.short`);
export const intervalName = (id) => t(`interval.${id}.name`);
export const intervalDescription = (id) => t(`interval.${id}.description`);
