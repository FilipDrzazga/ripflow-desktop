import { app, ipcMain, dialog, BrowserWindow } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { readFolders } from "./readFolders.js";
import { peekInbox } from "./peekInbox.js";
import { submitBatch } from "./submitBatch.js";
import { openPreview } from "./openPreview.js";
import { openInFolder } from "./openInFolder.js";
import { openInShopify } from "./openInShopify.js";
import { readPrintedFolder, readPrintedDays, readPrintedDay, readSingleBatch, parseBatchFolderName, setDiagWorkstationResolver, getPrintedRootUnreachable } from "./readPrintedFolder.js";
import { sweepOrphanTemps } from "./createBatch.js";
import { rollbackBatchFromHistory, rollbackFileFromHistory, regenerateXmlForBatch, deleteBatchFolder } from "./batchHistoryHandlers.js";
import { registerCustomOrderHandlers } from "./customOrderHandlers.js";
import { registerProductionHandlers } from "./productionHandlers.js";
import { registerRipErrorHandlers } from "./ripErrorHandlers.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getSettings, setSettings, getRollbackDefinitions, clearRollbackDefinitions } from "../helpers/getSettings.js";
import { initDb, insertLog, getAllLogs, clearAllLogs, holdFile, unholdFile, getHeldFiles, pruneOrphanHeldFiles, getRollbackReasonsByBatch, getRollbackReasonsByFile, getRollbackStats, getRollbackDetails, clearAllRollbackReasons, deleteRollbackReason, getLatestRollbackReasonsForFileIds, getReasonDefinitions, setReasonDefinitions as setReasonDefinitionsDb, migrateReasonDefinitions, getAllFabrics, saveFabric, deleteFabric as deleteFabricDb, setAllFabrics, backupDb, cleanupShippedStages, getDbDegraded, getShopProfileRaw, isDbOpen } from "../helpers/db.js";
import { collectDiagnostics, diagnosticsFileName, diagnosticTargets, checkAccess } from "../helpers/diagnostics.js";
import { buildZip } from "../helpers/zipWriter.js";
import { loadFabricCache, invalidateFabricCache } from "../helpers/fabricCache.js";
import { getProfile, getPrinterByCode } from "../helpers/shopProfile.js";
import { loadShopData, reloadShopData } from "../helpers/reloadShopData.js";
import { fabricSaveError, fabricListError } from "../helpers/fabricInput.js";
import { saveShopProfile } from "../helpers/saveShopProfile.js";
import { exportShopProfile, previewShopProfileImport, applyShopProfileImport } from "../helpers/profileTransfer.js";
import { setPrinterResolver } from "./createXML.js";
import { runShopProfileMigration } from "../helpers/runShopProfileMigration.js";
import { describeRollbackFailure, buildRollbackBatchLog } from "../helpers/rollbackFailure.js";

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{4}$/;

let batchWatcher = null;
let watcherSender = null;
const debounceMap = new Map();

// Watcher restart with exponential backoff — fs.watch dies on a dead SMB mount and must
// be revived without hammering the network. One pending restart timer at a time.
let watcherRestartTimer = null;
const WATCHER_RESTART_MIN_MS = 5000;
const WATCHER_RESTART_MAX_MS = 60000;
let watcherRestartDelay = WATCHER_RESTART_MIN_MS;

const getPrintedRootPath = () => path.join(getStorageRootPath(), "PRINTED");

const processWatchEvent = async (relativePath) => {
  if (!watcherSender || watcherSender.isDestroyed()) return;

  const normalized = relativePath.replace(/\//g, path.sep);
  const parts = normalized.split(path.sep).filter(Boolean);

  if (parts.length < 2) return;

  const [dayFolder, batchFolder, ...rest] = parts;

  if (!DAY_FOLDER_RE.test(dayFolder)) return;

  const meta = parseBatchFolderName(batchFolder);
  if (!meta) return;

  const printedRoot = getPrintedRootPath();
  const batchPath = path.join(printedRoot, dayFolder, batchFolder);

  try {
    await fs.promises.access(batchPath);
  } catch {
    watcherSender.send("batch:update", { type: "removed", batchPath });
    return;
  }

  if (rest.length === 0) {
    try {
      const batchData = await readSingleBatch(batchPath, meta);
      watcherSender.send("batch:update", { type: "new-batch", batch: batchData });
    } catch (err) {
      if (err.code === "ENOENT") {
        watcherSender.send("batch:update", { type: "removed", batchPath });
      } else {
        console.error("[watcher] readSingleBatch failed:", err);
      }
    }
    return;
  }

  const fileName = rest[0];
  if (!fileName.toLowerCase().endsWith(".pdf")) return;

  const filePath = path.join(batchPath, fileName);

  try {
    await fs.promises.access(filePath);
    const parsed = parsePrintFileName(fileName, { fullPath: filePath, dir: batchPath, shopConfig: getProfile() });
    watcherSender.send("batch:update", {
      type: "new-file",
      batchPath,
      file: { name: fileName, path: filePath, type: parsed?.printTypeCode || "UNKNOWN" },
    });
  } catch {
    try {
      const batchData = await readSingleBatch(batchPath, meta);
      if (batchData.fileCount === 0) {
        watcherSender.send("batch:update", { type: "removed", batchPath });
      } else {
        watcherSender.send("batch:update", { type: "new-batch", batch: batchData });
      }
    } catch {
      watcherSender.send("batch:update", { type: "removed", batchPath });
    }
  }
};

// Schedule a single backoff-delayed restart. Guarded so a storm of 'error' events (a
// flapping mount) can never stack multiple timers. Backoff grows up to the cap.
const scheduleWatcherRestart = () => {
  if (watcherRestartTimer) return;
  watcherRestartTimer = setTimeout(() => {
    watcherRestartTimer = null;
    startWatcher();
  }, watcherRestartDelay);
  watcherRestartDelay = Math.min(watcherRestartDelay * 2, WATCHER_RESTART_MAX_MS);
};

const handleWatcherError = () => {
  // Tell the renderer the live feed is down so it can switch to polling-fallback.
  if (watcherSender && !watcherSender.isDestroyed()) {
    watcherSender.send("batch:update", { type: "watcher-error" });
  }
  if (batchWatcher) {
    try { batchWatcher.close(); } catch { /* already gone */ }
    batchWatcher = null; // zero it so the restart path doesn't bounce off the guard
  }
  scheduleWatcherRestart();
};

const startWatcher = () => {
  if (batchWatcher) return { success: true }; // already running — don't double-watch

  // Dev-sandbox opt-out: a LOCAL fs.watch sees other processes' writes, so it cannot
  // reproduce SMB's blindness to another host. Setting RIPFLOW_SANDBOX_NO_WATCH=1 lets a
  // manual test prove the poll alone surfaces a new batch. Gated on !app.isPackaged first,
  // so the installed build ignores the env var entirely.
  if (!app.isPackaged && process.env.RIPFLOW_SANDBOX_NO_WATCH === "1") {
    console.log("sandbox: batch watcher disabled");
    return { success: true };
  }

  try {
    const printedRoot = getPrintedRootPath();
    fs.mkdirSync(printedRoot, { recursive: true });

    batchWatcher = fs.watch(printedRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      clearTimeout(debounceMap.get(filename));
      debounceMap.set(
        filename,
        setTimeout(() => {
          debounceMap.delete(filename);
          processWatchEvent(filename).catch(() => {});
        }, 200),
      );
    });

    batchWatcher.on("error", handleWatcherError);

    watcherRestartDelay = WATCHER_RESTART_MIN_MS; // healthy (re)start — reset backoff
    return { success: true };
  } catch (err) {
    // Couldn't create the watcher (e.g. mount still dead) — retry later with backoff.
    scheduleWatcherRestart();
    return { success: false, error: err.message };
  }
};

// async ONLY because of the best-effort backup inside the migration, and only on the one
// start where a migration is actually pending: migrateShopProfile is pure and answers
// changed:false before anything asynchronous is touched, so every later start runs this
// function straight through. main.js awaits it before createWindow().
export async function registerIpcHandlers() {
  initDb();

  // Migrate reasonDefinitions from electron-store to DB (one-time, idempotent)
  const storeReasonDefs = getRollbackDefinitions();
  if (storeReasonDefs && Array.isArray(storeReasonDefs)) {
    migrateReasonDefinitions(storeReasonDefs);
    clearRollbackDefinitions();
  }

  // One-time, idempotent upgrade of an EXISTING shop_profile row. Must land after initDb
  // (it needs the handle) and BEFORE loadShopProfile, which caches the row for the whole
  // session - see the comment on runShopProfileMigration for the full ordering argument.
  await runShopProfileMigration();

  // Both caches, the profile first (the fabric layer reads its material classes) - the same
  // function the operator's "Reload shop data" runs (reloadShopData.js, ETAP 4 4-retry).
  loadShopData();
  // createXML.js routes a job to printers[].hotfolder through this lookup (ETAP 2e step 2);
  // injected because createXML.js must stay importable without db.js. getPrinterByCode reads
  // the live cache on every call, so a profile:set on this station applies at once.
  setPrinterResolver(getPrinterByCode);
  registerCustomOrderHandlers();
  registerProductionHandlers();
  registerRipErrorHandlers();
  cleanupShippedStages(getSettings().shippedRetentionDays ?? 30);

  sweepOrphanTemps().catch(() => {});

  backupDb(false).catch((err) => console.error("[backup] startup backup failed:", err));

  ipcMain.handle("logs:getAll", () => {
    return { success: true, data: getAllLogs() };
  });

  ipcMain.handle("logs:clear", () => {
    clearAllLogs(getSettings().workstationName ?? "");
    return { success: true };
  });

  ipcMain.handle("hold:get", () => {
    return { success: true, data: getHeldFiles() };
  });

  ipcMain.handle("hold:set", (_event, fileId, reason) => {
    holdFile(fileId, reason ?? "");
    return { success: true };
  });

  ipcMain.handle("hold:unset", (_event, fileId) => {
    unholdFile(fileId);
    return { success: true };
  });

  // Delete held_files rows whose file_id is no longer in the inbox. Caller passes the
  // fresh live inbox id set; the diff + empty-guard live in pruneOrphanHeldFiles.
  ipcMain.handle("hold:pruneOrphans", (_event, liveIds) => {
    const res = pruneOrphanHeldFiles(liveIds);
    return { success: res.success, removed: res.removed };
  });

  // ETAP 4 (4-inbox): which PDF names are in the inbox now - names only, cheap (peekInbox.js).
  ipcMain.handle("inbox:peek", () => peekInbox());

  ipcMain.handle("read-folders", async (event) => {
    try {
      return await readFolders({
        onProgress: (payload) => {
          event.sender.send("read-folders:progress", payload);
        },
      });
    } catch (err) {
      return {
        success: false,
        errors: [
          {
            code: err.code || "UNKNOWN_ERROR",
            message: err.message || "An unknown error occurred.",
            stage: err.stage || "read-folders",
            type: err.type || "Error",
            title: err.title || "Read folders failed",
          },
        ],
      };
    }
  });

  ipcMain.handle("submit-batch", async (_event, batch) => {
    const result = await submitBatch(batch);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "submitBatch",
        code: result.success ? "BATCH_SUBMITTED" : (result.errors?.[0]?.code || "BATCH_FAILED"),
        message: result.success
          ? `Batch submitted: ${result.batchId}`
          : (result.errors?.[0]?.message || "Batch submission failed"),
        detail: result.success ? { batchId: result.batchId } : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (submit-batch):", err); }
    return result;
  });

  ipcMain.handle("open-preview", async (_event, filePath) => {
    return openPreview(filePath);
  });

  ipcMain.handle("file:read-buffer", async (_event, filePath) => {
    try {
      const validatedPath = await assertStorageFilePath(filePath, { stage: "file:read-buffer", title: "Invalid file path" });
      const buffer = await fs.promises.readFile(validatedPath);
      return { success: true, data: buffer.toString("base64") };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-in-folder", async (_event, filePath) => {
    return openInFolder(filePath);
  });

  ipcMain.handle("open-in-shopify", async (_event, orderName) => {
    return openInShopify(orderName);
  });

  // Tell the PRINTED-read diagnostics which station they are on. A resolver, not a value:
  // the station name can change in Settings mid-session. Kept out of readPrintedFolder.js
  // so that module never imports getSettings (electron-store) and stays test-isolable.
  setDiagWorkstationResolver(() => getSettings().workstationName ?? null);

  ipcMain.handle("read-printed-folder", async () => {
    return readPrintedFolder();
  });

  ipcMain.handle("read-printed-days", async () => {
    return readPrintedDays();
  });

  ipcMain.handle("read-printed-day", async (_event, dayFolder) => {
    return readPrintedDay(dayFolder);
  });

  ipcMain.handle("regenerate-xml", async (_event, batchPath) => {
    const result = await regenerateXmlForBatch(batchPath);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "regenerateXml",
        code: result.success ? "XML_REGENERATED" : (result.errors?.[0]?.code || "XML_REGEN_FAILED"),
        message: result.success
          ? "XML regenerated successfully"
          : (result.errors?.[0]?.message || "XML regeneration failed"),
        detail: result.success ? null : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (regenerate-xml):", err); }
    return result;
  });

  ipcMain.handle("rollback-batch-history", async (_event, payload) => {
    const result = await rollbackBatchFromHistory(payload);
    // Give the renderer a human cause for the failure (first failed file's OS error,
    // + a tail when more failed). Whole-operation failures keep their errors[] title.
    if (!result.success) {
      const described = describeRollbackFailure(result.failedFiles);
      if (described) {
        result.userMessage = described.message;
        result.userCode = described.code;
      }
    }
    try {
      // Entry assembled by the single pure builder (rollbackFailure.js) so its shape is
      // pinned by a test; the handler only adds id/timestamp.
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...buildRollbackBatchLog(result, getSettings().workstationName),
      });
    } catch (err) { console.error("[ipc] insertLog failed (rollback-batch):", err); }
    return result;
  });

  ipcMain.handle("rollback-file-history", async (_event, payload) => {
    const result = await rollbackFileFromHistory(payload);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "rollbackFile",
        code: result.success ? "FILE_ROLLED_BACK" : (result.errors?.[0]?.code || "FILE_ROLLBACK_FAILED"),
        message: result.success
          ? "File rolled back successfully"
          : (result.errors?.[0]?.message || "File rollback failed"),
        detail: result.success ? null : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (rollback-file):", err); }
    return result;
  });

  ipcMain.handle("get-rollback-stats", (_event, since) => {
    return { success: true, data: getRollbackStats(since ?? null) };
  });

  ipcMain.handle("get-rollback-details", (_event, since) => {
    return { success: true, data: getRollbackDetails(since ?? null) };
  });

  ipcMain.handle("rollback-reasons:clear", () => {
    clearAllRollbackReasons();
    return { success: true };
  });

  ipcMain.handle("rollback-reasons:delete", (_event, id) => {
    const result = deleteRollbackReason(id);
    return { success: !!result };
  });

  ipcMain.handle("get-rollback-reasons-batch", (_event, batchPath) => {
    return { success: true, data: getRollbackReasonsByBatch(batchPath) };
  });

  ipcMain.handle("get-rollback-reasons-file", (_event, fileId) => {
    return { success: true, data: getRollbackReasonsByFile(fileId) };
  });

  ipcMain.handle("get-rollback-reasons-files", (_event, fileIds) => {
    if (!Array.isArray(fileIds)) return { success: true, data: [] };
    return { success: true, data: getLatestRollbackReasonsForFileIds(fileIds) };
  });

  ipcMain.handle("delete-batch", async (_event, batchPath) => {
    const result = await deleteBatchFolder(batchPath);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "deleteBatch",
        code: result.success ? "BATCH_DELETED" : (result.errors?.[0]?.code || "DELETE_FAILED"),
        message: result.success
          ? "Batch deleted"
          : (result.errors?.[0]?.message || "Delete batch failed"),
        detail: result.success ? null : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (delete-batch):", err); }
    return result;
  });

  ipcMain.handle("start-batch-watcher", (event) => {
    watcherSender = event.sender;
    return startWatcher();
  });

  ipcMain.handle("stop-batch-watcher", () => {
    if (watcherRestartTimer) {
      clearTimeout(watcherRestartTimer);
      watcherRestartTimer = null;
    }
    if (batchWatcher) {
      batchWatcher.close();
      batchWatcher = null;
    }
    watcherSender = null;
    watcherRestartDelay = WATCHER_RESTART_MIN_MS; // reset for the next mount
    return { success: true };
  });

  ipcMain.handle("reasonDefs:get", () => {
    return { success: true, data: getReasonDefinitions() };
  });

  ipcMain.handle("reasonDefs:set", (_event, definitions) => {
    if (!Array.isArray(definitions)) return { success: false, error: "Definitions must be an array." };
    return { success: setReasonDefinitionsDb(definitions) };
  });

  ipcMain.handle("fabrics:getAll", () => {
    return { success: true, data: getAllFabrics() ?? [] };
  });

  ipcMain.handle("fabrics:save", (_event, { oldName, fabric }) => {
    // name AND material class (helpers/fabricInput.js, 4-types-b)
    const inputError = fabricSaveError(fabric);
    if (inputError) return { success: false, error: inputError };
    const ok = saveFabric(oldName ?? fabric.name, fabric);
    invalidateFabricCache();
    loadFabricCache();
    return { success: ok };
  });

  ipcMain.handle("fabrics:delete", (_event, name) => {
    if (!name?.trim()) return { success: false, error: "Fabric name is required." };
    const ok = deleteFabricDb(name);
    invalidateFabricCache();
    loadFabricCache();
    return { success: ok };
  });

  ipcMain.handle("fabrics:setAll", (_event, fabrics) => {
    // every row needs a name and a material class; the first bad row refuses the whole list
    // (helpers/fabricInput.js, 4-types-d)
    const listError = fabricListError(fabrics);
    if (listError) return { success: false, error: listError };
    const ok = setAllFabrics(fabrics);
    invalidateFabricCache();
    loadFabricCache();
    return { success: ok };
  });

  // ── shop profile ───────────────────────────────────────────────────────────
  // Its own pair of handlers on purpose: settings:set writes per-machine values to
  // electron-store, while the profile is shop-wide and lives in the shared DB.
  ipcMain.handle("profile:get", () => {
    // null when the DB was unreachable at startup — the caller is told that, not
    // handed a default that would look like a real profile.
    return { success: true, data: getProfile() };
  });

  // ETAP 4 (4-retry): reopen the database if startup could not, then reload the profile and the
  // fabric catalogue - one mechanism for both (helpers/reloadShopData.js). The renderer reloads
  // its own copies from the answers of profile:get / fabrics:getAll afterwards.
  ipcMain.handle("shopData:reload", () => reloadShopData());

  // Compare-and-swap against the profile this station loaded; refuses with PROFILE_CHANGED when
  // another station saved in between, and reloads the cache either way (saveShopProfile.js).
  ipcMain.handle("profile:set", (_event, profile) => saveShopProfile(profile, getSettings().workstationName));

  // The profile as a file (ETAP 3-3, helpers/profileTransfer.js). Main owns the dialogs and the
  // file I/O; the renderer sends nothing but the preview's token back (rule 14). The paths are
  // anywhere the operator picks, like the custom-order CSV - not files under storagePath.
  ipcMain.handle("profile:export", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return exportShopProfile({
      chooseSavePath: async (defaultName) => {
        const result = await dialog.showSaveDialog(win, {
          defaultPath: defaultName,
          filters: [{ name: "Shop profile", extensions: ["json"] }],
        });
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      writeFile: (filePath, content) => fs.promises.writeFile(filePath, content, "utf8"),
    });
  });

  ipcMain.handle("profile:importPreview", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return previewShopProfileImport({
      chooseOpenPath: async () => {
        const result = await dialog.showOpenDialog(win, {
          properties: ["openFile"],
          filters: [{ name: "Shop profile", extensions: ["json"] }],
        });
        return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
      },
      statSize: async (filePath) => (await fs.promises.stat(filePath)).size,
      readFile: (filePath) => fs.promises.readFile(filePath, "utf8"),
    });
  });

  ipcMain.handle("profile:importApply", (_event, token) =>
    applyShopProfileImport(token, { workstation: getSettings().workstationName }),
  );

  ipcMain.handle("db:backup", async () => {
    return backupDb(true);
  });

  ipcMain.handle("db:get-degraded", () => ({ degraded: getDbDegraded() }));

  // ETAP 4 (4-diag): one zip for support - versions, settings (paths only), folder access, the last
  // 500 logs, the stored profile. Saved where the operator chooses; nothing is sent anywhere.
  ipcMain.handle("diagnostics:export", async (event) => {
    try {
      const settings = getSettings();
      const now = new Date();
      const win = BrowserWindow.fromWebContents(event.sender);
      const choice = await dialog.showSaveDialog(win, {
        defaultPath: diagnosticsFileName(settings.workstationName, now),
        filters: [{ name: "Diagnostics", extensions: ["zip"] }],
      });
      if (choice.canceled || !choice.filePath) return { success: true, canceled: true };
      let profileRaw = null;
      try {
        profileRaw = getShopProfileRaw();
      } catch {
        profileRaw = null; // no database - summary.json says so
      }
      const entries = await collectDiagnostics({
        versions: { app: app.getVersion(), electron: process.versions.electron, node: process.versions.node, os: `${os.type()} ${os.release()}` },
        settings,
        logs: getAllLogs(),
        profileRaw,
        dbOpen: isDbOpen(),
        dbDegraded: getDbDegraded(),
        // a real listing - fs.access(W_OK) on Windows ignores the share's permissions (4-diag round 2)
        readDir: (p) => fs.promises.readdir(p),
        now,
      });
      await fs.promises.writeFile(choice.filePath, buildZip(entries, { now }));
      return { success: true, canceled: false, path: choice.filePath };
    } catch (err) {
      return { success: false, error: err?.message ?? String(err) };
    }
  });

  // ETAP 4 (4-wizard): the first-run wizard's folder check - the same folder list and the same
  // real read (readdir) as the diagnostics zip, so the two can never disagree. Nothing is written.
  ipcMain.handle("setup:checkFolders", async () => {
    try {
      const folders = await checkAccess(diagnosticTargets(getSettings(), getProfile()), (p) => fs.promises.readdir(p));
      return { success: true, folders };
    } catch (err) {
      return { success: false, error: err?.message ?? String(err) };
    }
  });

  // ETAP 4 (4-wizard): the wizard ends with a restart - the database, the watchers and the polls
  // start with the paths only at startup. Run from the repo, `npm run dev` (concurrently -k) would
  // take Vite down with this process, so the sandbox answers "restart by hand" like update:check.
  ipcMain.handle("app:relaunch", () => {
    if (!app.isPackaged) return { success: false, reason: "sandbox" };
    app.relaunch();
    app.exit(0);
    return { success: true };
  });

  // Snapshot for the renderer, twin of db:get-degraded: a PRINTED root that was already
  // unreachable when the app started emits its transition before anyone is listening.
  ipcMain.handle("printed:get-unreachable", () => ({ unreachable: getPrintedRootUnreachable() }));

  ipcMain.handle("settings:get", () => {
    return { success: true, settings: getSettings() };
  });

  ipcMain.handle("settings:set", async (_event, settings) => {
    const { storagePath, xmlPath, workstationName, customOrderFolderPath, labelPrinterName, workstationRole, shippedRetentionDays, batchHistoryEagerDays, labelPrintMode, clientId } = settings ?? {};
    if (!storagePath || !xmlPath) {
      return { success: false, error: "Both paths are required." };
    }
    try {
      await fs.promises.access(storagePath);
    } catch {
      return { success: false, error: `Storage path does not exist: ${storagePath}` };
    }
    try {
      await fs.promises.access(xmlPath);
    } catch {
      return { success: false, error: `XML path does not exist: ${xmlPath}` };
    }
    if (customOrderFolderPath) {
      try {
        await fs.promises.access(customOrderFolderPath);
      } catch {
        return { success: false, error: `Custom Order folder path does not exist: ${customOrderFolderPath}` };
      }
    }
    setSettings({ storagePath, xmlPath, workstationName, customOrderFolderPath, labelPrinterName, workstationRole, shippedRetentionDays, batchHistoryEagerDays, labelPrintMode, clientId });
    return { success: true };
  });

  ipcMain.handle("dialog:select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true, path: null };
    }
    return { success: true, canceled: false, path: result.filePaths[0] };
  });
}
