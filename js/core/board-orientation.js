// Lets a fretboard stand upright.
//
// A neck drawn across the screen is right at a desk and wrong in a hand: a phone
// is tall, the neck is long, and chord diagrams have been drawn vertically in
// every songbook ever printed. So the boards can be turned a quarter turn, which
// also puts them in the orientation a player is used to reading — low string on
// the left, frets running down the page.
//
// The turn is a rotation rather than a second layout: one transform, and every
// board keeps the markup, the hit targets and the styling it already had. What a
// rotation does not do is change the space the element takes up, so the frame
// around it has to be told to swap its width and height — that is what
// layoutRotatedBoard is for, and why it runs again after every redraw.

export const ORIENTATION_KEY = 'chordforge-board-orientation-v1';
const VERTICAL = 'vertical';
const HORIZONTAL = 'horizontal';

// The turn is offered on narrow screens only, so the choice has to be gated the
// same way. Without this, standing the neck up on a phone would follow the reader
// to their desk, where the button that would put it back is hidden.
const NARROW = '(max-width: 980px)';
const narrow = window.matchMedia(NARROW);

let orientation = readStored();
// A page opts in by calling initOrientation(). The choice is stored for the whole
// site, but a page that offers no way to undo it must not inherit it — the studio
// shares this board code and has no turn button of its own.
let enabled = false;
const listeners = [];

function readStored() {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === VERTICAL ? VERTICAL : HORIZONTAL;
  } catch {
    return HORIZONTAL;
  }
}

export function isVertical() {
  return enabled && orientation === VERTICAL && narrow.matches;
}

function applyClass() {
  document.body.classList.toggle('board-vertical', isVertical());
}

// Crossing the breakpoint changes the answer, so everything drawn from it is
// told to redraw.
narrow.addEventListener('change', () => {
  applyClass();
  for (const listener of listeners) listener(orientation);
});

export function onOrientationChange(listener) {
  listeners.push(listener);
}

export function setOrientation(next) {
  orientation = next === VERTICAL ? VERTICAL : HORIZONTAL;
  try {
    localStorage.setItem(ORIENTATION_KEY, orientation);
  } catch {
    // A locked-down browser can refuse storage; the choice then lasts the visit.
  }
  applyClass();
  for (const listener of listeners) listener(orientation);
}

// Applies the stored choice on load, before the first paint the reader sees.
export function initOrientation() {
  enabled = true;
  applyClass();
}

// `frame` is the element the board sits in; `board` is what gets rotated.
export function layoutRotatedBoard(frame, board) {
  if (!frame || !board) return;
  if (!isVertical()) {
    frame.style.height = '';
    board.style.left = '';
    return;
  }
  // offsetWidth/offsetHeight are layout values, so they still describe the board
  // as it was laid out rather than as it now appears.
  const laidOutWidth = board.offsetWidth;
  const laidOutHeight = board.offsetHeight;
  frame.style.height = `${laidOutWidth}px`;
  board.style.left = `${Math.max(0, (frame.clientWidth - laidOutHeight) / 2)}px`;
}

export function bindOrientationToggle(button, labels) {
  if (!button) return;
  const sync = () => {
    button.setAttribute('aria-pressed', String(isVertical()));
    button.title = isVertical() ? labels.horizontal : labels.vertical;
  };
  button.addEventListener('click', () => {
    setOrientation(isVertical() ? HORIZONTAL : VERTICAL);
    sync();
  });
  onOrientationChange(sync);
  sync();
}
