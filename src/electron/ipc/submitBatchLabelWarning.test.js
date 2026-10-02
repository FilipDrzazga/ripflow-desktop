import { describe, it, expect, vi, beforeEach } from "vitest";

// D3: the auto-label is skipped for THREE different reasons and only one of them is news to the
// operator. A feature that is off and manual mode are choices (silent); an unreadable shop profile
// (getProfile() === null) is a fault, so submitBatch adds a warning to the response - the batch is
// already printed, so it is not an error. Same mock conventions as submitBatchLabelGate.test.js;
// getFeature here mirrors the real helper: fail-closed, false whenever the profile is null.

const h = vi.hoisted(() => ({
  profile: { features: { labelPrinting: true } },
  labelPrintMode: "automatic",
  printBatchLabel: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock("../helpers/labelPrinter.js", () => ({ printBatchLabel: h.printBatchLabel }));
vi.mock("../helpers/shopProfile.js", () => ({
  getFeature: (name) => (h.profile === null ? false : h.profile.features?.[name] === true),
  getProfile: () => h.profile,
}));
vi.mock("../helpers/getSettings.js", () => ({
  getSettings: () => ({ workstationName: "TEST-PC", labelPrintMode: h.labelPrintMode }),
}));
vi.mock("./createBatch.js", () => ({
  createBatch: () => Promise.resolve({
    success: true,
    batchId: "B1",
    finalBatchFolderPath: "O:\\SPPrintReadyArtwork\\PRINTED\\29-06-2026\\PRINTED_095958-Drill-DGEN",
    warnings: ["created-warning"],
  }),
  rollbackBatch: () => Promise.resolve({ errors: [], warnings: [], rollbackPerformed: false }),
}));
vi.mock("./createXML.js", () => ({
  submitBatchToPrintFactory: () => Promise.resolve({
    success: true,
    finalXmlPath: "X:\\job.xml",
    localXmlPath: "O:\\job.xml",
    warnings: ["xml-warning"],
  }),
}));
vi.mock("../helpers/db.js", () => ({ insertFileStage: () => true }));
vi.mock("../helpers/ipcError.js", () => ({ toIpcError: (err) => ({ message: String(err) }) }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Cottons" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));
vi.mock("../../shared/estimatePrintLength.js", () => ({
  estimatePrintLength: () => ({ fixedTotalLengthM: 12.5 }),
}));

import { submitBatch, LABEL_SKIPPED_PROFILE_UNREADABLE } from "./submitBatch.js";

const BATCH = [{ file: { name: "ON12345_Jane_XWD00ab_1of1.pdf" }, material: "Drill", height: 2000, qty: 1 }];

beforeEach(() => {
  h.profile = { features: { labelPrinting: true } };
  h.labelPrintMode = "automatic";
  h.printBatchLabel.mockClear();
});

describe("submitBatch - label skipped because the shop profile is unreadable (D3)", () => {
  it("warns, prints no label and still succeeds when the profile is unreadable in automatic mode", async () => {
    h.profile = null;
    const res = await submitBatch(BATCH);
    expect(res.success).toBe(true);
    expect(h.printBatchLabel).not.toHaveBeenCalled();
    expect(res.warnings).toContain(LABEL_SKIPPED_PROFILE_UNREADABLE);
  });

  it("keeps the other warnings of the submit and appends the label warning after them", async () => {
    h.profile = null;
    const res = await submitBatch(BATCH);
    expect(res.warnings).toEqual(["created-warning", "xml-warning", LABEL_SKIPPED_PROFILE_UNREADABLE]);
  });

  it("is silent when the profile is readable and the labelPrinting feature is off", async () => {
    h.profile = { features: { labelPrinting: false } };
    const res = await submitBatch(BATCH);
    expect(h.printBatchLabel).not.toHaveBeenCalled();
    expect(res.warnings).toEqual(["created-warning", "xml-warning"]);
  });

  it("is silent in manual mode even when the profile is unreadable", async () => {
    h.profile = null;
    h.labelPrintMode = "manual";
    const res = await submitBatch(BATCH);
    expect(h.printBatchLabel).not.toHaveBeenCalled();
    expect(res.warnings).toEqual(["created-warning", "xml-warning"]);
  });

  it("is silent and prints the label when the profile is readable and the feature is on", async () => {
    // The corpse for an over-wide warning: the happy path must not carry the fault message.
    const res = await submitBatch(BATCH);
    expect(h.printBatchLabel).toHaveBeenCalledTimes(1);
    expect(res.warnings).toEqual(["created-warning", "xml-warning"]);
  });
});
