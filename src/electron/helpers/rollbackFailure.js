// Turns a batch-rollback failure into (a) a structured log detail carrying the raw
// OS error codes and (b) a human-readable message for the operator.
//
// Why this exists: rollbackBatchFromHistory collects per-file failures in
// result.failedFiles, but nothing ever surfaced the OS cause. The IPC handler logged
// only result.errors (empty whenever the failures happened inside the per-file loop),
// and the operator saw a bare "Rollback failed" with the ENOENT/EPERM/EXDEV distinction
// discarded - the distinction that costs a day to re-derive from nothing.
//
// Zero imports, on purpose. Same shape as migrateShopProfile.js / dayKey.js: a pure
// function is the only thing here that can carry a test without mocking Electron, fs or
// the DB. The producer (batchHistoryHandlers.js) enriches each failedFiles entry with the
// raw fields { name, src, dest, code, errno, syscall, message }; this module only reads
// them.

// The ONE application error code. Deliberately not one-code-per-OS-errno: a single code
// with different advice text, so the log stays greppable and the operator gets the cause.
export const ROLLBACK_FAILED_CODE = "ERR_ROLLBACK_FAILED";

// Human-readable advice for a single failed file, chosen by its raw OS code.
// `entry` is one failedFiles element: { name, src, dest, code, ... }.
export const describeOsFailure = (entry) => {
  const code = entry?.code;
  const dest = entry?.dest ?? entry?.src ?? entry?.name ?? "(nieznana ścieżka)";
  const name = entry?.name ?? "(nieznany plik)";
  switch (code) {
    case "ENOENT":
      return `Nie znaleziono pliku lub folderu docelowego: ${dest}`;
    case "EPERM":
    case "EACCES":
      return `Brak uprawnień do zapisu w: ${dest}`;
    case "EXDEV":
      return `Plik nie może zostać przeniesiony między dyskami: ${dest}`;
    case "EEXIST":
      return `Plik już istnieje w miejscu docelowym: ${dest}`;
    default:
      return `Błąd systemu (${code ?? "brak kodu"}) przy pliku ${name}`;
  }
};

// Full operator message: the cause of the FIRST failed file, plus a tail when more than
// one failed. Returns null when there is nothing to describe - both null/undefined
// (couldn't read the list) and [] (read it, empty) collapse to null here, because in
// EITHER case there is no per-file cause to show and the caller keeps its generic text.
// The null-vs-[] distinction that matters is kept in summarizeRollbackResult (the log),
// not here (the message).
export const describeRollbackFailure = (failedFiles) => {
  if (!Array.isArray(failedFiles) || failedFiles.length === 0) return null;
  let message = describeOsFailure(failedFiles[0]);
  const rest = failedFiles.length - 1;
  if (rest > 0) {
    message += ` …i jeszcze ${rest} ${rest === 1 ? "plik" : "plików"} (szczegóły w logu).`;
  }
  return { code: ROLLBACK_FAILED_CODE, message };
};

// Structured detail for the session log. Sentinel discipline is kept HERE: a null/undefined
// failedFiles ("could not read") is reported distinctly from an empty array ("read, none
// failed") - `failed` and `failedFiles` are null in the first case, 0 / [] in the second.
export const summarizeRollbackResult = (result) => {
  const succeeded = Array.isArray(result?.restoredFiles) ? result.restoredFiles.length : 0;
  const list = result?.failedFiles;
  const readable = Array.isArray(list);
  const failed = readable ? list.length : null; // null = failedFiles was undefined/null
  return {
    attempted: succeeded + (failed ?? 0),
    succeeded,
    failed,
    failedFiles: readable ? list : null,
    errors: Array.isArray(result?.errors) ? result.errors : [],
  };
};
