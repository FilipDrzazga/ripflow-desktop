import { describe, it, expect } from "vitest";
import {
  UNKNOWN_DAY_KEY,
  dayKeyFromBatchPath,
  parseDayKey,
  getDayLabel,
  compareDayKeysDesc,
  daysSinceDayKey,
} from "./dayKey";

// Helper: build a "DD-MM-YYYY" key N days before today, in LOCAL time — the
// same frame the day folder is written in.
const keyDaysAgo = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mo}-${d.getFullYear()}`;
};

describe("dayKeyFromBatchPath", () => {
  it("reads the day folder from a Windows path", () => {
    expect(dayKeyFromBatchPath("O:\\SPPrintReadyArtwork\\PRINTED\\19-08-2026\\PRINTED_094512-Cotton-DGEN")).toBe(
      "19-08-2026",
    );
  });

  it("reads the day folder from a POSIX path", () => {
    expect(dayKeyFromBatchPath("/mnt/art/PRINTED/19-08-2026/PRINTED_094512-Cotton-DGEN")).toBe("19-08-2026");
  });

  it("ignores the _N collision suffix on the batch folder", () => {
    expect(dayKeyFromBatchPath("O:\\PRINTED\\01-02-2026\\PRINTED_101010-Poly-YOKO_1")).toBe("01-02-2026");
  });

  it("tolerates a trailing separator", () => {
    expect(dayKeyFromBatchPath("O:\\PRINTED\\01-02-2026\\PRINTED_101010-Poly-YOKO\\")).toBe("01-02-2026");
  });

  it("returns null for a missing or non-string batch_path", () => {
    expect(dayKeyFromBatchPath(null)).toBeNull();
    expect(dayKeyFromBatchPath(undefined)).toBeNull();
    expect(dayKeyFromBatchPath("")).toBeNull();
    expect(dayKeyFromBatchPath(42)).toBeNull();
  });

  it("returns null when the segment is not a day folder", () => {
    expect(dayKeyFromBatchPath("O:\\PRINTED\\NOT_A_DAY\\PRINTED_101010-Poly-YOKO")).toBeNull();
    expect(dayKeyFromBatchPath("PRINTED_101010-Poly-YOKO")).toBeNull();
  });
});

describe("parseDayKey", () => {
  it("parses to local midnight", () => {
    const d = parseDayKey("19-08-2026");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(19);
    expect(d.getHours()).toBe(0);
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseDayKey("2026-08-19")).toBeNull();
    expect(parseDayKey("32-01-2026")).toBeNull();
    expect(parseDayKey("01-13-2026")).toBeNull();
    expect(parseDayKey(null)).toBeNull();
  });
});

describe("getDayLabel", () => {
  it("labels today and yesterday, nothing else", () => {
    expect(getDayLabel(keyDaysAgo(0))).toBe("Today");
    expect(getDayLabel(keyDaysAgo(1))).toBe("Yesterday");
    expect(getDayLabel(keyDaysAgo(2))).toBeNull();
  });

  it("returns null for an unparsable key", () => {
    expect(getDayLabel(UNKNOWN_DAY_KEY)).toBeNull();
  });
});

describe("compareDayKeysDesc", () => {
  it("sorts newest first and pushes unparsable keys last", () => {
    const keys = ["17-08-2026", UNKNOWN_DAY_KEY, "19-08-2026", "18-08-2026"];
    expect([...keys].sort(compareDayKeysDesc)).toEqual(["19-08-2026", "18-08-2026", "17-08-2026", UNKNOWN_DAY_KEY]);
  });

  it("keeps two unparsable keys equal", () => {
    expect(compareDayKeysDesc(UNKNOWN_DAY_KEY, "nope")).toBe(0);
  });
});

describe("daysSinceDayKey", () => {
  it("counts whole days back from today", () => {
    expect(daysSinceDayKey(keyDaysAgo(0))).toBe(0);
    expect(daysSinceDayKey(keyDaysAgo(1))).toBe(1);
    expect(daysSinceDayKey(keyDaysAgo(9))).toBe(9);
  });

  it("returns null for an unparsable key", () => {
    expect(daysSinceDayKey(UNKNOWN_DAY_KEY)).toBeNull();
  });
});
