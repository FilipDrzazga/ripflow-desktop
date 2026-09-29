// The files as they will actually be printed: effectiveQty = manual override ?? reprintQty ??
// parsed original. One function for the two readers that must agree - submitBatch (what goes to
// the RIP and the batch label) and the print-length counter in the selection bar - so the number
// the operator sees before pressing Rip is the number the label prints afterwards.
//
// Every overridden/reprinted item also carries provenance fields (_printed, _manual, _reprintQty,
// _reprintOriginal) so createBatch can persist the two-dimensional shape into
// _batch_info.overrides (Etap 2).
export const applyPrintOverrides = (items, overrides) =>
  items.map((item) => {
    const manual = overrides?.get(item.id);
    const reprintQty = item.reprintQty ?? null;
    const reprintOriginal = item.reprintQtyOriginal ?? null;
    const isLm = item.printTypeCode === "LM";

    if (manual) {
      // Manual operator override: overwrite the printed qty/height AND tag the
      // file (qtyOverride/metersOverride + _*Overridden/_original*) so XML,
      // file_stages and badges treat it as an override. _reprint* may still be
      // non-null when the operator overrode a file that was itself a reprint -
      // both dimensions then coexist in provenance.
      return {
        ...item,
        ...(manual.qty != null ? { qty: manual.qty, qtyOverride: manual.qty, _originalQty: item.qty, _qtyOverridden: true } : {}),
        ...(manual.meters != null ? { height: Math.round(manual.meters * 1000), metersOverride: manual.meters, _originalHeight: item.height, _heightOverridden: true } : {}),
        _printed: manual.meters != null ? { meters: manual.meters } : { qty: manual.qty },
        _manual: true,
        _reprintQty: reprintQty,
        _reprintOriginal: reprintOriginal,
      };
    }
    if (reprintQty != null) {
      // Open reprint request with no manual override: print only the affected
      // quantity, but do NOT set any override flag - this is a reprint, not an
      // operator override, so file_stages.*_override stays empty and no false
      // "Override" badge is shown downstream. Provenance still records it.
      return {
        ...item,
        ...(isLm ? { height: Math.round(reprintQty * 1000) } : { qty: reprintQty }),
        _printed: isLm ? { meters: reprintQty } : { qty: reprintQty },
        _manual: false,
        _reprintQty: reprintQty,
        _reprintOriginal: reprintOriginal,
      };
    }
    return item;
  });
