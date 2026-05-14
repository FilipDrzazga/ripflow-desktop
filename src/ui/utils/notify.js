import { useStore } from "../store/useStore";

const ALERT_TO_LOG_TYPE = {
  Error: "error",
  Warning: "warning",
  Success: "success",
  Info: "info",
};

export const notify = (
  { type, title, message },
  { stage = "app", code = "", detail = null } = {}
) => {
  const { setAlert, addLog } = useStore.getState();

  setAlert({ id: crypto.randomUUID(), type, title, message });

  addLog({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: ALERT_TO_LOG_TYPE[type] || "info",
    stage,
    code,
    message: title + (message ? `: ${message}` : ""),
    detail,
  });
};
