import { toIpcError } from "./ipcError.js";
import { ETSY_IMPORT_STATE, ETSY_LISTING_PRINT_TYPES, ETSY_XWD_INPUT_RE } from "../../shared/constants.js";
import { ETSY_SHIP_DATES_MAX, etsyShipByOf } from "../../shared/etsyShipBy.js";
import { etsyBuyerNoteOf } from "../../shared/etsyBuyerNote.js";
import { otherLiveImporters } from "../../shared/etsyImporters.js";

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

// "Import this order" (E5): the ONLY thing the renderer sends is the receipt number - digits, or a refusal.
export const etsyReceiptIdOf = (value) => {
  const receiptId = typeof value === "string" ? value.trim() : "";
  if (!ETSY_ID_RE.test(receiptId)) throw refusal("INVALID_ETSY_RECEIPT", "The Etsy order is not named by its number.");
  return receiptId;
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

const isControlChar = (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127;

// -> the fabric name a person chose, checked: a non-empty string of a sane length with no control character, and a row
// of the Fabrics catalogue to the character (`has` is the catalogue's own answer, so a stale list in the bar cannot
// write a name that is gone). Never trimmed or case-folded into another name.
export const fabricNameOf = (value, has) => {
  if (typeof value !== "string" || value === "" || value.length > 200 || [...value].some(isControlChar)) {
    throw refusal("INVALID_FABRIC", "The fabric must be chosen from the Fabrics list.");
  }
  if (has(value) !== true) throw refusal("UNKNOWN_FABRIC", `"${value}" is not in the Fabrics catalogue.`);
  return value;
};

// -> the print type code a person chose for a listing: one of ETSY_LISTING_PRINT_TYPES, exactly as spelled.
export const listingPrintTypeOf = (value) => {
  if (typeof value !== "string" || !Object.hasOwn(ETSY_LISTING_PRINT_TYPES, value)) {
    throw refusal("INVALID_PRINT_TYPE", "The print type must be chosen from the list.");
  }
  return value;
};

// The states in which the bar offers a line to a person (the same set as ETSY_IMPORT_OPEN_STATES).
const OPEN_STATES = new Set([ETSY_IMPORT_STATE.NEEDS_REVIEW, ETSY_IMPORT_STATE.FAILED, ETSY_IMPORT_STATE.RETRY]);

export const createEtsyImportRequests = ({
  featureOn, // () => getFeature("etsy")
  isImporter, // () => this station is switched on as the importer
  list, // listOpenEtsyImports
  requestRetry, // requestEtsyImportRetry
  dismiss, // dismissEtsyImport
  getLine = () => undefined, // (receiptId, transactionId) => the etsy_imports row | null | undefined (getEtsyImport)
  hasFabric = () => false, // (name) => the name is a row of the Fabrics catalogue (fail closed: no answer, no fabric)
  listListingFabrics = () => null, // getEtsyListingFabrics
  saveListingFabric = () => null, // setEtsyListingFabric
  forgetListingFabric = () => null, // deleteEtsyListingFabric
  listListingTypes = () => null, // getEtsyListingTypes
  saveListingType = () => null, // setEtsyListingType
  forgetListingType = () => null, // deleteEtsyListingType
  listingTitles = () => null, // getEtsyListingTitles
  listImporters = () => null, // listEtsyImporters
  ownWorkstation = () => "", // () => the name of THIS station (settings)
  now = () => Date.now(),
  requestTick, // () => one tick now on this station
  openExternal, // async (url) => opens the address in the browser (shell.openExternal)
  listingImage = async () => null, // async (listingId) => data: URL | null (helpers/etsyThumbnail.js)
  shipDates = () => null, // (receiptIds) => { receiptId: { shipBy: epoch s | null, buyerNote: text | null } } | null (listEtsyShipDates)
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

  const asyncAnswer = async (stage, title, fn) => {
    try {
      guard();
      return { success: true, ...(await fn()) };
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

    // Plan FAB: the fabric a person chose for a line, remembered for its LISTING (the importer uses it for a line whose own
    // Fabric variation is missing or does not resolve). The renderer names the LINE and the fabric; the listing comes from
    // the row, never from the renderer. Only a line the bar offers (needs_review / failed / retry) can set one. It only
    // writes the choice - the person still presses Retry.
    setListingFabric: (request) =>
      answer("etsy-imports:setListingFabric", "Remembering the Etsy fabric failed", () => {
        const key = keyOf(request);
        const fabricName = fabricNameOf(request?.fabric, hasFabric);
        const row = getLine(key.receiptId, key.transactionId);
        if (!row) throw refusal("ETSY_LINE_GONE", "The Etsy order line is not in the import table (any more).");
        if (!OPEN_STATES.has(row.state)) throw refusal("ETSY_LINE_CLOSED", "That Etsy order line is no longer waiting for a person.");
        const listingId = typeof row.listingId === "string" ? row.listingId.trim() : "";
        if (!ETSY_ID_RE.test(listingId)) throw refusal("NO_ETSY_LISTING", "The Etsy order line has no listing to remember a fabric for.");
        written(saveListingFabric({ listingId, fabricName }));
        return { listingId };
      }),

    // Settings > Etsy (plan IMP-W): the OTHER stations whose Etsy-import switch is On - [{ workstation, minutesAgo }], the
    // newest heartbeat first. [] = asked, none alive; a heartbeat table that cannot be read is an error, never "none".
    otherImporters: () =>
      answer("etsy-imports:otherImporters", "Reading the Etsy importers failed", () => {
        const rows = listImporters();
        if (!Array.isArray(rows)) throw Object.assign(new Error("The Etsy importers could not be read."), { code: "DB_READ_FAILED" });
        return { data: otherLiveImporters(rows, ownWorkstation(), now()) };
      }),

    // Settings > Etsy: everything remembered per listing in ONE answer - [{ listingId, title, fabric, printType }], newest
    // choice first. fabric / printType are null where only the other was chosen; title is null when no line row of the
    // listing carries one. Either memory that cannot be read is an error, never a list that quietly lacks half of it.
    listingChoices: () =>
      answer("etsy-imports:listingChoices", "Reading the remembered Etsy choices failed", () => {
        const fabrics = listListingFabrics();
        const types = listListingTypes();
        if (!Array.isArray(fabrics) || !Array.isArray(types)) {
          throw Object.assign(new Error("The remembered Etsy choices could not be read."), { code: "DB_READ_FAILED" });
        }
        const order = [...new Set([...fabrics, ...types].map((r) => r.listingId))];
        const titles = listingTitles(order) ?? {};
        const data = order.map((listingId) => ({
          listingId,
          title: typeof titles[listingId] === "string" ? titles[listingId] : null,
          fabric: fabrics.find((r) => r.listingId === listingId)?.fabricName ?? null,
          printType: types.find((r) => r.listingId === listingId)?.printType ?? null,
        }));
        return { data };
      }),

    // Plan FAB-3c: the print type a person chose for a line's listing (a snood, an apron). The same rules as the fabric:
    // the listing comes from the row, the line must be one the bar offers, the code must be one of ETSY_LISTING_PRINT_TYPES.
    setListingPrintType: (request) =>
      answer("etsy-imports:setListingPrintType", "Remembering the Etsy print type failed", () => {
        const key = keyOf(request);
        const printType = listingPrintTypeOf(request?.printType);
        const row = getLine(key.receiptId, key.transactionId);
        if (!row) throw refusal("ETSY_LINE_GONE", "The Etsy order line is not in the import table (any more).");
        if (!OPEN_STATES.has(row.state)) throw refusal("ETSY_LINE_CLOSED", "That Etsy order line is no longer waiting for a person.");
        const listingId = typeof row.listingId === "string" ? row.listingId.trim() : "";
        if (!ETSY_ID_RE.test(listingId)) throw refusal("NO_ETSY_LISTING", "The Etsy order line has no listing to remember a print type for.");
        written(saveListingType({ listingId, printType }));
        return { listingId };
      }),

    // { [listingId]: printType } - what is remembered, for the bar and for Settings.
    listingPrintTypes: () =>
      answer("etsy-imports:listingPrintTypes", "Reading the remembered Etsy print types failed", () => {
        const rows = listListingTypes();
        if (!Array.isArray(rows)) throw Object.assign(new Error("The remembered Etsy print types could not be read."), { code: "DB_READ_FAILED" });
        return { data: Object.fromEntries(rows.map((r) => [r.listingId, r.printType])) };
      }),

    forgetListingPrintType: (listingId) =>
      answer("etsy-imports:forgetListingPrintType", "Forgetting the Etsy print type failed", () => {
        const id = typeof listingId === "string" ? listingId.trim() : "";
        if (!ETSY_ID_RE.test(id)) throw refusal("INVALID_ETSY_LISTING", "The Etsy listing is not named by its number.");
        return { deleted: written(forgetListingType(id)).deleted };
      }),

    // { [listingId]: fabricName } - what is remembered, for the bar (the field shows it) and for Settings.
    listingFabrics: () =>
      answer("etsy-imports:listingFabrics", "Reading the remembered Etsy fabrics failed", () => {
        const rows = listListingFabrics();
        if (!Array.isArray(rows)) throw Object.assign(new Error("The remembered Etsy fabrics could not be read."), { code: "DB_READ_FAILED" });
        return { data: Object.fromEntries(rows.map((r) => [r.listingId, r.fabricName])) };
      }),

    forgetListingFabric: (listingId) =>
      answer("etsy-imports:forgetListingFabric", "Forgetting the Etsy fabric failed", () => {
        const id = typeof listingId === "string" ? listingId.trim() : "";
        if (!ETSY_ID_RE.test(id)) throw refusal("INVALID_ETSY_LISTING", "The Etsy listing is not named by its number.");
        return { deleted: written(forgetListingFabric(id)).deleted };
      }),

    dismiss: (request) =>
      answer("etsy-imports:dismiss", "Dismissing the Etsy line failed", () => {
        const { updated } = written(dismiss(keyOf(request)));
        return { updated };
      }),

    // The public page of a listing, for a line whose SKU the person has to look up. The address is built here from
    // the digits only - the renderer never sends a URL.
    openListing: (listingId) =>
      asyncAnswer("etsy-imports:openListing", "Open listing failed", async () => {
        const id = typeof listingId === "string" ? listingId.trim() : "";
        if (!ETSY_ID_RE.test(id)) throw refusal("INVALID_ETSY_LISTING", "The Etsy listing is not named by its number.");
        await openExternal(`https://www.etsy.com/listing/${id}`);
        return {};
      }),

    // The "Ship by" badge and the buyer's-note bubble of Inbox / Production (plans ETA-2 / MSG-2): the earliest ship-by
    // date and the buyer's note of each of the asked orders, { [receiptId]: { shipBy, buyerNote } }.
    // Only a list of receipt numbers (digits, at most ETSY_SHIP_DATES_MAX) crosses - never the whole table, which grows
    // with every order. An order with neither is simply not in the answer; null from the database is an error.
    shipDates: (receiptIds) =>
      answer("etsy-imports:shipDates", "Reading the Etsy ship-by dates failed", () => {
        if (!Array.isArray(receiptIds)) throw refusal("INVALID_ETSY_RECEIPT", "The Etsy orders are not named by a list of numbers.");
        const ids = [...new Set(receiptIds.map(etsyReceiptIdOf))];
        if (ids.length > ETSY_SHIP_DATES_MAX) throw refusal("TOO_MANY_ETSY_RECEIPTS", `At most ${ETSY_SHIP_DATES_MAX} Etsy orders can be asked at once.`);
        const found = ids.length === 0 ? {} : shipDates(ids);
        if (!found) throw Object.assign(new Error("The Etsy ship-by dates could not be read."), { code: "DB_READ_FAILED" });
        // A value that is not usable is dropped here as well - the screens only ever see what etsyShipByOf /
        // etsyBuyerNoteOf accept; an order left with neither is not in the answer.
        const data = {};
        for (const [receiptId, fact] of Object.entries(found)) {
          const shipBy = etsyShipByOf(fact?.shipBy);
          const buyerNote = etsyBuyerNoteOf(fact?.buyerNote);
          if (shipBy !== null || buyerNote !== null) data[receiptId] = { shipBy, buyerNote };
        }
        return { data };
      }),

    // The listing's small picture for a line of the bar, as a data: URL (null: none, or not reachable now). Only the
    // digits cross; main asks Etsy and keeps the answer (etsyThumbnail.js), so the bar may ask on every open.
    listingImage: (listingId) =>
      asyncAnswer("etsy-imports:listingImage", "Etsy listing picture failed", async () => {
        const id = typeof listingId === "string" ? listingId.trim() : "";
        if (!ETSY_ID_RE.test(id)) throw refusal("INVALID_ETSY_LISTING", "The Etsy listing is not named by its number.");
        return { image: await listingImage(id) };
      }),
  };
};
