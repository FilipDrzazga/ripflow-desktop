import { describe, it, expect } from "vitest";
import { FILE_STATUS } from "./constants.js";
import { PDF_STATE, NO_EOF_WARNING, applyReadiness, applyReadinessUpdates } from "./inboxReadiness.js";

const row = (id, status = FILE_STATUS.READY, extra = {}) => ({ id, status, warnings: [], errors: [], ...extra });

describe("applyReadiness", () => {
  it("READY leaves a ready row exactly as it was", () => {
    const r = row("a");
    expect(applyReadiness(r, { state: PDF_STATE.READY })).toEqual(r);
  });

  it("COPYING shows the row as COPYING and remembers what the parse said", () => {
    const out = applyReadiness(row("a"), { state: PDF_STATE.COPYING, reason: "the end of the file is still empty" });
    expect(out).toMatchObject({ status: FILE_STATUS.COPYING, statusParsed: FILE_STATUS.READY, copyingReason: "the end of the file is still empty" });
  });

  it("a COPYING row goes back to its parsed status when the file is ready, leaving no trace", () => {
    const copying = applyReadiness(row("a"), { state: PDF_STATE.COPYING, reason: "x" });
    const back = applyReadiness(copying, { state: PDF_STATE.READY });
    expect(back).toEqual(row("a"));
    expect("statusParsed" in back).toBe(false);
    expect("copyingReason" in back).toBe(false);
  });

  it("READY_NO_EOF is a WARNING with the reason, added once", () => {
    const copying = applyReadiness(row("a"), { state: PDF_STATE.COPYING });
    const once = applyReadiness(copying, { state: PDF_STATE.READY_NO_EOF });
    expect(once.status).toBe(FILE_STATUS.WARNING);
    expect(once.warnings).toEqual([NO_EOF_WARNING]);
    expect(applyReadiness(once, { state: PDF_STATE.READY_NO_EOF }).warnings).toEqual([NO_EOF_WARNING]);
  });

  it("an INVALID row stays INVALID whatever the verdict (a bad name does not change by waiting)", () => {
    const bad = row("a", FILE_STATUS.INVALID);
    for (const state of [PDF_STATE.COPYING, PDF_STATE.READY, PDF_STATE.READY_NO_EOF]) {
      expect(applyReadiness(bad, { state }).status).toBe(FILE_STATUS.INVALID);
    }
  });

  it("does not touch the item it was given", () => {
    const r = row("a");
    applyReadiness(r, { state: PDF_STATE.COPYING });
    expect(r.status).toBe(FILE_STATUS.READY);
  });
});

describe("applyReadinessUpdates - a row going ready changes in place", () => {
  const copying = (id) => applyReadiness(row(id), { state: PDF_STATE.COPYING });
  const groups = () => [
    { printGroup: "A", items: [row("A_1"), copying("A_2"), row("A_3")] },
    { printGroup: "B", items: [row("B_1")] },
    { printGroup: "C", items: [copying("C_1"), copying("C_2")] },
  ];

  it("flips only the rows named, keeps every row's place and every other group by reference", () => {
    const before = groups();
    const after = applyReadinessUpdates(before, [{ id: "A_2", state: PDF_STATE.READY }, { id: "C_2", state: PDF_STATE.READY_NO_EOF }]);
    expect(after.map((g) => g.items.map((i) => i.id))).toEqual([["A_1", "A_2", "A_3"], ["B_1"], ["C_1", "C_2"]]);
    expect(after[0].items.map((i) => i.status)).toEqual([FILE_STATUS.READY, FILE_STATUS.READY, FILE_STATUS.READY]);
    expect(after[2].items.map((i) => i.status)).toEqual([FILE_STATUS.COPYING, FILE_STATUS.WARNING]);
    expect(after[1]).toBe(before[1]);
    expect(after[0].items[0]).toBe(before[0].items[0]);
  });

  it("returns the same list when nothing applies (no needless store update)", () => {
    const before = groups();
    expect(applyReadinessUpdates(before, [])).toBe(before);
    expect(applyReadinessUpdates(before, [{ id: "nope", state: PDF_STATE.READY }])).toEqual(before);
  });

  it("an update for a row that is no longer COPYING is ignored (a newer scan already moved it)", () => {
    const before = groups();
    const after = applyReadinessUpdates(before, [{ id: "A_1", state: PDF_STATE.READY_NO_EOF }]);
    expect(after[0].items[0].status).toBe(FILE_STATUS.READY);
  });
});
