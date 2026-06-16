// Shared timeout for mutating operations (submit / rollback / delete / regenerate).
// Generous so a slow-but-alive SMB scan is never cut short — see #6.
export const MUTATING_TIMEOUT_MS = 90000;

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const err = new Error(`IPC timeout (${ms}ms): ${label}`);
        err.timedOut = true; // tag so callers recognize a timeout without string-matching
        reject(err);
      }, ms)
    ),
  ]);
}
