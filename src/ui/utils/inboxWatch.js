// ETAP 4 (4-inbox): what changed in the inbox since the list was loaded, from the light peeks
// (peekInbox in main, every 30 s). Pure: the store only feeds it the id sets.
//
// ids are `${folder}_${file}` - the shape of the loaded list's item ids. Four sets:
// - loaded:   the ids of the list on screen (store.files);
// - baseline: a peek taken when that list was loaded. readFolders leaves some PDF names out (an
//             empty or half-copied file, one that is not a real PDF, one the parser cannot read),
//             so a peek always shows a few names the list never will - the baseline makes those
//             "old" instead of "new" forever;
// - previous: the peek before this one;
// - current:  this peek.
//
// added   - in this peek AND in the previous one (a file still being copied shows up on one look
//           and may be gone or renamed by the next - two looks cut the false alarms), and neither
//           on the list nor in the baseline;
// removed - on the list but no longer in the inbox (another station took it, it was deleted) -
//           reported at once: a SELECTED file that is gone must be marked before Submit fails.
// Both sorted, so the store can compare answers cheaply.

const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));

export const inboxDiff = ({ loaded, baseline, previous, current }) => {
  const L = asSet(loaded);
  const B = asSet(baseline);
  const P = asSet(previous);
  const C = asSet(current);
  const added = [...C].filter((id) => P.has(id) && !L.has(id) && !B.has(id)).sort();
  const removed = [...L].filter((id) => !C.has(id)).sort();
  return { added, removed };
};

// The ids of the list on screen, from store.files ([{ items: [{ id }] }]).
export const loadedInboxIds = (groups) => (groups || []).flatMap((g) => (g.items || []).map((i) => i.id));

// The selected files that left the inbox - the rows to mark before the operator submits them.
export const goneSelectedIds = (removed, selectedIds) => {
  const sel = asSet(selectedIds);
  return (removed || []).filter((id) => sel.has(id));
};

// The label of the pill above the list (null = no pill).
export const inboxPillLabel = ({ added = [], removed = [], error = false } = {}) => {
  if (error) return "Can't check the inbox";
  const parts = [];
  if (added.length) parts.push(`${added.length} new ${added.length === 1 ? "file" : "files"}`);
  if (removed.length) parts.push(`${removed.length} ${removed.length === 1 ? "file" : "files"} gone`);
  return parts.length ? `${parts.join(" · ")} - click to refresh` : null;
};
