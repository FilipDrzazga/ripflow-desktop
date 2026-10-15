import { checkPdf } from "../helpers/pdfReadiness.js";
import { PDF_STATE } from "../../shared/inboxReadiness.js";

// The tick behind "Copying..." rows going ready on their own (every 30 s with the inbox look, App.jsx):
// it asks again about ONLY the files the last scan listed as copying - never the whole inbox, so
// it stays cheap, and never with a path from the renderer: main keeps the list itself
// (readFolders hands it over with rememberCopying), so no path crosses the IPC boundary.
//
// { success: true, updates: [{ id, state, reason? }] } - one entry per file whose verdict is no
// longer "copying" (READY or READY_NO_EOF); the renderer applies it with applyReadiness. A file that
// vanished or stopped being a PDF is dropped from the list and reported as nothing: the inbox look
// already tells the operator it is gone.

let pending = new Map(); // id -> full path

export const rememberCopying = (copying) => {
  pending = new Map(copying);
};

export const recheckCopying = async ({ check = checkPdf } = {}) => {
  try {
    const updates = [];
    for (const [id, fullPath] of [...pending]) {
      let verdict;
      try {
        verdict = await check(fullPath);
      } catch {
        continue; // unreadable right now: ask again at the next tick
      }
      if (verdict.state === PDF_STATE.COPYING) continue;
      pending.delete(id);
      if (verdict.state === PDF_STATE.READY || verdict.state === PDF_STATE.READY_NO_EOF) {
        updates.push({ id, state: verdict.state });
      }
    }
    return { success: true, updates };
  } catch (err) {
    return { success: false, error: err?.message ?? String(err) };
  }
};
