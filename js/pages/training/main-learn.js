import { applyTheme, bindThemeDock, THEME_KEY } from '../../core/theme.js';
import { init as i18nInit, onChange as onLocaleChange, t } from '../../i18n/i18n.js';
import { OPEN_MIDIS, tuningLabel, renderNoteBoard } from './board.js';
import { elements, checkedValue } from './elements.js';
import { audio, showToast, playIntervalByType } from './playback.js';
import { syncLocaleDock, bindLocaleDock } from '../../i18n/locale-dock.js';
import { initOrientation, bindOrientationToggle, onOrientationChange } from '../../core/board-orientation.js';
import {
  renderIntervalRail, renderLearning, renderTuningControls, bindTuningActions,
  chooseLearnTarget, setLearnAnchor, setLearnInterval, learnAnchor, onTuningChange,
} from './learn.js';
import { renderScales, bindScaleEvents, currentScaleLabel } from './scales.js';

// Which part of the page is on screen. All three are drawn from the same tuning
// and the same board module; only their panels are swapped.
// In the order they build on each other: you read the neck, then hear distances
// across it, then play those distances as shapes.
const SECTIONS = ['notes', 'intervals', 'scales'];
let section = SECTIONS[0];

function applySection(next) {
  section = SECTIONS.includes(next) ? next : SECTIONS[0];
  elements.sectionPanels.forEach((panel) => {
    panel.hidden = panel.dataset.learnPanel !== section;
  });
  // A board laid out while its panel was hidden has no width to measure, so the
  // section being shown is always redrawn rather than trusted.
  if (section === 'scales') renderScales();
  else if (section === 'notes') renderNoteBoard(elements.noteFretboard);
  else renderLearning();
}

function refreshBadges() {
  if (elements.tuningBadge) elements.tuningBadge.textContent = tuningLabel();
  if (elements.notesBadge) elements.notesBadge.textContent = tuningLabel();
  if (elements.scaleBadge) elements.scaleBadge.textContent = currentScaleLabel();
}

function renderAll() {
  renderIntervalRail();
  renderTuningControls();
  renderLearning();
  renderScales();
  renderNoteBoard(elements.noteFretboard);
  refreshBadges();
}

onLocaleChange(() => {
  syncLocaleDock();
  renderAll();
});

function bindEvents() {
  document.querySelectorAll('input[name="learnSection"]').forEach((input) => {
    input.addEventListener('change', () => { if (input.checked) applySection(input.value); });
  });

  elements.intervalRail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-interval]');
    if (!button) return;
    setLearnInterval(button.dataset.interval);
    renderIntervalRail();
    renderLearning();
  });

  elements.learnFretboard.addEventListener('click', (event) => {
    const button = event.target.closest('[data-learn-cell]');
    if (!button) return;
    const [stringIndex, fret] = button.dataset.learnCell.split(':').map(Number);
    setLearnAnchor({ stringIndex, fret, midi: OPEN_MIDIS[stringIndex] + fret });
    renderLearning();
  });

  elements.playLearnInterval.addEventListener('click', () => {
    const target = chooseLearnTarget();
    if (!target) {
      showToast(t('training.toast.noSecondPosition'));
      return;
    }
    const intervalType = checkedValue('learnIntervalType', 'ascending');
    playIntervalByType(learnAnchor.midi, target.midi, intervalType, elements.playLearnInterval);
  });

  bindScaleEvents();
  // The scale controls redraw their own board; the badge above it is this
  // module's, so it is refreshed on the way past.
  elements.scaleRoot.addEventListener('click', refreshBadges);
  elements.scaleType.addEventListener('click', refreshBadges);

  onTuningChange(() => { renderScales(); renderNoteBoard(elements.noteFretboard); refreshBadges(); });
  const flipLabels = { vertical: t('common.boardFlipVertical'), horizontal: t('common.boardFlipHorizontal') };
  bindOrientationToggle(document.querySelector('#boardFlip'), flipLabels);
  bindOrientationToggle(document.querySelector('#scaleBoardFlip'), flipLabels);
  bindOrientationToggle(document.querySelector('#noteBoardFlip'), flipLabels);
  // Every board is laid out from the same tuning, so all are redrawn when the
  // neck turns or the window changes shape.
  const redrawBoards = () => { renderLearning(); renderScales(); renderNoteBoard(elements.noteFretboard); };
  onOrientationChange(redrawBoards);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redrawBoards, 160);
  });
  bindTuningActions();
  bindThemeDock('sunset');
  bindLocaleDock();
  window.addEventListener('beforeunload', () => audio?.stop());
}

function initialize() {
  i18nInit();
  initOrientation();
  syncLocaleDock();
  renderAll();
  applySection(SECTIONS[0]);
  bindEvents();
  applyTheme(localStorage.getItem(THEME_KEY), 'sunset');
  window.setTimeout(() => {
    document.body.classList.remove('site-loading');
    document.body.classList.add('site-ready');
    elements.loader?.classList.add('is-hidden');
    window.setTimeout(() => elements.loader?.remove(), 650);
  }, 780);
  audio.prepare([40, 47, 52]).catch(() => {
    // Audio is also retried on the first explicit play gesture.
  });
}

initialize();
