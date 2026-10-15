// ONE computed condition for "the periodic polls stand" (B2a). Two independent sources feed it and
// neither may overwrite the other: the power state (sleep / lock screen / 10 s grace after a wake,
// store.pollingPaused, written by main's power:paused) and the visibility of the window
// (store.windowHidden, written by the document's visibilitychange). A wake while the window is
// minimised therefore does NOT start the polls: the window is still hidden.
//
// Strict `=== true`: a source that was never written reads as "not stopping" only when it is
// really false/undefined, never because a truthy stray value leaked in.
export const pollsStand = ({ pollingPaused, windowHidden }) => pollingPaused === true || windowHidden === true;

// The edge the polls restart on: stopped a moment ago, running now. A first render (no previous
// value) is not a resume - startup has its own full loads.
export const pollsResumed = (wasStopped, isStopped) => wasStopped === true && isStopped === false;
