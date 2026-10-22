// What the Etsy bar of the Inbox says (plan E4b). Pure, so it carries tests without rendering.
// The rows come from IPC `etsy-imports:list` (db.listOpenEtsyImports): receiptId, transactionId, state,
// reason, title, quantity, listingId, manualXwd, updatedAt.

import { ETSY_IMPORT_INTERRUPTED_REASON, ETSY_IMPORT_STATE, ETSY_XWD_INPUT_RE } from "../../shared/constants";

// How often the bar asks for the open lines: a read of one small table, and the importer checks Etsy every few minutes (Settings > Etsy on that station).
export const ETSY_BAR_POLL_MS = 30_000;

export const lineKey = (row) => `${row.receiptId}:${row.transactionId}`;

// The order number the rest of the app uses for an Etsy order (src/shared/orderSource.js).
export const etsyOrderIdOf = (row) => `ET${row.receiptId}`;

// A number typed into the field -> { ok: true, value } (six digits, or null for an empty field = judge the line
// again as it is) or { ok: false, message }. Spaces around the number are ignored, nothing else is fixed up.
export const readXwdInput = (text) => {
  const typed = String(text ?? "").trim();
  if (typed === "") return { ok: true, value: null };
  if (!ETSY_XWD_INPUT_RE.test(typed)) return { ok: false, message: "The XWD number is exactly six digits." };
  return { ok: true, value: typed };
};

// The field starts from the number a person typed before (Retry with an empty field stores NULL and clears it).
export const initialXwdInput = (row) => (typeof row?.manualXwd === "string" ? row.manualXwd : "");

// E4c: the XWD number the importer found in the library for a line without one (a hint, never applied) - offered
// only where the person can act on it, and only as six digits.
export const suggestionOf = (row) =>
  canRetry(row) && typeof row?.suggestedXwd === "string" && ETSY_XWD_INPUT_RE.test(row.suggestedXwd) ? row.suggestedXwd : null;

export const suggestionText = (xwd) => `Suggestion: XWD${xwd} - a library file matches the design and designer in this listing's title. Check the file before you use it.`;

// Does this library file belong to this suggested number? A library file name carries "XWD<six digits>" (D83: an importer on an
// OLDER build rewrites suggested_xwd and leaves the name of the previous number, which must not be shown beside the new one).
export const suggestionFileFits = (xwd, fileName) =>
  typeof xwd === "string" && typeof fileName === "string" && fileName.toUpperCase().includes(`XWD${xwd}`);

// The library file the suggestion names (D76), as the tail of its tooltip - only for a suggestion offered; "" for a row without
// the name (a row from before D76, or a failed ALTER) or with a name of another number (D83).
export const suggestionFileNote = (row) =>
  suggestionFileFits(suggestionOf(row), row?.suggestedFile) ? ` Library file: "${row.suggestedFile}".` : "";

export const isInterrupted = (row) => row?.reason === ETSY_IMPORT_INTERRUPTED_REASON;

export const isWaitingForImporter = (row) => row?.state === ETSY_IMPORT_STATE.RETRY;

// Retry is offered for a line that waits for a person; a RETRY already waits for the importer.
export const canRetry = (row) => row?.state === ETSY_IMPORT_STATE.NEEDS_REVIEW || row?.state === ETSY_IMPORT_STATE.FAILED;

export const stateChip = (row) => {
  if (row.state === ETSY_IMPORT_STATE.RETRY) return { tone: "wait", text: "Retry requested" };
  if (row.state === ETSY_IMPORT_STATE.FAILED) return { tone: "bad", text: "Failed" };
  return { tone: "warn", text: "Needs a person" };
};

// The line under the reason: what the person is waiting for.
export const stateHint = (row, importerHere) => {
  if (row.state !== ETSY_IMPORT_STATE.RETRY) return null;
  return importerHere
    ? "Retry requested - this station imports it in a moment."
    : "Retry requested - the importer station picks it up at its next check of Etsy.";
};

// The words of a line's state badge (FILIP 2026-10-22 16:33): why it stopped - or, once a Retry is requested, who acts
// next, which is what the person waits for then. The state itself is the badge's icon and colour.
export const statusText = (row, importerHere) => stateHint(row, importerHere) ?? (typeof row.reason === "string" && row.reason.trim() !== "" ? row.reason : stateChip(row).text);

// The badge's tooltip: everything, uncut - the state, the reason and the hint.
export const statusTitle = (row, importerHere) => [stateChip(row).text, row.reason, stateHint(row, importerHere)].filter((part) => typeof part === "string" && part.trim() !== "").join("\n");

export const lineTitle = (row) => (typeof row.title === "string" && row.title.trim() !== "" ? row.title.trim() : "Order line without a title");

export const barTitle = (rows) => {
  const count = rows.length;
  const waiting = rows.filter(isWaitingForImporter).length;
  const base = `${count} Etsy order ${count === 1 ? "line needs" : "lines need"} a person`;
  return waiting > 0 ? `${base} (${waiting} waiting for the importer)` : base;
};

export const retryConfirmMessage = (row) =>
  `${row.reason}\n\nImport ${etsyOrderIdOf(row)} again anyway? A second copy of the file may end up in a batch.`;

export const dismissConfirmMessage = (row) =>
  `Mark "${lineTitle(row)}" (${etsyOrderIdOf(row)}) as not a print?\n\nThe importer never looks at this line again.`;

const failure = (res, fallbackTitle) => {
  const error = res?.error ?? res?.errors?.[0];
  return {
    type: error?.type === "Warning" ? "Warning" : "Error",
    title: error?.title || fallbackTitle,
    message: error?.message || "No answer from RipFlow's main process.",
  };
};

// retry answer -> the notify() payload.
export const retryNotice = (res, row) => {
  if (!res?.success) return failure(res, "Etsy retry failed");
  if (!res.updated) {
    return { type: "Warning", title: "Etsy order line", message: `${etsyOrderIdOf(row)} was already moved by someone else - the list is reloaded.` };
  }
  return {
    type: "Success",
    title: "Etsy retry requested",
    message: res.importerHere
      ? `${etsyOrderIdOf(row)} is being imported by this station.`
      : `${etsyOrderIdOf(row)} - the importer station picks it up at its next check of Etsy.`,
  };
};

export const dismissNotice = (res, row) => {
  if (!res?.success) return failure(res, "Dismissing the Etsy line failed");
  if (!res.updated) {
    return { type: "Warning", title: "Etsy order line", message: `${etsyOrderIdOf(row)} was already moved by someone else - the list is reloaded.` };
  }
  return { type: "Success", title: "Etsy order line dismissed", message: `${etsyOrderIdOf(row)} will not be imported.` };
};

export const listingNotice = (res) => (res?.success ? null : failure(res, "Open listing failed"));

// The typed texts of the fields without one line's entry: after a Retry that was written, the field goes back to the
// number the database holds (`manualXwd`), which another station may have changed since the person typed.
export const withoutTyped = (typed, key) => {
  if (!Object.hasOwn(typed, key)) return typed;
  const { [key]: _dropped, ...rest } = typed;
  return rest;
};
