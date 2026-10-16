import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness: the wiring of the Printed metres tile and the Cloud key is pinned by reading the
// sources (the same approach as printSmallWindowWiring.test.js).

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const preload = read("../../electron/preload.js");
const handlers = read("../../electron/ipc/cloudHandlers.js");
const overview = read("./OverviewPanel/OverviewPanel.jsx");
const general = read("./Settings/views/GeneralView.jsx");
const section = read("./Settings/views/CloudKeySection.jsx");
const service = read("../services/cloudService.js");
const ipcIndex = read("../../electron/ipc/index.js");

describe("PrintFactory Cloud key", () => {
  it("the renderer can set, clear, test and ask whether a key exists - never read it back", () => {
    const block = preload.match(/cloud: Object\.freeze\(\{([\s\S]*?)\}\),/)[1];
    const names = [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(["clearKey", "getDayMetres", "hasKey", "setKey", "test"]);
  });

  it("main registers exactly those channels, and none that returns the key", () => {
    const channels = [...handlers.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((m) => m[1]);
    expect(channels.sort()).toEqual(["cloud:clear-key", "cloud:get-day-metres", "cloud:has-key", "cloud:set-key", "cloud:test"]);
    // the stored key is used inside main (getKey for the service, the test with no typed key) and
    // is not part of any answer: no handler returns getCloudKey()
    expect(handlers).not.toMatch(/return[^;]*getCloudKey\(\)/);
    expect(handlers).not.toMatch(/data:\s*getCloudKey/);
  });

  it("handlers are registered at startup", () => {
    expect(ipcIndex).toMatch(/registerCloudHandlers\(\);/);
  });

  it("the key lives in a file of its own, never in getSettings", () => {
    const settings = read("../../electron/helpers/getSettings.js");
    expect(settings).not.toMatch(/cloud|MisKey/i);
    expect(read("../../electron/helpers/cloudKey.js")).toMatch(/new Store\(\{ name: "cloud" \}\)/);
  });

  it("only the service touches window.api, and only its cloud part", () => {
    expect(service).toMatch(/window\.api\.cloud\./);
    for (const [name, src] of [["OverviewPanel", overview], ["CloudKeySection", section]]) {
      expect(src, name).not.toMatch(/window\.api/);
    }
  });

  it("the key field is part of General, next to the station settings", () => {
    expect(general).toMatch(/import CloudKeySection from "\.\/CloudKeySection"/);
    expect(general).toMatch(/<CloudKeySection \/>/);
  });
});

describe("Printed metres tile", () => {
  it("replaced Last batch: it reads the hook and no longer the newest batch", () => {
    expect(overview).toMatch(/useCloudDayMetres\(\)/);
    expect(overview).toMatch(/Printed metres/);
    expect(overview).not.toMatch(/getLastBatch|Last batch/);
  });

  it("shows yesterday and today and copies one day at a time", () => {
    expect(overview).toMatch(/field: "yesterday"/);
    expect(overview).toMatch(/field: "today"/);
    expect(overview).toMatch(/metresCopyText\(cloud\.data\.devices, field\)/);
  });

  it("the poll stands while the polls stand (power pause, hidden window)", () => {
    const hook = read("../hooks/useCloudDayMetres.js");
    expect(hook).toMatch(/usePollingPaused\(\)/);
    expect(hook).toMatch(/if \(stopped\) return undefined;/);
  });
});
