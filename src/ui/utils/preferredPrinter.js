// The preferred printer of a fabric (fabrics.preferred_printer, see .claude/rules/database.md):
// a printers[].code of the shop profile, of the fabric's OWN class. main refuses any other code on
// save (fabricSaveError); these helpers keep Settings > Fabrics from ever sending one, and tell
// Print which codes to ignore.

const ofClass = (printers, materialClass) =>
  (Array.isArray(printers) ? printers : []).filter((p) => p?.materialClass === materialClass && typeof p?.code === "string");

// The printers a fabric of this class may prefer.
export const preferredPrinterOptions = (printers, materialClass) => ofClass(printers, materialClass);

// "none" | "ok" | "stale". Stale = a stored code that is not (or no longer) a printer of the
// fabric's class in the profile: the printer was removed or renamed, the fabric changed class on
// another station, or the profile could not be read. Shown, never acted on.
export const preferredPrinterState = (code, printers, materialClass) => {
  if (!code) return "none";
  return ofClass(printers, materialClass).some((p) => p.code === code) ? "ok" : "stale";
};

// The draft after the operator picks another class: the preference belonged to the old class
// (a Polyesters printer is never valid for Cottons), so it is cleared rather than left to make
// main refuse the whole save.
export const draftWithType = (draft, type) =>
  draft.type === type ? draft : { ...draft, type, preferredPrinter: null };

// What the save sends. A value the operator did NOT change is not sent (undefined): main then
// neither validates nor overwrites it (preferredPrinterToStore keeps the stored value), so a
// stale preference never blocks saving the other fields of the fabric. A changed value - a code
// chosen, None, or the null a class change leaves (draftWithType) - is sent as it is, and main
// validates it.
export const preferredPrinterToSend = (draft, original) => {
  const chosen = draft.preferredPrinter || null;
  const stored = original?.preferredPrinter || null;
  return chosen === stored ? undefined : chosen;
};

// ── Print (step C) ──────────────────────────────────────────────────────────
// The preferred printer Print acts on for ONE file: its fabric's code (by the file's material
// name, the same lookup the estimator makes), and only when that code is "ok" for the fabric's
// class - a stale code is ignored, the same rule Settings shows (preferredPrinterState).
export const preferredPrinterForItem = (item, fabrics, printers) => {
  const name = (item?.material ?? "").toString().trim();
  const fabric = (Array.isArray(fabrics) ? fabrics : []).find((f) => f?.name === name);
  if (!fabric?.preferredPrinter) return null;
  return preferredPrinterState(fabric.preferredPrinter, printers, fabric.type) === "ok" ? fabric.preferredPrinter : null;
};

// The one preferred printer shared by EVERY given file, else null: files with different
// preferences, or any file without one, give no suggestion at all - never a majority vote.
// Used for the group header pill and for the pre-selection in the selection bar.
export const sharedPreferredPrinter = (items, fabrics, printers) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  const codes = new Set(list.map((item) => preferredPrinterForItem(item, fabrics, printers)));
  if (codes.size !== 1) return null;
  return [...codes][0];
};
