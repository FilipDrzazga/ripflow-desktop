import { notify } from "./notify";

// Wraps a mutating operation call. A timeout (err.timedOut) is NOT an error — the
// operation keeps running in main; we show "in progress" and refresh state from
// disk/DB instead of lying "failed". Real errors are rethrown for the call-site to
// handle as before (notify Error).
export async function runMutation(fn, { refresh, timeoutMessage } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (err?.timedOut) {
      notify(
        {
          type: "Warning",
          title: "Operation still in progress",
          message: timeoutMessage || "Taking longer than expected — refreshing to show the latest state.",
        },
        { stage: "mutation", code: "MUTATION_TIMEOUT" },
      );
      if (refresh) await refresh();
      return { timedOut: true };
    }
    throw err; // real error → call-site handles it as before (notify Error)
  }
}
