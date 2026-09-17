export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || clone(fallback); }
  catch { return clone(fallback); }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

// Creates an independent id generator so each page keeps its own counter,
// matching the previous per-file `idCounter` closures.
export function createIdGenerator(seed = Date.now()) {
  let counter = seed;
  return (prefix) => {
    counter += 1;
    return `${prefix}-${counter.toString(36)}`;
  };
}
