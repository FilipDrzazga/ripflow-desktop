// The jump from a Ctrl+F row to the file itself (plan C3-3): ONE task in the store, `searchTarget`,
// `{ view, fileId, dayKey, nonce }`. App.jsx switches the view, the view that owns the file (DataList for
// Print, Production) consumes the task and clears it.
//
// The nonce is what makes the second pick of the SAME file work: the task is cleared after use, and a
// consumer that keys its effect on the nonce fires again for an identical { view, fileId }.

import { APP_VIEW } from "../constants/appViews";

// The views a row can lead to: where Inbox / Held rows live, and where the Production stages live.
export const SEARCH_TARGET_VIEWS = [APP_VIEW.PRINT, APP_VIEW.PRODUCTION];

// A task from a search row's `target`, numbered with `nonce`; null when the row carries nothing usable
// (no view this jump knows, no file id) - the caller then does not navigate at all.
export const makeSearchTarget = (target, nonce) => {
  if (!target || !SEARCH_TARGET_VIEWS.includes(target.view)) return null;
  if (typeof target.fileId !== "string" || target.fileId === "") return null;
  return {
    view: target.view,
    fileId: target.fileId,
    dayKey: typeof target.dayKey === "string" && target.dayKey !== "" ? target.dayKey : null,
    nonce,
  };
};

// Is the pending task one for this view? A consumer ignores a task for another view.
export const isSearchTargetFor = (searchTarget, view) => !!searchTarget && searchTarget.view === view;
