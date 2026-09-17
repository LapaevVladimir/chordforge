import * as Audio from '../../core/guitar-audio.js';
import { clamp, clone } from '../../core/utils.js';
import { t } from '../../i18n/i18n.js';
import { store, uid, normalizeInstrument, persistTimeline, CLIPBOARD_KEY } from './store.js';
import { strumActionName, strumCountLabels, renderStrumSteps } from './strum.js';
import { showToast, stopPlayback } from './playback.js';
import {
  selectedClip, locateClip, renderTimeline, syncPasteButton,
  snapTimelineBeat, preciseDuration, formatDuration, MIN_CLIP_BEATS,
} from './timeline.js';

export function renderEnvelopeGraph() {
  const located = selectedClip();
  if (!located) return;
  const { clip } = located;
  const durationSeconds = Math.max(0.08, clip.duration * 60 / store.timeline.bpm);
  const volume = Audio.normalizeVolume(clip.instrument.volume);
  const attackX = clamp(clip.instrument.attack / durationSeconds * 100, 0, 48);
  const releaseX = clamp(100 - clip.instrument.release / durationSeconds * 100, 52, 100);
  const levelY = 44 - volume * 36;
  const path = `M 0 46 L ${attackX.toFixed(2)} ${levelY.toFixed(2)} L ${releaseX.toFixed(2)} ${levelY.toFixed(2)} L 100 46`;
  document.getElementById('clipEnvelopeLine').setAttribute('d', path);
  document.getElementById('clipEnvelopeFill').setAttribute('d', `${path} L 100 48 L 0 48 Z`);
  document.getElementById('clipAttackHandle').style.left = `${attackX}%`;
  document.getElementById('clipAttackHandle').style.top = `${levelY / 48 * 100}%`;
  document.getElementById('clipVolumeHandle').style.left = `${(attackX + releaseX) / 2}%`;
  document.getElementById('clipVolumeHandle').style.top = `${levelY / 48 * 100}%`;
  document.getElementById('clipReleaseHandle').style.left = `${releaseX}%`;
  document.getElementById('clipReleaseHandle').style.top = `${levelY / 48 * 100}%`;
  document.getElementById('clipEnvelopeSummary').textContent = t('builder.clipEditor.envelopeSummary', {
    pct: Math.round(volume * 100),
    attack: clip.instrument.attack.toFixed(2),
    release: clip.instrument.release.toFixed(2),
  });
}

export function renderClipStrumEditor(activeIndex = -1) {
  const located = selectedClip();
  if (!located) return;
  const pattern = located.clip.instrument.strumPattern;
  document.getElementById('clipStrumStepCount').value = String(pattern.length);
  document.getElementById('clipStrumCount').style.setProperty('--strum-steps', pattern.length);
  document.getElementById('clipStrumPattern').style.setProperty('--strum-steps', pattern.length);
  document.getElementById('clipStrumCount').innerHTML = strumCountLabels(pattern.length);
  renderStrumSteps(document.getElementById('clipStrumPattern'), pattern, {
    dataAttr: 'clip-strum-step',
    activeIndex,
    describe: (index, action) => ({
      ariaLabel: t('builder.clipEditor.strumStepAria', { n: index + 1, name: strumActionName(action) }),
      title: null,
    }),
  });
}

export function renderClipEditor() {
  const located = selectedClip();
  if (!located) {
    closeClipEditor();
    return;
  }
  const { clip } = located;
  document.getElementById('clipEditorTitle').textContent = clip.name;
  document.getElementById('clipDurationEditor').value = formatDuration(clip.duration);
  document.getElementById('clipVolume').value = Math.round(clip.instrument.volume * 100);
  document.getElementById('clipVolumeValue').textContent = t('common.template.percent', { n: Math.round(clip.instrument.volume * 100) });
  document.getElementById('clipAttack').value = clip.instrument.attack;
  document.getElementById('clipAttackValue').textContent = t('common.template.seconds', { n: clip.instrument.attack.toFixed(2) });
  document.getElementById('clipRelease').value = clip.instrument.release;
  document.getElementById('clipReleaseValue').textContent = t('common.template.seconds', { n: clip.instrument.release.toFixed(2) });
  renderEnvelopeGraph();
  renderClipStrumEditor();
}

export function openClipEditor(clipId) {
  if (!locateClip(clipId)) return;
  store.selectedClipId = clipId;
  renderTimeline();
  renderClipEditor();
  document.getElementById('clipEditorOverlay').hidden = false;
  document.body.classList.add('modal-open');
}

export function closeClipEditor() {
  document.getElementById('clipEditorOverlay').hidden = true;
  if (document.getElementById('voicingModalOverlay').hidden) document.body.classList.remove('modal-open');
}

export function copySelectedClip(showMessage = true) {
  const located = selectedClip();
  if (!located) return false;
  store.clipClipboard = {
    name: located.clip.name,
    duration: located.clip.duration,
    instrument: clone(located.clip.instrument),
  };
  localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(store.clipClipboard));
  syncPasteButton();
  if (showMessage) showToast(t('builder.toast.clipCopied', { name: located.clip.name }));
  return true;
}

export function pasteClip() {
  const instrument = normalizeInstrument(store.clipClipboard?.instrument);
  if (!instrument) {
    showToast(t('builder.toast.copyFirst'));
    return;
  }
  const editorWasOpen = !document.getElementById('clipEditorOverlay').hidden;
  const current = selectedClip();
  const track = current?.track || store.timeline.tracks[0];
  const lastEnd = track.clips.reduce((maximum, clip) => Math.max(maximum, clip.start + clip.duration), 0);
  const start = current ? current.clip.start + current.clip.duration : lastEnd;
  const clip = {
    id: uid('clip'),
    name: typeof store.clipClipboard.name === 'string' ? store.clipClipboard.name : t('common.chordDefaultName'),
    start: Math.max(0, snapTimelineBeat(start)),
    duration: preciseDuration(store.clipClipboard.duration),
    instrument,
  };
  track.clips.push(clip);
  store.selectedClipId = clip.id;
  stopPlayback();
  persistTimeline();
  renderTimeline();
  if (editorWasOpen) renderClipEditor();
  showToast(t('builder.toast.clipPasted', { name: clip.name }));
}

export function duplicateSelectedClip() {
  if (!copySelectedClip(false)) return;
  pasteClip();
  renderClipEditor();
}

export function deleteSelectedClip() {
  const located = selectedClip();
  if (!located) return;
  located.track.clips.splice(located.index, 1);
  store.selectedClipId = null;
  stopPlayback();
  persistTimeline();
  closeClipEditor();
  renderTimeline();
  showToast(t('builder.toast.clipDeleted'));
}

export function updateSelectedEnvelope(kind, pointerEvent) {
  const located = selectedClip();
  if (!located) return;
  const rect = document.getElementById('clipEnvelopeGraph').getBoundingClientRect();
  const x = clamp((pointerEvent.clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((pointerEvent.clientY - rect.top) / rect.height, 0, 1);
  const durationSeconds = Math.max(0.08, located.clip.duration * 60 / store.timeline.bpm);
  if (kind === 'attack') located.clip.instrument.attack = Audio.normalizeAttack(Math.min(2, x * durationSeconds));
  if (kind === 'release') located.clip.instrument.release = Audio.normalizeRelease(Math.min(2, (1 - x) * durationSeconds));
  if (kind === 'volume') located.clip.instrument.volume = Audio.normalizeVolume(clamp((0.92 - y) / 0.75, 0, 1));
  document.getElementById('clipVolume').value = Math.round(located.clip.instrument.volume * 100);
  document.getElementById('clipVolumeValue').textContent = t('common.template.percent', { n: Math.round(located.clip.instrument.volume * 100) });
  document.getElementById('clipAttack').value = located.clip.instrument.attack;
  document.getElementById('clipAttackValue').textContent = t('common.template.seconds', { n: located.clip.instrument.attack.toFixed(2) });
  document.getElementById('clipRelease').value = located.clip.instrument.release;
  document.getElementById('clipReleaseValue').textContent = t('common.template.seconds', { n: located.clip.instrument.release.toFixed(2) });
  renderEnvelopeGraph();
  const clipElement = document.querySelector(`[data-clip-id="${located.clip.id}"]`);
  clipElement?.style.setProperty('--clip-volume', located.clip.instrument.volume);
  persistTimeline();
}

export function bindEnvelopeHandle(id, kind) {
  document.getElementById(id).addEventListener('pointerdown', (event) => {
    event.preventDefault();
    stopPlayback();
    const move = (moveEvent) => updateSelectedEnvelope(kind, moveEvent);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    updateSelectedEnvelope(kind, event);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

