// Selecting HELD files in Print, for a bulk Unhold. A second selection next to selectedIds, never
// merged into it: selectedIds feeds Rip, the metres counter, overrides and the material lock, and
// every one of those assumes it holds no held file (toggleItemSelection refuses them). One
// selection at a time - picking held files is refused while files are selected for print, and
// the other way round (toggleItemSelection / toggleGroupSelection) - so no click ever turns one
// kind of selection into the other behind the operator's back.

// Toggle one held file. Refused (same Set back) for a file that is not held, or while a print
// selection exists.
export const toggleHeldId = (heldSelectedIds, id, { heldIds, selectedIds }) => {
  if (!heldIds.has(id) || selectedIds.size > 0) return heldSelectedIds;
  const next = new Set(heldSelectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

// Keep only ids that are still held - another station may have unheld some since (the 30 s poll
// reloads heldIds), and a stale id would make "Unhold N" count a file that is no longer on hold.
export const pruneHeldSelection = (heldSelectedIds, heldIds) => {
  const next = new Set([...heldSelectedIds].filter((id) => heldIds.has(id)));
  return next.size === heldSelectedIds.size ? heldSelectedIds : next;
};

// Unhold ids one by one through `unholdOne` (the IPC call). A file counts as done only on
// { success: true }; a false result or a throw (timeout) lands in `failed`, so the caller can
// keep exactly those selected for another try instead of reporting them as released.
export const unholdMany = async (ids, unholdOne) => {
  const done = [];
  const failed = [];
  for (const id of ids) {
    try {
      const res = await unholdOne(id);
      if (res?.success) done.push(id);
      else failed.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { done, failed };
};
