// Microphone capture: permissions, AudioContext lifecycle and the worklet that
// cuts the stream into analysis frames. Knows nothing about pitch or about the UI.
//
// Failures are reported as a small set of reasons rather than raw exceptions, so
// callers can show a translated message for each without string-matching.

export const INPUT_ERRORS = {
  UNSUPPORTED: 'unsupported',
  INSECURE_CONTEXT: 'insecure-context',
  DENIED: 'denied',
  NO_DEVICE: 'no-device',
  IN_USE: 'in-use',
  WORKLET_FAILED: 'worklet-failed',
  ENGINE_FAILED: 'engine-failed',
};

const WORKLET_URL = new URL('./capture-processor.js', import.meta.url);

export function isSupported() {
  return Boolean(
    globalThis.navigator?.mediaDevices?.getUserMedia
    && (globalThis.AudioContext || globalThis.webkitAudioContext)
    && globalThis.AudioWorkletNode,
  );
}

// getUserMedia is only exposed over HTTPS and on localhost; saying so plainly
// beats a generic "permission denied" when someone opens the page over http://.
export function isSecure() {
  return globalThis.isSecureContext !== false;
}

export function createAudioInput(options = {}) {
  const frameSize = options.frameSize ?? 2048;
  const hopSize = options.hopSize ?? 512;

  let context = null;
  let stream = null;
  let source = null;
  let node = null;
  let onFrame = null;

  async function start(frameHandler) {
    if (!isSecure()) return { ok: false, reason: INPUT_ERRORS.INSECURE_CONTEXT };
    if (!isSupported()) return { ok: false, reason: INPUT_ERRORS.UNSUPPORTED };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Every one of these damages pitch detection: AGC pumps the level,
        // noise suppression eats sustained tones, echo cancellation filters.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (error) {
      return { ok: false, reason: reasonForGetUserMediaError(error), detail: error?.name };
    }

    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      context = new AudioContextClass({ latencyHint: 'interactive' });
      if (context.state === 'suspended') await context.resume();
    } catch (error) {
      await stop();
      return { ok: false, reason: INPUT_ERRORS.ENGINE_FAILED, detail: error?.message };
    }

    try {
      await context.audioWorklet.addModule(WORKLET_URL);
    } catch (error) {
      await stop();
      return { ok: false, reason: INPUT_ERRORS.WORKLET_FAILED, detail: error?.message };
    }

    try {
      source = context.createMediaStreamSource(stream);
      node = new AudioWorkletNode(context, 'tuner-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: { frameSize, hopSize },
      });
      onFrame = frameHandler;
      node.port.onmessage = (event) => {
        if (event.data?.type === 'frame' && onFrame) onFrame(event.data);
      };
      source.connect(node);
    } catch (error) {
      await stop();
      return { ok: false, reason: INPUT_ERRORS.ENGINE_FAILED, detail: error?.message };
    }

    return { ok: true, sampleRate: context.sampleRate, baseLatency: context.baseLatency ?? 0 };
  }

  async function stop() {
    onFrame = null;
    try { node?.port.postMessage({ type: 'stop' }); } catch { /* already gone */ }
    try { source?.disconnect(); } catch { /* already gone */ }
    try { node?.disconnect(); } catch { /* already gone */ }
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') {
      try { await context.close(); } catch { /* already closing */ }
    }
    context = null;
    stream = null;
    source = null;
    node = null;
  }

  return {
    start,
    stop,
    get sampleRate() { return context?.sampleRate ?? 0; },
    get running() { return Boolean(stream); },
  };
}

function reasonForGetUserMediaError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return INPUT_ERRORS.DENIED;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return INPUT_ERRORS.NO_DEVICE;
    case 'NotReadableError':
    case 'AbortError':
      return INPUT_ERRORS.IN_USE;
    default:
      return INPUT_ERRORS.ENGINE_FAILED;
  }
}
