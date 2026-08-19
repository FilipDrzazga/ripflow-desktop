// Day derivation for the Production view.
//
// file_stages carries NO creation timestamp — `updated_at` is rewritten on every
// stage transition, so it is not the day a batch was printed. The printed-folder
// layout is the authority instead:
//
//   {storagePath}\PRINTED\DD-MM-YYYY\PRINTED_HHMMSS-GROUP-PRINTER[_N]
//
// (built in helpers/createBatchIds.js + ipc/createBatch.js; the `_N` collision
// suffix lands on the batch folder, never on the day folder). This is the same
// key BatchHistory groups by, so both views agree on "the day".
//
// The renderer cannot import from src/electron, so DAY_FOLDER_RE mirrors
// ipc/readPrintedFolder.js:12 and getDayLabel mirrors readPrintedFolder.js:46-57.

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{4}$/;

// Bucket for rows whose batch_path carries no parsable day folder. They are
// never dropped — they collapse into one group sorted last.
export const UNKNOWN_DAY_KEY = "unknown";

// batch_path -> "DD-MM-YYYY" | null. Handles both separators: batch_path is
// re-rooted by withLocalBatchPath (main), which preserves the day + batch
// segments verbatim, but the root may arrive with either slash style.
export const dayKeyFromBatchPath = (batchPath) => {
  if (typeof batchPath !== "string" || !batchPath) return null;
  const segments = batchPath.split(/[/\\]/).filter(Boolean);
  const day = segments[segments.length - 2];
  return day && DAY_FOLDER_RE.test(day) ? day : null;
};

// "DD-MM-YYYY" -> Date at LOCAL midnight (the day folder is written from the
// submitting workstation's local clock, so local is the matching frame).
export const parseDayKey = (key) => {
  if (typeof key !== "string" || !DAY_FOLDER_RE.test(key)) return null;
  const [d, mo, y] = key.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  date.setHours(0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible dates that Date silently rolls over (e.g. 32-01-2026).
  if (date.getDate() !== d || date.getMonth() !== mo - 1 || date.getFullYear() !== y) return null;
  return date;
};

// "Today" | "Yesterday" | null — same semantics as readPrintedFolder.js.
export const getDayLabel = (key) => {
  const date = parseDayKey(key);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return null;
};

// Newest day first. Unparsable keys (incl. UNKNOWN_DAY_KEY) always sort last,
// whichever side they appear on.
export const compareDayKeysDesc = (a, b) => {
  const da = parseDayKey(a);
  const db = parseDayKey(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return db.getTime() - da.getTime();
};

// Oldest day first — the backlog order used by the Production "Stuck" tab.
// NOT `[...days].sort(compareDayKeysDesc).reverse()`: reversing would drag the
// unparsable bucket to the TOP. Unparsable keys stay last in both directions.
export const compareDayKeysAsc = (a, b) => {
  const da = parseDayKey(a);
  const db = parseDayKey(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
};

// Whole days between that day and today (0 = today). null when unparsable.
export const daysSinceDayKey = (key) => {
  const date = parseDayKey(key);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / 86_400_000);
};
