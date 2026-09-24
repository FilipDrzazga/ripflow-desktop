import { describe, it, expect, vi, afterEach } from "vitest";

// ETAP 2e step 2: which hotfolder a job goes to is printers[].hotfolder from the shop
// profile, looked up through an injected resolver (createXML.js must stay importable
// without db.js). The golden net renders buildPFJobXML only and never routes, so the
// parity case below is what proves the move changed nothing for Alex's three printers.
//
// Same stubbing edge as materialClassGate.test.js; defaultProfile.js is real (plain data).
vi.mock("../helpers/getRootPath.js", () => ({ getXmlRootPath: () => "X:\\root", getStorageRootPath: () => "S:\\root" }));
vi.mock("../helpers/fabricCache.js", () => ({ getFabricByName: () => null, getEstimateConfig: () => null }));
vi.mock("../../shared/estimatePrintLength.js", () => ({ estimatePrintLength: () => ({ fixedTotalLengthM: 1 }) }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { getWorkflowFolderName, setPrinterResolver } from "./createXML.js";
import { DEFAULT_PROFILE } from "../helpers/defaultProfile.js";

// the same lookup getPrinterByCode performs, over a given printers[]
const resolverOver = (printers) => (code) =>
  printers.find((p) => String(p?.code).toUpperCase() === String(code).toUpperCase()) ?? null;

afterEach(() => setPrinterResolver(null));

describe("getWorkflowFolderName - routing from the profile", () => {
  it("routes Alex's printers exactly as the old if-chain did (parity with the seed)", () => {
    setPrinterResolver(resolverOver(DEFAULT_PROFILE.printers));
    // the removed code: DGEN -> COTTON, YOKO | YUMI -> POLY
    expect(getWorkflowFolderName("DGEN")).toBe("AUTOMATION_WORKFLOW_COTTON");
    expect(getWorkflowFolderName("YOKO")).toBe("AUTOMATION_WORKFLOW_POLY");
    expect(getWorkflowFolderName("YUMI")).toBe("AUTOMATION_WORKFLOW_POLY");
  });

  it("routes a printer the old code did not know, when the profile has it", () => {
    setPrinterResolver(resolverOver([{ code: "MIMAKI2", hotfolder: "AUTOMATION_WORKFLOW_SILK" }]));
    expect(getWorkflowFolderName("MIMAKI2")).toBe("AUTOMATION_WORKFLOW_SILK");
  });
});

describe("getWorkflowFolderName - refuses, fail-closed", () => {
  const refused = (code) => {
    try {
      getWorkflowFolderName(code);
    } catch (err) {
      return err.code;
    }
    return "NOT REFUSED";
  };

  it("refuses everything while no resolver is wired", () => {
    expect(refused("DGEN")).toBe("ERR_INVALID_PRINTER");
  });

  // afterEach resets through setPrinterResolver(null), so the case above sees the RESET
  // path. The module's own starting value is only visible on a fresh copy of it - the state
  // a station is in if ipc/index.js ever stops wiring the resolver.
  it("a freshly loaded module refuses before anything is wired (its own default)", async () => {
    vi.resetModules();
    const fresh = await import("./createXML.js");
    expect(() => fresh.getWorkflowFolderName("DGEN")).toThrow(/no valid hotfolder/);
  });

  it("refuses when the profile could not be read (the resolver finds nothing)", () => {
    setPrinterResolver(() => null);
    expect(refused("DGEN")).toBe("ERR_INVALID_PRINTER");
  });

  it("refuses a printer that is not in the profile", () => {
    setPrinterResolver(resolverOver(DEFAULT_PROFILE.printers));
    expect(refused("MIMAKI2")).toBe("ERR_INVALID_PRINTER");
    expect(refused(undefined)).toBe("ERR_INVALID_PRINTER");
  });

  it("refuses a hotfolder that is not one plain folder name", () => {
    for (const hotfolder of ["..\\escape", "../escape", "a\\b", "a/b", "", "  ", null, 42]) {
      setPrinterResolver(() => ({ code: "X", hotfolder }));
      expect(refused("X")).toBe("ERR_INVALID_PRINTER");
    }
  });

  it("a non-function resolver resets to refusing, it does not throw a TypeError later", () => {
    setPrinterResolver(resolverOver(DEFAULT_PROFILE.printers));
    setPrinterResolver("not a function");
    expect(refused("DGEN")).toBe("ERR_INVALID_PRINTER");
  });

  it("the refusal carries what toIpcError reads", () => {
    try {
      getWorkflowFolderName("DGEN");
    } catch (err) {
      expect(err).toMatchObject({ code: "ERR_INVALID_PRINTER", stage: "validate", title: "Invalid printer", type: "Error" });
      expect(err.message).toContain('"DGEN"');
      return;
    }
    throw new Error("not refused");
  });
});
