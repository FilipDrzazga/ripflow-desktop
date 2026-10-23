import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests } from "./etsyImportRequests.js";

// Plan IMP-W: which OTHER stations have the Etsy-import switch On, for the warning in Settings > Etsy.

const NOW = Date.parse("2026-10-23T10:00:00.000Z");
const beat = (workstation, minutes, intervalMin = 2) => ({ workstation, intervalMin, lastTickAt: new Date(NOW - minutes * 60000).toISOString() });

const make = (over = {}) => {
  const parts = { listImporters: vi.fn(() => []), ownWorkstation: () => "Cotton PC", now: () => NOW, ...over };
  const requests = createEtsyImportRequests({
    featureOn: () => true,
    isImporter: () => false,
    list: () => [],
    requestRetry: () => ({ updated: true }),
    dismiss: () => ({ updated: true }),
    requestTick: () => {},
    ...parts,
  });
  return { requests, parts };
};

describe("otherImporters", () => {
  it("answers the other stations with a live heartbeat, never this one", () => {
    const { requests } = make({ listImporters: () => [beat("Cotton PC", 0), beat("QC-PC", 3)] });
    expect(requests.otherImporters()).toEqual({ success: true, data: [{ workstation: "QC-PC", minutesAgo: 3 }] });
  });

  it("an old heartbeat is not an importer", () => {
    const { requests } = make({ listImporters: () => [beat("QC-PC", 45)] });
    expect(requests.otherImporters()).toEqual({ success: true, data: [] });
  });

  it("nobody else is [] - asked and none alive", () => {
    const { requests } = make({ listImporters: () => [beat("Cotton PC", 0)] });
    expect(requests.otherImporters()).toEqual({ success: true, data: [] });
  });

  it("a heartbeat table that cannot be read is an error, never 'nobody else'", () => {
    const { requests } = make({ listImporters: () => null });
    expect(requests.otherImporters()).toMatchObject({ success: false, error: { code: "DB_READ_FAILED" } });
  });

  it("is refused while features.etsy is off", () => {
    const off = createEtsyImportRequests({ featureOn: () => false, isImporter: () => false, list: () => [], requestRetry: () => null, dismiss: () => null, requestTick: () => {} });
    expect(off.otherImporters()).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
  });
});
