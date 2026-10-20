// "Close every menu, popover and dropdown that floats over the app" - one event instead of a list of components (D59).
// A floating layer that is not a modal (ContextMenu, RipErrorPopover, the Filter panel, Select) has no aria-modal and so
// does not stop Ctrl+F; before the order search opens, App asks them all to close, so none stays open under the window
// (its Esc stops propagation, and a menu left underneath would not see it). A new floating layer subscribes through
// useFloatingClose (hooks/useFloatingClose.js).
export const CLOSE_FLOATING_EVENT = "ripflow:close-floating";

// `target` is injectable for tests; in the app it is window.
export const closeFloatingLayers = (target = window) => {
  target.dispatchEvent(new Event(CLOSE_FLOATING_EVENT));
};
