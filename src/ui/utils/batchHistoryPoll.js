// Pure helpers for BatchHistory's cross-station poll. Zero React/Electron imports so they
// carry unit tests directly. Why a poll at all (KROK A2): BatchHistory reads the PRINTED
// tree from disk and learns of changes only through fs.watch, which on an SMB share does
// NOT report writes made by ANOTHER host. An operator sitting on the Batch tab would never
// see another station's batch/day without a Refresh. Production already polls; this brings
// the same freshness to BatchHistory.

// Should a poll tick run right now?
export const shouldTick = ({ visible, inFlight, lastTickAt, now, minGapMs }) => {
  if (!visible) return false; // window hidden/minimised — nothing to refresh for
  if (inFlight) return false; // a tick is still running — one request at a time
  if (now - lastTickAt < minGapMs) return false; // debounce visibilitychange bursts
  return true;
};

// Which days to FULLY re-read this tick. Today is ALWAYS read (new batches land there),
// then the expanded + already-loaded days in list order, capped at `max` (today counts
// toward the cap). Skeletons other than today are skipped — they carry no loaded content
// to keep fresh and their batch count already refreshes from the skeleton list.
export const pickDaysToPoll = (dayGroups, { todayFolder, expandedDays, max = 3 }) => {
  const list = Array.isArray(dayGroups) ? dayGroups : [];
  const picked = [];
  const add = (df) => {
    if (df && !picked.includes(df) && picked.length < max) picked.push(df);
  };
  if (todayFolder && list.some((d) => d.dayFolder === todayFolder)) add(todayFolder);
  for (const d of list) {
    if (picked.length >= max) break;
    if (d.loaded === true && expandedDays?.has?.(d.date)) add(d.dayFolder);
  }
  return picked;
};

// Fold this tick's reads back into the day list.
// - `skeletons` = readPrintedDays() output (the full, sorted-desc day list);
// - `days` = full day objects (readPrintedDay) for the days picked this tick.
// Rules: a day present in `days` is replaced by its full object; a day in `prev` that is
// loaded but NOT re-read this tick is kept untouched except its label (so a load-all is
// never undone, and Today/Yesterday re-labels after midnight); a day that is a skeleton in
// `prev`, or absent from `prev` (a new day from another station), takes the fresh skeleton;
// a day absent from `skeletons` (deleted on disk) is dropped. Order follows `skeletons`.
export const mergePolledDays = (prev, { skeletons, days }) => {
  const prevByFolder = new Map((Array.isArray(prev) ? prev : []).map((d) => [d.dayFolder, d]));
  const freshByFolder = new Map((Array.isArray(days) ? days : []).map((d) => [d.dayFolder, d]));
  return (Array.isArray(skeletons) ? skeletons : []).map((sk) => {
    const fresh = freshByFolder.get(sk.dayFolder);
    if (fresh) return fresh;
    const prevDay = prevByFolder.get(sk.dayFolder);
    if (prevDay && prevDay.loaded === true) return { ...prevDay, label: sk.label };
    return sk;
  });
};
