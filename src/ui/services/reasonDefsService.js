import { withTimeout } from "@/utils/ipcWithTimeout";

export const getRollbackDefinitions = () =>
  withTimeout(window.api.getRollbackDefinitions(), 5_000, "getRollbackDefinitions");
export const setReasonDefinitions = (defs) =>
  withTimeout(window.api.setReasonDefinitions(defs), 30_000, "setReasonDefinitions");
