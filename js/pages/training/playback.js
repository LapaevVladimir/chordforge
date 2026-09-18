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

// Plays a run of notes one after another — a scale in a position, in practice.
// Voices are spread across the stereo field the way the run climbs the neck, and
// the button stays disabled until the last note has sounded so a second click
// cannot stack two runs on top of each other.
const STEP_MS = 260;

export async function playSequence(midis, sourceButton = null) {
  if (!midis.length) return;
  const previous = sourceButton?.innerHTML;
  try {
    if (sourceButton) {
      sourceButton.disabled = true;
      sourceButton.innerHTML = t('common.loadingSound');
    }
    const context = await audio.prepare(midis);
    // Past this point the samples are in memory, so the button stops claiming to
    // be loading and says what it is actually doing.
    if (sourceButton) sourceButton.innerHTML = t('training.scales.playing');
    audio.stop();
    const origin = context.currentTime + 0.05;
    const step = STEP_MS / 1000;
    midis.forEach((midi, order) => {
      const pan = midis.length <= 1 ? 0 : -0.24 + (order / (midis.length - 1)) * 0.48;
      audio.playVoice({ midi, stringIndex: order % 6 }, {
        start: origin + order * step,
        velocity: 0.62,
        pan,
        duration: 0.85,
        release: 0.22,
      });
    });
    await new Promise((resolve) => window.setTimeout(resolve, midis.length * STEP_MS + 260));
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
