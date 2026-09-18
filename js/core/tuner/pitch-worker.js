// Dedicated worker running YIN, so neither the realtime audio thread nor the UI
// thread ever carries the O(tauMax * window) difference function.
import { createYinDetector } from '../pitch/yin.js';

let detector = null;

self.onmessage = (event) => {
  const message = event.data;
  if (!message) return;

  if (message.type === 'configure') {
    detector = createYinDetector(message.options);
    self.postMessage({
      type: 'ready',
      tauMin: detector.tauMin,
      tauMax: detector.tauMax,
      bufferSize: detector.bufferSize,
    });
    return;
  }

  if (message.type === 'frame' && detector) {
    const startedAt = performance.now();
    const result = detector.detect(message.samples);
    self.postMessage({
      type: 'pitch',
      frequency: result.frequency,
      clarity: result.clarity,
      rms: result.rms,
      peak: result.peak,
      time: message.time,
      computeMs: performance.now() - startedAt,
    });
  }
};
