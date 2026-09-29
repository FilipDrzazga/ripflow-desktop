import { describe, it, expect } from "vitest";
import { PROFILE_STATUS } from "./profileStatus.js";
import {
  WIZARD_STEPS,
  profileStepState,
  canLeaveProfileStep,
  readProblemText,
  folderCheckRows,
  folderCheckSummary,
} from "./setupWizard.js";

// ETAP 4 (4-wizard): what the first-run wizard says at each step.

const PRINTER = { code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C" };

describe("WIZARD_STEPS", () => {
  it("paths, then the profile, then the folder check", () => {
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual(["paths", "profile", "folders"]);
  });
});

describe("profileStepState", () => {
  it("an unreadable database is its own state, never an empty profile (rule 24)", () => {
    expect(profileStepState(PROFILE_STATUS.FAILED, null)).toBe("unreadable");
  });

  it("loading until the store has a loaded profile", () => {
    expect(profileStepState(PROFILE_STATUS.LOADING, null)).toBe("loading");
    expect(profileStepState(PROFILE_STATUS.LOADED, null)).toBe("loading");
  });

  it("a profile with no usable printer has to be imported", () => {
    expect(profileStepState(PROFILE_STATUS.LOADED, { printers: [] })).toBe("empty");
  });

  it("a profile another station imported is ready", () => {
    expect(profileStepState(PROFILE_STATUS.LOADED, { printers: [PRINTER] })).toBe("ready");
  });

  it("only a ready profile lets the wizard go on", () => {
    expect(["loading", "unreadable", "empty", "ready"].filter(canLeaveProfileStep)).toEqual(["ready"]);
  });
});

describe("folderCheckRows", () => {
  it("maps the check's rows; only read === 'ok' is readable", () => {
    const rows = folderCheckRows([
      { label: "storagePath", path: "C:\\s", read: "ok", write: "not tested" },
      { label: "hotfolder HOT_C (DGEN)", path: "C:\\s\\HOT_C", read: "ENOENT", write: "not tested" },
    ]);
    expect(rows).toEqual([
      { label: "storagePath", path: "C:\\s", ok: true, message: "Readable" },
      { label: "hotfolder HOT_C (DGEN)", path: "C:\\s\\HOT_C", ok: false, message: "Folder does not exist (ENOENT)" },
    ]);
  });

  it("a malformed row is a problem, never ok", () => {
    expect(folderCheckRows([{ read: true }, null])).toEqual([
      { label: "?", path: "", ok: false, message: "Cannot read (true)" },
      { label: "?", path: "", ok: false, message: "Cannot read (unknown error)" },
    ]);
    expect(folderCheckRows(undefined)).toEqual([]);
  });

  it("an unknown code is shown as it came", () => {
    expect(readProblemText("EIO")).toBe("Cannot read (EIO)");
    expect(readProblemText("EACCES")).toBe("No permission to read it (EACCES)");
  });
});

describe("folderCheckSummary", () => {
  it("all readable - and says writing is NOT what was checked", () => {
    const s = folderCheckSummary(folderCheckRows([{ label: "a", path: "a", read: "ok" }]));
    expect(s.tone).toBe("ok");
    expect(s.text).toContain("Writing is proven by the first job");
  });

  it("counts the folders that cannot be read", () => {
    const rows = folderCheckRows([
      { label: "a", path: "a", read: "ok" },
      { label: "b", path: "b", read: "EACCES" },
    ]);
    expect(folderCheckSummary(rows)).toMatchObject({ tone: "error", text: expect.stringMatching(/^1 of 2 folders/) });
  });

  it("nothing to check is an error, not a pass", () => {
    expect(folderCheckSummary([]).tone).toBe("error");
  });
});
