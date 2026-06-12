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
  readPrintedFolder: () => ipcRenderer.invoke("read-printed-folder"),
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
  getRollbackDefinitions: () => ipcRenderer.invoke("reasonDefs:get"),
  setReasonDefinitions: (defs) => {
    if (!Array.isArray(defs)) throw new TypeError("Definitions must be an array.");
    return ipcRenderer.invoke("reasonDefs:set", defs);
  },
  getFabricGlobals: () => ipcRenderer.invoke("fabricGlobals:get"),
  setFabricGlobals: (globals) => {
    if (!isPlainObject(globals)) throw new TypeError("Globals must be a plain object.");
    return ipcRenderer.invoke("fabricGlobals:set", globals);
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
  getRollbackStats: (since) => ipcRenderer.invoke("get-rollback-stats", since ?? null),
  getRollbackDetails: (since) => ipcRenderer.invoke("get-rollback-details", since ?? null),
  clearRollbackReasons: () => ipcRenderer.invoke("rollback-reasons:clear"),
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
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),

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
    selectCSV: () => ipcRenderer.invoke("customOrder:selectCSV"),
  }),

  stage: Object.freeze({
    getByBatch:             (batchPath)                    => ipcRenderer.invoke("stage:getByBatch", batchPath),
    getAll:                 ()                             => ipcRenderer.invoke("stage:getAll"),
    getAfter:               (since)                        => ipcRenderer.invoke("stage:getAfter", since),
    advance:                (fileId, newStage, expectedStage) => ipcRenderer.invoke("stage:advance", { fileId, newStage, expectedStage: expectedStage ?? null }),
    reject:                 (fileId, reason, expectedStage)   => ipcRenderer.invoke("stage:reject", { fileId, reason, expectedStage: expectedStage ?? null }),
    override:               (fileId)                       => ipcRenderer.invoke("stage:override", { fileId }),
    clearFile:              (fileId)                       => ipcRenderer.invoke("stage:clearFile", fileId),
    clearBatch:             (batchPath)                    => ipcRenderer.invoke("stage:clearBatch", batchPath),
    setSewingSent:          (fileId, expectedStage, sewingCompany) => ipcRenderer.invoke("stage:setSewingSent", { fileId, expectedStage: expectedStage ?? null, sewingCompany: sewingCompany ?? null }),
    setSewingReceived:      (fileId, expectedStage)        => ipcRenderer.invoke("stage:setSewingReceived", { fileId, expectedStage: expectedStage ?? null }),
    insertRollbackReason:   (data)                         => ipcRenderer.invoke("stage:insertRollbackReason", data),
    getAllHistory:           ()                             => ipcRenderer.invoke("stage:getAllHistory"),
    clearAll:               ()                             => ipcRenderer.invoke("stage:clearAll"),
  }),

  label: Object.freeze({
    printBatch: (data) => ipcRenderer.invoke("label:printBatch", data),
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
