// AudioWorkletProcessor: runs on the realtime audio thread, so it does as little
// as possible — fill a ring buffer, and every `hopSize` samples hand a whole
// analysis frame to the main thread. Pitch detection itself happens in a worker.
//
// This file is loaded with AudioWorklet.addModule and therefore cannot import
// anything: the worklet global scope has no module resolution, no fetch and no
// DOM. It is intentionally self-contained.

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    this.frameSize = settings.frameSize || 2048;
    this.hopSize = settings.hopSize || 512;
    this.ring = new Float32Array(this.frameSize);
    this.writeIndex = 0;
    this.sinceLastHop = 0;
    this.filled = 0;
    this.running = true;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'stop') this.running = false;
    };
  }

  process(inputs) {
    if (!this.running) return false;
    const input = inputs[0];
    if (!input || !input.length) return true;
    const channel = input[0];
    if (!channel) return true;

    const { ring, frameSize } = this;
    for (let i = 0; i < channel.length; i += 1) {
      ring[this.writeIndex] = channel[i];
      this.writeIndex = (this.writeIndex + 1) % frameSize;
      if (this.filled < frameSize) this.filled += 1;
      this.sinceLastHop += 1;

      if (this.sinceLastHop >= this.hopSize && this.filled >= frameSize) {
        this.sinceLastHop = 0;
        // Unwrap the ring into a contiguous, chronologically ordered frame and
        // transfer it, so no copy is made on the way to the worker.
        const frame = new Float32Array(frameSize);
        const start = this.writeIndex;
        const firstPart = frameSize - start;
        frame.set(ring.subarray(start), 0);
        frame.set(ring.subarray(0, start), firstPart);
        this.port.postMessage({ type: 'frame', samples: frame, time: currentTime }, [frame.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('tuner-capture', CaptureProcessor);
