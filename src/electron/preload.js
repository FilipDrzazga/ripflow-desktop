const { contextBridge, ipcRenderer } = require("electron");

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const isValidBatchItem = (item) => {
  return isPlainObject(item) && isPlainObject(item.file) && isNonEmptyString(item.file.fullPath);
};

const assertBatch = (batch) => {
  if (!Array.isArray(batch) || batch.length === 0 || !batch.every(isValidBatchItem)) {
    throw new TypeError("Batch must be a non-empty array of items with file.fullPath.");
  }
};

const assertPath = (filePath) => {
  if (!isNonEmptyString(filePath)) {
    throw new TypeError("File path must be a non-empty string.");
  }
};

const api = Object.freeze({
  readFolders: () => ipcRenderer.invoke("read-folders"),
  // ETAP 4 (4-inbox): the PDF names in the inbox, for "N new files" - no parsing, cheap.
  peekInbox: () => ipcRenderer.invoke("inbox:peek"),
  recheckCopying: () => ipcRenderer.invoke("inbox:recheck-copying"),
  onReadFoldersProgress: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("Progress callback must be a function.");
    }

    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("read-folders:progress", handler);

    return () => ipcRenderer.removeListener("read-folders:progress", handler);
  },
  submitBatch: (batch) => {
    assertBatch(batch);
    return ipcRenderer.invoke("submit-batch", batch);
  },
  openPreview: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("open-preview", filePath);
  },
  readFileBuffer: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("file:read-buffer", filePath);
  },
  openInFolder: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("open-in-folder", filePath);
  },
  openInShopify: (orderName) => {
    if (!isNonEmptyString(orderName)) throw new TypeError("Order name must be a non-empty string.");
    return ipcRenderer.invoke("open-in-shopify", orderName);
  },
  openInEtsy: (orderName, options) => {
    if (!isNonEmptyString(orderName)) throw new TypeError("Order name must be a non-empty string.");
    return ipcRenderer.invoke("open-in-etsy", orderName, options?.conversation === true);
  },
  readPrintedFolder: () => ipcRenderer.invoke("read-printed-folder"),
  readPrintedDays: () => ipcRenderer.invoke("read-printed-days"),
  readPrintedDay: (dayFolder) => {
    if (!isNonEmptyString(dayFolder)) throw new TypeError("Day folder must be a non-empty string.");
    return ipcRenderer.invoke("read-printed-day", dayFolder);
  },
  readPrintedDayNames: (dayFolder) => {
    if (!isNonEmptyString(dayFolder)) throw new TypeError("Day folder must be a non-empty string.");
    return ipcRenderer.invoke("read-printed-day-names", dayFolder);
  },
  regenerateXml: (batchPath) => {
    assertPath(batchPath);
    return ipcRenderer.invoke("regenerate-xml", batchPath);
  },
  rollbackBatch: (payload) => {
    if (!isPlainObject(payload) || !isNonEmptyString(payload.batchPath)) {
      throw new TypeError("rollbackBatch requires { batchPath: string }");
    }
    return ipcRenderer.invoke("rollback-batch-history", payload);
  },
  rollbackFile: (payload) => {
    if (!isPlainObject(payload) || !isNonEmptyString(payload.filePath) || !isNonEmptyString(payload.batchPath)) {
      throw new TypeError("rollbackFile requires { filePath: string, batchPath: string }");
    }
    return ipcRenderer.invoke("rollback-file-history", payload);
  },
  deleteBatch: (batchPath) => {
    assertPath(batchPath);
    return ipcRenderer.invoke("delete-batch", batchPath);
  },
  startBatchWatcher: () => ipcRenderer.invoke("start-batch-watcher"),
  stopBatchWatcher: () => ipcRenderer.invoke("stop-batch-watcher"),
  onBatchUpdate: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("Batch update callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("batch:update", handler);
    return () => ipcRenderer.removeListener("batch:update", handler);
  },
  onDbError: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("DB error callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("db:error", handler);
    return () => ipcRenderer.removeListener("db:error", handler);
  },
  onDbRecovered: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("DB recovered callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("db:recovered", handler);
    return () => ipcRenderer.removeListener("db:recovered", handler);
  },
  getDbDegraded: () => ipcRenderer.invoke("db:get-degraded"),
  // ETAP 4 (4-diag): main opens the save dialog and writes the zip; nothing comes back but the path.
  exportDiagnostics: () => ipcRenderer.invoke("diagnostics:export"),
  // ETAP 4 (4-power): { paused } on a transition - sleep / lock screen pause the polls.
  onPowerPaused: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("Power pause callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("power:paused", handler);
    return () => ipcRenderer.removeListener("power:paused", handler);
  },
  // Snapshot for a window that loaded after the transition: { paused }.
  getPowerPaused: () => ipcRenderer.invoke("power:get-paused"),
  // ETAP 4 (4-wizard): read-only folder check (readdir) and the closing restart.
  checkSetupFolders: () => ipcRenderer.invoke("setup:checkFolders"),
  relaunchApp: () => ipcRenderer.invoke("app:relaunch"),
  onPrintedRootUnreachable: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("PRINTED root callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("printed:unreachable", handler);
    return () => ipcRenderer.removeListener("printed:unreachable", handler);
  },
  onPrintedRootReachable: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("PRINTED root callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("printed:reachable", handler);
    return () => ipcRenderer.removeListener("printed:reachable", handler);
  },
  getPrintedRootUnreachable: () => ipcRenderer.invoke("printed:get-unreachable"),
  getRollbackDefinitions: () => ipcRenderer.invoke("reasonDefs:get"),
  setReasonDefinitions: (defs) => {
    if (!Array.isArray(defs)) throw new TypeError("Definitions must be an array.");
    return ipcRenderer.invoke("reasonDefs:set", defs);
  },
  getFabrics: () => ipcRenderer.invoke("fabrics:getAll"),
  saveFabric: (oldName, fabric) => {
    if (!isPlainObject(fabric)) throw new TypeError("Fabric must be a plain object.");
    return ipcRenderer.invoke("fabrics:save", { oldName, fabric });
  },
  deleteFabric: (name) => {
    if (!isNonEmptyString(name)) throw new TypeError("Fabric name must be a non-empty string.");
    return ipcRenderer.invoke("fabrics:delete", name);
  },
  setAllFabrics: (fabrics) => {
    if (!Array.isArray(fabrics)) throw new TypeError("Fabrics must be an array.");
    return ipcRenderer.invoke("fabrics:setAll", fabrics);
  },
  profile: {
    get: () => ipcRenderer.invoke("profile:get"),
    set: (profile) => {
      if (!isPlainObject(profile)) throw new TypeError("Profile must be a plain object.");
      return ipcRenderer.invoke("profile:set", profile);
    },
    // ETAP 3-3: main opens the dialogs and reads/writes the file; only the token comes back.
    export: () => ipcRenderer.invoke("profile:export"),
    importPreview: () => ipcRenderer.invoke("profile:importPreview"),
    importApply: (token) => {
      if (!isNonEmptyString(token)) throw new TypeError("Import token must be a non-empty string.");
      return ipcRenderer.invoke("profile:importApply", token);
    },
  },
  // ETAP 4 (4-retry): reopen the DB if needed and reload the profile + fabric caches in main.
  shopData: {
    reload: () => ipcRenderer.invoke("shopData:reload"),
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => {
    if (!isPlainObject(settings)) throw new TypeError("Settings must be a plain object.");
    return ipcRenderer.invoke("settings:set", settings);
  },
  showConfirm: (message) => {
    if (!isNonEmptyString(message)) throw new TypeError("Confirm message must be a non-empty string.");
    return ipcRenderer.invoke("dialog:confirm", message);
  },
  getLogs: () => ipcRenderer.invoke("logs:getAll"),
  clearLogs: () => ipcRenderer.invoke("logs:clear"),
  getHeldFiles: () => ipcRenderer.invoke("hold:get"),
  holdFile: (fileId, reason) => {
    assertPath(fileId);
    return ipcRenderer.invoke("hold:set", fileId, reason ?? "");
  },
  unholdFile: (fileId) => {
    assertPath(fileId);
    return ipcRenderer.invoke("hold:unset", fileId);
  },
  // liveIds is a plain diff key list (never used for file ops) — no assertPath needed.
  pruneOrphanHolds: (liveIds) => ipcRenderer.invoke("hold:pruneOrphans", liveIds),
  getRollbackStats: (since) => ipcRenderer.invoke("get-rollback-stats", since ?? null),
  getRollbackDetails: (since) => ipcRenderer.invoke("get-rollback-details", since ?? null),
  clearRollbackReasons: () => ipcRenderer.invoke("rollback-reasons:clear"),
  deleteRollbackReason: (id) => ipcRenderer.invoke("rollback-reasons:delete", id),
  getRollbackReasonsByBatch: (batchPath) => {
    assertPath(batchPath);
    return ipcRenderer.invoke("get-rollback-reasons-batch", batchPath);
  },
  getRollbackReasonsByFile: (fileId) => {
    assertPath(fileId);
    return ipcRenderer.invoke("get-rollback-reasons-file", fileId);
  },
  getRollbackReasonsForFiles: (fileIds) => {
    if (!Array.isArray(fileIds)) throw new TypeError("fileIds must be an array.");
    return ipcRenderer.invoke("get-rollback-reasons-files", fileIds);
  },
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  backupDb: () => ipcRenderer.invoke("db:backup"),
  selectFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  closeWindow: () => ipcRenderer.send("window:close"),
  toggleMaximizeWindow: () => ipcRenderer.send("window:toggle-maximize"),
  // { maximized } on every maximise / restore (button, double click on the title bar, Win+Up).
  onWindowMaximizedChanged: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("Window maximized callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("window:maximized-changed", handler);
    return () => ipcRenderer.removeListener("window:maximized-changed", handler);
  },
  // Snapshot for a window that loaded after the last change: { maximized }.
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),

  customOrder: Object.freeze({
    scanFolder: () => ipcRenderer.invoke("customOrder:scanFolder"),
    importCSVContent: (content) => {
      if (!isNonEmptyString(content)) throw new TypeError("CSV content must be a non-empty string.");
      return ipcRenderer.invoke("customOrder:importCSVContent", content);
    },
    generateXML: (group) => {
      if (!isPlainObject(group)) throw new TypeError("Group must be a plain object.");
      return ipcRenderer.invoke("customOrder:generateXML", group);
    },
    getHistory: () => ipcRenderer.invoke("customOrder:getHistory"),
    clearHistory: () => ipcRenderer.invoke("customOrder:clearHistory"),
    deleteOrder: (id) => ipcRenderer.invoke("customOrder:deleteOrder", id),
    selectCSV: () => ipcRenderer.invoke("customOrder:selectCSV"),
  }),

  stage: Object.freeze({
    getByBatch:             (batchPath)                    => ipcRenderer.invoke("stage:getByBatch", batchPath),
    getAll:                 ()                             => ipcRenderer.invoke("stage:getAll"),
    getAfter:               (since)                        => ipcRenderer.invoke("stage:getAfter", since),
    advance:                (fileId, newStage, expectedStage) => ipcRenderer.invoke("stage:advance", { fileId, newStage, expectedStage: expectedStage ?? null }),
    clearFile:              (fileId)                       => ipcRenderer.invoke("stage:clearFile", fileId),
    clearBatch:             (batchPath)                    => ipcRenderer.invoke("stage:clearBatch", batchPath),
    setSewingSent:          (fileId, expectedStage, sewingCompany) => ipcRenderer.invoke("stage:setSewingSent", { fileId, expectedStage: expectedStage ?? null, sewingCompany: sewingCompany ?? null }),
    setSewingReceived:      (fileId, expectedStage)        => ipcRenderer.invoke("stage:setSewingReceived", { fileId, expectedStage: expectedStage ?? null }),
    getAllHistory:           ()                             => ipcRenderer.invoke("stage:getAllHistory"),
    clearAll:               ()                             => ipcRenderer.invoke("stage:clearAll"),
  }),

  label: Object.freeze({
    printBatch: (data) => ipcRenderer.invoke("label:printBatch", data),
  }),

  reprint: Object.freeze({
    getOpen: () => ipcRenderer.invoke("reprint:getOpen"),
  }),

  ripErrors: Object.freeze({
    scan: () => ipcRenderer.invoke("rip-errors:scan"),
    get: () => ipcRenderer.invoke("rip-errors:get"),
    resolve: (fileId) => ipcRenderer.invoke("rip-errors:resolve", fileId),
    resolveJob: (jobGuid) => ipcRenderer.invoke("rip-errors:resolveJob", jobGuid),
  }),

  // Settings -> Etsy (plan E2): this station's Etsy key and sign-in. Main keeps the secrets;
  // every answer carries only the public status.
  etsy: Object.freeze({
    status: () => ipcRenderer.invoke("etsy:status"),
    saveKey: (key) => {
      if (!isPlainObject(key)) throw new TypeError("Etsy key must be a plain object.");
      if (!isNonEmptyString(key.keystring) || !isNonEmptyString(key.sharedSecret)) {
        throw new TypeError("Etsy keystring and shared secret must be non-empty strings.");
      }
      return ipcRenderer.invoke("etsy:saveKey", { keystring: key.keystring, sharedSecret: key.sharedSecret });
    },
    connect: () => ipcRenderer.invoke("etsy:connect"),
    test: () => ipcRenderer.invoke("etsy:test"),
    disconnect: () => ipcRenderer.invoke("etsy:disconnect"),
    removeKey: () => ipcRenderer.invoke("etsy:removeKey"),
  }),

  // The Inbox bar of the Etsy import (plan E4), on any station: the lines that wait for a person, and the two
  // requests a person can write. Only the two key fields and the typed number cross; main checks all three.
  etsyImports: Object.freeze({
    list: () => ipcRenderer.invoke("etsy-imports:list"),
    retry: (line) => {
      if (!isPlainObject(line)) throw new TypeError("Etsy import line must be a plain object.");
      return ipcRenderer.invoke("etsy-imports:retry", { receiptId: line.receiptId, transactionId: line.transactionId, xwd: line.xwd ?? null });
    },
    dismiss: (line) => {
      if (!isPlainObject(line)) throw new TypeError("Etsy import line must be a plain object.");
      return ipcRenderer.invoke("etsy-imports:dismiss", { receiptId: line.receiptId, transactionId: line.transactionId });
    },
    openListing: (listingId) => {
      if (!isNonEmptyString(listingId)) throw new TypeError("Etsy listing number must be a non-empty string.");
      return ipcRenderer.invoke("etsy-imports:openListing", listingId);
    },
    listingImage: (listingId) => {
      if (typeof listingId !== "string" || !/^\d{1,20}$/.test(listingId)) throw new TypeError("Etsy listing number must be a string of digits.");
      return ipcRenderer.invoke("etsy-imports:listingImage", listingId);
    },
    // -> { success, data: { [receiptId]: { shipBy: epoch s | null, buyerNote: text | null } } } (plans ETA-2 / MSG-2)
    shipDates: (receiptIds) => {
      if (!Array.isArray(receiptIds) || receiptIds.some((id) => typeof id !== "string" || !/^\d{1,20}$/.test(id))) {
        throw new TypeError("Etsy order numbers must be a list of strings of digits.");
      }
      return ipcRenderer.invoke("etsy-imports:shipDates", receiptIds);
    },
    previewNewest: () => ipcRenderer.invoke("etsy-imports:previewNewest"),
    importOrder: (receiptId) => {
      if (typeof receiptId !== "string" || !/^\d{1,20}$/.test(receiptId)) throw new TypeError("Etsy order number must be a string of digits.");
      return ipcRenderer.invoke("etsy-imports:importOrder", receiptId);
    },
  }),

  update: Object.freeze({
    check: () => ipcRenderer.invoke("update:check"),
    install: () => ipcRenderer.invoke("update:install"),
    onAvailable: (cb) => {
      const handler = (_e, version) => cb(version);
      ipcRenderer.on("update:available", handler);
      return () => ipcRenderer.removeListener("update:available", handler);
    },
    onProgress: (cb) => {
      const handler = (_e, percent) => cb(percent);
      ipcRenderer.on("update:progress", handler);
      return () => ipcRenderer.removeListener("update:progress", handler);
    },
    onReady: (cb) => {
      const handler = () => cb();
      ipcRenderer.on("update:ready", handler);
      return () => ipcRenderer.removeListener("update:ready", handler);
    },
    onNotAvailable: (cb) => {
      const handler = () => cb();
      ipcRenderer.on("update:not-available", handler);
      return () => ipcRenderer.removeListener("update:not-available", handler);
    },
    onError: (cb) => {
      const handler = (_e, msg) => cb(msg);
      ipcRenderer.on("update:error", handler);
      return () => ipcRenderer.removeListener("update:error", handler);
    },
  }),
});

contextBridge.exposeInMainWorld("api", api);
