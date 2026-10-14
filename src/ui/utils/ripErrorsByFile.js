import { RIP_ERROR_SCOPE } from "../../shared/constants";

// One RIP-error row per file for the store: file_id -> the MOST RECENT open row.
//
// A file can hold several open rows at once - dedup in the DB is on (job_guid, file_id),
// so two failed jobs for the same file are two rows. The badge only needs "is there one",
// but the popover shows the row's message and time, and those must be the latest event.
//
// Picked by detected_at, not by position. The DB happens to answer ORDER BY detected_at
// DESC, and the previous Object.fromEntries kept the LAST row per key - i.e. the OLDEST.
// Comparing the timestamp makes the result independent of whatever order the rows
// arrive in. detected_at is always new Date().toISOString(), so a string compare is a
// time compare. On a tie (or a missing timestamp) the first row seen stays.
// No guard for a row without file_id: the column is NOT NULL, the parser drops such
// rows and the ingest skips them, so it cannot reach here.
export const latestRipErrorPerFile = (rows) => {
  const byFile = {};
  if (!Array.isArray(rows)) return byFile;
  for (const row of rows) {
    const kept = byFile[row.file_id];
    if (!kept || (row.detected_at ?? "") > (kept.detected_at ?? "")) byFile[row.file_id] = row;
  }
  return byFile;
};

// The whole-batch failure over a group of files (a batch's file stems, keys of store.ripErrors):
// the most recent of their rows with scope BATCH, or null. A batch failure gives EVERY file of the
// batch a row, so any one of them is enough - the header badge stays while at least one of the
// batch's files still carries it (a single-file rollback resolves only that file's row).
export const batchRipErrorOf = (fileIds, ripErrors) => {
  let found = null;
  for (const fileId of fileIds) {
    const row = ripErrors?.[fileId];
    if (row?.scope !== RIP_ERROR_SCOPE.BATCH) continue;
    if (!found || (row.detected_at ?? "") > (found.detected_at ?? "")) found = row;
  }
  return found;
};

// What the Overview "RIP errors" pill counts: failures, not files. A batch failure is ONE (its
// job_guid) however many files it put a badge on; a file failure counts once per file, as before.
// A row without a scope (written before the column existed) is a file failure.
export const countRipErrorEvents = (ripErrors) => {
  const keys = new Set();
  for (const row of Object.values(ripErrors ?? {})) {
    keys.add(row.scope === RIP_ERROR_SCOPE.BATCH ? `job:${row.job_guid}` : `file:${row.file_id}`);
  }
  return keys.size;
};

// The store map without the rows of one job - the optimistic drop after a whole-batch failure was
// resolved. The same object when nothing matched, so a no-op does not re-render the subscribers.
export const withoutRipErrorJob = (ripErrors, jobGuid) => {
  let changed = false;
  const next = {};
  for (const [fileId, row] of Object.entries(ripErrors)) {
    if (row.job_guid === jobGuid) { changed = true; continue; }
    next[fileId] = row;
  }
  return changed ? next : ripErrors;
};
