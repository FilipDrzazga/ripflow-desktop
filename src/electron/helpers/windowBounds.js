// Window size limits and the restored (non-maximised) size. Pure: main.js feeds it the work area
// of the display the window opens on (screen.getDisplayMatching / getPrimaryDisplay).

export const WINDOW_MIN_WIDTH = 960;
export const WINDOW_MIN_HEIGHT = 560;
export const WINDOW_DEFAULT_WIDTH = 1280;
export const WINDOW_DEFAULT_HEIGHT = 800;

const positive = (n) => Number.isFinite(n) && n > 0;

// The window starts maximised, but "restore" gives it this size back. On a small screen (a laptop
// 1366x768 at 125% scaling is ~1092x582 usable) the 1280x800 default would be larger than the
// screen, so it is clamped to the work area - never below the minimum, which wins on a screen
// smaller than the minimum. An unreadable work area leaves the default untouched.
export const fitStartSize = (workArea) => {
  const w = workArea?.width;
  const h = workArea?.height;
  const width = positive(w) ? Math.min(WINDOW_DEFAULT_WIDTH, Math.floor(w)) : WINDOW_DEFAULT_WIDTH;
  const height = positive(h) ? Math.min(WINDOW_DEFAULT_HEIGHT, Math.floor(h)) : WINDOW_DEFAULT_HEIGHT;
  return {
    width: Math.max(WINDOW_MIN_WIDTH, width),
    height: Math.max(WINDOW_MIN_HEIGHT, height),
  };
};
