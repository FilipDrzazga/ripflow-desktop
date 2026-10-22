import { describe, it, expect, vi } from "vitest";

// The dry run of the Etsy import (Settings > Etsy > Check newest order): the same prepare() as the tick, and it
// WRITES NOTHING. The engine here gets an import table that can only be read (`get`), so a write would throw,
// and the disk counts every copy and rename. Same isolation of the parser and harness as etsyImport.retry.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { LIBRARY, setupImporter, makeImports, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

// setupImporter's own table is replaced by a read-only one over the same rows.
const setup = (over = {}) => {
  const table = makeImports();
  const t = setupImporter({ parse: parsePrintFileName, imports: { get: table.get }, ...over });
  return { ...t, table };
};

const ROSE_TITLE = "Rose fabric by designer - Cotton/ Polyester";

describe("preview", () => {
  it("a readable line: the file it would make, the folder and the library file - and nothing is written or copied", async () => {
    const t = setup();
    const lines = await t.tick.preview(receipt([lm()]));
    expect(lines).toEqual([
      {
        transactionId: "501",
        title: "Rose fabric",
        quantity: 3,
        recordedState: null,
        ok: true,
        fileName: "ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg",
        folder: "Drill",
        libraryFile: "ROSE XWD173706_designer_Half-Drop_211.67_14102025.jpg",
        xwd: "173706",
      },
    ]);
    expect(t.disk.calls).toEqual({ copy: 0, rename: 0 });
    expect(inboxOf(t.disk, "Drill")).toEqual([]);
    expect(t.table.rows.size).toBe(0);
  });

  it("a line it cannot read: the reason, with the library suggestion when the number is what is missing", async () => {
    const t = setup();
    const [line] = await t.tick.preview(receipt([lm({ sku: "", title: ROSE_TITLE })]));
    expect(line).toMatchObject({ ok: false, suggestedXwd: "173706", recordedState: null });
    expect(line.reason).toMatch(/No XWD pattern number/);
    expect(line).not.toHaveProperty("fileName");
    expect(t.disk.calls).toEqual({ copy: 0, rename: 0 });
  });

  it("a line that stops for another reason has no suggestion", async () => {
    const t = setup();
    const [line] = await t.tick.preview(receipt([lm({ title: ROSE_TITLE, variations: [{ formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" }] })]));
    expect(line).toMatchObject({ ok: false, suggestedXwd: null });
    expect(line.reason).toMatch(/no "Fabric" variation/);
  });

  it("says what the import table already holds for the line (it is only asked)", async () => {
    const table = makeImports();
    table.putRetry();
    const t = setupImporter({ parse: parsePrintFileName, imports: { get: table.get } });
    const [line] = await t.tick.preview(receipt([lm()]));
    expect(line.recordedState).toBe("retry");
    expect(table.rows.get("3456789012:501").state).toBe("retry"); // untouched
  });

  it("does not ask the gate: a station that is not the importer can still be asked", async () => {
    const t = setup({ gate: () => "this station is not switched on as the Etsy importer" });
    const lines = await t.tick.preview(receipt([lm()]));
    expect(lines[0].ok).toBe(true);
  });

  it("every line of the order is answered, in order", async () => {
    const t = setup();
    const lines = await t.tick.preview(receipt([lm(), lm({ transaction_id: 502, sku: "XWD204411" })]));
    expect(lines.map((l) => [l.transactionId, l.xwd])).toEqual([["501", "173706"], ["502", "204411"]]);
    expect(lines[1].fileName).toMatch(/2of2/);
  });

  it("an order without lines -> no lines", async () => {
    const t = setup();
    expect(await t.tick.preview(receipt([]))).toEqual([]);
    expect(await t.tick.preview({ receipt_id: 1 })).toEqual([]);
  });

  it("an unreadable library folder is thrown (there is no tick to end), not turned into a verdict on the order", async () => {
    const t = setup();
    t.disk.folders.delete(LIBRARY);
    await expect(t.tick.preview(receipt([lm()]))).rejects.toThrow(`Cannot read the folder ${LIBRARY}`);
  });

  it("the tick itself is unchanged: the same engine still imports", async () => {
    const t = setupImporter({ parse: parsePrintFileName });
    t.setReceipts([receipt([lm()])]);
    expect(await t.tick()).toMatchObject({ imported: 1 });
    expect(inboxOf(t.disk, "Drill")).toHaveLength(1);
  });
});
