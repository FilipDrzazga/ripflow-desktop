import { useEffect, useState } from "react";
import { readPrintedDays, readPrintedDayNames } from "../services/batchService";
import { PRINTED_SCAN, createPrintedSweep } from "../utils/printedSweep";

// Shared by every window the operator opens: a day listed a minute ago is not read again (printedSweep.js, TTL).
const sharedDayCache = new Map();

const NOT_STARTED = { status: PRINTED_SCAN.IDLE, days: [], listed: 0, total: 0 };

/**
 * The history half of the Ctrl+F window: lists the PRINTED folders in the background once `armed` is true and
 * keeps what it has listed. `armed` is sticky on the caller's side (the first query long enough to search): the
 * listing does not depend on the query, so a shorter query later must not cancel it.
 *
 * Returns `{ status, days, listed, total }`. Between `armed` turning true and the first answer of the sweep the
 * status already reads RUNNING - the window must not say "not found" for the moment it takes to list the days.
 */
export const usePrintedSearch = (armed) => {
  const [scan, setScan] = useState(NOT_STARTED);

  useEffect(() => {
    if (!armed) return undefined;
    let cancelled = false;
    const sweep = createPrintedSweep({ readDays: readPrintedDays, readDayNames: readPrintedDayNames, cache: sharedDayCache });
    sweep.run({
      onUpdate: (next) => {
        if (!cancelled) setScan(next);
      },
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [armed]);

  return armed && scan.status === PRINTED_SCAN.IDLE ? { ...scan, status: PRINTED_SCAN.RUNNING } : scan;
};
