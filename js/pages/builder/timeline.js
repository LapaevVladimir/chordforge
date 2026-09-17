import * as Audio from '../../core/guitar-audio.js';
import { clamp, clone, escapeHtml } from '../../core/utils.js';
import { t } from '../../i18n/i18n.js';
import { store, uid, SNAP_STEPS, normalizeInstrument, currentChordPayload, persistTimeline, makeTrack } from './store.js';
import { STRUM_ICONS } from './strum.js';
import { audio, stopPlayback, showToast, updateSampleStatus, setTimelinePlaybackState, setTimelineFrame } from './playback.js';
import { openClipEditor, closeClipEditor, renderClipEditor } from './clip-editor.js';

export const BEAT_WIDTH = 72;
const MIN_TIMELINE_BEATS = 32;
const TIMELINE_GROWTH_BEATS = 16;
export const MIN_CLIP_BEATS = 0.1;
const DURATION_PRECISION = 100;
export const DEFAULT_CLIP_BEATS = 4;

export function snapTimelineBeat(value) {
  const beat = Number(value) || 0;
  const step = Number(store.timeline.snapStep) || 0;
  if (!step) return Math.round(beat * DURATION_PRECISION) / DURATION_PRECISION;
  return Math.round(Math.round(beat / step) * step * 1000) / 1000;
}

export function preciseDuration(value, fallback = DEFAULT_CLIP_BEATS) {
  const duration = Number(value);
  const safeDuration = Number.isFinite(duration) ? duration : fallback;
  return Math.max(MIN_CLIP_BEATS, Math.round(safeDuration * DURATION_PRECISION) / DURATION_PRECISION);
}

export function formatDuration(value) {
  return preciseDuration(value).toFixed(2).replace(/\.?0+$/, '');
}

export function timelineBeatCount(extraEnd = 0) {
  const timeline = store.timeline;
  const contentEnd = timeline.tracks.reduce((trackMaximum, track) => Math.max(
    trackMaximum,
    track.clips.reduce((clipMaximum, clip) => Math.max(clipMaximum, clip.start + clip.duration), 0),
  ), Math.max(0, extraEnd, timeline.startBeat));
  return Math.max(MIN_TIMELINE_BEATS, Math.ceil((contentEnd + 8) / TIMELINE_GROWTH_BEATS) * TIMELINE_GROWTH_BEATS);
}

export function createClip(payload, start) {
  return {
    id: uid('clip'),
    name: payload.name,
    start: Math.max(0, snapTimelineBeat(start)),
    duration: DEFAULT_CLIP_BEATS,
    instrument: clone(payload.instrument),
  };
}

export function locateClip(clipId) {
  for (const track of store.timeline.tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return null;
}

export function selectedClip() {
  return store.selectedClipId ? locateClip(store.selectedClipId) : null;
}

export function syncPasteButton() {
  const validClipboard = Boolean(store.clipClipboard?.instrument && normalizeInstrument(store.clipClipboard.instrument));
  document.getElementById('pasteClip').disabled = !validClipboard;
}

function dropBeat(event, lane, pointerOffset = 0) {
  const rect = lane.getBoundingClientRect();
  return Math.max(0, snapTimelineBeat((event.clientX - rect.left - pointerOffset) / BEAT_WIDTH));
}

function createTimelineDragGhost(name, duration) {
  const ghost = document.createElement('div');
  ghost.className = 'timeline-drag-ghost';
  ghost.style.width = `${Math.max(MIN_CLIP_BEATS, duration) * BEAT_WIDTH}px`;
  ghost.innerHTML = `<span>${escapeHtml(name)}</span><small>${t('common.template.beats', { n: formatDuration(duration) })}</small>`;
  return ghost;
}

export function bindPointerDrop(element, onDrop, options = {}) {
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (options.ignoreSelector && event.target.closest(options.ignoreSelector))) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const elementRect = element.getBoundingClientRect();
    const duration = Number(options.duration?.()) || DEFAULT_CLIP_BEATS;
    const pointerOffset = options.keepPointerOffset
      ? clamp(event.clientX - elementRect.left, 10, duration * BEAT_WIDTH - 10)
      : 22;
    const wasDraggable = element.draggable;
    let active = false;
    let hoveredLane = null;
    let previewStart = 0;
    let ghost = null;
    element.draggable = false;

    const move = (moveEvent) => {
      if (!active && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
      if (!active) {
        ghost = createTimelineDragGhost(options.name?.() || t('common.chordDefaultName'), duration);
        document.body.appendChild(ghost);
      }
      active = true;
      moveEvent.preventDefault();
      element.classList.add('pointer-dragging');
      const timelineScroller = document.getElementById('timelineScroll');
      const scrollRect = timelineScroller.getBoundingClientRect();
      if (moveEvent.clientX > scrollRect.right - 44) timelineScroller.scrollLeft += 18;
      else if (moveEvent.clientX < scrollRect.left + 44) timelineScroller.scrollLeft = Math.max(0, timelineScroller.scrollLeft - 18);
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const nextLane = target?.closest('[data-track-lane]') || null;
      if (nextLane !== hoveredLane) {
        hoveredLane?.classList.remove('drag-over');
        hoveredLane = nextLane;
        hoveredLane?.classList.add('drag-over');
      }
      if (hoveredLane) {
        const laneRect = hoveredLane.getBoundingClientRect();
        previewStart = Math.max(0, snapTimelineBeat((moveEvent.clientX - laneRect.left - pointerOffset) / BEAT_WIDTH));
        if (ghost.parentElement !== hoveredLane) hoveredLane.appendChild(ghost);
        ghost.classList.add('in-lane');
        ghost.style.left = `${previewStart * BEAT_WIDTH}px`;
        ghost.style.top = '10px';
        const requiredBeats = timelineBeatCount(previewStart + duration);
        document.getElementById('timelineContent').style.setProperty('--timeline-width', `${requiredBeats * BEAT_WIDTH}px`);
      } else {
        if (ghost.parentElement !== document.body) document.body.appendChild(ghost);
        ghost.classList.remove('in-lane');
        ghost.style.left = `${moveEvent.clientX - pointerOffset}px`;
        ghost.style.top = `${moveEvent.clientY - 27}px`;
      }
    };
    const up = (upEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      element.draggable = wasDraggable;
      element.classList.remove('pointer-dragging');
      hoveredLane?.classList.remove('drag-over');
      ghost?.remove();
      if (active) {
        element.dataset.pointerDragged = '1';
        setTimeout(() => delete element.dataset.pointerDragged, 0);
      }
      if (active && hoveredLane) onDrop(upEvent, hoveredLane, Math.max(0, snapTimelineBeat(previewStart)));
      else if (active) renderTimeline();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

export function addCurrentToTimeline() {
  const track = store.timeline.tracks[0];
  const lastEnd = track.clips.reduce((maximum, clip) => Math.max(maximum, clip.start + clip.duration), 0);
  const clip = createClip(currentChordPayload(), lastEnd);
  track.clips.push(clip);
  persistTimeline();
  renderTimeline();
  requestAnimationFrame(() => document.getElementById('timelineScroll').scrollTo({ left: Math.max(0, clip.start * BEAT_WIDTH - 90), behavior: 'smooth' }));
  showToast(t('builder.toast.chordAddedToFirstTrack'));
}

export function bindClipResize(handle, clipElement, clip) {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopPlayback();
    const startX = event.clientX;
    const initialDuration = clip.duration;
    const durationInput = clipElement.querySelector('.clip-duration-input');
    const move = (moveEvent) => {
      clip.duration = preciseDuration(snapTimelineBeat(initialDuration + (moveEvent.clientX - startX) / BEAT_WIDTH));
      clipElement.style.width = `${clip.duration * BEAT_WIDTH}px`;
      clipElement.dataset.end = clip.start + clip.duration;
      durationInput.value = formatDuration(clip.duration);
      const requiredBeats = timelineBeatCount(clip.start + clip.duration);
      document.getElementById('timelineContent').style.setProperty('--timeline-width', `${requiredBeats * BEAT_WIDTH}px`);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      persistTimeline();
      renderTimeline();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

export function renderTimeline() {
  const timeline = store.timeline;
  const totalBeats = timelineBeatCount();
  document.getElementById('timelineContent').style.setProperty('--timeline-width', `${totalBeats * BEAT_WIDTH}px`);
  document.getElementById('timelineBpm').value = timeline.bpm;
  document.getElementById('timelineSnap').value = String(timeline.snapStep);
  syncPasteButton();
  document.getElementById('timelineRuler').innerHTML = Array.from({ length: totalBeats / 4 }, (_, index) => `<span class="ruler-bar">${index + 1}</span>`).join('');
  document.getElementById('timelineStartMarker').style.transform = `translateX(${timeline.startBeat * BEAT_WIDTH}px)`;
  document.getElementById('timelineStartMarker').setAttribute('aria-valuenow', Number(timeline.startBeat || 0).toFixed(3).replace(/\.?0+$/, '') || '0');
  document.getElementById('timelineStartMarker').setAttribute('aria-valuemax', String(totalBeats));
  document.getElementById('timelineTracks').innerHTML = timeline.tracks.map((track, trackIndex) => {
    const clips = track.clips.map((clip) => {
      const pattern = clip.instrument.strumPattern.map((action) => STRUM_ICONS[action]).join(' ');
      const duration = formatDuration(clip.duration);
      const volume = Math.round(clip.instrument.volume * 100);
      const title = t('builder.timeline.clipTitle', { name: escapeHtml(clip.name), duration, volume, pattern });
      const durationAria = t('builder.timeline.durationAria', { name: escapeHtml(clip.name) });
      const deleteAria = t('builder.timeline.deleteClipAria', { name: escapeHtml(clip.name) });
      return `<div class="timeline-clip ${clip.id === store.selectedClipId ? 'selected' : ''}" draggable="true" data-clip-id="${clip.id}" data-start="${clip.start}" data-end="${clip.start + clip.duration}" style="left:${clip.start * BEAT_WIDTH}px;width:${clip.duration * BEAT_WIDTH}px;--clip-volume:${clip.instrument.volume}" title="${title}"><div class="clip-content"><span class="clip-name">${escapeHtml(clip.name)}</span><span class="clip-performance">${volume}% · ${clip.instrument.attack.toFixed(2)}↗ ${clip.instrument.release.toFixed(2)}↘</span><label class="clip-duration-edit"><input class="clip-duration-input" data-clip-duration="${clip.id}" type="number" min="${MIN_CLIP_BEATS}" step="0.01" value="${duration}" aria-label="${durationAria}" /><span>${t('common.unit.beats')}</span></label></div><button class="clip-delete" data-delete-clip="${clip.id}" aria-label="${deleteAria}">✕</button><span class="resize-handle" data-resize-clip="${clip.id}" aria-label="${t('builder.timeline.resizeAria')}"></span></div>`;
    }).join('');
    const muteAction = track.muted ? t('builder.timeline.unmuteAction') : t('builder.timeline.muteAction');
    return `<div class="track-row ${track.muted ? 'muted' : ''}" data-track-id="${track.id}"><div class="track-head"><span class="track-index">${trackIndex + 1}</span><input class="track-name" data-track-name="${track.id}" value="${escapeHtml(track.name)}" aria-label="${t('builder.timeline.trackNameAria', { n: trackIndex + 1 })}" /><button class="mute-track ${track.muted ? 'active' : ''}" data-mute-track="${track.id}" aria-pressed="${track.muted}" aria-label="${t('builder.timeline.muteTrackAria', { action: muteAction, n: trackIndex + 1 })}">M</button><button class="remove-track" data-remove-track="${track.id}" aria-label="${t('builder.timeline.removeTrackAria', { n: trackIndex + 1 })}">✕</button></div><div class="track-lane" data-track-lane="${track.id}">${clips || `<span class="track-empty">${t('builder.timeline.emptyLane')}</span>`}</div></div>`;
  }).join('');

  document.querySelectorAll('[data-track-lane]').forEach((lane) => {
    lane.addEventListener('dragover', (event) => { event.preventDefault(); lane.classList.add('drag-over'); });
    lane.addEventListener('dragleave', () => lane.classList.remove('drag-over'));
    lane.addEventListener('drop', (event) => {
      event.preventDefault();
      lane.classList.remove('drag-over');
      stopPlayback();
      const destination = timeline.tracks.find((track) => track.id === lane.dataset.trackLane);
      const encoded = event.dataTransfer.getData('text/plain');
      const clipId = event.dataTransfer.getData('application/x-chordforge-clip') || (encoded.startsWith('clip:') ? encoded.slice(5) : '');
      if (clipId) {
        const located = locateClip(clipId);
        if (!located) return;
        located.track.clips.splice(located.index, 1);
        located.clip.start = dropBeat(event, lane, located.clip.duration);
        destination.clips.push(located.clip);
      } else {
        const payload = store.dragPayload?.type === 'current' ? store.dragPayload.payload : currentChordPayload();
        destination.clips.push(createClip(payload, dropBeat(event, lane)));
      }
      store.dragPayload = null;
      persistTimeline();
      renderTimeline();
    });
  });

  document.querySelectorAll('[data-track-name]').forEach((input) => input.addEventListener('change', () => {
    const track = timeline.tracks.find((candidate) => candidate.id === input.dataset.trackName);
    if (!track) return;
    track.name = input.value.trim().slice(0, 40) || t('builder.timeline.untitledTrack');
    persistTimeline();
    renderTimeline();
  }));
  document.querySelectorAll('[data-mute-track]').forEach((button) => button.addEventListener('click', () => {
    const track = timeline.tracks.find((candidate) => candidate.id === button.dataset.muteTrack);
    if (!track) return;
    track.muted = !track.muted;
    stopPlayback();
    persistTimeline();
    renderTimeline();
  }));
  document.querySelectorAll('[data-remove-track]').forEach((button) => button.addEventListener('click', () => {
    stopPlayback();
    const index = timeline.tracks.findIndex((track) => track.id === button.dataset.removeTrack);
    if (index < 0) return;
    if (timeline.tracks[index].clips.some((clip) => clip.id === store.selectedClipId)) {
      store.selectedClipId = null;
      closeClipEditor();
    }
    timeline.tracks.splice(index, 1);
    if (!timeline.tracks.length) timeline.tracks.push(makeTrack());
    persistTimeline();
    renderTimeline();
  }));
  document.querySelectorAll('[data-delete-clip]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    stopPlayback();
    const located = locateClip(button.dataset.deleteClip);
    if (located) located.track.clips.splice(located.index, 1);
    if (store.selectedClipId === button.dataset.deleteClip) {
      store.selectedClipId = null;
      closeClipEditor();
    }
    persistTimeline();
    renderTimeline();
  }));
  document.querySelectorAll('[data-clip-duration]').forEach((input) => {
    ['pointerdown', 'click', 'dblclick'].forEach((eventName) => input.addEventListener(eventName, (event) => event.stopPropagation()));
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('input', () => {
      const duration = Number(input.value);
      if (!Number.isFinite(duration) || duration < MIN_CLIP_BEATS) return;
      const located = locateClip(input.dataset.clipDuration);
      if (!located) return;
      located.clip.duration = preciseDuration(duration);
      const clipElement = input.closest('[data-clip-id]');
      clipElement.style.width = `${located.clip.duration * BEAT_WIDTH}px`;
      clipElement.dataset.end = located.clip.start + located.clip.duration;
      const requiredBeats = timelineBeatCount(located.clip.start + located.clip.duration);
      document.getElementById('timelineContent').style.setProperty('--timeline-width', `${requiredBeats * BEAT_WIDTH}px`);
    });
    input.addEventListener('change', () => {
      const located = locateClip(input.dataset.clipDuration);
      if (!located) return;
      located.clip.duration = preciseDuration(input.value, located.clip.duration);
      stopPlayback();
      persistTimeline();
      renderTimeline();
    });
  });
  document.querySelectorAll('[data-clip-id]').forEach((clipElement) => {
    const located = locateClip(clipElement.dataset.clipId);
    if (!located) return;
    clipElement.addEventListener('click', (event) => {
      if (clipElement.dataset.pointerDragged || event.target.closest('.resize-handle, .clip-delete, .clip-duration-edit')) return;
      openClipEditor(located.clip.id);
    });
    clipElement.addEventListener('dragstart', (event) => {
      if (event.target.closest('.resize-handle') || event.target.closest('.clip-delete') || event.target.closest('.clip-duration-edit')) {
        event.preventDefault();
        return;
      }
      store.dragPayload = { type: 'clip', clipId: located.clip.id };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-chordforge-clip', located.clip.id);
      event.dataTransfer.setData('text/plain', `clip:${located.clip.id}`);
    });
    bindClipResize(clipElement.querySelector('.resize-handle'), clipElement, located.clip);
    bindPointerDrop(clipElement, (event, lane, start) => {
      stopPlayback();
      const current = locateClip(located.clip.id);
      const destination = timeline.tracks.find((track) => track.id === lane.dataset.trackLane);
      if (!current || !destination) return;
      current.track.clips.splice(current.index, 1);
      current.clip.start = start;
      destination.clips.push(current.clip);
      persistTimeline();
      renderTimeline();
    }, {
      ignoreSelector: '.resize-handle, .clip-delete, .clip-duration-edit',
      duration: () => located.clip.duration,
      name: () => located.clip.name,
      keepPointerOffset: true,
    });
  });
}

export function timelineEvents(startBeat = store.timeline.startBeat) {
  const timeline = store.timeline;
  const secondsPerBeat = 60 / timeline.bpm;
  return timeline.tracks.flatMap((track) => track.muted ? [] : track.clips.map((clip) => {
    const skippedBeats = Math.max(0, startBeat - clip.start);
    if (skippedBeats >= clip.duration) return null;
    return {
      notes: Audio.soundingMidis(clip.instrument.shape, clip.instrument.tuning, clip.instrument.capo, clip.instrument.register),
      stringCount: clip.instrument.strings,
      intervalMs: clip.instrument.strumInterval,
      pattern: clip.instrument.strumPattern,
      patternOffset: Math.floor(skippedBeats / 0.5),
      volume: clip.instrument.volume,
      attack: skippedBeats > 0 ? 0 : clip.instrument.attack,
      release: clip.instrument.release,
      stepDuration: secondsPerBeat / 2,
      start: Math.max(0, clip.start - startBeat) * secondsPerBeat,
      duration: (clip.duration - skippedBeats) * secondsPerBeat,
    };
  })).filter((event) => event?.notes.length);
}

function animateTimeline(startedAt, duration, leadIn, startBeat) {
  const playhead = document.getElementById('timelinePlayhead');
  const secondsPerBeat = 60 / store.timeline.bpm;
  const trackLabelWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--track-label')) || 156;
  playhead.hidden = false;
  const frame = (now) => {
    const elapsed = Math.max(0, (now - startedAt) / 1000 - leadIn);
    const beat = startBeat + elapsed / secondsPerBeat;
    playhead.style.transform = `translateX(${beat * BEAT_WIDTH}px)`;
    document.querySelectorAll('[data-clip-id]').forEach((clipElement) => {
      clipElement.classList.toggle('is-playing', beat >= Number(clipElement.dataset.start) && beat < Number(clipElement.dataset.end));
    });
    const scroller = document.getElementById('timelineScroll');
    const playheadX = trackLabelWidth + beat * BEAT_WIDTH;
    if (playheadX > scroller.scrollLeft + scroller.clientWidth - 88) {
      scroller.scrollLeft = playheadX - scroller.clientWidth + 88;
    }
    if (elapsed < duration) setTimelineFrame(requestAnimationFrame(frame));
    else stopPlayback();
  };
  setTimelineFrame(requestAnimationFrame(frame));
}

export async function playTimeline() {
  if (document.getElementById('playTimeline').classList.contains('playing')) {
    stopPlayback();
    return;
  }
  const startBeat = store.timeline.startBeat;
  const events = timelineEvents(startBeat);
  if (!events.length) {
    showToast(t('builder.toast.noActiveChordsAfterStart'));
    return;
  }
  stopPlayback();
  document.getElementById('timelinePlayLabel').textContent = t('common.loading');
  try {
    const result = await audio.playTimeline(events);
    updateSampleStatus();
    const startedAt = performance.now();
    setTimelinePlaybackState(true);
    animateTimeline(startedAt, result.duration, result.leadIn, startBeat);
  } catch {
    stopPlayback();
    updateSampleStatus();
    showToast(t('builder.toast.playbackFailed'));
  }
}

function timelineLabelWidth() {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--track-label')) || 156;
}

export function setTimelineStartFromClientX(clientX) {
  const rect = document.getElementById('timelineRuler').getBoundingClientRect();
  const beat = (clientX - rect.left - timelineLabelWidth()) / BEAT_WIDTH;
  store.timeline.startBeat = Math.max(0, snapTimelineBeat(beat));
  stopPlayback();
  persistTimeline();
  renderTimeline();
}

export function bindStartMarkerDrag() {
  document.getElementById('timelineStartMarker').addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const move = (moveEvent) => setTimelineStartFromClientX(moveEvent.clientX);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

export { SNAP_STEPS };
