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
