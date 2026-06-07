import { withTimeout } from "@/utils/ipcWithTimeout";

export const getRollbackStats = (since) =>
  withTimeout(window.api.getRollbackStats(since), 5_000, "getRollbackStats");
export const getRollbackDetails = (since) =>
  withTimeout(window.api.getRollbackDetails(since), 5_000, "getRollbackDetails");
export const clearRollbackReasons = () =>
  withTimeout(window.api.clearRollbackReasons(), 5_000, "clearRollbackReasons");
export const getRollbackReasonsForFiles = (fileIds) =>
  withTimeout(window.api.getRollbackReasonsForFiles(fileIds), 5_000, "getRollbackReasonsForFiles");
