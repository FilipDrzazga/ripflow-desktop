import { FILE_STATUS } from "../../shared/constants";

// Shift-click range selection for the Production cards and the BatchHistory file rows (Gmail model:
// the range takes the state of the anchor, the card last clicked, and ADDS to / removes from the
// selection - it never replaces it).
// Pure helpers only: Production.jsx and BatchHistory.jsx own the anchor ref and the selection state.

// The ids from anchor to target inclusive, in the order of `orderedIds`. null when either end is
// missing (no anchor yet, or the anchor/target is not in the list any more) - the caller then
// treats the click as a plain toggle.
export const idsBetween = (orderedIds, anchorId, targetId) => {
  if (anchorId == null || targetId == null) return null;
  const from = orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(targetId);
  if (from === -1 || to === -1) return null;
  return orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);
};

// The selection after a click on `fileId`. A shift-click with a usable anchor applies the anchor's
// state to the whole range; everything else (plain click, no anchor, anchor gone from the list,
// shift-click on the anchor itself) toggles that one card.
export const nextSelection = (prev, { fileId, shiftKey, anchorId, orderedIds }) => {
  const next = new Set(prev);
  const range = shiftKey && anchorId !== fileId ? idsBetween(orderedIds, anchorId, fileId) : null;
  if (range) {
    const select = prev.has(anchorId);
    for (const id of range) {
      if (select) next.add(id);
      else next.delete(id);
    }
    return next;
  }
  if (next.has(fileId)) next.delete(fileId);
  else next.add(fileId);
  return next;
};

// The anchor lives and dies with the selection: an empty selection (cleared by a filter, lens or
// batch change, or by deselecting the last card) leaves nothing to extend from.
export const anchorAfterSelection = (selection, anchorId) => (selection.size === 0 ? null : anchorId);

// The card ids in the order the BATCHES lens draws them: days as grouped (already sorted, Stuck
// oldest-first), skipping collapsed days (their cards are not on screen), and inside a day either
// the batch layer (Groups on) or the flat row list - the two orders differ, so it must follow the
// same switch the render does.
export const dayRowsInRenderOrder = (day, isGrouped) =>
  isGrouped ? day.batches.flatMap(([, rows]) => rows) : day.rows;

export const visibleFileIds = (groupedDays, collapsedDays, isGrouped) =>
  groupedDays
    .filter((day) => !collapsedDays.has(day.dayKey))
    .flatMap((day) => dayRowsInRenderOrder(day, isGrouped).map((row) => row.file_id));

// BatchHistory: the selectable files in the order the tree draws them. Only what is on screen
// counts - a collapsed day or batch draws no file rows - and rolled-back files are skipped
// because their rows have no checkbox (the same split FileRow makes). The batch layer is the
// filtered one (a search narrows batch.files), so pass the list the render maps over.
export const visibleHistoryFiles = (dayGroups, expandedDays, expandedBatches) =>
  dayGroups
    .filter((day) => expandedDays.has(day.date))
    .flatMap((day) => day.batches)
    .filter((batch) => expandedBatches.has(batch.path))
    .flatMap((batch) =>
      batch.files
        .filter((file) => file.status !== FILE_STATUS.ROLLED_BACK)
        .map((file) => ({ path: file.path, batchPath: batch.path })),
    );

// BatchHistory keeps its selection as Map<filePath, batchPath> (bulk rollback needs the batch of
// every file). The range maths is the Set one above; this maps it back, taking the batch of a file
// from `ordered` ([{ path, batchPath }], what visibleHistoryFiles returns) or from the click.
export const nextFileSelection = (prev, { filePath, batchPath, shiftKey, anchorPath, ordered }) => {
  const paths = nextSelection(new Set(prev.keys()), {
    fileId: filePath,
    shiftKey,
    anchorId: anchorPath,
    orderedIds: ordered.map((f) => f.path),
  });
  const batchOf = new Map(ordered.map((f) => [f.path, f.batchPath]));
  batchOf.set(filePath, batchPath);
  const next = new Map();
  for (const path of paths) next.set(path, prev.get(path) ?? batchOf.get(path));
  return next;
};

// mousedown on a card with Shift held: stop the browser from extending a text selection to the
// click point, and drop any selection already there. Otherwise the click guard in ProductionCard
// ("non-empty text selection -> not a click") swallows the shift-click. Returns true when it
// claimed the event. Plain mousedown is left alone, so copying text out of a card still works.
export const claimShiftMouseDown = (e, win) => {
  if (!e.shiftKey || e.button !== 0) return false;
  e.preventDefault();
  win?.getSelection?.()?.removeAllRanges();
  return true;
};
