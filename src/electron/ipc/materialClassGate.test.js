import { describe, it, expect, vi } from "vitest";

// Same stubbing edge as printSizeGate.test.js: everything buildPFJobXML reaches for
// outside itself answers a constant, because the subject is one guard and not the
// template. Deliberately a separate file rather than new cases in printSizeGate.test.js -
// that file's mocks describe a catalogue that places every fabric, and this guard is
// about a catalogue row that answers a width but no class.
vi.mock("../helpers/getRootPath.js", () => ({ getXmlRootPath: () => "X:\\root" }));
vi.mock("../helpers/fabricCache.js", () => ({
  getFabricByName: () => ({ isVelvet: 0, isLinen: 0, isBlossom: 0 }),
  getEstimateConfig: () => null,
}));
vi.mock("../../shared/estimatePrintLength.js", () => ({
  estimatePrintLength: () => ({ fixedTotalLengthM: 12 }),
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { buildPFJobXML } from "./createXML.js";

const item = (over = {}) => ({
  file: { name: "ON1_Ann_Lee_1of1_Cotton Slub_1x_Linear Meter_XWDab12_FF.pdf", fullPath: "C:\\in\\a.pdf" },
  printGroup: "Cotton Slub",
  printer: "DGEN",
  material: "Cotton Slub",
  materialType: "Cottons",
  printTypeCode: "LM",
  qty: 3,
  artworkId: "XWDab12",
  orderId: "ON1",
  width: 1420,
  height: 3000,
  ...over,
});

const build = (batch) => buildPFJobXML(batch, "01-01-2026/PRINTED_101010-Cotton Slub-DGEN");

describe("buildPFJobXML - a known material class is written through", () => {
  it("renders the class it was given", () => {
    expect(build([item()])).toContain("<MaterialType>Cottons</MaterialType>");
    expect(build([item({ materialType: "Polyesters" })])).toContain("<MaterialType>Polyesters</MaterialType>");
  });

  // The guard refuses a MISSING class, not a class outside a list. Naming the legal
  // classes here would put them back in the code that 2g/2h is emptying of them, and a
  // third class is an open possibility. This test pins that decision so a later
  // "tightening" to a whitelist has to argue with it rather than slip past.
  it("does not police the class against a list of known names", () => {
    expect(build([item({ materialType: "Silk" })])).toContain("<MaterialType>Silk</MaterialType>");
  });
});

describe("buildPFJobXML - an unknown material class is refused", () => {
  // The decided case: PrintFactory cannot accept <MaterialType>Unknown</MaterialType>,
  // and escapeXml would have written exactly that.
  it("throws on the literal Unknown", () => {
    expect(() => build([item({ materialType: "Unknown" })])).toThrow(/material class is unknown/i);
  });

  it("throws whatever case the word arrives in", () => {
    expect(() => build([item({ materialType: "unknown" })])).toThrow(/material class is unknown/i);
    expect(() => build([item({ materialType: "  UNKNOWN  " })])).toThrow(/material class is unknown/i);
  });

  // A catalogue row with a NULL type column reaches getMaterialType as "Unknown"; a blank
  // one reaches it as "", which is not nullish and so survives the ?? there. Both end in
  // an empty element in the job file, which is the state this guard exists for.
  it("throws on a missing or blank class", () => {
    expect(() => build([item({ materialType: null })])).toThrow(/material class is unknown/i);
    expect(() => build([item({ materialType: undefined })])).toThrow(/material class is unknown/i);
    expect(() => build([item({ materialType: "" })])).toThrow(/material class is unknown/i);
    expect(() => build([item({ materialType: "   " })])).toThrow(/material class is unknown/i);
  });

  it("throws for a non-string class", () => {
    expect(() => build([item({ materialType: 7 })])).toThrow(/material class is unknown/i);
  });
});

describe("buildPFJobXML - what the class refusal carries", () => {
  // The error crosses IPC through toIpcError, which reads these fields.
  it("is typed, with a code of its own", () => {
    let err;
    try { build([item({ materialType: "Unknown" })]); } catch (e) { err = e; }
    expect(err.code).toBe("ERR_UNKNOWN_MATERIAL_CLASS");
    expect(err.code).not.toBe("ERR_UNKNOWN_PRINT_SIZE");
    expect(err.stage).toBe("validate");
    expect(err.title).toBe("Unknown material class");
    expect(err.type).toBe("Error");
  });

  // Same shape as the size refusal: the file, the fabric, and the one action that fixes
  // it. No diagnosis - the operator is the only one who acts on this sentence.
  it("names the file, the fabric and where the class is fixed", () => {
    let err;
    try { build([item({ materialType: null, material: "Eco Astra Ramie" })]); } catch (e) { err = e; }
    expect(err.message).toContain("ON1_Ann_Lee_1of1");
    expect(err.message).toContain("Eco Astra Ramie");
    expect(err.message).toMatch(/Settings > Fabrics/);
  });

  it("still names the file when the fabric is missing entirely", () => {
    let err;
    try { build([item({ materialType: null, material: null })]); } catch (e) { err = e; }
    expect(err.message).toContain("an unnamed fabric");
  });
});

describe("buildPFJobXML - the class guard stands beside the size guard, not in front", () => {
  // An out-of-catalogue fabric fails BOTH: getXmlWidthFromCache answers null for it, so
  // its width is null too. The size guard runs first on purpose, so that batch keeps the
  // message it has today and the 70 golden baselines cannot move.
  it("reports the size, not the class, when both are unknown", () => {
    let err;
    try { build([item({ width: null, materialType: "Unknown" })]); } catch (e) { err = e; }
    expect(err.code).toBe("ERR_UNKNOWN_PRINT_SIZE");
  });

  // One bad document sinks the whole job. A batch rendered up to the offending document
  // would print part of the work and silently drop the rest.
  it("refuses a batch where only the second document has no class", () => {
    expect(() => build([item(), item({ materialType: "Unknown", material: "Nope" })])).toThrow(/Nope/);
  });

  // Diagnostic guard, kept deliberately and with no corpse of its own: an empty batch is
  // not this guard's business, and a throw here would read as a class problem in a batch
  // that carries no documents at all.
  it("does not throw on an empty batch", () => {
    expect(() => build([])).not.toThrow();
  });
});
