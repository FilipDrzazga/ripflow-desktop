import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// BatchHistory has no UI test harness (no jsdom, no component tests), so the shift-click wiring that
// lives in the .jsx files is pinned by reading the sources, like Production/rangeSelectWiring.test.js.
// The range maths is tested in utils/rangeSelectHistory.test.js; these lines connect it to a click.

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const history = read("BatchHistory.jsx");
const batchRow = read("BatchRow.jsx");
const fileRow = read("FileRow.jsx");

describe("shift-click wiring in the BatchHistory components", () => {
  it("the file row forwards shiftKey with the click (without it a shift-click is a plain toggle)", () => {
    expect(fileRow).toContain("onToggleSelect?.(file.path, { shiftKey: e.shiftKey })");
  });

  it("the file row claims a shift mousedown (without it the browser starts a text selection)", () => {
    expect(fileRow).toContain("claimShiftMouseDown(e, window)");
  });

  it("the batch row passes the click options on to the one handler", () => {
    expect(batchRow).toContain("onToggleSelect={(filePath, opts) => onToggleFileSelect?.(filePath, batch.path, opts)}");
  });

  it("the handler hands the anchor and the on-screen list to nextFileSelection and re-anchors on the clicked file", () => {
    expect(history).toContain(
      "nextFileSelection(prev, { filePath, batchPath, shiftKey, anchorPath, ordered: visibleFiles })",
    );
    expect(history).toContain("selectionAnchorRef.current = filePath;");
  });

  it("the list comes from the FILTERED days plus the expanded sets, the data the render uses", () => {
    expect(history).toContain("visibleHistoryFiles(filteredDayGroups, expandedDays, expandedBatches)");
  });

  it("no second toggle path survives", () => {
    expect(history.match(/onToggleFileSelect=\{toggleFileSelect\}/g)).toHaveLength(1);
    expect(history).not.toContain("if (next.has(filePath)) next.delete(filePath);");
  });

  it("the anchor is dropped together with the selection", () => {
    expect(history).toContain(
      "selectionAnchorRef.current = anchorAfterSelection(selectedFiles, selectionAnchorRef.current);",
    );
    expect(history).toContain("}, [selectedFiles]);");
  });
});
