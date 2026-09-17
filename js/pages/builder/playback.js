import * as Audio from '../../core/guitar-audio.js';
import { t } from '../../i18n/i18n.js';
import { store } from './store.js';

export const audio = new Audio.GuitarEngine();

let playbackTimer = null;
let timelineFrame = null;

export function setPlaybackTimer(id) { playbackTimer = id; }
export function setTimelineFrame(id) { timelineFrame = id; }

export function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2300);
}

export function updateSampleStatus() {
  const status = audio.getSampleStatus();
  const indicator = document.getElementById('sampleStatus');
  const label = indicator.querySelector('span');
  if (status.failed) {
    indicator.dataset.state = 'error';
    label.textContent = t('builder.sampleStatus.error');
  } else if (status.loading) {
    indicator.dataset.state = 'loading';
    label.textContent = t('builder.sampleStatus.loadingCount', { n: status.loading });
  } else if (status.loaded) {
    indicator.dataset.state = 'ready';
    label.textContent = t('builder.sampleStatus.ready', { n: status.loaded });
  } else {
    indicator.dataset.state = 'loading';
    label.textContent = t('builder.sampleStatus.loading');
  }
}

export function setCurrentPlaybackState(playing) {
  document.getElementById('playChord').classList.toggle('playing', playing);
  document.getElementById('playChord').setAttribute('aria-label', t(playing ? 'builder.play.stopAria' : 'builder.play.chordAria'));
  document.getElementById('playLabel').textContent = t(playing ? 'common.stop' : 'common.listen');
}

// No-ops on pages without a timeline (the chord identifier reuses this module).
export function setTimelinePlaybackState(playing) {
  const button = document.getElementById('playTimeline');
  if (!button) return;
  button.classList.toggle('playing', playing);
  document.getElementById('timelinePlayLabel').textContent = t(playing ? 'common.stop' : 'builder.timeline.start');
  button.querySelector('span').textContent = playing ? '■' : '▶';
}

export function stopPlayback() {
  audio.stop();
  clearTimeout(playbackTimer);
  cancelAnimationFrame(timelineFrame);
  playbackTimer = null;
  timelineFrame = null;
  setCurrentPlaybackState(false);
  setTimelinePlaybackState(false);
  const playhead = document.getElementById('timelinePlayhead');
  if (playhead) {
    playhead.hidden = true;
    playhead.style.transform = 'translateX(0)';
  }
  document.querySelectorAll('.timeline-clip.is-playing').forEach((clip) => clip.classList.remove('is-playing'));
}

export async function playString(stringIndex) {
  const state = store.state;
  const note = Audio.soundingMidis(state.shape, state.tuning, state.capo, state.register)
    .find((candidate) => candidate.stringIndex === stringIndex);
  if (!note) {
    audio.stopString(stringIndex);
    return;
  }
  try {
    await audio.pluck(note, state.strings);
    updateSampleStatus();
  } catch {
    updateSampleStatus();
    showToast(t('builder.toast.sampleLoadFailed'));
  }
}
