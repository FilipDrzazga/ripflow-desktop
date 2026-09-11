// Turns a batch-rollback failure into (a) a structured log detail carrying the raw
// OS error codes and (b) a message for the operator.
//
// Why this exists: rollbackBatchFromHistory collects per-file failures in
// result.failedFiles, but the cause never reached anyone. The IPC handler logged only
// result.errors (empty whenever the failures happen inside the per-file move loop, since
// errors is assigned only by the outer catch), so the session log read "Rollback failed"
// with no cause. The operator saw a bare "Rollback failed" with the OS code discarded -
// the code that tells ENOENT from EPERM from EXDEV, and that took a day to re-derive from
// nothing during the 2026-09-10 incident.
//
// Zero imports, on purpose. Same shape as migrateShopProfile.js / dayKey.js: a pure
// function is the only thing here that can carry a test without mocking Electron, fs or
// the DB. The producer (batchHistoryHandlers.js) enriches each failedFiles entry with the
// raw fields { name, src, dest, code, errno, syscall, message }; this module only reads
// them.
//
// The message deliberately does NOT diagnose. It says what failed, the OS code and
// syscall, and what to check - it does not name a cause. That restraint is the lesson of
// the 2026-09-10 incident: the failure looked like a permissions or missing-folder
// problem and was in fact Windows Offline Files (CSC) serving a stale cache on one
// station. A confident "folder not found" would have pointed the operator away from the
// real cause. The advice below is phrased so it is true whether or not the guess is.

// The ONE application error code. Deliberately not one-code-per-OS-errno: a single code
// with different advice text, so the log stays greppable and the operator gets the cause.
export const ROLLBACK_FAILED_CODE = "ERR_ROLLBACK_FAILED";

// Advice text (English, ASCII only) chosen by the raw OS code. Each string is true
// regardless of the actual cause - it points at things to CHECK, never states a diagnosis.
const adviceForCode = (code) => {
  switch (code) {
    // rename runs AFTER a successful mkdir(destDir), so the destination folder existed;
    // in the 2026-09-10 incident the source existed too and the cause was the Offline
    // Files cache. A flat "folder not found" here would most likely be a false statement.
    case "ENOENT":
      return " Windows reported 'not found', but the file may still be in the batch folder. Check that the server folder is reachable, then try again.";
    // On Windows a failed rename most often means the file is locked by another process,
    // not a server permission problem ("server denies permission" was the hypothesis
    // disproved in the 2026-09-10 incident).
    case "EPERM":
    case "EACCES":
    case "EBUSY":
      return " The file may be open in another program (PrintFactory, a PDF viewer) or the folder may be read-only. Close it and try again.";
    case "EXDEV":
      return " The inbox and the batch folder are on different drives.";
    case "EEXIST":
      return " A file with the same name is already in the inbox. Nothing was overwritten.";
    default:
      return " See the session log for details.";
  }
};

// One failed file -> a single operator line. Uses the file NAME, never the full path
// (paths live in the log). `entry` is one failedFiles element: { name, code, syscall, ... }.
export const describeOsFailure = (entry) => {
  const name = entry?.name ?? "(unknown file)";
  const code = entry?.code || "(no code)";
  const where = entry?.syscall ? `${code} on ${entry.syscall}` : code;
  return `Could not move "${name}" back to the inbox (${where}).${adviceForCode(entry?.code)}`;
};

// Full operator message: the first failed file's cause, plus a tail when more failed.
// Returns null when there is nothing to describe (empty or not an array) - the caller
// keeps its generic text in that case.
export const describeRollbackFailure = (failedFiles) => {
  if (!Array.isArray(failedFiles) || failedFiles.length === 0) return null;
  let message = describeOsFailure(failedFiles[0]);
  const rest = failedFiles.length - 1;
  if (rest > 0) message += ` (+${rest} more - see the session log)`;
  return { code: ROLLBACK_FAILED_CODE, message };
};

// Structured detail for the session log: counts + the raw per-file OS fields. The
// producer always returns arrays for restoredFiles/failedFiles/errors; the Array.isArray
// guards are defensive against a malformed result, not a claim about distinct states.
export const summarizeRollbackResult = (result) => {
  const failedFiles = Array.isArray(result?.failedFiles) ? result.failedFiles : [];
  const succeeded = Array.isArray(result?.restoredFiles) ? result.restoredFiles.length : 0;
  return {
    attempted: succeeded + failedFiles.length,
    succeeded,
    failed: failedFiles.length,
    failedFiles,
    errors: Array.isArray(result?.errors) ? result.errors : [],
  };
};

// The session-log entry for a batch rollback, WITHOUT id/timestamp (the IPC handler adds
// those). This is the single place the entry is assembled, so the failure detail cannot
// silently regress to the empty { errors: [] } it used to be: on failure the detail is the
// full summary (counts + the raw per-file OS fields + the errors[] channel), on success it
// is just { restoredFiles }. The handler must set result.userMessage/userCode (from
// describeRollbackFailure) before calling this, exactly as it did inline.
export const buildRollbackBatchLog = (result, workstation) => {
  const summary = summarizeRollbackResult(result);
  return {
    type: result.success ? "success" : "error",
    stage: "rollbackBatch",
    code: result.success
      ? "BATCH_ROLLED_BACK"
      : (result.errors?.[0]?.code || result.userCode || "ROLLBACK_FAILED"),
    message: result.success
      ? `Batch rolled back: ${result.restoredFiles?.length || 0} files restored`
      : `Rollback failed: ${summary.succeeded}/${summary.attempted} restored`
        + (result.userMessage ? ` — ${result.userMessage}` : ""),
    detail: result.success ? { restoredFiles: result.restoredFiles } : summary,
    workstation,
  };
};
