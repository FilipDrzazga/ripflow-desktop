// What the inbox scan knows about an inbox PDF being complete, and how that shows on its list
// item. Shared: main decides (helpers/pdfReadiness.js, the ONE test of "is this file finished" -
// the scan and createBatch both call it), the renderer applies a later verdict to a row it already
// holds (store.recheckCopying) with the SAME applyReadiness the scan used, so a row cannot reach a
// status the scan would not have given it.
import { FILE_STATUS } from "./constants.js";

export const PDF_STATE = {
  READY: "ready", // %PDF- header and a %%EOF in the last 1 KB
  READY_NO_EOF: "ready-no-eof", // no %%EOF, but unchanged long enough in this station's own looks
  COPYING: "copying", // not finished (yet): selectable never, and createBatch refuses it
  NOT_PDF: "not-pdf", // not a PDF at all: not listed
  GONE: "gone", // vanished between the directory read and the open: not listed
};

export const NO_EOF_WARNING =
  "No %%EOF marker at the end of the PDF; the file has not changed for 2 minutes, so it is treated as complete.";

// The list item for a verdict. `item.statusParsed` remembers what the filename parse said while the
// row shows COPYING, so the row can go back to it. An INVALID row stays INVALID whatever the
// verdict - a bad name does not change by waiting, and its tooltip says so.
export const applyReadiness = (item, verdict) => {
  const state = verdict?.state;
  const parsed = item.statusParsed ?? item.status;
  const rest = { ...item };
  delete rest.statusParsed;
  delete rest.copyingReason;
  if (parsed === FILE_STATUS.INVALID) return item;

  if (state === PDF_STATE.COPYING) {
    return { ...rest, status: FILE_STATUS.COPYING, statusParsed: parsed, copyingReason: verdict.reason ?? null };
  }
  if (state === PDF_STATE.READY_NO_EOF) {
    const warnings = rest.warnings?.includes(NO_EOF_WARNING) ? rest.warnings : [...(rest.warnings ?? []), NO_EOF_WARNING];
    return { ...rest, status: FILE_STATUS.WARNING, warnings };
  }
  // READY, or a verdict that says nothing about copying: back to what the parse said
  return { ...rest, status: parsed };
};

export const hasCopyingRows = (groups) =>
  (groups ?? []).some((group) => group.items.some((item) => item.status === FILE_STATUS.COPYING));

// The list ([{ items }] groups, as readFolders returns it) after later verdicts
// ([{ id, state, reason? }], recheckCopying.js). Only a row that still shows COPYING is touched, and
// every row keeps its place - a row going ready must not move the list under the operator's hands.
// A group with nothing to change is returned as it was.
export const applyReadinessUpdates = (groups, updates) => {
  const byId = new Map((updates ?? []).map((update) => [update.id, update]));
  if (byId.size === 0) return groups;
  return groups.map((group) => {
    if (!group.items.some((item) => item.status === FILE_STATUS.COPYING && byId.has(item.id))) return group;
    return {
      ...group,
      items: group.items.map((item) =>
        item.status === FILE_STATUS.COPYING && byId.has(item.id) ? applyReadiness(item, byId.get(item.id)) : item,
      ),
    };
  });
};
