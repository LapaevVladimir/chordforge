const SAMPLE_MIN_MIDI = 40; // E2
const SAMPLE_MAX_MIDI = 74; // D5
const SAMPLE_NOTE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const STRUM_ACTIONS = new Set(['down', 'up', 'mute', 'rest']);
const DEFAULT_STRUM_PATTERN = ['down', 'rest', 'down', 'up', 'rest', 'up', 'down', 'up'];
const mod12 = (value) => ((value % 12) + 12) % 12;

function nearestMidi(pitchClass, target) {
  let best = pitchClass;
  let distance = Infinity;
  for (let midi = pitchClass; midi <= 108; midi += 12) {
    const candidateDistance = Math.abs(midi - target);
    if (candidateDistance < distance) {
      best = midi;
      distance = candidateDistance;
    }
  }
  return best;
}

export function inferOpenMidis(tuning, register = 'guitar') {
  if (!tuning.length) return [];
  const stringOffset = register === 'bass' ? Math.max(0, tuning.length - 4) : Math.max(0, tuning.length - 6);
  const target = register === 'bass' ? 28 - stringOffset * 5 : Math.max(28, 40 - stringOffset * 5);
  const midis = [nearestMidi(mod12(tuning[0]), target)];
  for (let index = 1; index < tuning.length; index += 1) {
    let midi = mod12(tuning[index]);
    while (midi <= midis[index - 1]) midi += 12;
    midis.push(midi);
  }
  return midis;
}

export function soundingMidis(shape, tuning, capo = 0, register = 'guitar') {
  const openMidis = inferOpenMidis(tuning, register);
  return shape.reduce((notes, position, stringIndex) => {
    if (position === null) return notes;
    const semitones = position === 0 ? capo : position;
    notes.push({ midi: openMidis[stringIndex] + semitones, stringIndex });
    return notes;
  }, []);
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function sampleRootForMidi(midi) {
  return Math.max(SAMPLE_MIN_MIDI, Math.min(SAMPLE_MAX_MIDI, Math.round(midi)));
}

export function sampleFileForMidi(midi) {
  const root = sampleRootForMidi(midi);
  const octave = Math.floor(root / 12) - 1;
  return `${SAMPLE_NOTE_NAMES[mod12(root)]}${octave}.mp3`;
}

export function normalizeStrumInterval(value) {
  const interval = Number(value);
  if (!Number.isFinite(interval)) return 30;
  return Math.max(0, Math.min(300, Math.round(interval / 5) * 5));
}

export function normalizePitchShift(value) {
  const semitones = Number(value);
  if (!Number.isFinite(semitones)) return 0;
  return Math.max(-12, Math.min(12, Math.round(semitones)));
}

export function normalizeRelease(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0.45;
  return Math.max(0.02, Math.min(2, Math.round(seconds * 100) / 100));
}

export function normalizeVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, Math.round(volume * 100) / 100));
}

export function normalizeAttack(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0.01;
  return Math.max(0, Math.min(2, Math.round(seconds * 100) / 100));
}

export function normalizeStrumPattern(pattern) {
  if (!Array.isArray(pattern) || !pattern.length) return [...DEFAULT_STRUM_PATTERN];
  return pattern.slice(0, 16).map((action) => STRUM_ACTIONS.has(action) ? action : 'rest');
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function seededNoise(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296 * 2 - 1;
  };
}

export class GuitarEngine {
  constructor() {
    this.context = null;
    this.input = null;
    this.activeVoices = [];
    this.samples = new Map();
    this.loading = new Map();
    this.sampleErrors = new Map();
    this.embeddedScripts = new Map();
    this.fallbackCache = new Map();
    this.pluckTokens = new Map();
  }

  createContext() {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio API is not supported');
    const context = new AudioContextClass({ latencyHint: 'interactive' });
    const input = context.createGain();
    const rumbleCut = context.createBiquadFilter();
    const body = context.createBiquadFilter();
    const harshness = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const output = context.createGain();

    rumbleCut.type = 'highpass';
    rumbleCut.frequency.value = 42;
    rumbleCut.Q.value = 0.7;
    body.type = 'peaking';
    body.frequency.value = 155;
    body.Q.value = 0.72;
    body.gain.value = 1.15;
    harshness.type = 'peaking';
    harshness.frequency.value = 3200;
    harshness.Q.value = 0.85;
    harshness.gain.value = -1.1;
    compressor.threshold.value = -12;
    compressor.knee.value = 16;
    compressor.ratio.value = 2.2;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.2;
    output.gain.value = 0.82;

    input.connect(rumbleCut).connect(body).connect(harshness).connect(compressor).connect(output).connect(context.destination);
    this.context = context;
    this.input = input;
    return context;
  }

  sampleUrl(midi) {
    const path = `assets/samples/guitar-acoustic/${sampleFileForMidi(midi)}`;
    return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href;
  }

  embeddedSampleUrl(midi) {
    const path = `assets/samples/guitar-acoustic/embedded/${sampleFileForMidi(midi)}.js`;
    return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href;
  }

  loadEmbeddedSample(midi) {
    const filename = sampleFileForMidi(midi);
    const registry = window.GuitarSampleData || (window.GuitarSampleData = Object.create(null));
    if (registry[filename]) return Promise.resolve(base64ToArrayBuffer(registry[filename]));
    if (this.embeddedScripts.has(filename)) return this.embeddedScripts.get(filename);

    const loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this.embeddedSampleUrl(midi);
      script.async = true;
      script.onload = () => {
        script.remove();
        this.embeddedScripts.delete(filename);
        if (!registry[filename]) {
          reject(new Error(`Embedded sample did not register: ${filename}`));
          return;
        }
        try { resolve(base64ToArrayBuffer(registry[filename])); }
        catch (error) { reject(error); }
      };
      script.onerror = () => {
        script.remove();
        this.embeddedScripts.delete(filename);
        reject(new Error(`Embedded sample failed to load: ${filename}`));
      };
      document.head.append(script);
    });
    this.embeddedScripts.set(filename, loading);
    return loading;
  }

  async readSampleData(midi) {
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      return this.loadEmbeddedSample(midi);
    }
    const response = await fetch(this.sampleUrl(midi));
    if (!response.ok) throw new Error(`Sample request failed: ${response.status}`);
    return response.arrayBuffer();
  }

  async loadSample(midi) {
    const root = sampleRootForMidi(midi);
    if (this.samples.has(root)) return this.samples.get(root);
    if (this.loading.has(root)) return this.loading.get(root);
    const context = this.createContext();
    const loading = this.readSampleData(root)
      .then((data) => context.decodeAudioData(data.slice(0)))
      .then((buffer) => {
        this.samples.set(root, buffer);
        this.sampleErrors.delete(root);
        this.loading.delete(root);
        return buffer;
      })
      .catch((error) => {
        this.loading.delete(root);
        this.sampleErrors.set(root, error);
        throw error;
      });
    this.loading.set(root, loading);
    return loading;
  }

  async preload(midis = [], options = {}) {
    if (!midis.length) return [];
    this.createContext();
    const roots = [...new Set(midis.map(sampleRootForMidi))];
    if (options.strict) return Promise.all(roots.map((midi) => this.loadSample(midi)));
    return Promise.all(roots.map((midi) => this.loadSample(midi).catch(() => null)));
  }

  async prepare(midis = []) {
    const context = this.createContext();
    if (context.state === 'suspended') await context.resume();
    await this.preload(midis, { strict: true });
    return context;
  }

  getSampleStatus() {
    return { loaded: this.samples.size, loading: this.loading.size, failed: this.sampleErrors.size };
  }

  createFallbackBuffer(midi) {
    if (this.fallbackCache.has(midi)) return this.fallbackCache.get(midi);
    const context = this.context;
    const frequency = midiToFrequency(midi);
    const duration = 3.1;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    const delayLength = Math.max(2, Math.round(context.sampleRate / frequency));
    const delay = new Float32Array(delayLength);
    const random = seededNoise(midi * 7919 + 37);
    for (let index = 0; index < delayLength; index += 1) delay[index] = random() * 0.68;
    let cursor = 0;
    for (let index = 0; index < length; index += 1) {
      const current = delay[cursor];
      const next = (cursor + 1) % delayLength;
      delay[cursor] = (current + delay[next]) * 0.495;
      cursor = next;
      data[index] = current * Math.min(1, index / (context.sampleRate * 0.002));
    }
    this.fallbackCache.set(midi, buffer);
    return buffer;
  }

  removeVoice(voice) {
    this.activeVoices = this.activeVoices.filter((item) => item !== voice);
  }

  stopVoice(voice, release = 0.018, atTime = null) {
    if (!this.context) return;
    const now = atTime === null ? this.context.currentTime : Math.max(this.context.currentTime, atTime);
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.velocity || voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
      voice.source.stop(now + release);
    } catch { /* source already ended */ }
  }

  muteAt(when, groupId, release = 0.028) {
    this.activeVoices
      .filter((voice) => !groupId || voice.groupId === groupId)
      .forEach((voice) => this.stopVoice(voice, release, when));
  }

  stopString(stringIndex) {
    this.pluckTokens.set(stringIndex, (this.pluckTokens.get(stringIndex) || 0) + 1);
    this.activeVoices.filter((voice) => voice.stringIndex === stringIndex).forEach((voice) => this.stopVoice(voice, 0.012));
  }

  stop() {
    this.pluckTokens.forEach((token, stringIndex) => this.pluckTokens.set(stringIndex, token + 1));
    this.activeVoices.forEach((voice) => this.stopVoice(voice));
    this.activeVoices = [];
  }

  createEnvelope(start, duration, options = {}) {
    const envelope = this.context.createGain();
    const end = start + Math.max(0.08, Number(duration) || 0.08);
    const volume = Math.max(0.0001, normalizeVolume(options.volume));
    const attack = Math.min(normalizeAttack(options.attack), Math.max(0, (end - start) * 0.48));
    const release = Math.min(normalizeRelease(options.release), Math.max(0.02, (end - start) * 0.48));
    const attackEnd = start + attack;
    const releaseStart = Math.max(attackEnd, end - release);

    envelope.gain.cancelScheduledValues(start);
    if (attack > 0) {
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.linearRampToValueAtTime(volume, attackEnd);
    } else {
      envelope.gain.setValueAtTime(volume, start);
    }
    envelope.gain.setValueAtTime(volume, releaseStart);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(this.input);
    return envelope;
  }

  playVoice(note, options = {}) {
    const root = sampleRootForMidi(note.midi);
    const recordedBuffer = this.samples.get(root);
    if (!recordedBuffer) throw new Error(`Recorded sample is unavailable for MIDI ${root}`);
    const buffer = recordedBuffer;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
    const start = options.start ?? this.context.currentTime + 0.006;
    const velocity = options.velocity ?? 0.72;
    const playbackRate = Math.pow(2, (note.midi - root) / 12);

    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.setValueAtTime(velocity, start);
    const naturalDuration = buffer.duration / playbackRate;
    const requestedDuration = Number(options.duration);
    const voiceDuration = Number.isFinite(requestedDuration)
      ? Math.max(0.08, Math.min(naturalDuration, requestedDuration))
      : naturalDuration;
    if (voiceDuration < naturalDuration && !options.useGroupEnvelope) {
      const release = Math.min(normalizeRelease(options.release), voiceDuration * 0.92);
      gain.gain.setValueAtTime(velocity, start + voiceDuration - release);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + voiceDuration);
    }
    const destination = options.destination || this.input;
    if (panner) {
      panner.pan.value = options.pan ?? 0;
      source.connect(gain).connect(panner).connect(destination);
    } else {
      source.connect(gain).connect(destination);
    }

    const voice = { source, gain, stringIndex: note.stringIndex, groupId: options.groupId, velocity };
    source.onended = () => this.removeVoice(voice);
    source.start(start);
    if (voiceDuration < naturalDuration) source.stop(start + voiceDuration + 0.02);
    this.activeVoices.push(voice);
    return voiceDuration;
  }

  scheduleStrum(notes, stringCount, options = {}) {
    const orderedNotes = options.direction === 'up' ? [...notes].reverse() : notes;
    const interval = normalizeStrumInterval(options.intervalMs) / 1000;
    const random = seededNoise(orderedNotes.reduce((sum, note) => sum + note.midi * (note.stringIndex + 3), options.seed || 173));
    let duration = 0;

    orderedNotes.forEach((note, order) => {
      const offset = order * interval;
      const remaining = Number.isFinite(options.duration) ? options.duration - offset : undefined;
      if (remaining !== undefined && remaining <= 0.035) return;
      const timingVariation = interval === 0 ? 0 : random() * Math.min(0.0025, interval * 0.08);
      const start = options.start + offset + timingVariation;
      const velocity = Math.max(0.31, (options.velocity || 0.47) + random() * 0.035 - order * 0.013);
      const pan = stringCount <= 1 ? 0 : -0.2 + note.stringIndex / (stringCount - 1) * 0.4;
      duration = Math.max(duration, offset + this.playVoice(note, {
        start,
        velocity,
        pan,
        duration: remaining,
        release: options.release,
        groupId: options.groupId,
        destination: options.destination,
        useGroupEnvelope: options.useGroupEnvelope,
      }));
    });
    return duration;
  }

  async pluck(note, stringCount, pitchShift = 0) {
    const shiftedNote = { ...note, midi: note.midi + normalizePitchShift(pitchShift) };
    const token = (this.pluckTokens.get(note.stringIndex) || 0) + 1;
    this.pluckTokens.set(note.stringIndex, token);
    await this.prepare([shiftedNote.midi]);
    if (this.pluckTokens.get(note.stringIndex) !== token) return 0;
    this.activeVoices.filter((voice) => voice.stringIndex === note.stringIndex).forEach((voice) => this.stopVoice(voice, 0.012));
    const pan = stringCount <= 1 ? 0 : -0.18 + note.stringIndex / (stringCount - 1) * 0.36;
    return this.playVoice(shiftedNote, { velocity: 0.72, pan });
  }

  async strum(notes, stringCount, intervalMs = 30, pitchShift = 0) {
    const semitones = normalizePitchShift(pitchShift);
    const shiftedNotes = notes.map((note) => ({ ...note, midi: note.midi + semitones }));
    await this.prepare(shiftedNotes.map((note) => note.midi));
    this.stop();
    const now = this.context.currentTime + 0.025;
    const random = seededNoise(shiftedNotes.reduce((sum, note) => sum + note.midi * (note.stringIndex + 3), 173));
    const interval = normalizeStrumInterval(intervalMs) / 1000;
    let duration = 0;

    shiftedNotes.forEach((note, order) => {
      const timingVariation = interval === 0 ? 0 : random() * Math.min(0.0025, interval * 0.08);
      const start = now + order * interval + timingVariation;
      const velocity = Math.max(0.31, 0.46 + random() * 0.035 - order * 0.013);
      const pan = stringCount <= 1 ? 0 : -0.2 + note.stringIndex / (stringCount - 1) * 0.4;
      duration = Math.max(duration, order * interval + this.playVoice(note, { start, velocity, pan }));
    });
    return duration;
  }

  async playInterval(rootMidi, targetMidi, mode = 'sequential') {
    const notes = [
      { midi: Math.round(Number(rootMidi) || 60), stringIndex: 0 },
      { midi: Math.round(Number(targetMidi) || 60), stringIndex: 1 },
    ];
    await this.prepare(notes.map((note) => note.midi));
    this.stop();
    const origin = this.context.currentTime + 0.035;
    const delay = mode === 'simultaneous' ? 0 : 0.72;
    const firstDuration = this.playVoice(notes[0], { start: origin, velocity: 0.68, pan: -0.12, duration: 2.7, release: 0.38 });
    const secondDuration = this.playVoice(notes[1], { start: origin + delay, velocity: 0.68, pan: 0.12, duration: 2.7, release: 0.38 });
    return Math.max(firstDuration, delay + secondDuration);
  }

  async playPattern(notes, stringCount, pattern, options = {}) {
    const shiftedNotes = notes.map((note) => ({ ...note, midi: note.midi + normalizePitchShift(options.pitchShift) }));
    await this.prepare(shiftedNotes.map((note) => note.midi));
    this.stop();

    const normalizedPattern = normalizeStrumPattern(pattern);
    const secondsPerBeat = 60 / Math.max(40, Math.min(240, Number(options.bpm) || 100));
    const stepDuration = secondsPerBeat / 2;
    const totalDuration = Math.max(stepDuration, (Number(options.beats) || 4) * secondsPerBeat);
    const origin = this.context.currentTime + 0.035;
    const groupId = `pattern-${Date.now()}-${Math.random()}`;
    const envelope = this.createEnvelope(origin, totalDuration, options);

    for (let stepIndex = 0; stepIndex * stepDuration < totalDuration; stepIndex += 1) {
      const action = normalizedPattern[stepIndex % normalizedPattern.length];
      const offset = stepIndex * stepDuration;
      const start = origin + offset;
      if (action === 'mute') {
        this.muteAt(start, groupId);
      } else if (action === 'down' || action === 'up') {
        this.scheduleStrum(shiftedNotes, stringCount, {
          direction: action,
          intervalMs: options.intervalMs,
          start,
          duration: totalDuration - offset,
          release: options.release,
          groupId,
          destination: envelope,
          useGroupEnvelope: true,
          seed: 173 + stepIndex * 19,
        });
      }
    }
    return totalDuration;
  }

  async playTimeline(events = []) {
    const validEvents = events.filter((event) => Array.isArray(event.notes) && event.notes.length);
    if (!validEvents.length) return { duration: 0, leadIn: 0 };
    await this.prepare(validEvents.flatMap((event) => event.notes.map((note) => note.midi)));
    this.stop();

    const leadIn = 0.08;
    const origin = this.context.currentTime + leadIn;
    let duration = 0;

    validEvents.forEach((event, eventIndex) => {
      const eventStart = Math.max(0, Number(event.start) || 0);
      const eventDuration = Math.max(0.08, Number(event.duration) || 0.08);
      const stringCount = Math.max(1, Number(event.stringCount) || event.notes.length);
      const pattern = normalizeStrumPattern(event.pattern);
      const stepDuration = Math.max(0.03, Number(event.stepDuration) || eventDuration);
      const groupId = `timeline-${eventIndex}`;
      const envelope = this.createEnvelope(origin + eventStart, eventDuration, event);
      const patternOffset = Math.max(0, Math.floor(Number(event.patternOffset) || 0));

      for (let stepIndex = 0; stepIndex * stepDuration < eventDuration; stepIndex += 1) {
        const action = pattern[(stepIndex + patternOffset) % pattern.length];
        const offset = stepIndex * stepDuration;
        const start = origin + eventStart + offset;
        if (action === 'mute') {
          this.muteAt(start, groupId);
        } else if (action === 'down' || action === 'up') {
          this.scheduleStrum(event.notes, stringCount, {
            direction: action,
            intervalMs: event.intervalMs,
            start,
            duration: eventDuration - offset,
            release: event.release,
            groupId,
            destination: envelope,
            useGroupEnvelope: true,
            seed: 173 + eventIndex * 97 + stepIndex * 19,
          });
        }
      }
      duration = Math.max(duration, eventStart + eventDuration);
    });

    return { duration, leadIn };
  }
}
