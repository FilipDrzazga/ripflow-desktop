import { estimatePrintLength } from "../../shared/estimatePrintLength";
import { applyPrintOverrides } from "./applyPrintOverrides";

// Estimated print length (m) of the files selected in Print - the counter next to "N items
// selected". The SAME estimate the batch label prints after Rip (submitBatch.js): one
// estimatePrintLength over the whole selection, after the operator's overrides and the open
// reprint quantities (applyPrintOverrides, shared with fileService.submitBatch). NOT the sum of
// the per-group numbers in the list, which nest each inbox folder on its own.
//
// `config` is store.fabricConfig (rule 23) - null before the catalogue loads, and the estimator
// then falls back to the class numbers exactly as everywhere else in the renderer.
//
// `measured` counts the selected files the estimator could not size (no dimensions, or a class
// with no numbers) so the bar can say the metres are incomplete instead of looking exact.
export const selectionPrintLength = (files, selectedIds, overrides, config) => {
  if (!selectedIds || selectedIds.size === 0) return { meters: 0, selected: 0, unmeasured: 0 };
  const selected = (files || []).flatMap((group) => group.items.filter((item) => selectedIds.has(item.id)));
  const printed = applyPrintOverrides(selected, overrides);
  const meters = estimatePrintLength(printed, config).fixedTotalLengthM;
  const unmeasured = printed.filter((item) => estimatePrintLength([item], config).rowsCount === 0).length;
  return { meters, selected: selected.length, unmeasured };
};
