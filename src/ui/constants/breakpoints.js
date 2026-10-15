// The ONLY window-size thresholds a stylesheet may use in @media / @container (CSS px). A CSS variable
// does not work inside a media condition, so the discipline lives here: breakpoints.test.js reads every
// *.css under src/ui and fails on a width/height that is not on this list. The same table is mirrored as a
// comment in styles/global.css - change both together.
//
// Window range the layout must hold: 960x560 (the minimum, main/helpers/windowBounds.js) up to 2560x1400,
// at Windows scaling 100-150%. A new threshold needs a reason a flexible layout (flex-wrap, minmax(),
// min-width: 0, clamp()) could not give - add it here, in the same change.
// An @container width is the width of the LIST a component sits in (Production cards: 1000 / 1080; Analytics table: 780), not of the window.

export const BREAKPOINT_WIDTHS = Object.freeze([780, 1000, 1080, 1100, 1200, 1440, 1600]);
export const BREAKPOINT_HEIGHTS = Object.freeze([640, 720]);
