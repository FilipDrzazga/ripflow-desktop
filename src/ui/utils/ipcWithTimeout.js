export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`IPC timeout (${ms}ms): ${label}`)), ms)
    ),
  ]);
}
