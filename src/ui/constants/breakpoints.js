// The ONLY window-size thresholds a stylesheet may use in @media / @container (CSS px). A CSS variable
// does not work inside a media condition, so the discipline lives here: breakpoints.test.js reads every
// *.css under src/ui and fails on a width/height that is not on this list. The same table is mirrored as a
// comment in styles/global.css - change both together.
//
// Window range the layout must hold: 960x560 (the minimum, main/helpers/windowBounds.js) up to 2560x1400,
// at Windows scaling 100-150%. A new threshold needs a reason a flexible layout (flex-wrap, minmax(),
// min-width: 0, clamp()) could not give - add it here, in the same change.

export const BREAKPOINT_WIDTHS = Object.freeze([1100, 1200, 1400]);
export const BREAKPOINT_HEIGHTS = Object.freeze([640, 720]);

// 900 px in DataPrintSelection.module.css never fires (the window is >= 960 px wide). Tolerated until
// resp-1 replaces it; remove it from here when that rule is gone.
export const LEGACY_BREAKPOINT_WIDTHS = Object.freeze([900]);
