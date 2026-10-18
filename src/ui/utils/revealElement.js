// Scroll to an element that a state change has just put (or is about to put) into the DOM, then let the
// caller flash it. State set a moment ago may not be painted when the next frame fires (a view that just
// mounted, a collapsed day that was just opened), so the element is looked for on a few consecutive frames
// instead of once. The scanner and the order-search jump both go through here.

export const REVEAL_MAX_FRAMES = 12;

/**
 * @param {string} selector
 * @param {{ onReveal?: (el: Element) => void, frames?: number, doc?: Document, raf?: (cb: () => void) => unknown }} [options]
 * @returns {() => void} cancel - stops the search (a view that unmounted meanwhile)
 */
export const revealElement = (selector, { onReveal, frames = REVEAL_MAX_FRAMES, doc = document, raf = requestAnimationFrame } = {}) => {
  let cancelled = false;
  let left = frames;
  const look = () => {
    if (cancelled) return;
    const el = doc.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      onReveal?.(el);
      return;
    }
    left -= 1;
    if (left > 0) raf(look);
  };
  raf(look);
  return () => {
    cancelled = true;
  };
};
