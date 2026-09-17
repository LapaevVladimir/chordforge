import * as Engine from '../../core/chord-engine.js';
import * as Audio from '../../core/guitar-audio.js';
import { clamp, clone, readJson, createIdGenerator } from '../../core/utils.js';
import { t } from '../../i18n/i18n.js';

export const PITCHES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const STANDARD = [4, 9, 2, 7, 11, 4];

export const PRESETS = {
  standard: { strings: 6, tuning: STANDARD, frets: 15, shape: [0, 2, 2, 0, 0, 0], register: 'guitar' },
  dropd: { strings: 6, tuning: [2, 9, 2, 7, 11, 4], frets: 15, shape: [0, 2, 2, 0, 0, 0], register: 'guitar' },
  dadgad: { strings: 6, tuning: [2, 9, 2, 7, 9, 2], frets: 15, shape: [0, 0, 0, 0, 0, 0], register: 'guitar' },
  openg: { strings: 6, tuning: [2, 7, 2, 7, 11, 2], frets: 15, shape: [0, 0, 0, 0, 0, 0], register: 'guitar' },
  bass: { strings: 4, tuning: [4, 9, 2, 7], frets: 15, shape: [0, 2, 2, 0], register: 'bass' },
  seven: { strings: 7, tuning: [11, 4, 9, 2, 7, 11, 4], frets: 15, shape: [0, 2, 2, 0, 0, 0, 0], register: 'guitar' },
};

export const STATE_KEY = 'chordforge-state-v2';
export const TIMELINE_KEY = 'chordforge-timeline-v1';
export const CLIPBOARD_KEY = 'chordforge-clip-clipboard-v1';
export const SNAP_STEPS = [0, 0.125, 0.25, 0.5, 1];
const DEFAULT_STRUM_PATTERN = ['down', 'rest', 'down', 'up', 'rest', 'up', 'down', 'up'];

const defaultState = {
  ...clone(PRESETS.standard),
  capo: 0,
  preset: 'standard',
  preferFlats: false,
  strumInterval: 30,
  strumPattern: clone(DEFAULT_STRUM_PATTERN),
  volume: 1,
  attack: 0.01,
  release: 0.45,
};

export const uid = createIdGenerator();

// A single mutable container so every module sees live updates without needing
// to re-import a reassigned binding — modules replace `store.state`/`store.timeline`
// wholesale (preset switch, shared-link load) by assigning these properties.
export const store = {
  state: readJson(STATE_KEY, defaultState),
  timeline: readJson(TIMELINE_KEY, { bpm: 100, snapStep: 0.5, startBeat: 0, tracks: [] }),
  clipClipboard: readJson(CLIPBOARD_KEY, null),
  selectedClipId: null,
  dragPayload: null,
};

export function tuningFor(count) {
  const tuning = [...STANDARD];
  while (tuning.length < count) tuning.unshift(Engine.mod12(tuning[0] - 5));
  while (tuning.length > count) tuning.shift();
  return tuning;
}

export function normalizeState() {
  const state = store.state;
  state.strings = clamp(Number(state.strings) || 6, 4, 12);
  state.frets = clamp(Number(state.frets) || 15, 8, 24);
  state.capo = clamp(Number(state.capo) || 0, 0, Math.min(12, state.frets - 1));
  state.strumInterval = Audio.normalizeStrumInterval(state.strumInterval);
  state.strumPattern = Audio.normalizeStrumPattern(state.strumPattern);
  state.volume = Audio.normalizeVolume(state.volume);
  state.attack = Audio.normalizeAttack(state.attack);
  state.release = Audio.normalizeRelease(state.release);
  state.register = state.register === 'bass' ? 'bass' : 'guitar';
  if (!Array.isArray(state.tuning) || state.tuning.length !== state.strings) state.tuning = tuningFor(state.strings);
  if (!Array.isArray(state.shape) || state.shape.length !== state.strings) state.shape = Array(state.strings).fill(0);
  state.shape = state.shape.map((position) => {
    if (position === null || position === 0) return position;
    const fret = Number(position);
    return fret > state.capo && fret <= state.frets ? fret : 0;
  });
}

export function normalizeInstrument(instrument) {
  if (!instrument || !Array.isArray(instrument.shape) || !Array.isArray(instrument.tuning)) return null;
  return {
    shape: instrument.shape.map((position) => position === null ? null : Number(position)),
    tuning: instrument.tuning.map(Number),
    capo: clamp(Number(instrument.capo) || 0, 0, 12),
    register: instrument.register === 'bass' ? 'bass' : 'guitar',
    strings: clamp(Number(instrument.strings) || instrument.tuning.length, 4, 12),
    strumInterval: Audio.normalizeStrumInterval(instrument.strumInterval),
    strumPattern: Audio.normalizeStrumPattern(instrument.strumPattern),
    volume: Audio.normalizeVolume(instrument.volume),
    attack: Audio.normalizeAttack(instrument.attack),
    release: Audio.normalizeRelease(instrument.release),
  };
}

export function makeTrack(name = null, index = store.timeline.tracks.length) {
  return { id: uid('track'), name: name || t('builder.timeline.defaultTrackName', { n: index + 1 }), muted: false, clips: [] };
}

export function normalizeTimeline() {
  const timeline = store.timeline;
  timeline.bpm = clamp(Math.round(Number(timeline.bpm) || 100), 40, 240);
  const snapStep = Number(timeline.snapStep);
  timeline.snapStep = SNAP_STEPS.includes(snapStep) ? snapStep : 0.5;
  const startBeat = Number(timeline.startBeat);
  timeline.startBeat = Number.isFinite(startBeat) ? Math.max(0, Math.round(startBeat * 100) / 100) : 0;
  if (!Array.isArray(timeline.tracks)) timeline.tracks = [];
  timeline.tracks = timeline.tracks.map((track, trackIndex) => ({
    id: typeof track.id === 'string' ? track.id : uid('track'),
    name: typeof track.name === 'string' && track.name.trim() ? track.name.slice(0, 40) : t('builder.timeline.defaultTrackName', { n: trackIndex + 1 }),
    muted: Boolean(track.muted),
    clips: Array.isArray(track.clips) ? track.clips.map((clip) => {
      const instrument = normalizeInstrument(clip.instrument);
      if (!instrument) return null;
      const start = Math.max(0, Math.round((Number(clip.start) || 0) * 100) / 100);
      return {
        id: typeof clip.id === 'string' ? clip.id : uid('clip'),
        name: typeof clip.name === 'string' ? clip.name.slice(0, 30) : t('common.chordDefaultName'),
        start,
        duration: Math.max(0.1, Math.round((Number(clip.duration) || 4) * 100) / 100),
        instrument,
      };
    }).filter(Boolean) : [],
  }));
  if (!timeline.tracks.length) timeline.tracks.push(makeTrack());
}

export function persistState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(store.state));
}

export function persistTimeline() {
  localStorage.setItem(TIMELINE_KEY, JSON.stringify(store.timeline));
}

export function currentAnalysis() {
  const state = store.state;
  return Engine.analyze(state.shape, state.tuning, state.capo, { preferFlats: Boolean(state.preferFlats) });
}

export function currentChordPayload() {
  const state = store.state;
  return {
    name: currentAnalysis().name,
    instrument: {
      shape: clone(state.shape),
      tuning: clone(state.tuning),
      capo: state.capo,
      register: state.register,
      strings: state.strings,
      strumInterval: state.strumInterval,
      strumPattern: clone(state.strumPattern),
      volume: state.volume,
      attack: state.attack,
      release: state.release,
    },
  };
}
