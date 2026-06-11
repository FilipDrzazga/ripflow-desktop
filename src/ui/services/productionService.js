import { withTimeout } from "@/utils/ipcWithTimeout";

export const getStagesByBatch               = (batchPath)                      => withTimeout(window.api.stage.getByBatch(batchPath),              15_000, "stage:getByBatch");
export const getAllStages                   = ()                               => withTimeout(window.api.stage.getAll(),                           15_000, "stage:getAll");
export const getStagesAfter                = (since)                          => withTimeout(window.api.stage.getAfter(since),                    15_000, "stage:getAfter");
export const advanceStage                  = (fileId, newStage, expectedStage) => withTimeout(window.api.stage.advance(fileId, newStage, expectedStage ?? null), 10_000, "stage:advance");
export const rejectStage                   = (fileId, reason, expectedStage)   => withTimeout(window.api.stage.reject(fileId, reason, expectedStage ?? null),    10_000, "stage:reject");
export const overrideStage                 = (fileId)                         => withTimeout(window.api.stage.override(fileId),                   10_000, "stage:override");
export const setSewingSent                 = (fileId, expectedStage, sewingCompany) => withTimeout(window.api.stage.setSewingSent(fileId, expectedStage ?? null, sewingCompany ?? null), 10_000, "stage:setSewingSent");
export const setSewingReceived             = (fileId, expectedStage)          => withTimeout(window.api.stage.setSewingReceived(fileId, expectedStage ?? null),   10_000, "stage:setSewingReceived");
export const insertProductionRollbackReason = (data)                          => withTimeout(window.api.stage.insertRollbackReason(data),          5_000,  "stage:insertRollbackReason");
export const printBatchLabel               = (data)                           => withTimeout(window.api.label.printBatch(data),                   30_000, "label:printBatch");
export const getAllStageHistory             = ()                               => withTimeout(window.api.stage.getAllHistory(),                     15_000, "stage:getAllHistory");
export const clearAllProductionStages      = ()                               => withTimeout(window.api.stage.clearAll(),                         10_000, "stage:clearAll");
