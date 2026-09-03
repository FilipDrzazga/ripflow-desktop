import { describe, it, expect, vi, beforeEach } from "vitest";

// The auto-print branch in submitBatch.js is the label path nobody presses: it fires on
// every successful submit, labelPrintMode defaults to "automatic" (getSettings.js), and
// labelPrinter.js drops deviceName when labelPrinterName is empty — i.e. it falls through
// to the station's default system printer. Gating it only in the renderer would leave a
// shop without features.labelPrinting with a label per batch. These tests pin the gate.
//
// submitBatch.js pulls the whole main-process infrastructure chain (better-sqlite3 via
// db.js, electron-store via getSettings.js, electron via labelPrinter.js), so every import
// is neutralised here — same convention as toLocalBatchPath.test.js. Only two of the mocks
// are actually under test: getFeature (the gate) and printBatchLabel (the effect).

const h = vi.hoisted(() => ({
  feature: true,
  labelPrintMode: "automatic",
  printBatchLabel: vi.fn(() => Promise.resolve({ success: true })),
  getFeature: vi.fn(),
}));

vi.mock("../helpers/labelPrinter.js", () => ({ printBatchLabel: h.printBatchLabel }));
vi.mock("../helpers/shopProfile.js", () => ({
  getFeature: h.getFeature.mockImplementation((name) => (name === "labelPrinting" ? h.feature : false)),
}));
vi.mock("../helpers/getSettings.js", () => ({
  getSettings: () => ({ workstationName: "TEST-PC", labelPrintMode: h.labelPrintMode }),
}));
vi.mock("./createBatch.js", () => ({
  createBatch: () => Promise.resolve({
    success: true,
    batchId: "B1",
    finalBatchFolderPath: "O:\\SPPrintReadyArtwork\\PRINTED\\29-06-2026\\PRINTED_095958-Drill-DGEN",
    warnings: [],
  }),
  rollbackBatch: () => Promise.resolve({ errors: [], warnings: [], rollbackPerformed: false }),
}));
vi.mock("./createXML.js", () => ({
  submitBatchToPrintFactory: () => Promise.resolve({
    success: true,
    finalXmlPath: "X:\\job.xml",
    localXmlPath: "O:\\job.xml",
    warnings: [],
  }),
}));
vi.mock("../helpers/db.js", () => ({ insertFileStage: () => true }));
vi.mock("../helpers/ipcError.js", () => ({ toIpcError: (err) => ({ message: String(err) }) }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Cottons" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));
vi.mock("../../shared/estimatePrintLength.js", () => ({
  estimatePrintLength: () => ({ fixedTotalLengthM: 12.5 }),
}));

import { submitBatch } from "./submitBatch.js";

const BATCH = [{ file: { name: "ON12345_Jane_XWD00ab_1of1.pdf" }, material: "Drill", height: 2000, qty: 1 }];

beforeEach(() => {
  h.feature = true;
  h.labelPrintMode = "automatic";
  h.printBatchLabel.mockClear();
  h.getFeature.mockClear();
});

describe("submitBatch — auto-print label gated on features.labelPrinting", () => {
  it("prints the label when the flag is on and the mode is automatic", () => {
    // The corpse for an over-tight gate: a gate that never opens breaks Alex, whose
    // profile grants labelPrinting.
    return submitBatch(BATCH).then((res) => {
      expect(res.success).toBe(true);
      expect(h.printBatchLabel).toHaveBeenCalledTimes(1);
    });
  });

  it("does not print when the flag is off, even in automatic mode", () => {
    h.feature = false;
    return submitBatch(BATCH).then(() => {
      expect(h.printBatchLabel).not.toHaveBeenCalled();
    });
  });

  it("asks the profile for exactly the labelPrinting flag", () => {
    // Pins the flag NAME. A typo would read as an absent flag, fail closed and silently
    // disable auto-print for every shop — the failure mode that looks like nothing.
    return submitBatch(BATCH).then(() => {
      expect(h.getFeature).toHaveBeenCalledWith("labelPrinting");
    });
  });

  it("still honours labelPrintMode manual while the flag is on", () => {
    // The gate is an AND, not a replacement: the per-machine setting keeps its say.
    h.labelPrintMode = "manual";
    return submitBatch(BATCH).then(() => {
      expect(h.printBatchLabel).not.toHaveBeenCalled();
    });
  });

  it("completes the submit normally with the flag off", () => {
    // The gate must skip one fire-and-forget branch, not abort the submit: file_stages
    // rows and the XML result still have to come back.
    h.feature = false;
    return submitBatch(BATCH).then((res) => {
      expect(res.success).toBe(true);
      expect(res.finalXmlPath).toBe("X:\\job.xml");
      expect(res.warnings).toEqual([]);
    });
  });
});
