// Where a dropdown list opens relative to its trigger: below it when there is room, above it when the window is low
// (960x560 with a rollback modal of several files puts the last trigger near the bottom edge). The list scrolls inside
// `maxHeight`, so it never runs off the window either way.
export const DROPDOWN_MAX_HEIGHT = 260;
const ROOMY = 200;
const GAP = 4;
const EDGE = 12;

// rect: the trigger's getBoundingClientRect(); returns the inline style of a position: fixed list (left is the caller's).
export const dropdownPlacement = (rect, viewportHeight) => {
  const below = viewportHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  if (below >= ROOMY || below >= above) {
    return { top: rect.bottom + GAP, maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, below)) };
  }
  return { bottom: viewportHeight - rect.top + GAP, maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, above)) };
};
