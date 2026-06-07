import { withTimeout } from "@/utils/ipcWithTimeout";

export const readPrintedFolder = () =>
  withTimeout(window.api.readPrintedFolder(), 15_000, "readPrintedFolder");
export const getRollbackReasonsByBatch = (batchPath) =>
  withTimeout(window.api.getRollbackReasonsByBatch(batchPath), 5_000, "getRollbackReasonsByBatch");
export const startBatchWatcher = () =>
  withTimeout(window.api.startBatchWatcher(), 5_000, "startBatchWatcher");
export const stopBatchWatcher = () =>
  withTimeout(window.api.stopBatchWatcher(), 5_000, "stopBatchWatcher");
export const onBatchUpdate = (cb) => window.api.onBatchUpdate(cb);
export const rollbackFile = (args) =>
  withTimeout(window.api.rollbackFile(args), 30_000, "rollbackFile");
export const rollbackBatch = (args) =>
  withTimeout(window.api.rollbackBatch(args), 30_000, "rollbackBatch");
export const deleteBatch = (batchPath) =>
  withTimeout(window.api.deleteBatch(batchPath), 30_000, "deleteBatch");
export const regenerateXml = (batchPath) =>
  withTimeout(window.api.regenerateXml(batchPath), 30_000, "regenerateXml");
