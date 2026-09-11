import { describe, it, expect } from "vitest";
import {
  ROLLBACK_FAILED_CODE,
  describeOsFailure,
  describeRollbackFailure,
  summarizeRollbackResult,
  buildRollbackBatchLog,
} from "./rollbackFailure.js";

// Pure module, zero imports in the unit under test - no mocks needed.

// True if any code point is outside 7-bit ASCII. Avoids a control-char regex (no-control-regex).
const hasNonAscii = (s) => [...s].some((c) => c.charCodeAt(0) > 127);

describe("describeOsFailure - single-file operator line", () => {
  it("names the file, the code and the syscall, then ENOENT advice", () => {
    const msg = describeOsFailure({ name: "a.pdf", code: "ENOENT", syscall: "rename" });
    expect(msg).toBe(
      'Could not move "a.pdf" back to the inbox (ENOENT on rename).' +
        " Windows reported 'not found', but the file may still be in the batch folder." +
        " Check that the server folder is reachable, then try again.",
    );
  });

  it("omits ' on <syscall>' when syscall is absent", () => {
    const msg = describeOsFailure({ name: "a.pdf", code: "ENOENT" });
    expect(msg).toContain("(ENOENT).");
    expect(msg).not.toContain(" on ");
  });

  it("EPERM, EACCES and EBUSY share the 'open in another program' advice", () => {
    const advice =
      " The file may be open in another program (PrintFactory, a PDF viewer)" +
      " or the folder may be read-only. Close it and try again.";
    expect(describeOsFailure({ name: "a.pdf", code: "EPERM", syscall: "rename" })).toBe(
      'Could not move "a.pdf" back to the inbox (EPERM on rename).' + advice,
    );
    expect(describeOsFailure({ name: "a.pdf", code: "EACCES", syscall: "rename" })).toBe(
      'Could not move "a.pdf" back to the inbox (EACCES on rename).' + advice,
    );
    expect(describeOsFailure({ name: "a.pdf", code: "EBUSY", syscall: "rename" })).toBe(
      'Could not move "a.pdf" back to the inbox (EBUSY on rename).' + advice,
    );
  });

  it("EXDEV is the different-drives advice", () => {
    expect(describeOsFailure({ name: "a.pdf", code: "EXDEV" })).toBe(
      'Could not move "a.pdf" back to the inbox (EXDEV). The inbox and the batch folder are on different drives.',
    );
  });

  it("EEXIST says nothing was overwritten", () => {
    expect(describeOsFailure({ name: "a.pdf", code: "EEXIST" })).toBe(
      'Could not move "a.pdf" back to the inbox (EEXIST). A file with the same name is already in the inbox. Nothing was overwritten.',
    );
  });

  it("a missing code reads '(no code)' and falls to the generic advice, no crash", () => {
    expect(describeOsFailure({ name: "a.pdf" })).toBe(
      'Could not move "a.pdf" back to the inbox ((no code)). See the session log for details.',
    );
  });

  it("an unknown code keeps the code and uses the generic advice", () => {
    expect(describeOsFailure({ name: "a.pdf", code: "ENOTDIR", syscall: "rename" })).toBe(
      'Could not move "a.pdf" back to the inbox (ENOTDIR on rename). See the session log for details.',
    );
  });

  it("a missing name reads '(unknown file)'", () => {
    expect(describeOsFailure({ code: "ENOENT" })).toContain('Could not move "(unknown file)" back to the inbox');
  });

  it("every produced message is pure ASCII", () => {
    for (const code of ["ENOENT", "EPERM", "EACCES", "EBUSY", "EXDEV", "EEXIST", "ENOTDIR", undefined]) {
      expect(hasNonAscii(describeOsFailure({ name: "a.pdf", code, syscall: "rename" }))).toBe(false);
    }
  });
});

describe("describeRollbackFailure - full operator message", () => {
  it("one entry -> the file's line, code is ERR_ROLLBACK_FAILED, no tail", () => {
    const out = describeRollbackFailure([{ name: "a.pdf", code: "ENOENT", syscall: "rename" }]);
    expect(out.code).toBe("ERR_ROLLBACK_FAILED");
    expect(ROLLBACK_FAILED_CODE).toBe("ERR_ROLLBACK_FAILED");
    expect(out.message).toContain('Could not move "a.pdf" back to the inbox (ENOENT on rename).');
    expect(out.message).not.toContain("more - see the session log");
  });

  it("three entries -> describes the first and counts the other two in the tail", () => {
    const out = describeRollbackFailure([
      { name: "a.pdf", code: "EPERM", syscall: "rename" },
      { name: "b.pdf", code: "ENOENT", syscall: "rename" },
      { name: "c.pdf", code: "EXDEV", syscall: "rename" },
    ]);
    expect(out.message).toContain('Could not move "a.pdf" back to the inbox (EPERM on rename).');
    expect(out.message.endsWith(" (+2 more - see the session log)")).toBe(true);
  });

  it("the message stays pure ASCII with a tail", () => {
    const out = describeRollbackFailure([
      { name: "a.pdf", code: "ENOENT", syscall: "rename" },
      { name: "b.pdf", code: "ENOENT", syscall: "rename" },
    ]);
    expect(hasNonAscii(out.message)).toBe(false);
  });

  it("empty array -> null (caller keeps generic text)", () => {
    expect(describeRollbackFailure([])).toBeNull();
  });

  it("null/undefined -> null", () => {
    expect(describeRollbackFailure(null)).toBeNull();
    expect(describeRollbackFailure(undefined)).toBeNull();
  });
});

describe("summarizeRollbackResult - structured log detail", () => {
  it("counts restored vs failed and preserves the raw per-file OS fields", () => {
    const result = {
      restoredFiles: ["O:\\INBOX\\ok1.pdf", "O:\\INBOX\\ok2.pdf"],
      failedFiles: [{ name: "a.pdf", src: "s", dest: "d", code: "EPERM", errno: -4048, syscall: "rename", message: "denied" }],
      errors: [],
    };
    const s = summarizeRollbackResult(result);
    expect(s.attempted).toBe(3);
    expect(s.succeeded).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.failedFiles[0]).toMatchObject({ code: "EPERM", errno: -4048, syscall: "rename" });
    expect(s.errors).toEqual([]);
  });

  it("empty failedFiles -> failed 0, attempted equals succeeded", () => {
    const s = summarizeRollbackResult({ restoredFiles: ["a"], failedFiles: [], errors: [] });
    expect(s.failed).toBe(0);
    expect(s.failedFiles).toEqual([]);
    expect(s.attempted).toBe(1);
  });

  it("a malformed result (no arrays) degrades to zeros and [], never throws", () => {
    const s = summarizeRollbackResult({ errors: [{ code: "EINVAL", message: "bad" }] });
    expect(s.succeeded).toBe(0);
    expect(s.failed).toBe(0);
    expect(s.attempted).toBe(0);
    expect(s.failedFiles).toEqual([]);
    expect(s.errors).toEqual([{ code: "EINVAL", message: "bad" }]);
  });

  it("a non-array errors channel degrades to []", () => {
    expect(summarizeRollbackResult({ restoredFiles: [], failedFiles: [] }).errors).toEqual([]);
  });
});

// NEW describe (added after buildRollbackBatchLog was extracted from the IPC handler; the
// existing describes above are unchanged). Pins the session-log entry so a future edit
// cannot silently regress the failure detail back to an empty { errors: [] }.
describe("buildRollbackBatchLog - the pinned session-log entry", () => {
  it("partial failure: detail carries the raw per-file OS fields and a counts message", () => {
    const result = {
      success: false,
      restoredFiles: ["O:\\INBOX\\ok.pdf"],
      failedFiles: [{ name: "fail.pdf", src: "s", dest: "d", code: "ENOENT", errno: -4058, syscall: "rename", message: "boom" }],
      errors: [],
      userMessage: 'Could not move "fail.pdf" back to the inbox (ENOENT on rename). ...',
      userCode: "ERR_ROLLBACK_FAILED",
    };
    const entry = buildRollbackBatchLog(result, "TEST-PC");
    expect(entry.type).toBe("error");
    expect(entry.stage).toBe("rollbackBatch");
    expect(entry.code).toBe("ERR_ROLLBACK_FAILED"); // errors[] empty -> falls to userCode
    expect(entry.detail.failedFiles[0]).toMatchObject({ code: "ENOENT", syscall: "rename" });
    expect(entry.message).toContain("1/2 restored");
    expect(entry.workstation).toBe("TEST-PC");
  });

  it("whole-operation failure: detail.errors is non-empty and drives the code", () => {
    const result = {
      success: false,
      restoredFiles: [],
      failedFiles: [],
      errors: [{ code: "EINVAL", message: "Invalid batch folder name.", title: "Rollback failed" }],
    };
    const entry = buildRollbackBatchLog(result, "TEST-PC");
    expect(entry.type).toBe("error");
    expect(entry.code).toBe("EINVAL");
    expect(entry.detail.errors).toHaveLength(1);
    expect(entry.detail.errors[0].code).toBe("EINVAL");
  });

  it("success: type success, BATCH_ROLLED_BACK, detail.restoredFiles", () => {
    const result = { success: true, restoredFiles: ["O:\\INBOX\\a.pdf", "O:\\INBOX\\b.pdf"] };
    const entry = buildRollbackBatchLog(result, "TEST-PC");
    expect(entry.type).toBe("success");
    expect(entry.code).toBe("BATCH_ROLLED_BACK");
    expect(entry.detail.restoredFiles).toHaveLength(2);
    expect(entry.message).toContain("2 files restored");
  });
});
