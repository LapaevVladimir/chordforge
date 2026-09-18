// Runs YIN off the main thread. Prefers a module worker; if the browser refuses
// to create one, it falls back to detecting in-process — still off the realtime
// audio thread, just without the extra isolation.
import { createYinDetector } from '../pitch/yin.js';

const WORKER_URL = new URL('./pitch-worker.js', import.meta.url);

export function createPitchAnalyzer(options) {
  let worker = null;
  let inlineDetector = null;
  let handler = null;

  try {
    worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data?.type === 'pitch' && handler) handler(event.data);
    };
    worker.onerror = () => {
      // A worker that dies mid-session must not silently stop the tuner.
      worker?.terminate();
      worker = null;
      inlineDetector = createYinDetector(options);
    };
    worker.postMessage({ type: 'configure', options });
  } catch {
    worker = null;
    inlineDetector = createYinDetector(options);
  }

  function onPitch(callback) { handler = callback; }

  function push(frame) {
    if (worker) {
      worker.postMessage({ type: 'frame', samples: frame.samples, time: frame.time }, [frame.samples.buffer]);
      return;
    }
    if (!inlineDetector) inlineDetector = createYinDetector(options);
    const startedAt = performance.now();
    const result = inlineDetector.detect(frame.samples);
    handler?.({
      type: 'pitch',
      frequency: result.frequency,
      clarity: result.clarity,
      rms: result.rms,
      peak: result.peak,
      time: frame.time,
      computeMs: performance.now() - startedAt,
    });
  }

  function dispose() {
    handler = null;
    worker?.terminate();
    worker = null;
    inlineDetector = null;
  }

  return { onPitch, push, dispose, get usingWorker() { return Boolean(worker); } };
}
