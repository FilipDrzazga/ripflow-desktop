import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The Production components have no UI test harness (no jsdom, no component tests in the repo), so
// the shift-click wiring that lives in the .jsx files is pinned here by reading the sources, the
// same way parseFileNameCallers.test.js pins its call sites. Each pin names the defect it stops:
// the pure logic in utils/rangeSelect.js is fully tested, but only these lines connect it to a click.

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const production = read("Production.jsx");
const card = read("ProductionCard.jsx");
const receive = read("SewingReceive.jsx");

describe("shift-click wiring in the Production components", () => {
  it("the card forwards shiftKey with the click (without it a shift-click is a plain toggle)", () => {
    expect(card).toContain("onSelect?.(row.file_id, { shiftKey: e.shiftKey });");
  });

  it("the card claims a shift mousedown (without it the text selection swallows the click)", () => {
    expect(card).toContain("claimShiftMouseDown(e, window);");
  });

  it("both lenses select through the one handler, and no second toggle path survives", () => {
    expect(production.match(/onSelect=\{handleCardSelect\}/g)).toHaveLength(2);
    expect(production).not.toContain("toggleProductionSelect");
  });

  it("the handler hands the anchor and the list to nextSelection and re-anchors on the clicked card", () => {
    expect(production).toContain("nextSelection(prev, { fileId, shiftKey, anchorId, orderedIds })");
    expect(production).toContain("selectionAnchorRef.current = fileId;");
  });

  it("the Batches list comes from groupedDays + collapsedDays + isGrouped, the data the render uses", () => {
    expect(production).toContain("visibleFileIds(groupedDays, collapsedDays, isGrouped)");
    expect(production).toContain("collapsedDays.has(day.dayKey)");
    expect(production).toContain("? day.batches.map(([batchPath, rows]) => (");
    expect(production).toContain(": day.rows.map((row) => renderCard(row))");
  });

  it("the anchor is dropped together with the selection", () => {
    expect(production).toContain(
      "selectionAnchorRef.current = anchorAfterSelection(selectedFileIds, selectionAnchorRef.current);",
    );
    expect(production).toContain("}, [selectedFileIds]);");
  });

  it("the Receive lens ranges over the active order's items only", () => {
    expect(receive).toContain("orderedIds: (activeOrder?.files ?? []).map((f) => f.file_id)");
    expect(receive).toContain("onSelect={handleSelectItem}");
  });
});
