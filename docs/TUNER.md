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
                     │ clarity gate → octave repair → outlier reject → median → weighted EMA
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

**Clarity is a weight, not just a gate.** The same sweep, bucketed more finely,
shows how much an estimate is worth across the band above the gate:

| clarity | frames | median error | 90th pct | 99th pct |
|---|---|---|---|---|
| 0.84 | 519 | 9.4 cents | 1200 | 2399 |
| 0.86 | 462 | 7.7 | 21.5 | 33.5 |
| 0.90 | 546 | 4.0 | 15.1 | 30.1 |
| 0.94 | 903 | 2.2 | 8.2 | 15.8 |
| 0.96 | 1776 | 1.1 | 3.8 | 8.2 |
| 0.98 | 4569 | 0.42 | 1.04 | 2.94 |

Two things follow. The floor stays at 0.90, because 0.84 and below is where
octave errors live and no amount of filtering survives a 1200-cent outlier. But a
0.91 frame is roughly ten times worse than a 0.98 one, so treating them alike is
what made the last digit dance on a decaying note. Frames between 0.90 and
**0.97** now move the estimate by a quadratically reduced fraction of the normal
step, down to 12% at the floor — never zero, because a quietly played string
lives in that band and still has to follow the peg.

**Median of 9, then a weighted EMA** (base alpha 0.15, scaled by the trust weight
above; a jump greater than 0.6 semitones snaps instead). Smoothing runs in
semitone space, so tolerances mean the same thing at E2 as at E4. Measured on a
decaying low E, this cuts the spread of the displayed value from 4.9 cents
standard deviation to 3.2, and roughly halves how often the number changes.
The cost is about 250 ms of lag while a peg is actually turning.

**Whole cents on screen.** The 90th-percentile error is around a cent, so a
tenths digit would be displaying noise. The readout rounds, with a 0.65-cent
hysteresis band so a value sitting on a boundary does not flicker between two
numbers, and the frequency shows one decimal for the same reason: 0.01 Hz at the
low E is a fifth of a cent.

**Half a second to earn a tick.** A string is only marked done after it has held
its pitch inside the in-tune window for a continuous 500 ms of *live* frames at
clarity 0.93 or better. Coasting frames from the hold window do not count, so a
note that has already died away cannot finish the countdown, and a gap longer
than 150 ms starts the count over. A door closing or a neighbouring string
ringing sympathetically can land in tune for a moment; a tick is supposed to mean
more than that.

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
