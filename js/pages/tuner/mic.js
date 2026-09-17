import { detectPitch } from '../../core/pitch-detect.js';

const POLL_MS = 45;
// ~85 ms at 48 kHz, which is comfortably more than the two periods of the lowest
// string that the detector analyses.
const FFT_SIZE = 4096;

let audioContext = null;
let analyser = null;
let stream = null;
let buffer = null;
let pollHandle = null;

export function isSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(window.AudioContext || window.webkitAudioContext);
}

export function isListening() {
  return Boolean(stream);
}

// Requests the microphone and starts polling for pitch; `onReading` is called on
// an interval with the detector's { frequency, clarity, level } result. Returns a
// result object instead of throwing so callers can show a translated message for
// whichever failure occurred.
export async function startListening(onReading) {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Every one of these processes the signal in ways that hurt pitch
      // detection: gain control pumps, noise suppression eats sustained tones.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (error) {
    return { ok: false, reason: error?.name === 'NotAllowedError' ? 'denied' : 'error' };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  buffer = new Float32Array(analyser.fftSize);
  source.connect(analyser);

  const poll = () => {
    analyser.getFloatTimeDomainData(buffer);
    onReading(detectPitch(buffer, audioContext.sampleRate));
    pollHandle = window.setTimeout(poll, POLL_MS);
  };
  poll();
  return { ok: true };
}

export function stopListening() {
  window.clearTimeout(pollHandle);
  pollHandle = null;
  stream?.getTracks().forEach((track) => track.stop());
  if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
  audioContext = null;
  analyser = null;
  stream = null;
  buffer = null;
}
