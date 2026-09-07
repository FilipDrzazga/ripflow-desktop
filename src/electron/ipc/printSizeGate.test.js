import { describe, it, expect, vi } from "vitest";

// Everything buildPFJobXML reaches for outside itself is stubbed to a constant, because
// the subject here is one guard, not the template. The fabric flags and the length
// estimate are mocked so a batch of two documents renders without a database.
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

describe("buildPFJobXML — a job with usable dimensions is built", () => {
  it("renders the width and height it was given", () => {
    const xml = build([item()]);
    expect(xml).toContain("<Width>1420</Width>");
    expect(xml).toContain("<Height>3000</Height>");
  });

  // 0 is falsy and a legal dimension. A guard written as `if (!width)` would reject it,
  // and the rejection would look exactly like the one for a missing fabric - a real batch
  // refused with a message about a catalogue entry that is not the problem.
  it("accepts a dimension of zero", () => {
    const xml = build([item({ width: 0, height: 0 })]);
    expect(xml).toContain("<Width>0</Width>");
    expect(xml).toContain("<Height>0</Height>");
  });

  it("accepts numeric strings, as the XML would have rendered them anyway", () => {
    const xml = build([item({ width: "1420", height: "3000" })]);
    expect(xml).toContain("<Width>1420</Width>");
  });
});

describe("buildPFJobXML — an unknown width is refused", () => {
  // The case step 4 created: an unknown fabric leaves width null, escapeXml turns null
  // into "", and the job would have carried <Width></Width> to PrintFactory.
  it("throws instead of writing an empty element", () => {
    expect(() => build([item({ width: null })])).toThrow(/width is unknown/i);
  });

  it("throws for undefined and for NaN", () => {
    expect(() => build([item({ width: undefined })])).toThrow(/width is unknown/i);
    expect(() => build([item({ width: NaN })])).toThrow(/width is unknown/i);
  });

  it("throws for a non-numeric string", () => {
    expect(() => build([item({ width: "wide" })])).toThrow(/width is unknown/i);
  });

  it("throws for Infinity", () => {
    expect(() => build([item({ width: Infinity })])).toThrow(/width is unknown/i);
  });
});

describe("buildPFJobXML — an unknown height is refused", () => {
  // Height can be null by a different and OLDER route than width: an LM file whose qty
  // does not parse returns early from applyLmDimensions, leaving whatever the size text
  // gave - which is null when the text carries no dimensions. Not introduced by step 4,
  // and equally malformed in the job file.
  it("throws when only the height is unknown", () => {
    expect(() => build([item({ height: null })])).toThrow(/height is unknown/i);
  });

  it("names both when both are unknown", () => {
    expect(() => build([item({ width: null, height: null })])).toThrow(/width and height/i);
  });
});

describe("buildPFJobXML — what the refusal carries", () => {
  // The error crosses IPC through toIpcError, which reads these fields. Without them the
  // operator gets a bare stack instead of a sentence telling them what to do.
  it("is typed like ERR_INVALID_PRINTER", () => {
    let err;
    try { build([item({ width: null })]); } catch (e) { err = e; }
    expect(err.code).toBe("ERR_UNKNOWN_PRINT_SIZE");
    expect(err.stage).toBe("validate");
    expect(err.title).toBe("Unknown print size");
    expect(err.type).toBe("Error");
  });

  // The fix is an operator action on ONE file. A batch-level message would leave them
  // opening forty filenames to find which one is missing from the catalogue.
  it("names the file and the fabric", () => {
    let err;
    try { build([item({ width: null, material: "Eco Astra Ramie" })]); } catch (e) { err = e; }
    expect(err.message).toContain("ON1_Ann_Lee_1of1");
    expect(err.message).toContain("Eco Astra Ramie");
  });

  it("still names the file when the fabric is missing entirely", () => {
    let err;
    try { build([item({ width: null, material: null })]); } catch (e) { err = e; }
    expect(err.message).toContain("an unnamed fabric");
  });
});

describe("buildPFJobXML — the guard runs before anything is written", () => {
  // One bad document must sink the whole job, not be skipped: a partially rendered batch
  // would print some documents and silently drop the rest.
  it("refuses a batch where only the second document is unusable", () => {
    expect(() => build([item(), item({ width: null, material: "Nope" })])).toThrow(/Nope/);
  });

  it("names the offending document, not the first one", () => {
    let err;
    try {
      build([item(), item({ width: null, file: { name: "SECOND.pdf", fullPath: "C:\\in\\b.pdf" } })]);
    } catch (e) { err = e; }
    expect(err.message).toContain("SECOND.pdf");
  });

  // Diagnostic guard, kept deliberately and with no corpse of its own: an empty batch is
  // not this guard's business, and if it ever starts throwing here the failure would look
  // like a dimension problem in a batch that has no documents at all.
  it("does not throw on an empty batch", () => {
    expect(() => build([])).not.toThrow();
  });
});

describe("buildPFJobXML — the refusal says WHICH of the two causes was hit", () => {
  // The mock above answers getFabricByName for every name, so inside this file every
  // named fabric is one the catalogue can place. That is the branch it can reach, and
  // the useful one: it proves the message stops sending the operator to Settings when
  // the fabric is already there. The opposite branch needs a catalogue that can say no,
  // which this file's fixed mock cannot express - it lives in printSizeGateCause.test.js.
  it("does not blame the catalogue when the catalogue knows the fabric", () => {
    let err;
    try { build([item({ width: null, material: "Cotton Slub" })]); } catch (e) { err = e; }
    expect(err.message).not.toMatch(/Add the fabric to the catalogue/i);
    expect(err.message).toMatch(/could not be worked out from the file name/i);
  });

  // The case measured on a real filename: an LM file whose qty token reads "1m" instead
  // of "1x" returns early from applyLmDimensions and keeps a null height, with a fabric
  // that IS in the catalogue. Older than the width work and unrelated to it.
  it("points at the file name for a known fabric with an unreadable size", () => {
    let err;
    try { build([item({ height: null, material: "Stretch Jersey" })]); } catch (e) { err = e; }
    expect(err.message).toMatch(/height is unknown/i);
    expect(err.message).toMatch(/product type configuration/i);
  });

  // No fabric to look up is not the catalogue's fault either, but it is the first place
  // to look, so it keeps the catalogue advice.
  it("keeps the catalogue advice when there is no fabric to look up", () => {
    let err;
    try { build([item({ width: null, material: null })]); } catch (e) { err = e; }
    expect(err.message).toMatch(/Add the fabric to the catalogue/i);
  });

  it("keeps the catalogue advice for a blank fabric name", () => {
    let err;
    try { build([item({ width: null, material: "   " })]); } catch (e) { err = e; }
    expect(err.message).toContain("an unnamed fabric");
    expect(err.message).toMatch(/Add the fabric to the catalogue/i);
  });

  // Whichever cause it is, the first sentence is unchanged - the file, the fabric and
  // which dimension. Only the advice differs, so a reader of the logs still gets the
  // same identifying line.
  it("names the file, the fabric and the dimension under either cause", () => {
    let known, unknown;
    try { build([item({ width: null, material: "Cotton Slub" })]); } catch (e) { known = e; }
    try { build([item({ width: null, material: null })]); } catch (e) { unknown = e; }
    for (const err of [known, unknown]) {
      expect(err.message).toMatch(/^Cannot build the job: width is unknown for ON1_Ann_Lee_1of1/);
      expect(err.code).toBe("ERR_UNKNOWN_PRINT_SIZE");
    }
  });
});
