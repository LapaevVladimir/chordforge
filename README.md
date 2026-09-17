# ChordForge

An interactive guitar chord builder and multi-track chord sequencer, plus a
companion interval trainer, built as a static site with no build step.

- **Builder** ([index.html](index.html)) — build chords on an interactive fretboard,
  search for a chord by name to see voicing options, arrange chords on a
  multi-track timeline with per-clip volume/attack/release and strum patterns,
  and play everything back with real recorded guitar samples.
- **Learn** ([training-learn.html](training-learn.html)) — pick an interval and
  click any note on the neck to see every matching position, with a
  customizable tuning and ascending/descending/harmonic playback.
- **Practice** ([training-quiz.html](training-quiz.html)) — a quiz that drills
  recognizing intervals visually on the neck or by ear.

The whole app is available in Russian and English, with a live language
switcher (🇷🇺/EN) that persists across visits.

## Running locally

This is a plain static site — no dependencies, no build step. Because the
audio samples are loaded with `fetch()`, it needs to be served over HTTP
rather than opened directly as a `file://` URL:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Project structure

```
index.html               Chord builder page
training-learn.html      Interval map / "Learn" page
training-quiz.html       Interval trainer / "Practice" page
css/                     Stylesheets (shared design system + page-specific)
js/
  core/                  Framework-agnostic logic: chord theory, audio engine,
                         shared utils and theming — no DOM/page dependencies
  i18n/                  Translation engine + ru/en dictionaries
  pages/
    builder/             Chord builder page modules (state, fretboard,
                         timeline, clip editor, strum editor, playback)
    training/            Learn/Practice page modules (board rendering,
                         interval data, learn/quiz logic, playback)
assets/                  Fretboard texture + recorded guitar samples
```

Each page loads a single `<script type="module">` entry point
(`js/pages/builder/main.js`, `js/pages/training/main-learn.js`,
`js/pages/training/main-quiz.js`); everything else is imported by that entry
module. There's no bundler — modules are served and resolved by the browser
as-is.

## Credits

The acoustic guitar samples in `assets/samples/` are from the
[tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)
project (original recordings by the University of Iowa Electronic Music
Studios), licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). See
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) for details.
