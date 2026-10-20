// The jump from a Ctrl+F row to the file itself (plan C3-3): ONE task in the store, `searchTarget`,
// `{ view, fileId, dayKey, nonce }`. App.jsx switches the view, the view that owns the file (DataList for
// Print, Production) consumes the task and clears it.
//
// The nonce is what makes the second pick of the SAME file work: the task is cleared after use, and a
// consumer that keys its effect on the nonce fires again for an identical { view, fileId }.

import { APP_VIEW } from "../constants/appViews";

// The views a row can lead to: where Inbox / Held rows live, and where the Production stages live.
export const SEARCH_TARGET_VIEWS = [APP_VIEW.PRINT, APP_VIEW.PRODUCTION];

// The third place a row can lead to: a file that only the PRINTED folders still hold (batch history). It is
// NOT in SEARCH_TARGET_VIEWS on purpose - that list is the views whose files the store holds (Inbox, Held, the
// Production stages); a history file lives on disk only. Its task also carries `batchPath`, the folder the file
// sits in: BatchHistory has to open that batch, and the file id alone does not name it (a stem can be printed twice).
export const SEARCH_HISTORY_VIEW = APP_VIEW.BATCH;

// A task from a search row's `target`, numbered with `nonce`; null when the row carries nothing usable
// (no view this jump knows, no file id, a history row without its batch) - the caller then does not navigate at all.
export const makeSearchTarget = (target, nonce) => {
  if (!target) return null;
  const isHistory = target.view === SEARCH_HISTORY_VIEW;
  if (!isHistory && !SEARCH_TARGET_VIEWS.includes(target.view)) return null;
  if (typeof target.fileId !== "string" || target.fileId === "") return null;
  if (isHistory) {
    if (typeof target.batchPath !== "string" || target.batchPath === "") return null;
    return {
      view: target.view,
      fileId: target.fileId,
      dayKey: typeof target.dayKey === "string" && target.dayKey !== "" ? target.dayKey : null,
      batchPath: target.batchPath,
      nonce,
    };
  }
  return {
    view: target.view,
    fileId: target.fileId,
    dayKey: typeof target.dayKey === "string" && target.dayKey !== "" ? target.dayKey : null,
    nonce,
  };
};

// Is the pending task one for this view? A consumer ignores a task for another view.
export const isSearchTargetFor = (searchTarget, view) => !!searchTarget && searchTarget.view === view;
