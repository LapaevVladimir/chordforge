import * as Engine from '../../core/chord-engine.js';
import * as Audio from '../../core/guitar-audio.js';
import { clone, readJson } from '../../core/utils.js';
import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, setLocale, getLocale, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import {
  store, STANDARD, PRESETS, SNAP_STEPS, makeTrack,
  normalizeState, normalizeTimeline, tuningFor,
  persistState, persistTimeline, currentAnalysis, currentChordPayload,
} from './store.js';
import { STRUM_ACTIONS, STRUM_PRESETS, resizePattern } from './strum.js';
import {
  render, renderBoard, renderStrumEditor, findShape,
  closeVoicingModal,
} from './fretboard.js';
import {
  renderTimeline, bindPointerDrop, addCurrentToTimeline, createClip, locateClip,
  setTimelineStartFromClientX, bindStartMarkerDrag, playTimeline,
  DEFAULT_CLIP_BEATS,
} from './timeline.js';
import {
  renderClipEditor, renderEnvelopeGraph, renderClipStrumEditor,
  closeClipEditor, copySelectedClip, duplicateSelectedClip, deleteSelectedClip,
  bindEnvelopeHandle, pasteClip,
} from './clip-editor.js';
import { audio, showToast, updateSampleStatus, stopPlayback, setPlaybackTimer, setCurrentPlaybackState } from './playback.js';

const $ = (id) => document.getElementById(id);

function syncLocaleDock() {
  const current = getLocale();
  document.querySelectorAll('[data-locale-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.localeOption === current));
  });
}

function bindLocaleDock() {
  document.querySelectorAll('[data-locale-option]').forEach((button) => {
    button.addEventListener('click', () => setLocale(button.dataset.localeOption));
  });
  syncLocaleDock();
}

onLocaleChange(() => {
  syncLocaleDock();
  render();
  renderTimeline();
  if (!$('clipEditorOverlay').hidden) renderClipEditor();
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
$('strumInterval').addEventListener('input', (event) => {
  store.state.strumInterval = Audio.normalizeStrumInterval(event.target.value);
  $('strumIntervalValue').textContent = store.state.strumInterval === 0 ? t('builder.strumInterval.together') : t('common.template.ms', { n: store.state.strumInterval });
  stopPlayback();
  persistState();
});
$('strumPattern').addEventListener('click', (event) => {
  const button = event.target.closest('[data-strum-step]');
  if (!button) return;
  const index = Number(button.dataset.strumStep);
  const currentIndex = STRUM_ACTIONS.indexOf(store.state.strumPattern[index]);
  store.state.strumPattern[index] = STRUM_ACTIONS[(currentIndex + 1) % STRUM_ACTIONS.length];
  stopPlayback();
  renderStrumEditor(index);
  persistState();
});
$('strumStepCount').addEventListener('change', (event) => {
  store.state.strumPattern = resizePattern(store.state.strumPattern, event.target.value);
  stopPlayback();
  renderStrumEditor();
  persistState();
});
document.querySelectorAll('[data-strum-preset]').forEach((button) => button.addEventListener('click', () => {
  store.state.strumPattern = clone(STRUM_PRESETS[button.dataset.strumPreset]);
  stopPlayback();
  renderStrumEditor();
  persistState();
}));
$('chordRelease').addEventListener('input', (event) => {
  store.state.release = Audio.normalizeRelease(event.target.value);
  $('chordReleaseValue').textContent = t('common.template.seconds', { n: store.state.release.toFixed(2) });
  stopPlayback();
  persistState();
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
$('clipEditorClose').addEventListener('click', closeClipEditor);
$('clipEditorDone').addEventListener('click', closeClipEditor);
$('clipEditorOverlay').addEventListener('click', (event) => { if (event.target.id === 'clipEditorOverlay') closeClipEditor(); });
$('copyClip').addEventListener('click', () => copySelectedClip());
$('duplicateClip').addEventListener('click', duplicateSelectedClip);
$('deleteClipEditor').addEventListener('click', deleteSelectedClip);
$('clipVolume').addEventListener('input', (event) => {
  const found = locateClip(store.selectedClipId);
  if (!found) return;
  found.clip.instrument.volume = Audio.normalizeVolume(Number(event.target.value) / 100);
  $('clipVolumeValue').textContent = t('common.template.percent', { n: Math.round(found.clip.instrument.volume * 100) });
  stopPlayback();
  persistTimeline();
  renderEnvelopeGraph();
  document.querySelector(`[data-clip-id="${found.clip.id}"]`)?.style.setProperty('--clip-volume', found.clip.instrument.volume);
});
$('clipAttack').addEventListener('input', (event) => {
  const found = locateClip(store.selectedClipId);
  if (!found) return;
  found.clip.instrument.attack = Audio.normalizeAttack(event.target.value);
  $('clipAttackValue').textContent = t('common.template.seconds', { n: found.clip.instrument.attack.toFixed(2) });
  stopPlayback();
  persistTimeline();
  renderEnvelopeGraph();
});
$('clipRelease').addEventListener('input', (event) => {
  const found = locateClip(store.selectedClipId);
  if (!found) return;
  found.clip.instrument.release = Audio.normalizeRelease(event.target.value);
  $('clipReleaseValue').textContent = t('common.template.seconds', { n: found.clip.instrument.release.toFixed(2) });
  stopPlayback();
  persistTimeline();
  renderEnvelopeGraph();
});
$('clipDurationEditor').addEventListener('input', (event) => {
  const found = locateClip(store.selectedClipId);
  const duration = Number(event.target.value);
  if (!found || !Number.isFinite(duration) || duration < 0.1) return;
  found.clip.duration = Math.max(0.1, Math.round(duration * 100) / 100);
  stopPlayback();
  persistTimeline();
  renderTimeline();
  renderEnvelopeGraph();
});
$('clipDurationEditor').addEventListener('change', (event) => {
  const found = locateClip(store.selectedClipId);
  if (!found) return;
  found.clip.duration = Math.max(0.1, Math.round((Number(event.target.value) || found.clip.duration) * 100) / 100);
  event.target.value = String(found.clip.duration.toFixed(2)).replace(/\.?0+$/, '');
  persistTimeline();
  renderTimeline();
  renderEnvelopeGraph();
});
$('clipStrumStepCount').addEventListener('change', (event) => {
  const found = locateClip(store.selectedClipId);
  if (!found) return;
  found.clip.instrument.strumPattern = resizePattern(found.clip.instrument.strumPattern, event.target.value);
  stopPlayback();
  persistTimeline();
  renderClipStrumEditor();
  renderTimeline();
});
$('clipStrumPattern').addEventListener('click', (event) => {
  const button = event.target.closest('[data-clip-strum-step]');
  const found = locateClip(store.selectedClipId);
  if (!button || !found) return;
  const index = Number(button.dataset.clipStrumStep);
  const currentIndex = STRUM_ACTIONS.indexOf(found.clip.instrument.strumPattern[index]);
  found.clip.instrument.strumPattern[index] = STRUM_ACTIONS[(currentIndex + 1) % STRUM_ACTIONS.length];
  stopPlayback();
  persistTimeline();
  renderClipStrumEditor(index);
  renderTimeline();
});
bindEnvelopeHandle('clipAttackHandle', 'attack');
bindEnvelopeHandle('clipVolumeHandle', 'volume');
bindEnvelopeHandle('clipReleaseHandle', 'release');

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeVoicingModal();
    closeClipEditor();
    stopPlayback();
    return;
  }
  const editing = event.target.matches?.('input, textarea, select, [contenteditable="true"]');
  if (editing || !(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 'c' && store.selectedClipId) {
    event.preventDefault();
    copySelectedClip();
  }
  if (event.key.toLowerCase() === 'v' && !event.shiftKey) {
    event.preventDefault();
    pasteClip();
  }
});

$('playChord').addEventListener('click', async () => {
  if ($('playChord').classList.contains('playing')) { stopPlayback(); return; }
  const notes = Audio.soundingMidis(store.state.shape, store.state.tuning, store.state.capo, store.state.register);
  if (!notes.length) { showToast(t('builder.toast.noStringsOpen')); return; }
  stopPlayback();
  $('playLabel').textContent = t('common.loading');
  try {
    const duration = await audio.playPattern(notes, store.state.strings, store.state.strumPattern, {
      bpm: store.timeline.bpm,
      beats: DEFAULT_CLIP_BEATS,
      intervalMs: store.state.strumInterval,
      volume: store.state.volume,
      attack: store.state.attack,
      release: store.state.release,
    });
    updateSampleStatus();
    setCurrentPlaybackState(true);
    setPlaybackTimer(setTimeout(() => setCurrentPlaybackState(false), duration * 1000 + 250));
  } catch {
    setCurrentPlaybackState(false);
    updateSampleStatus();
    showToast(t('builder.toast.playbackFailed'));
  }
});
$('currentChordDrag').addEventListener('dragstart', (event) => {
  store.dragPayload = { type: 'current', payload: currentChordPayload() };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-chordforge-current', '1');
  event.dataTransfer.setData('text/plain', 'current-chord');
});
$('currentChordDrag').addEventListener('dragend', () => { store.dragPayload = null; });
bindPointerDrop($('currentChordDrag'), (event, lane, start) => {
  const destination = store.timeline.tracks.find((track) => track.id === lane.dataset.trackLane);
  if (!destination) return;
  destination.clips.push(createClip(currentChordPayload(), start));
  persistTimeline();
  renderTimeline();
}, {
  duration: () => DEFAULT_CLIP_BEATS,
  name: () => currentAnalysis().name,
});
$('currentChordDrag').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addCurrentToTimeline(); } });
$('addCurrentToTimeline').addEventListener('click', addCurrentToTimeline);
$('addTrack').addEventListener('click', () => { store.timeline.tracks.push(makeTrack()); persistTimeline(); renderTimeline(); });
$('pasteClip').addEventListener('click', pasteClip);
$('timelineSnap').addEventListener('change', (event) => {
  const step = Number(event.target.value);
  store.timeline.snapStep = SNAP_STEPS.includes(step) ? step : 0;
  persistTimeline();
  renderTimeline();
  showToast(store.timeline.snapStep ? t('builder.toast.snapSet', { label: event.target.selectedOptions[0].textContent }) : t('builder.toast.snapOff'));
});
$('timelineBpm').addEventListener('change', (event) => {
  store.timeline.bpm = Math.max(40, Math.min(240, Math.round(Number(event.target.value) || 100)));
  stopPlayback();
  persistTimeline();
  renderTimeline();
});
$('timelineRuler').addEventListener('pointerdown', (event) => {
  if (event.button === 0) setTimelineStartFromClientX(event.clientX);
});
$('timelineStartMarker').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const step = store.timeline.snapStep || 0.1;
  store.timeline.startBeat = Math.max(0, Math.round((store.timeline.startBeat + (event.key === 'ArrowRight' ? step : -step)) * 1000) / 1000);
  stopPlayback();
  persistTimeline();
  renderTimeline();
  $('timelineStartMarker').focus();
});
bindStartMarkerDrag();
$('playTimeline').addEventListener('click', playTimeline);
bindThemeDock('midnight', { bloom: true });
bindLocaleDock();
$('saveShape').addEventListener('click', () => {
  const shapes = readJson('chordforge-shapes-v2', []);
  shapes.unshift({ name: currentAnalysis().name, state: clone(store.state), date: Date.now() });
  localStorage.setItem('chordforge-shapes-v2', JSON.stringify(shapes.slice(0, 30)));
  showToast(t('builder.toast.shapeSaved'));
});
$('copyLink').addEventListener('click', async () => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ instrument: store.state, timeline: store.timeline }))));
  history.replaceState(null, '', `${location.pathname}#${encoded}`);
  try { await navigator.clipboard.writeText(location.href); showToast(t('builder.toast.linkCopied')); }
  catch { showToast(t('builder.toast.linkInAddressBar')); }
});

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
    if (shared.instrument) {
      store.state = shared.instrument;
      if (shared.timeline) store.timeline = shared.timeline;
    } else store.state = shared;
  } catch { /* keep local data */ }
}

normalizeState();
normalizeTimeline();
applyTheme(localStorage.getItem(THEME_KEY), 'midnight');
render();
renderTimeline();
persistTimeline();
finishSiteIntro();
if (typeof ResizeObserver !== 'undefined') {
  const fretScroll = $('fretScroll');
  let fretViewportWidth = Math.round(fretScroll.clientWidth);
  let fretResizeTimer = null;
  const fretObserver = new ResizeObserver((entries) => {
    const nextWidth = Math.round(entries[0].contentRect.width);
    if (Math.abs(nextWidth - fretViewportWidth) < 3) return;
    fretViewportWidth = nextWidth;
    clearTimeout(fretResizeTimer);
    fretResizeTimer = setTimeout(() => renderBoard({ stopAudio: false }), 70);
  });
  fretObserver.observe(fretScroll);
}
