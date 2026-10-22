import { toIpcError } from "./ipcError.js";
import { ETSY_XWD_INPUT_RE } from "../../shared/constants.js";

// What the Inbox bar of ANY station may ask about the Etsy import (plan E4): the open lines, a Retry (optionally
// with the XWD number typed in) and a Dismiss. It only reads and WRITES REQUESTS in etsy_imports - the copy is
// always the importer's (helpers/etsyImport.js). Everything is injected, so it runs in tests without Electron.
//
// - Fail closed: features.etsy off (or the profile unreadable) refuses every call, like every gated effect.
// - The number is checked HERE as well as in the engine: six digits or nothing. Never trimmed into shape
//   beyond surrounding spaces, never padded.
// - A guarded write that matched no row is `updated: false` (the line was already moved - by the importer, or
//   by a person on another station), not an error: the bar reloads and shows where it is now.

const ETSY_ID_RE = /^\d{1,20}$/;

const refusal = (code, message) => Object.assign(new Error(message), { code, type: "Warning", title: "Etsy import" });

const keyOf = (request) => {
  const receiptId = typeof request?.receiptId === "string" ? request.receiptId.trim() : "";
  const transactionId = typeof request?.transactionId === "string" ? request.transactionId.trim() : "";
  if (!ETSY_ID_RE.test(receiptId) || !ETSY_ID_RE.test(transactionId)) {
    throw refusal("INVALID_ETSY_LINE", "The Etsy order line is not named by its receipt and line numbers.");
  }
  return { receiptId, transactionId };
};

// -> the number to store (six digits) or null for "judge the line again as it is".
export const manualXwdOf = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw refusal("INVALID_XWD", "The XWD number must be typed as text.");
  const typed = value.trim();
  if (typed === "") return null;
  if (!ETSY_XWD_INPUT_RE.test(typed)) throw refusal("INVALID_XWD", `The XWD number must be exactly six digits (got "${typed}").`);
  return typed;
};

export const createEtsyImportRequests = ({
  featureOn, // () => getFeature("etsy")
  isImporter, // () => this station is switched on as the importer
  list, // listOpenEtsyImports
  requestRetry, // requestEtsyImportRetry
  dismiss, // dismissEtsyImport
  requestTick, // () => one tick now on this station
}) => {
  const guard = () => {
    if (!featureOn()) throw refusal("ETSY_DISABLED", "The Etsy import is not switched on for this shop.");
  };

  const answer = (stage, title, fn) => {
    try {
      guard();
      return { success: true, ...fn() };
    } catch (err) {
      if (err.type !== "Warning") console.error(`[etsy-import] ${stage} failed:`, err);
      return { success: false, error: toIpcError(err, stage, title) };
    }
  };

  const written = (result) => {
    if (!result) throw Object.assign(new Error("The import table could not be written."), { code: "DB_WRITE_FAILED" });
    return result;
  };

  return {
    list: () =>
      answer("etsy-imports:list", "Reading the Etsy import failed", () => {
        const rows = list();
        if (!Array.isArray(rows)) throw Object.assign(new Error("The Etsy import table could not be read."), { code: "DB_READ_FAILED" });
        return { data: rows, importerHere: Boolean(isImporter()) };
      }),

    retry: (request) =>
      answer("etsy-imports:retry", "Etsy retry failed", () => {
        const key = keyOf(request);
        const manualXwd = manualXwdOf(request?.xwd);
        const { updated } = written(requestRetry({ ...key, manualXwd }));
        const importerHere = Boolean(isImporter());
        if (updated && importerHere) requestTick();
        return { updated, importerHere };
      }),

    dismiss: (request) =>
      answer("etsy-imports:dismiss", "Dismissing the Etsy line failed", () => {
        const { updated } = written(dismiss(keyOf(request)));
        return { updated };
      }),
  };
};
