import { describe, it, expect } from "vitest";
import { visibleHistoryFiles, nextFileSelection } from "./rangeSelect";
import { FILE_STATUS } from "../../shared/constants";

const file = (path, status = FILE_STATUS.READY) => ({ path, name: path, status });
const batch = (path, files) => ({ path, files });
const day = (date, batches) => ({ date, batches });

describe("visibleHistoryFiles", () => {
  const days = [
    day("07-10-2026", [batch("b1", [file("f1"), file("f2")]), batch("b2", [file("f3")])]),
    day("06-10-2026", [batch("b3", [file("f4"), file("f5")])]),
  ];

  it("lists the files of expanded days and batches in the order the tree draws them", () => {
    const out = visibleHistoryFiles(days, new Set(["07-10-2026", "06-10-2026"]), new Set(["b1", "b2", "b3"]));
    expect(out.map((f) => f.path)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(out.map((f) => f.batchPath)).toEqual(["b1", "b1", "b2", "b3", "b3"]);
  });

  it("leaves out a collapsed day and a collapsed batch (their file rows are not on screen)", () => {
    expect(visibleHistoryFiles(days, new Set(["07-10-2026"]), new Set(["b1", "b2", "b3"])).map((f) => f.path)).toEqual([
      "f1",
      "f2",
      "f3",
    ]);
    expect(
      visibleHistoryFiles(days, new Set(["07-10-2026", "06-10-2026"]), new Set(["b2", "b3"])).map((f) => f.path),
    ).toEqual(["f3", "f4", "f5"]);
  });

  it("skips rolled-back files: their rows have no checkbox", () => {
    const d = [day("d", [batch("b", [file("f1"), file("f2", FILE_STATUS.ROLLED_BACK), file("f3")])])];
    expect(visibleHistoryFiles(d, new Set(["d"]), new Set(["b"])).map((f) => f.path)).toEqual(["f1", "f3"]);
  });

  it("returns nothing when nothing is expanded", () => {
    expect(visibleHistoryFiles(days, new Set(), new Set())).toEqual([]);
  });
});

describe("nextFileSelection", () => {
  const ordered = [
    { path: "f1", batchPath: "b1" },
    { path: "f2", batchPath: "b1" },
    { path: "f3", batchPath: "b2" },
    { path: "f4", batchPath: "b2" },
    { path: "f5", batchPath: "b3" },
  ];
  const click = (prev, filePath, extra = {}) =>
    nextFileSelection(new Map(prev), {
      filePath,
      batchPath: ordered.find((f) => f.path === filePath).batchPath,
      shiftKey: false,
      anchorPath: null,
      ordered,
      ...extra,
    });

  it("a plain click toggles one file and keeps its batch", () => {
    expect([...click([], "f3")]).toEqual([["f3", "b2"]]);
    expect([...click([["f3", "b2"]], "f3")]).toEqual([]);
  });

  it("a shift-click on a selected anchor selects the range across batches, with each file's batch", () => {
    const next = click([["f1", "b1"]], "f4", { shiftKey: true, anchorPath: "f1" });
    expect([...next]).toEqual([
      ["f1", "b1"],
      ["f2", "b1"],
      ["f3", "b2"],
      ["f4", "b2"],
    ]);
  });

  it("works upwards too, and adds to what was already selected", () => {
    const next = click([["f2", "b1"], ["f5", "b3"]], "f1", { shiftKey: true, anchorPath: "f2" });
    expect([...next].sort()).toEqual([
      ["f1", "b1"],
      ["f2", "b1"],
      ["f5", "b3"],
    ]);
  });

  it("a shift-click on a deselected anchor deselects the range", () => {
    const prev = [["f2", "b1"], ["f3", "b2"], ["f4", "b2"]];
    const next = click(prev, "f4", { shiftKey: true, anchorPath: "f1" });
    // f1 is not selected -> the range f1..f4 is removed
    expect([...next]).toEqual([]);
  });

  it("without a usable anchor a shift-click is a plain toggle", () => {
    expect([...click([], "f3", { shiftKey: true })]).toEqual([["f3", "b2"]]);
    expect([...click([], "f3", { shiftKey: true, anchorPath: "gone" })]).toEqual([["f3", "b2"]]);
  });

  it("keeps the batch already recorded for a selected file", () => {
    const next = click([["f1", "b-old"]], "f3", { shiftKey: true, anchorPath: "f1" });
    expect(next.get("f1")).toBe("b-old");
  });
});
