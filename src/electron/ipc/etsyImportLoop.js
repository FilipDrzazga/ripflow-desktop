import fs from "node:fs";
import { getEtsyParts } from "./etsyHandlers.js";
import { createEtsyImporter } from "../helpers/etsyImport.js";
import { etsyImportGate } from "../helpers/etsyImportGate.js";
import { getSettings, getEtsyImportSince } from "../helpers/getSettings.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { getProfile, getFeature } from "../helpers/shopProfile.js";
import { isDbOpen, getAllFabrics, getEtsyFabricMap, getEtsyImport, claimEtsyImport, setEtsyImportState, moveEtsyImport } from "../helpers/db.js";
import { renameNoOverwrite } from "../helpers/renameNoOverwrite.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";

// The background half of the Etsy import (plan E3b-2): ONE tick every few minutes on the station that is
// switched on as the importer. The rules of the import itself are in helpers/etsyImport.js; this file only
// supplies the real parts and the pause. Started once from main.js with the power pause of that file.

export const ETSY_IMPORT_INTERVAL_MS = 5 * 60 * 1000;
// The first tick waits, so the start-up reads (profile, fabrics, inbox) are not joined by an Etsy call.
const FIRST_TICK_DELAY_MS = 60 * 1000;

// The running loop's tick, for requestEtsyImportTick; null before the start and after the stop.
let runNow = null;

const libraryPath = () => getSettings().etsyLibraryPath ?? "";

const storagePathOrNull = () => {
  try {
    return getStorageRootPath();
  } catch {
    return null; // ERR_PATHS_NOT_SET
  }
};

export const gateReason = (isPaused) => {
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
  });
};

export const startEtsyImportLoop = ({ isPaused }) => {
  const tick = createEtsyImporter({
    gate: () => gateReason(isPaused),
    listReceipts: () => getEtsyParts().client.listOpenReceipts({ minCreated: getEtsyImportSince() }),
    getFabrics: getAllFabrics,
    getFabricMap: getEtsyFabricMap,
    getProfile,
    storageRoot: () => storagePathOrNull(),
    libraryRoot: libraryPath,
    imports: { get: getEtsyImport, claim: claimEtsyImport, setState: setEtsyImportState, move: moveEtsyImport },
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

  const first = setTimeout(run, FIRST_TICK_DELAY_MS);
  const timer = setInterval(run, ETSY_IMPORT_INTERVAL_MS);
  // A request that arrives during a tick gets one more pass right after it (that tick may have read the row
  // before the request was written); the interval keeps its old rule and simply skips.
  runNow = () => {
    if (running) {
      again = true;
      return Promise.resolve();
    }
    return run();
  };
  return () => {
    runNow = null;
    clearTimeout(first);
    clearInterval(timer);
  };
};

// A Retry from the Inbox bar of THIS station (E4): one tick now instead of within 5 minutes. On a station that
// is not the importer the gate closes the tick at once, so the call is harmless anywhere.
export const requestEtsyImportTick = () => {
  if (runNow) runNow().catch((err) => console.error("[etsy-import] tick on request failed:", err));
};
