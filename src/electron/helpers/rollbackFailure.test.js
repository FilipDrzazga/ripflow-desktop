import { describe, it, expect } from "vitest";
import {
  ROLLBACK_FAILED_CODE,
  describeOsFailure,
  describeRollbackFailure,
  summarizeRollbackResult,
} from "./rollbackFailure.js";

// Pure module, zero imports in the unit under test - no mocks needed.

describe("describeOsFailure — OS code → operator advice", () => {
  it("ENOENT names the destination path", () => {
    const msg = describeOsFailure({ name: "a.pdf", dest: "O:\\INBOX\\a.pdf", code: "ENOENT" });
    expect(msg).toBe("Nie znaleziono pliku lub folderu docelowego: O:\\INBOX\\a.pdf");
  });

  it("EPERM is a write-permission message with the path", () => {
    const msg = describeOsFailure({ name: "a.pdf", dest: "O:\\INBOX\\a.pdf", code: "EPERM" });
    expect(msg).toBe("Brak uprawnień do zapisu w: O:\\INBOX\\a.pdf");
  });

  it("EACCES maps to the same permission message as EPERM", () => {
    const dest = "O:\\INBOX\\a.pdf";
    expect(describeOsFailure({ dest, code: "EACCES" })).toBe(`Brak uprawnień do zapisu w: ${dest}`);
  });

  it("EXDEV is the cross-device message", () => {
    const msg = describeOsFailure({ dest: "O:\\INBOX\\a.pdf", code: "EXDEV" });
    expect(msg).toBe("Plik nie może zostać przeniesiony między dyskami: O:\\INBOX\\a.pdf");
  });

  it("EEXIST is the already-exists message", () => {
    const msg = describeOsFailure({ dest: "O:\\INBOX\\a.pdf", code: "EEXIST" });
    expect(msg).toBe("Plik już istnieje w miejscu docelowym: O:\\INBOX\\a.pdf");
  });

  it("an unknown code falls back to a generic message naming the code and file, no crash", () => {
    const msg = describeOsFailure({ name: "a.pdf", dest: "O:\\INBOX\\a.pdf", code: "EBUSY" });
    expect(msg).toBe("Błąd systemu (EBUSY) przy pliku a.pdf");
  });

  it("a missing code still produces a message rather than crashing", () => {
    expect(describeOsFailure({ name: "a.pdf" })).toBe("Błąd systemu (brak kodu) przy pliku a.pdf");
  });

  it("path falls back to src, then name, then a placeholder when dest is absent", () => {
    expect(describeOsFailure({ src: "O:\\SRC\\a.pdf", code: "ENOENT" }))
      .toBe("Nie znaleziono pliku lub folderu docelowego: O:\\SRC\\a.pdf");
    expect(describeOsFailure({ name: "a.pdf", code: "ENOENT" }))
      .toBe("Nie znaleziono pliku lub folderu docelowego: a.pdf");
    expect(describeOsFailure({ code: "ENOENT" }))
      .toBe("Nie znaleziono pliku lub folderu docelowego: (nieznana ścieżka)");
  });
});

describe("describeRollbackFailure — full operator message", () => {
  it("one ENOENT entry → message carries the path, code is ERR_ROLLBACK_FAILED", () => {
    const out = describeRollbackFailure([{ name: "a.pdf", dest: "O:\\INBOX\\a.pdf", code: "ENOENT" }]);
    expect(out).toEqual({
      code: "ERR_ROLLBACK_FAILED",
      message: "Nie znaleziono pliku lub folderu docelowego: O:\\INBOX\\a.pdf",
    });
    expect(ROLLBACK_FAILED_CODE).toBe("ERR_ROLLBACK_FAILED");
  });

  it("three entries → describes the first and mentions the remaining two", () => {
    const out = describeRollbackFailure([
      { name: "a.pdf", dest: "O:\\INBOX\\a.pdf", code: "EPERM" },
      { name: "b.pdf", dest: "O:\\INBOX\\b.pdf", code: "ENOENT" },
      { name: "c.pdf", dest: "O:\\INBOX\\c.pdf", code: "EXDEV" },
    ]);
    expect(out.message).toBe(
      "Brak uprawnień do zapisu w: O:\\INBOX\\a.pdf …i jeszcze 2 plików (szczegóły w logu).",
    );
  });

  it("two entries → singular 'plik' for the one remaining", () => {
    const out = describeRollbackFailure([
      { name: "a.pdf", dest: "O:\\INBOX\\a.pdf", code: "EPERM" },
      { name: "b.pdf", dest: "O:\\INBOX\\b.pdf", code: "ENOENT" },
    ]);
    expect(out.message).toBe("Brak uprawnień do zapisu w: O:\\INBOX\\a.pdf …i jeszcze 1 plik (szczegóły w logu).");
  });

  it("empty array → null (read, nothing failed → caller keeps generic text)", () => {
    expect(describeRollbackFailure([])).toBeNull();
  });

  it("null/undefined → null (nothing to describe)", () => {
    expect(describeRollbackFailure(null)).toBeNull();
    expect(describeRollbackFailure(undefined)).toBeNull();
  });
});

describe("summarizeRollbackResult — structured log detail with sentinel discipline", () => {
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

  it("empty failedFiles ([]) → failed 0, distinct from unreadable", () => {
    const s = summarizeRollbackResult({ restoredFiles: ["a"], failedFiles: [], errors: [] });
    expect(s.failed).toBe(0);
    expect(s.failedFiles).toEqual([]);
    expect(s.attempted).toBe(1);
  });

  it("undefined/null failedFiles → failed null and failedFiles null ('could not read'), NOT []", () => {
    const s = summarizeRollbackResult({ restoredFiles: [], errors: [{ code: "EINVAL", message: "bad" }] });
    expect(s.failed).toBeNull();
    expect(s.failedFiles).toBeNull();
    // attempted must not treat a null failed count as 0-failed-of-something
    expect(s.attempted).toBe(0);
    expect(s.errors).toEqual([{ code: "EINVAL", message: "bad" }]);
  });

  it("a null errors channel degrades to [] rather than leaking null", () => {
    const s = summarizeRollbackResult({ restoredFiles: [], failedFiles: [] });
    expect(s.errors).toEqual([]);
  });
});
