# ChordForge

A set of guitar tools that run in the browser: a microphone tuner, a chord
identifier, an interval and scale map, and an ear-training quiz. It is a static
site — no dependencies, no build step, no framework. Every page loads one ES
module and the browser resolves the rest.

## The pages

| Page | What it does |
|---|---|
| [index.html](index.html) | Landing page: what the four tools are and where they live. |
| [tuner.html](tuner.html) | Microphone tuner. Guitar mode measures against the strings of the current tuning, automatically or one string you pin by hand; chromatic mode names whatever it hears. Built on a YIN pitch detector running off the UI thread — see [docs/TUNER.md](docs/TUNER.md). |
| [chords.html](chords.html) | Chord identifier. Press frets and the chord names itself, or search by name and pick from the voicings — full barre and compact shapes, up the neck. |
| [training-learn.html](training-learn.html) | Three maps of the neck: every position of a chosen interval from a note you pick, any of eight scales laid out by position with the degrees marked, and the whole fretboard with every note named. |
| [training-quiz.html](training-quiz.html) | Interval quiz, on the neck or by ear. |

`studio.html` is the older combined builder — chord editing plus a multi-track
timeline with per-clip strum patterns and envelopes. It still works and shares
most of its code with the chord identifier, but it is unfinished and is not
linked from the landing page.

## What is in it

- **46 chord qualities** with aliases, inversions and a search that only offers
  shapes a hand can actually hold: fingers and stretch are counted, and a barre
  that an open string would have to ring through is counted as the several
  fingers it really costs.
- **13 intervals** and **8 scales** (major, natural minor, both pentatonics,
  blues, dorian, mixolydian, harmonic minor), with positions derived from the
  scale rather than hard-coded, so they hold for any root and any tuning.
- **Real recorded samples**, not a synthesiser: 35 acoustic guitar notes from
  E2 to D5, pitch-shifted to fill the gaps between them.
- **Russian and English**, switchable live and remembered. English is the base
  language — it is what the markup says before any dictionary is applied.
- **Six themes**, also remembered.
- **Built for a phone as well as a desk**: navigation becomes a bar fixed to
  the bottom of the screen, and the fretboards can be turned upright, the way
  chord diagrams are drawn.

## Running it

A plain static site, but it has to be served over HTTP rather than opened as a
`file://` URL — the pages are ES modules, and the tuner's microphone needs a
secure context (`localhost` counts).

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Layout

```
*.html                   One page each, one module each
css/                     styles.css is the shared design system;
                         home/tuner/training add what only they need
js/
  core/                  No DOM, no page knowledge, reusable anywhere:
    chord-engine.js        chord theory — naming, parsing, shape generation
    scales.js              scale theory and neck positions
    tuning.js              tunings and pitch classes
    guitar-audio.js        sample loading, playback, strums, timelines
    theme.js               themes
    board-orientation.js   the upright-neck toggle
    utils.js
    pitch/                 note maths, the YIN detector, smoothing, a test-signal
                           generator used by the tuner's accuracy self-test
    tuner/                 microphone capture, the worklet, the pitch worker and
                           TunerEngine, which knows nothing about the UI
  i18n/                  Translation engine and the ru/en dictionaries
  pages/
    home/ tuner/ chords/ training/ builder/
                         Page modules. builder/ is shared by chords.html and
                         studio.html; training/ by both training pages.
assets/                  Fretboard texture and the guitar samples (embedded/
                         holds base64 copies, used only on a file:// origin)
docs/TUNER.md            How the tuner works and why it is built that way
```

The engines in `js/core/` are meant to be used from anywhere: `TunerEngine`
emits readings to whatever subscribes, `chord-engine.js` and `scales.js` return
data rather than markup, and none of them import anything from `js/pages/`.

## Credits

The acoustic guitar samples in `assets/samples/` are from the
[tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)
project (original recordings by the University of Iowa Electronic Music
Studios), licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). See
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) for details.
