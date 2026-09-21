import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// The PRINTED-root signal: an unreachable root and an empty one return the SAME shape to
// the renderer, so the banner cannot be driven by the return value. It is driven by this
// transition signal instead, and what follows pins the three properties that make it
// usable: it fires only on a CHANGE, it clears itself, and the returned reads keep the
// shape they had before it existed.
//
// Same stubbing edge as readPrintedFolder.diag.test.js - fs and the readers are real, the
// database and the caches are not. The storage root is a fresh mkdtemp per test, so the
// module-level logOnce throttle in readPrintedFolder.js can never suppress one test
// because another ran first.

const h = vi.hoisted(() => ({ storageRoot: "", insertLog: vi.fn(), degraded: false }));

vi.mock("../helpers/db.js", () => ({
  insertLog: (...a) => h.insertLog(...a),
  getDbDegraded: () => h.degraded,
  getOpenReprintRequestsByFileIds: () => [],
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Unknown" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));

import {
  readPrintedDays,
  readPrintedFolder,
  setPrintedRootSink,
  getPrintedRootUnreachable,
} from "./readPrintedFolder.js";

const sink = vi.fn();
const channels = () => sink.mock.calls.map((c) => c[0]);

// A storage root WITHOUT a PRINTED subfolder is the unreachable case; making the folder
// is the recovery. Both go through the same access() the readers run.
const printedDir = () => path.join(h.storageRoot, "PRINTED");
const makePrintedRoot = () => fs.mkdirSync(printedDir(), { recursive: true });
const removePrintedRoot = () => fs.rmSync(printedDir(), { recursive: true, force: true });

// The flag lives at MODULE level - that is the whole design, one state per process - so
// it survives from one test into the next just like the logOnce throttle does. Each test
// is therefore PRIMED into the known "reachable" state with the sink detached: create the
// folder, read once (which sets the flag false), remove it again. Every test then starts
// from flag=false with no PRINTED folder on disk, and asserts about its own emits only.
beforeEach(async () => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-printed-"));
  h.degraded = false;
  setPrintedRootSink(null);
  makePrintedRoot();
  await readPrintedDays();
  removePrintedRoot();
  h.insertLog.mockClear();
  sink.mockClear();
  setPrintedRootSink(sink);
});

afterEach(() => {
  setPrintedRootSink(null);
  try { fs.rmSync(h.storageRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("PRINTED root signal — what the operator ends up seeing", () => {
  it("emits unreachable when the root cannot be reached", async () => {
    await readPrintedDays();
    expect(channels()).toEqual(["printed:unreachable"]);
    expect(getPrintedRootUnreachable()).toBe(true);
  });

  it("stays quiet when the root is there", async () => {
    makePrintedRoot();
    await readPrintedDays();
    expect(sink).not.toHaveBeenCalled();
    expect(getPrintedRootUnreachable()).toBe(false);
  });

  // The reason the signal is per-transition and not per-read: readPrintedDays runs on
  // every BatchHistory mount, after every submit and on a 30s poll. An emit per read
  // would be a banner re-raised several times a minute.
  it("emits once, not once per read", async () => {
    await readPrintedDays();
    await readPrintedDays();
    await readPrintedFolder();
    expect(channels()).toEqual(["printed:unreachable"]);
  });

  it("clears itself when the root comes back", async () => {
    await readPrintedDays();
    makePrintedRoot();
    await readPrintedDays();
    expect(channels()).toEqual(["printed:unreachable", "printed:reachable"]);
    expect(getPrintedRootUnreachable()).toBe(false);
  });

  it("does not repeat the recovery either", async () => {
    await readPrintedDays();
    makePrintedRoot();
    await readPrintedDays();
    await readPrintedDays();
    expect(channels()).toEqual(["printed:unreachable", "printed:reachable"]);
  });

  it("raises again after a second outage", async () => {
    makePrintedRoot();
    await readPrintedDays();
    removePrintedRoot();
    await readPrintedDays();
    expect(channels()).toEqual(["printed:unreachable"]);
  });

  // Both readers carry the signal, because refreshBatchDays and the legacy full scan can
  // each be the first to touch the share.
  it("is raised by the full scan too", async () => {
    await readPrintedFolder();
    expect(channels()).toEqual(["printed:unreachable"]);
  });
});

describe("PRINTED root signal — what it must NOT change", () => {
  // The whole point of a signal beside the read: the returned shape is what BatchHistory
  // already renders, and this change is not allowed to touch it.
  it("leaves the unreachable read returning success with an empty list", async () => {
    const res = await readPrintedDays();
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    expect(res.errors).toEqual([]);
  });

  it("leaves the full scan's unreachable result unchanged as well", async () => {
    const res = await readPrintedFolder();
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });

  // The log entry that existed before the banner did. It is the record in the shared
  // session log, and it is what makes an outage visible per STATION after the fact -
  // the banner is only visible while somebody is looking at that screen.
  it("still writes PRINTED_ROOT_UNREACHABLE to the session log", async () => {
    await readPrintedDays();
    const codes = h.insertLog.mock.calls.map((c) => c[0]?.code);
    expect(codes).toContain("PRINTED_ROOT_UNREACHABLE");
  });
});

describe("PRINTED root signal — the sink is optional", () => {
  // Diagnostic guard, kept deliberately and with no corpse of its own: main wires the
  // sink after createWindow, so a read that lands before that must not throw. If this
  // ever breaks, the failure would look like a disk problem rather than a wiring one.
  it("reads fine with no sink wired", async () => {
    setPrintedRootSink(null);
    await expect(readPrintedDays()).resolves.toMatchObject({ success: true });
  });

  it("ignores a non-function sink", async () => {
    setPrintedRootSink("not a function");
    await expect(readPrintedDays()).resolves.toMatchObject({ success: true });
  });
});
