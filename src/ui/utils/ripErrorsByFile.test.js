import { describe, it, expect } from "vitest";
import { latestRipErrorPerFile } from "./ripErrorsByFile.js";

// Pure module - no mocks. Rows are shaped like getOpenRipErrors() rows.
const row = (file_id, detected_at, error_message) => ({ file_id, detected_at, error_message });

describe("latestRipErrorPerFile", () => {
  it("keeps the NEWER of two open rows for one file when the DB sends them newest first", () => {
    // Exactly what getOpenRipErrors returns: ORDER BY detected_at DESC.
    const rows = [
      row("ON1001_A", "2026-09-23T15:00:00.000Z", "new failure"),
      row("ON1001_A", "2026-09-22T09:00:00.000Z", "old failure"),
    ];
    expect(latestRipErrorPerFile(rows).ON1001_A.error_message).toBe("new failure");
  });

  it("keeps the newer row whatever order the rows arrive in", () => {
    const rows = [
      row("ON1001_A", "2026-09-22T09:00:00.000Z", "old failure"),
      row("ON1001_A", "2026-09-23T15:00:00.000Z", "new failure"),
    ];
    expect(latestRipErrorPerFile(rows).ON1001_A.error_message).toBe("new failure");
  });

  it("leaves a row of another file untouched", () => {
    const other = row("ON2002_B", "2026-09-20T08:00:00.000Z", "other file");
    const rows = [
      row("ON1001_A", "2026-09-23T15:00:00.000Z", "new failure"),
      other,
      row("ON1001_A", "2026-09-22T09:00:00.000Z", "old failure"),
    ];
    const out = latestRipErrorPerFile(rows);
    expect(Object.keys(out).sort()).toEqual(["ON1001_A", "ON2002_B"]);
    expect(out.ON2002_B).toBe(other);
  });

  it("answers an empty map for a missing or non-array input", () => {
    expect(latestRipErrorPerFile(undefined)).toEqual({});
    expect(latestRipErrorPerFile(null)).toEqual({});
    expect(latestRipErrorPerFile({})).toEqual({});
  });
});
