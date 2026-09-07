import { describe, it, expect, vi } from "vitest";

// A second file for one reason: printSizeGate.test.js mocks getFabricByName as a constant
// that answers for EVERY name, so inside it the catalogue can never say "no". That mock is
// existing executable content and stays untouched, so the branch where the catalogue does
// not know the fabric needs a catalogue that can refuse - which is what this file supplies.
//
// Everything else is stubbed the same way, for the same reason: the subject is the message
// the guard chooses, not the XML template.
let catalogue = new Set();

vi.mock("../helpers/getRootPath.js", () => ({ getXmlRootPath: () => "X:\\root" }));
vi.mock("../helpers/fabricCache.js", () => ({
  getFabricByName: (name) => (catalogue.has(name) ? { isVelvet: 0, isLinen: 0, isBlossom: 0 } : null),
  getEstimateConfig: () => null,
}));
vi.mock("../../shared/estimatePrintLength.js", () => ({
  estimatePrintLength: () => ({ fixedTotalLengthM: 12 }),
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { buildPFJobXML } from "./createXML.js";

const item = (over = {}) => ({
  file: { name: "ON7_Ola_Nowak_1of1_Eco Astra Ramie_1x_Linear Meter_XWDcd34_FF.pdf", fullPath: "C:\\in\\a.pdf" },
  printGroup: "Eco Astra Ramie",
  printer: "DGEN",
  material: "Eco Astra Ramie",
  materialType: "Cottons",
  printTypeCode: "LM",
  qty: 3,
  artworkId: "XWDcd34",
  orderId: "ON7",
  width: 1420,
  height: 3000,
  ...over,
});

const build = (batch) => buildPFJobXML(batch, "01-01-2026/PRINTED_101010-Eco Astra Ramie-DGEN");

const throwOn = (batch) => {
  try { build(batch); } catch (e) { return e; }
  return null;
};

describe("buildPFJobXML — the catalogue cannot place the fabric", () => {
  // The cause step 4 created. The catalogue is loaded and simply does not list this
  // fabric, so it is the right place to send the operator.
  it("sends the operator to the catalogue", () => {
    catalogue = new Set(["Cotton Slub"]);
    const err = throwOn([item({ width: null })]);
    expect(err.message).toMatch(/Add the fabric to the catalogue in Settings > Fabrics/i);
    expect(err.message).not.toMatch(/could not be worked out from the file name/i);
  });

  // An unreadable catalogue answers null for everything, which lands here too. Correct:
  // the catalogue is still the first thing to check, and the print view carries the
  // separate banner explaining the outage.
  it("sends the operator to the catalogue when nothing is loaded at all", () => {
    catalogue = new Set();
    const err = throwOn([item({ width: null })]);
    expect(err.message).toMatch(/Add the fabric to the catalogue/i);
  });
});

describe("buildPFJobXML — the catalogue knows the fabric", () => {
  // The cause that predates the width work: the fabric is fine and the size still cannot
  // be established. Sending this operator to Settings > Fabrics is a wrong instruction,
  // not merely an unhelpful one - the fabric they would go looking for is already there.
  it("points at the file name instead of the catalogue", () => {
    catalogue = new Set(["Eco Astra Ramie"]);
    const err = throwOn([item({ height: null })]);
    expect(err.message).toMatch(/That fabric is in the catalogue/i);
    expect(err.message).toMatch(/product type configuration/i);
    expect(err.message).not.toMatch(/Add the fabric to the catalogue/i);
  });

  it("chooses per document, not once per batch", () => {
    catalogue = new Set(["Eco Astra Ramie"]);
    const known = throwOn([item({ width: null })]);
    catalogue = new Set();
    const unknown = throwOn([item({ width: null })]);
    expect(known.message).toMatch(/That fabric is in the catalogue/i);
    expect(unknown.message).toMatch(/Add the fabric to the catalogue/i);
  });
});

describe("buildPFJobXML — what both causes still share", () => {
  // The advice differs; the identifying sentence does not. A log line has to stay
  // comparable across both, and the error code is what callers key on.
  it("keeps one error code and one opening sentence", () => {
    catalogue = new Set(["Eco Astra Ramie"]);
    const known = throwOn([item({ width: null })]);
    catalogue = new Set();
    const unknown = throwOn([item({ width: null })]);
    for (const err of [known, unknown]) {
      expect(err.code).toBe("ERR_UNKNOWN_PRINT_SIZE");
      expect(err.stage).toBe("validate");
      expect(err.message).toMatch(/^Cannot build the job: width is unknown for ON7_Ola_Nowak_1of1/);
      expect(err.message).toContain('"Eco Astra Ramie"');
    }
  });

  // A usable batch is still built whichever way the catalogue answers - the discriminator
  // must not have turned into a second gate.
  it("builds normally when the dimensions are fine, catalogue or not", () => {
    catalogue = new Set();
    expect(build([item()])).toContain("<Width>1420</Width>");
    catalogue = new Set(["Eco Astra Ramie"]);
    expect(build([item()])).toContain("<Width>1420</Width>");
  });
});
