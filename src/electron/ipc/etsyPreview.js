import fs from "node:fs";
import { getEtsyParts } from "./etsyHandlers.js";
import { gateReason } from "./etsyImportLoop.js";
import { createEtsyImporter } from "../helpers/etsyImport.js";
import { receiptFacts } from "../helpers/etsyApi.js";
import { getSettings, getEtsyImportSince } from "../helpers/getSettings.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { getProfile } from "../helpers/shopProfile.js";
import { getAllFabrics, getEtsyFabricMap, getEtsyImport } from "../helpers/db.js";
import { renameNoOverwrite } from "../helpers/renameNoOverwrite.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";

// Settings -> Etsy -> "Check newest order": a DRY RUN of the import on the newest paid order of the shop. It builds
// the same engine as the background tick (helpers/etsyImport.js) and asks only for `preview`, which goes through
// the same prepare() and writes nothing: the engine gets NO claim / setState / move here (only `get`), so a write
// would throw instead of happening, and no file is copied. Works on any station - it also says why the real
// tick would not run here right now (the gate), which is the one thing a switched-on station keeps quiet.

const failure = (message) => Object.assign(new Error(message), { code: "ETSY_PREVIEW_NOT_READY", type: "Warning", title: "Etsy" });

export const previewNewestEtsyOrder = async () => {
  let storage = null;
  try {
    storage = getStorageRootPath();
  } catch {
    storage = null; // ERR_PATHS_NOT_SET
  }
  if (!storage) throw failure("The storage folder is not set.");
  const library = getSettings().etsyLibraryPath ?? "";
  if (!library) throw failure("The Etsy pattern folder is not set - choose it above and press Save import settings.");

  const { client } = getEtsyParts();
  const receipt = await client.newestPaidReceipt();
  const gate = gateReason(() => false);
  if (!receipt) return { receipt: null, lines: [], gate };

  const importer = createEtsyImporter({
    gate: () => null,
    listReceipts: async () => [],
    getFabrics: getAllFabrics,
    getFabricMap: getEtsyFabricMap,
    getProfile,
    storageRoot: () => storage,
    libraryRoot: () => library,
    imports: { get: getEtsyImport },
    fs: { ...fs.promises, constants: fs.constants },
    renameNoOverwrite,
    parse: parsePrintFileName,
  });
  const lines = await importer.preview(receipt);

  return { receipt: receiptFacts(receipt, getEtsyImportSince()), lines, gate };
};
