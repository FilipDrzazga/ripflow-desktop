import fs from "node:fs";
import { getEtsyParts } from "./etsyHandlers.js";
import { createEtsyImporter } from "../helpers/etsyImport.js";
import { etsyImportGate } from "../helpers/etsyImportGate.js";
import { getSettings, getEtsyImportSince } from "../helpers/getSettings.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { getProfile, getFeature } from "../helpers/shopProfile.js";
import { isDbOpen, getAllFabrics, getEtsyFabricMap, getEtsyImport, claimEtsyImport, setEtsyImportState, moveEtsyImport, listEtsyImportRetries } from "../helpers/db.js";
import { renameNoOverwrite } from "../helpers/renameNoOverwrite.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { clampEtsyImportMinutes } from "../../shared/etsyImportInterval.js";

// The background half of the Etsy import (plan E3b-2): ONE tick every few minutes on the station that is
// switched on as the importer. The rules of the import itself are in helpers/etsyImport.js; this file only
// supplies the real parts and the pause. Started once from main.js with the power pause of that file.

// The wait between two ticks, read again before every wait: a change in Settings > Etsy applies from the next tick,
// without a restart (FILIP 2026-10-22). Default and range: shared/etsyImportInterval.js.
export const etsyImportIntervalMs = () => clampEtsyImportMinutes(getSettings().etsyImportIntervalMin) * 60 * 1000;
// The first tick waits, so the start-up reads (profile, fabrics, inbox) are not joined by an Etsy call.
const FIRST_TICK_DELAY_MS = 60 * 1000;

// The running loop's tick, for requestEtsyImportTick; null before the start and after the stop.
let runNow = null;
// The running loop's one-order import, for importEtsyReceiptNow; null outside the loop's life, like runNow.
let importNow = null;

const libraryPath = () => getSettings().etsyLibraryPath ?? "";

const storagePathOrNull = () => {
  try {
    return getStorageRootPath();
  } catch {
    return null; // ERR_PATHS_NOT_SET
  }
};

// anyStartDate: "Import this order" (E5) - the same gate without the start date.
export const gateReason = (isPaused, { anyStartDate = false } = {}) => {
  let etsyStatus = null;
  try {
    etsyStatus = getEtsyParts().credentials.status();
  } catch {
    etsyStatus = null;
  }
  const settings = getSettings();
  return etsyImportGate({
    paused: isPaused(),
    dbOpen: isDbOpen(),
    featureOn: getFeature("etsy"),
    enabled: settings.etsyImportEnabled,
    storageSet: storagePathOrNull() !== null,
    libraryPath: settings.etsyLibraryPath ?? "",
    since: getEtsyImportSince(),
    etsyStatus,
    anyStartDate,
  });
};

export const startEtsyImportLoop = ({ isPaused }) => {
  const tick = createEtsyImporter({
    gate: (options) => gateReason(isPaused, options),
    listReceipts: () => getEtsyParts().client.listOpenReceipts({ minCreated: getEtsyImportSince() }),
    getReceipt: (receiptId) => getEtsyParts().client.getReceipt(receiptId),
    getFabrics: getAllFabrics,
    getFabricMap: getEtsyFabricMap,
    getProfile,
    storageRoot: () => storagePathOrNull(),
    libraryRoot: libraryPath,
    imports: { get: getEtsyImport, claim: claimEtsyImport, setState: setEtsyImportState, move: moveEtsyImport, listRetries: listEtsyImportRetries },
    fs: { ...fs.promises, constants: fs.constants },
    renameNoOverwrite,
    parse: parsePrintFileName,
    log: (line) => console.log(line),
  });

  let running = false;
  let again = false;
  let lastNote = null;

  const run = async () => {
    if (running) return; // a slow share must not stack ticks
    running = true;
    try {
      const result = await tick();
      // One line per CHANGE of the reason, never one per tick: a switched-off station is quiet.
      const note = result.reason ?? null;
      if (note !== lastNote) {
        if (note) console.log(`[etsy-import] ${result.ran ? "stopped" : "idle"}: ${note}`);
        lastNote = note;
      }
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      await run();
    }
  };

  // One timer at a time: each tick, when it ends, books the next one with the interval of that moment.
  let timer = null;
  let stopped = false;
  const schedule = (ms) => {
    timer = setTimeout(() => {
      run()
        .catch((err) => console.error("[etsy-import] tick failed:", err))
        .finally(() => {
          if (!stopped) schedule(etsyImportIntervalMs());
        });
    }, ms);
  };
  schedule(FIRST_TICK_DELAY_MS);
  // A request that arrives during a tick gets one more pass right after it (that tick may have read the row
  // before the request was written); the interval keeps its old rule and simply skips.
  runNow = () => {
    if (running) {
      again = true;
      return Promise.resolve();
    }
    return run();
  };
  // "Import this order" (E5) shares the tick's `running`: never beside a tick, and a tick that comes due meanwhile
  // skips like it does beside another tick. A request for a tick that arrived meanwhile runs right after.
  importNow = async (receiptId) => {
    if (running) return { busy: true };
    running = true;
    try {
      return await tick.importReceipt(receiptId);
    } finally {
      running = false;
      if (again) {
        again = false;
        run().catch((err) => console.error("[etsy-import] tick after the order import failed:", err));
      }
    }
  };
  return () => {
    runNow = null;
    importNow = null;
    stopped = true;
    clearTimeout(timer);
  };
};

// A Retry from the Inbox bar of THIS station (E4): one tick now instead of at the next booked one. On a station that
// is not the importer the gate closes the tick at once, so the call is harmless anywhere.
export const requestEtsyImportTick = () => {
  if (runNow) runNow().catch((err) => console.error("[etsy-import] tick on request failed:", err));
};

// "Import this order" from Settings > Etsy (E5). -> { busy: true } while a tick runs, else the engine's summary
// ({ ran, reason, imported, needsReview, failed, skipped }). receiptId: digits, checked by the caller.
export const importEtsyReceiptNow = async (receiptId) => {
  if (!importNow) return { ran: false, reason: "the Etsy import has not started yet in this window", imported: 0, needsReview: 0, failed: 0, skipped: 0 };
  return importNow(receiptId);
};
