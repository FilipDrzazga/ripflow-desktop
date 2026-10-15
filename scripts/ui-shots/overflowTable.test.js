import { describe, expect, it } from "vitest";
import { overflowTable, problemCount } from "./lib/overflowTable.mjs";

const row = (id, state, overflow, status = "ok") => ({ id, state, status, overflow });
const clean = { pageScrollX: 0, pageScrollY: 0, outsideCount: 0, outside: [] };

describe("overflowTable", () => {
  it("shows ok for a clean cell and the numbers for a broken one", () => {
    const rows = [
      row("SW-print", "960x560", { ...clean, pageScrollX: 14, outsideCount: 3 }),
      row("SW-print", "1920x1080", clean),
    ];
    const table = overflowTable(rows, ["960x560", "1920x1080"]);
    expect(table).toContain("| SW-print | X+14, out 3 | ok |");
  });

  it("marks a size that was not taken, a failed step and a probe that errored", () => {
    const rows = [row("SW-a", "960x560", clean), row("SW-b", "960x560", { error: "x" }), row("SW-c", "960x560", undefined, "failed")];
    const table = overflowTable(rows, ["960x560", "1920x1080"]);
    expect(table).toContain("| SW-a | ok | - |");
    expect(table).toContain("| SW-b | probe? | - |");
    expect(table).toContain("| SW-c | failed | - |");
  });

  it("problemCount counts every cell that is not ok", () => {
    expect(problemCount([row("a", "s", clean), row("a", "t", { ...clean, outsideCount: 1 }), row("b", "s", undefined, "failed")])).toBe(2);
  });
});

describe("overflowTable geometry cells", () => {
  it("shows overlapping siblings and hollow wrapped items as their own figures, and counts them as problems", () => {
    const rows = [row("SW-print", "960x560", { ...clean, overlapCount: 2, hollowCount: 3, spillCount: 1 }), row("SW-print", "1920x1080", clean)];
    expect(overflowTable(rows, ["960x560", "1920x1080"])).toContain("| SW-print | overlap 2, hollow 3, spill 1 | ok |");
    expect(problemCount(rows)).toBe(1);
  });
});
