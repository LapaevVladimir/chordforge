// Chord identifier: the fretboard, the name lookup and the instrument settings
// that feed them, without any of the studio page's arrangement features.
// The rendering and chord-analysis modules are shared with the studio page —
// they no-op on the elements that only exist there.
import * as Engine from '../../core/chord-engine.js';
import * as Audio from '../../core/guitar-audio.js';
import { clone, readJson } from '../../core/utils.js';
import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import {
  store, STANDARD, PRESETS, normalizeState, tuningFor,
  persistState, currentAnalysis, useStateKey,
} from '../builder/store.js';
import { render, renderBoard, findShape, closeVoicingModal } from '../builder/fretboard.js';
import { audio, showToast, updateSampleStatus, stopPlayback, setPlaybackTimer, setCurrentPlaybackState } from '../builder/playback.js';

const SHAPES_KEY = 'chordforge-shapes-v2';

const $ = (id) => document.getElementById(id);

// Own storage slot: identifying a chord must never overwrite the instrument the
// studio page has saved alongside its timeline.
useStateKey('chordforge-chords-v1');

onLocaleChange(() => {
  syncLocaleDock();
  render();
});

$('preset').addEventListener('change', (event) => {
  const preset = PRESETS[event.target.value];
  store.state = {
    ...clone(preset),
    capo: 0,
    preset: event.target.value,
    strumInterval: store.state.strumInterval,
    strumPattern: clone(store.state.strumPattern),
    volume: store.state.volume,
    attack: store.state.attack,
    release: store.state.release,
  };
  $('shapeInfo').classList.remove('show');
  render();
});
$('stringCount').addEventListener('input', (event) => {
  store.state.strings = Number(event.target.value);
  store.state.tuning = tuningFor(store.state.strings);
  store.state.shape = Array(store.state.strings).fill(0);
  store.state.preset = 'custom';
  render();
});
$('fretCount').addEventListener('input', (event) => { store.state.frets = Number(event.target.value); render(); });
$('capo').addEventListener('input', (event) => {
  store.state.capo = Number(event.target.value);
  store.state.shape = store.state.shape.map((position) => position !== null && position > 0 && position <= store.state.capo ? 0 : position);
  store.state.preset = 'custom';
  render();
});
$('resetTuning').addEventListener('click', () => { store.state.tuning = store.state.strings === 6 ? [...STANDARD] : tuningFor(store.state.strings); store.state.preset = 'custom'; render(); });
$('tuningDown').addEventListener('click', () => { store.state.tuning = store.state.tuning.map((pitch) => Engine.mod12(pitch - 1)); store.state.preset = 'custom'; render(); });
$('tuningUp').addEventListener('click', () => { store.state.tuning = store.state.tuning.map((pitch) => Engine.mod12(pitch + 1)); store.state.preset = 'custom'; render(); });
$('clear').addEventListener('click', () => { store.state.shape = Array(store.state.strings).fill(null); render(); });
$('allOpen').addEventListener('click', () => { store.state.shape = Array(store.state.strings).fill(0); render(); });
$('muteAll').addEventListener('click', () => { store.state.shape = Array(store.state.strings).fill(null); render(); });
$('findChord').addEventListener('click', () => findShape($('chordSearch').value));
$('chordSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') findShape(event.target.value); });
$('voicingModalClose').addEventListener('click', closeVoicingModal);
$('voicingModalOverlay').addEventListener('click', (event) => { if (event.target.id === 'voicingModalOverlay') closeVoicingModal(); });

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeVoicingModal();
  stopPlayback();
});

// A single strum of the chord as it stands, rather than the studio's repeating
// strum pattern — here the point is to hear what the shape sounds like.
$('playChord').addEventListener('click', async () => {
  if ($('playChord').classList.contains('playing')) { stopPlayback(); return; }
  const notes = Audio.soundingMidis(store.state.shape, store.state.tuning, store.state.capo, store.state.register);
  if (!notes.length) { showToast(t('builder.toast.noStringsOpen')); return; }
  stopPlayback();
  $('playLabel').textContent = t('common.loading');
  try {
    const duration = await audio.strum(notes, store.state.strings, store.state.strumInterval);
    updateSampleStatus();
    setCurrentPlaybackState(true);
    setPlaybackTimer(setTimeout(() => setCurrentPlaybackState(false), duration * 1000 + 250));
  } catch {
    setCurrentPlaybackState(false);
    updateSampleStatus();
    showToast(t('builder.toast.playbackFailed'));
  }
});

$('saveShape').addEventListener('click', () => {
  const shapes = readJson(SHAPES_KEY, []);
  shapes.unshift({ name: currentAnalysis().name, state: clone(store.state), date: Date.now() });
  localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes.slice(0, 30)));
  showToast(t('builder.toast.shapeSaved'));
});
$('copyLink').addEventListener('click', async () => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ instrument: store.state }))));
  history.replaceState(null, '', `${location.pathname}#${encoded}`);
  try { await navigator.clipboard.writeText(location.href); showToast(t('builder.toast.linkCopied')); }
  catch { showToast(t('builder.toast.linkInAddressBar')); }
});

bindThemeDock('midnight', { bloom: true });
bindLocaleDock();

function finishSiteIntro() {
  const loader = $('siteLoader');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reveal = () => {
    document.body.classList.remove('site-loading');
    document.body.classList.add('site-ready');
    loader.classList.add('is-leaving');
    setTimeout(() => loader.remove(), reduceMotion ? 20 : 850);
  };
  if (reduceMotion) reveal();
  else requestAnimationFrame(() => setTimeout(reveal, 1450));
}

i18nInit();
syncLocaleDock();

if (location.hash.length > 1) {
  try {
    const shared = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
    store.state = shared.instrument ?? shared;
  } catch { /* keep local data */ }
}

normalizeState();
applyTheme(localStorage.getItem(THEME_KEY), 'midnight');
render();
finishSiteIntro();

if (typeof ResizeObserver !== 'undefined') {
  const fretScroll = $('fretScroll');
  let fretViewportWidth = Math.round(fretScroll.clientWidth);
  let fretResizeTimer = null;
  new ResizeObserver((entries) => {
    const nextWidth = Math.round(entries[0].contentRect.width);
    if (Math.abs(nextWidth - fretViewportWidth) < 3) return;
    fretViewportWidth = nextWidth;
    clearTimeout(fretResizeTimer);
    fretResizeTimer = setTimeout(() => renderBoard({ stopAudio: false }), 70);
  }).observe(fretScroll);
}
