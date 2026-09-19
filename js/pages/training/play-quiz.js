// The microphone half of the "play it back" quiz.
//
// It owns the tuner engine and the note stream, and hands the quiz two things:
// a live readout while you play, and a note event each time you actually land
// one. Everything about whether the answer was right stays in quiz.js — this
// module only reports what was heard.
import { createTunerEngine, TUNER_STATES } from '../../core/tuner/tuner-engine.js';
import { createNoteStream } from '../../core/tuner/note-stream.js';

// Chromatic, because the player may answer anywhere on the neck in any tuning, so
// the reading must not be forced onto a string of the current one. Octave repair
// is off for the same reason: it exists to stop a tuner jumping an octave on a
// single held note, and here an octave leap is a legitimate answer.
const engine = createTunerEngine({ mode: 'chromatic', smoother: { octaveRepair: false } });
const stream = createNoteStream();

let noteListeners = [];
let liveListeners = [];
let capturing = false;
let captured = [];

export function onPlayNote(listener) {
  noteListeners.push(listener);
  return () => { noteListeners = noteListeners.filter((entry) => entry !== listener); };
}

export function onPlayLive(listener) {
  liveListeners.push(listener);
  return () => { liveListeners = liveListeners.filter((entry) => entry !== listener); };
}

engine.onReading((reading) => {
  for (const listener of liveListeners) {
    listener({
      level: reading.signalLevel,
      label: reading.state === TUNER_STATES.ACTIVE ? reading.label : null,
      state: reading.state,
      error: reading.error ?? null,
    });
  }
  const note = stream.push(reading);
  if (!note || !capturing) return;
  captured.push(note);
  for (const listener of noteListeners) listener(note, captured.slice());
});

export function isListening() {
  return engine.running;
}

// Called from a click, so the permission prompt is tied to a gesture.
export async function startMic() {
  if (engine.running) return { ok: true };
  stream.reset();
  return engine.start();
}

export async function stopMic() {
  capturing = false;
  captured = [];
  stream.reset();
  if (engine.running) await engine.stop();
}

// Opens a fresh attempt: whatever is still ringing from the last one is not part
// of this answer.
export function armAttempt() {
  captured = [];
  capturing = true;
  stream.reset();
  engine.resetSmoothing();
}

// Waits for the room to fall quiet, so the question's own sound cannot be taken
// for an answer.
//
// The obvious way — wait for the playback promise — does not work: playInterval
// schedules the notes and returns, so awaiting it opens the microphone while the
// speakers are still talking. Nor is a fixed delay right, since how long a
// speaker takes to fall below the detector's floor depends on how loud it is and
// whether there are headphones in at all. So the level itself is the signal: it
// has to stay down for a moment before the answer is allowed to begin.
export function waitForQuiet({ level = 0.02, steadyMs = 260, minMs = 420, maxMs = 4000 } = {}) {
  if (!engine.running) return Promise.resolve();
  return new Promise((resolve) => {
    const started = performance.now();
    let quietSince = 0;
    const stop = onPlayLive((live) => {
      const now = performance.now();
      // Nothing counts as quiet before minMs: the first note of the question has
      // not even been scheduled to sound yet when this starts waiting.
      if (now - started < minMs) return;
      if (live.level > level) quietSince = 0;
      else if (!quietSince) quietSince = now;
      if ((quietSince && now - quietSince >= steadyMs) || now - started >= maxMs) {
        stop();
        resolve();
      }
    });
  });
}

export function pauseCapture() {
  capturing = false;
}

export function capturedNotes() {
  return captured.slice();
}
