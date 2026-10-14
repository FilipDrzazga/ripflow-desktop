import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { batchRipErrorOf, countRipErrorEvents, withoutRipErrorJob } from "./ripErrorsByFile";
import { RIP_ERROR_SCOPE } from "../../shared/constants";

// 2026-10-14: a whole-batch PrintFactory failure puts a row on EVERY file of the batch (scope
// BATCH). These helpers turn that into the batch-header badge, the Overview count and the drop
// after a resolve. The store map is file_id -> row, as latestRipErrorPerFile builds it.
const row = (file_id, job_guid, scope, detected_at = "2026-10-14T09:00:00.000Z") => ({
  file_id,
  job_guid,
  scope,
  detected_at,
});
const { FILE, BATCH } = RIP_ERROR_SCOPE;

describe("batchRipErrorOf", () => {
  it("finds the batch failure through any one of the batch's files", () => {
    const ripErrors = { b: row("b", "job-1", BATCH) };
    expect(batchRipErrorOf(["a", "b", "c"], ripErrors)).toBe(ripErrors.b);
  });

  it("a file failure, or a row from before the scope column, is no batch failure", () => {
    const ripErrors = { a: row("a", "job-1", FILE), b: row("b", "job-2", null) };
    expect(batchRipErrorOf(["a", "b"], ripErrors)).toBeNull();
  });

  it("files of other batches do not count", () => {
    expect(batchRipErrorOf(["a"], { z: row("z", "job-9", BATCH) })).toBeNull();
  });

  it("two batch failures over the same files -> the most recent", () => {
    const ripErrors = {
      a: row("a", "job-old", BATCH, "2026-10-13T09:00:00.000Z"),
      b: row("b", "job-new", BATCH, "2026-10-14T09:00:00.000Z"),
    };
    expect(batchRipErrorOf(["a", "b"], ripErrors).job_guid).toBe("job-new");
  });
});

describe("countRipErrorEvents", () => {
  it("a batch failure on three files is ONE error; file failures count per file", () => {
    const ripErrors = {
      a: row("a", "job-1", BATCH),
      b: row("b", "job-1", BATCH),
      c: row("c", "job-1", BATCH),
      d: row("d", "job-2", FILE),
      e: row("e", "job-3", null),
    };
    expect(countRipErrorEvents(ripErrors)).toBe(3);
  });

  it("two batches failing are two errors", () => {
    expect(countRipErrorEvents({ a: row("a", "job-1", BATCH), b: row("b", "job-2", BATCH) })).toBe(2);
  });

  it("empty store -> 0", () => {
    expect(countRipErrorEvents({})).toBe(0);
  });
});

describe("withoutRipErrorJob", () => {
  it("drops every file of the job and keeps the rest", () => {
    const ripErrors = { a: row("a", "job-1", BATCH), b: row("b", "job-1", BATCH), c: row("c", "job-2", FILE) };
    expect(Object.keys(withoutRipErrorJob(ripErrors, "job-1"))).toEqual(["c"]);
  });

  it("nothing of the job in the store -> the SAME object (no re-render)", () => {
    const ripErrors = { c: row("c", "job-2", FILE) };
    expect(withoutRipErrorJob(ripErrors, "job-1")).toBe(ripErrors);
  });
});

// No UI harness (rejected in 50f64c8): the wiring of the .jsx files is pinned by reading them.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("wiring of the whole-batch badge", () => {
  it("both batch headers look the failure up through batchRipErrorOf and open the popover with it", () => {
    for (const src of [read("../components/BatchHistory/BatchRow.jsx"), read("../components/Production/Production.jsx")]) {
      expect(src).toMatch(/const batchRipError = batchRipErrorOf\(/);
      expect(src).toMatch(/onRipBadgeClick\?\.\(batchRipError, e\.clientX, e\.clientY\)/);
    }
  });

  it("Production hands the popover opener to the batch header", () => {
    const src = read("../components/Production/Production.jsx");
    expect(src).toMatch(/<BatchGroupHeader[\s\S]{0,300}onRipBadgeClick=\{\(error, x, y\) => setRipPopover\(\{ error, x, y \}\)\}/);
  });

  it("the Overview pill counts failures, not files", () => {
    expect(read("../components/OverviewPanel/OverviewPanel.jsx")).toMatch(/const ripErrorCount = countRipErrorEvents\(ripErrors\)/);
  });

  it("the popover resolves a batch failure by its job and a file failure by its file", () => {
    const src = read("../components/RipErrorPopover/RipErrorPopover.jsx");
    expect(src).toMatch(/const isBatch = error\.scope === RIP_ERROR_SCOPE\.BATCH/);
    expect(src).toMatch(/const resolveKey = isBatch \? rawJobGuid : rawFileId/);
    expect(src).toMatch(/isBatch \? await resolveRipErrorJob\(resolveKey\) : await resolveRipError\(resolveKey\)/);
  });
});
