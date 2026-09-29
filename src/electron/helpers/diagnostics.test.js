import { describe, it, expect } from "vitest";
import path from "path";
import { diagnosticTargets, collectDiagnostics, diagnosticsFileName } from "./diagnostics.js";

// ETAP 4 (4-diag): what "Export diagnostics" puts in the zip. Pure apart from the injected readDir
// (round 2, S2: a real listing - fs.access(W_OK) on Windows ignores the share's permissions).

const SETTINGS = { storagePath: "C:\\store", xmlPath: "C:\\xml", workstationName: "PC-1", workstationRole: "cotton" };
const PROFILE = {
  schemaVersion: 4,
  printers: [
    { code: "DGEN", hotfolder: "HOT_C" },
    { code: "YOKO", hotfolder: "HOT_P" },
    { code: "YUMI", hotfolder: "HOT_P" }, // shared hotfolder - checked once
  ],
  folders: { printed: "PRINTED", ripError: "ERR", customOrder: null },
};

describe("diagnosticTargets", () => {
  it("storage root, XML path, PRINTED, each hotfolder once, the configured special folders", () => {
    expect(diagnosticTargets(SETTINGS, PROFILE)).toEqual([
      { label: "storagePath", path: "C:\\store" },
      { label: "xmlPath", path: "C:\\xml" },
      { label: "PRINTED (PRINTED)", path: path.join("C:\\store", "PRINTED") },
      { label: "hotfolder HOT_C (DGEN)", path: path.join("C:\\store", "HOT_C") },
      { label: "hotfolder HOT_P (YOKO)", path: path.join("C:\\store", "HOT_P") },
      { label: "folders.ripError (ERR)", path: path.join("C:\\store", "ERR") },
    ]);
  });

  it("no paths set / no profile: only what exists is listed", () => {
    expect(diagnosticTargets({}, null)).toEqual([]);
    expect(diagnosticTargets({ storagePath: "C:\\s" }, null).map((t) => t.label)).toEqual(["storagePath", "PRINTED (PRINTED)"]);
  });
});

describe("collectDiagnostics", () => {
  const collect = (over = {}) =>
    collectDiagnostics({
      versions: { app: "1.0.27" },
      settings: SETTINGS,
      logs: [{ id: "1", message: "hello" }],
      profileRaw: JSON.stringify(PROFILE),
      dbOpen: true,
      dbDegraded: false,
      readDir: async (p) => {
        if (p.endsWith("HOT_P")) throw Object.assign(new Error("denied"), { code: "EACCES" });
        return [];
      },
      now: new Date("2026-09-29T08:00:00Z"),
      ...over,
    });
  const byName = async (over) => Object.fromEntries((await collect(over)).map((e) => [e.name, e.data]));

  it("four files, the stored profile as it is, the logs as rows", async () => {
    const files = await byName();
    expect(Object.keys(files)).toEqual(["summary.json", "access.json", "logs.json", "shop-profile.json"]);
    expect(files["shop-profile.json"]).toBe(JSON.stringify(PROFILE));
    expect(JSON.parse(files["logs.json"])).toEqual([{ id: "1", message: "hello" }]);
  });

  it("summary: versions, station, database state, profile version, and the folders that failed", async () => {
    const s = JSON.parse((await byName())["summary.json"]);
    expect(s.generatedAt).toBe("2026-09-29T08:00:00.000Z");
    expect(s.workstation).toEqual({ name: "PC-1", role: "cotton" });
    expect(s.database).toEqual({ open: true, degraded: false });
    expect(s.shopProfile).toEqual({ schemaVersion: 4, printers: 3 });
    expect(s.folderProblems).toEqual(["hotfolder HOT_P (YOKO): cannot read (EACCES)"]);
    expect(s.logRows).toBe(1);
  });

  it("access.json: every target with read ok / the error, and write honestly not tested", async () => {
    const a = JSON.parse((await byName())["access.json"]);
    expect(a.filter((r) => r.read === "ok").length).toBe(5);
    expect(a.find((r) => r.read !== "ok")).toMatchObject({ label: "hotfolder HOT_P (YOKO)", read: "EACCES" });
    expect(a.every((r) => r.write === "not tested")).toBe(true);
  });

  it("the read check lists the folder (readDir is called for every target, nothing else)", async () => {
    const seen = [];
    await collect({ readDir: async (p) => { seen.push(p); return []; } });
    expect(seen).toEqual(diagnosticTargets(SETTINGS, PROFILE).map((t) => t.path));
  });

  it("no database: profile null, the rest still exported", async () => {
    const files = await byName({ profileRaw: null, dbOpen: false, logs: [] });
    expect(files["shop-profile.json"]).toBe("null\n");
    const s = JSON.parse(files["summary.json"]);
    expect([s.shopProfile, s.database.open, s.logRows]).toEqual([null, false, 0]);
  });

  it("a profile row that is not JSON is still shipped as it is; the summary says unreadable", async () => {
    const files = await byName({ profileRaw: "{broken" });
    expect(files["shop-profile.json"]).toBe("{broken");
    expect(JSON.parse(files["summary.json"]).shopProfile.schemaVersion).toBe("unreadable");
  });
});

describe("diagnosticsFileName", () => {
  it("station name made file-safe, the date", () => {
    expect(diagnosticsFileName("RIP PC/2", new Date("2026-09-29T08:00:00Z"))).toBe("ripflow-diagnostics-RIP_PC_2-2026-09-29.zip");
  });
});
