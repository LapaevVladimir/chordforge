import { GuitarEngine } from '../../core/guitar-audio.js';
import { t } from '../../i18n/i18n.js';

export const audio = new GuitarEngine();

let toastTimer = 0;

export function showToast(message) {
  const toast = document.getElementById('trainingToast');
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

export async function playNotes(rootMidi, targetMidi, mode, sourceButton = null) {
  const previous = sourceButton?.innerHTML;
  try {
    if (sourceButton) {
      sourceButton.disabled = true;
      sourceButton.innerHTML = t('common.loadingSound');
    }
    await audio.playInterval(rootMidi, targetMidi, mode);
  } catch (error) {
    console.error(error);
    showToast(t('training.toast.samplesLoadFailed'));
  } finally {
    if (sourceButton) {
      sourceButton.disabled = false;
      sourceButton.innerHTML = previous;
    }
  }
}

// Orders and plays a pair of notes according to the selected interval type:
// ascending/descending order the two notes by pitch and play them one after
// another, harmonic plays them together. Shared by the Learn and Practice pages.
export function playIntervalByType(rootMidi, targetMidi, type, sourceButton = null) {
  if (type === 'harmonic') return playNotes(rootMidi, targetMidi, 'simultaneous', sourceButton);
  const low = Math.min(rootMidi, targetMidi);
  const high = Math.max(rootMidi, targetMidi);
  if (type === 'descending') return playNotes(high, low, 'sequential', sourceButton);
  return playNotes(low, high, 'sequential', sourceButton);
}
