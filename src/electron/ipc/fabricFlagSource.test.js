import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// ETAP 2h-2: the velvet / linen / blossom flags come from the catalogue row only. A fabric
// with no row gets false (no guessing from the material or the file name) and the submit
// carries a warning naming it. The golden net cannot see this: its stub catalogue places
// every fabric of the 70 batches, so the no-row branch runs there zero times.
//
// Same stubbing edge as materialClassGate.test.js, with a catalogue the test controls.
let catalogue = new Map();
let storageRoot = "";
vi.mock("../helpers/getRootPath.js", () => ({
  getXmlRootPath: () => "X:\\root",
  getStorageRootPath: () => storageRoot,
}));
vi.mock("../helpers/fabricCache.js", () => ({
  getFabricByName: (name) => catalogue.get(name) ?? null,
  getEstimateConfig: () => null,
}));
vi.mock("../../shared/estimatePrintLength.js", () => ({
  estimatePrintLength: () => ({ fixedTotalLengthM: 12 }),
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { buildPFJobXML, submitBatchToPrintFactory, setPrinterResolver, uncataloguedFabricWarning } from "./createXML.js";

const row = (flags = {}) => ({ isVelvet: 0, isLinen: 0, isBlossom: 0, ...flags });

// A name that holds all three words, in the material AND in the file name - exactly what
// the removed fallback matched on.
const GUESSABLE = "Velvet Linen Blossom Test";

const item = (over = {}) => ({
  file: { name: `ON1_Ann_Lee_1of1_${GUESSABLE}_1x_Linear Meter_XWDab12_FF.pdf`, fullPath: "C:\\in\\a.pdf" },
  printGroup: GUESSABLE,
  printer: "DGEN",
  material: GUESSABLE,
  materialType: "Cottons",
  printTypeCode: "LM",
  qty: 1,
  artworkId: "XWDab12",
  orderId: "ON1",
  width: 1420,
  height: 3000,
  ...over,
});

const build = (batch) => buildPFJobXML(batch, "01-01-2026/PRINTED_101010-Test-DGEN");
const flagsOf = (xml) => ({
  velvet: /<IsVelvet>(\w+)<\/IsVelvet>/.exec(xml)?.[1],
  linen: /<IsLinen>(\w+)<\/IsLinen>/.exec(xml)?.[1],
  blossom: /<IsBlossom>(\w+)<\/IsBlossom>/.exec(xml)?.[1],
});

beforeEach(() => {
  catalogue = new Map();
});

describe("flags - a fabric with a catalogue row", () => {
  it("writes each flag from the row", () => {
    catalogue.set(GUESSABLE, row({ isVelvet: 1, isBlossom: 1 }));
    expect(flagsOf(build([item()]))).toEqual({ velvet: "true", linen: "false", blossom: "true" });
  });

  // The row wins over the name: a fabric CALLED "...Velvet Linen Blossom..." whose row says
  // no flag at all gets none. Pins the lookup for the catalogued case, which the change
  // must leave exactly as it was.
  it("writes false when the row says so, whatever the name holds", () => {
    catalogue.set(GUESSABLE, row());
    expect(flagsOf(build([item()]))).toEqual({ velvet: "false", linen: "false", blossom: "false" });
  });
});

describe("flags - a fabric with NO catalogue row", () => {
  // The removed fallback answered true for all three here (the words are in the material
  // and in the file name).
  it("writes false for all three, no guessing from the material or file name", () => {
    expect(flagsOf(build([item()]))).toEqual({ velvet: "false", linen: "false", blossom: "false" });
  });

  it("does not guess from the file name either", () => {
    const xml = build([item({ material: "Plain Weave" })]);
    expect(flagsOf(xml)).toEqual({ velvet: "false", linen: "false", blossom: "false" });
  });
});

describe("uncataloguedFabricWarning", () => {
  it("is null when every fabric has a row", () => {
    catalogue.set(GUESSABLE, row());
    expect(uncataloguedFabricWarning([item(), item()])).toBeNull();
  });

  it("names each missing fabric once, in batch order, and says what was sent", () => {
    catalogue.set("Known", row());
    const msg = uncataloguedFabricWarning([
      item({ material: "Gone B" }),
      item({ material: "Known" }),
      item({ material: "Gone A" }),
      item({ material: " Gone B " }),
    ]);
    expect(msg).toMatch(/^Not in the fabric catalogue: "Gone B", "Gone A"\. /);
    expect(msg).toContain('Velvet, Linen and Blossom were sent to the printer as "No" for them.');
    expect(msg).toContain("Settings > Fabrics");
  });

  it("names an item without a material as an unnamed fabric", () => {
    const msg = uncataloguedFabricWarning([item({ material: undefined })]);
    expect(msg).toMatch(/: an unnamed fabric\. /);
    expect(msg).toContain('as "No" for it.');
  });
});

// The path the operator actually meets: the warning has to come back from the submit,
// which is what DataPrintSelection shows as "Batch printed with warnings".
describe("submitBatchToPrintFactory - the warning reaches the result", () => {
  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ripflow-flags-"));
    setPrinterResolver(() => ({ code: "DGEN", hotfolder: "AUTOMATION_WORKFLOW_COTTON" }));
  });
  afterEach(() => {
    setPrinterResolver(null);
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  it("succeeds and carries the warning when a fabric has no row", async () => {
    const res = await submitBatchToPrintFactory([item()], "01-01-2026/PRINTED_101010-Test-DGEN");
    expect(res.success).toBe(true);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain(`"${GUESSABLE}"`);
  });

  it("carries no warning when every fabric has a row", async () => {
    catalogue.set(GUESSABLE, row({ isLinen: 1 }));
    const res = await submitBatchToPrintFactory([item()], "01-01-2026/PRINTED_101010-Test-DGEN");
    expect(res.success).toBe(true);
    expect(res.warnings).toEqual([]);
  });
});
