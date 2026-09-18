# Tuner engine

Realtime pitch detection for ChordForge. The engine is UI-agnostic: `tuner.html`
is one consumer, and any other page can import `js/core/tuner/tuner-engine.js`,
subscribe with `onReading` and render the result however it likes.

## Pipeline

```
getUserMedia ─► AudioWorklet (capture-processor.js)   realtime audio thread
                     │ frames of 3072 samples, every 512
                     ▼
               Worker (pitch-worker.js) ─► YIN (pitch/yin.js)
                     │ { frequency, clarity, rms, peak }
                     ▼
               PitchSmoother (pitch/smoother.js)
                     │ clarity gate → octave repair → outlier reject → median → adaptive EMA
                     ▼
               note detection (pitch/note.js)  midi / name / octave / target / cents
                     ▼
               TunerEngine ─► reading ─► UI
```

Three threads, on purpose. The audio thread only copies samples into a ring
buffer; the O(tauMax x window) difference function runs in a worker; the main
thread only paints. Nothing blocks the UI, and nothing heavy runs on the
realtime thread where it would cause dropouts.

## Why YIN, and why not aubio

The brief asked for aubio, preferably `yin`/`yinfft`. aubio was evaluated
properly rather than dismissed — `aubiojs` 0.2.1 (the WASM build) was downloaded
and run in this project. Findings:

| | result |
|---|---|
| Loads on the main thread | yes |
| Loads in a Worker | yes, via `importScripts` with an absolute URL |
| Loads in an AudioWorklet | **no** — that scope has no `importScripts`, `fetch`, `XMLHttpRequest` or `atob`, which the emscripten glue needs to decode its embedded wasm |
| Accuracy of `yin` vs the implementation here | identical to 0.01 cents on every string, pure and plucked |
| Accuracy of `yinfft` | markedly worse in this range: +169 cents on a pure E2, +6.9 on E4 |
| Size | 209 KB of JS with the wasm inlined as a data URI |
| Licence | aubio is **GPL-3.0** |

The decisive points are the last two rows. `yin` and this implementation agree
to a hundredth of a cent, so there is no accuracy argument for the dependency —
and taking it on would put the whole public repository under GPL-3, since the
compiled artifact contains aubio's GPL code regardless of the MIT notice on the
`aubiojs` wrapper repo. `yinfft`, the variant the brief preferred, was the worst
of the three here; its spectral weighting is tuned for general audio rather than
for a single low-pitched string.

So the algorithm is the one that was asked for — YIN, de Cheveigné & Kawahara
(2002), steps 1-5 including parabolic interpolation — implemented directly, with
no dependency and no licence entanglement. If aubio is ever wanted anyway, the
worker is the place it fits: `pitch-worker.js` is the only file that would change.

Peak-picking an FFT was never a candidate. On a plucked steel string the second
or third partial routinely out-powers the fundamental, so the tallest spectral
peak is often an octave or a twelfth above the note being played.

## Parameters, and how they were chosen

All measured in-browser with synthetic signals whose partial series has a
*weaker* fundamental than its upper partials, plus per-partial decay, string
inharmonicity and broadband noise.

**Frame size 3072** (64 ms at 48 kHz). Under a deliberately quiet, noisy test
condition: 1024 samples failed to detect E2 at all, 2048 managed 55% of frames
at ~12 cents, 3072 reached 75% at ~4.5 cents, and 4096 bought nothing further
while costing 21 ms more latency. The low E is the binding constraint — YIN needs
roughly two periods of the note in its integration window, and E2's period is
582 samples.

**Hop 512** (10.7 ms): a new estimate ~94 times a second, independent of frame
length.

**Clarity gate 0.9.** Estimates were bucketed by clarity across a sweep of levels
and noise floors. At 0.9 and above the median error was 0.57 cents and the 90th
percentile 3.67. Every bucket below 0.9 contained octave errors of 1200-2400
cents. The gate is therefore a real discriminator, not a guess.

**Median of 5, then adaptive EMA** (alpha 0.25 steady, 1.0 on a jump greater than
0.6 semitones). Smoothing runs in semitone space, so tolerances mean the same
thing at E2 as at E4. The adaptive step is what keeps a string change snappy
while a held note stays still.

## Measured accuracy

Full pipeline, synthetic plucked tones with decay, noise and inharmonicity:

| signal | median error |
|---|---|
| E2 82.4069 Hz | +0.98 cents |
| A2 110.0000 Hz | +0.74 |
| D3 146.8324 Hz | +0.66 |
| G3 195.9977 Hz | +0.43 |
| B3 246.9417 Hz | +0.70 |
| E4 329.6276 Hz | +0.41 |

Detuned low E tracked within ~1 cent of truth at -10, -5, 0, +5 and +10 cents.
On a perfectly harmonic tone the error is under 0.02 cents; the ~1 cent seen
above is dominated by string inharmonicity, which pushes a real string's partials
sharp of exact multiples. aubio's `yin` shows the same offset on the same
signals, so it is physics rather than implementation.

These numbers come from generated signals. They are not a claim about accuracy
through a particular microphone in a particular room — run the in-app "check
accuracy" panel, and trust a real guitar over any of it.

## Known limits

- Requires AudioWorklet and a secure context (HTTPS or localhost). Browsers
  without it get a clear message rather than a degraded main-thread fallback.
- One note at a time. A strummed chord is not decomposed; YIN reports a single
  fundamental and the clarity gate usually rejects the frame instead.
- Inharmonicity bias is real and not compensated. Doing so would need a per-string
  stiffness estimate, which is the main avenue left for more accuracy.
- The worker is a module worker. If a browser refuses to create one,
  `pitch-analyzer.js` falls back to detecting on the main thread — still off the
  audio thread, but without the isolation.
