import { inferOpenMidis } from './guitar-audio.js';

export const STANDARD_TUNING = [4, 9, 2, 7, 11, 4]; // low string -> high string, pitch classes (E A D G B E)
export const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const mod12 = (value) => ((value % 12) + 12) % 12;

// A small mutable tuning instance — each page that needs one creates its own
// via createTuning() so multiple tuners/boards on different pages never share state.
export function createTuning(initial = STANDARD_TUNING, register = 'guitar') {
  let pitches = [...initial];
  let openMidis = inferOpenMidis(pitches, register);

  function recompute() {
    openMidis = inferOpenMidis(pitches, register);
  }

  return {
    get pitches() { return pitches.slice(); },
    get openMidis() { return openMidis; },
    label() { return pitches.map((pitch) => PITCH_NAMES[mod12(pitch)]).join(' · '); },
    setString(stringIndex, pitchClass) { pitches[stringIndex] = mod12(pitchClass); recompute(); },
    shiftString(stringIndex, semitones) { pitches[stringIndex] = mod12(pitches[stringIndex] + semitones); recompute(); },
    shiftAll(semitones) { pitches = pitches.map((pitch) => mod12(pitch + semitones)); recompute(); },
    setAll(nextPitches) { pitches = nextPitches.slice(); recompute(); },
    reset() { pitches = [...initial]; recompute(); },
  };
}
