import { describe, it, expect } from "vitest";
import { ETSY_IMPORTER_MIN_ALIVE_MS, importerAliveMs, otherLiveImporters } from "./etsyImporters";

const NOW = Date.parse("2026-10-23T10:00:00.000Z");
const ago = (minutes) => new Date(NOW - minutes * 60000).toISOString();
const row = (workstation, minutes, intervalMin = 2) => ({ workstation, intervalMin, lastTickAt: ago(minutes) });

describe("importerAliveMs", () => {
  it("is three intervals of the station, never under ten minutes", () => {
    expect(importerAliveMs(2)).toBe(ETSY_IMPORTER_MIN_ALIVE_MS);
    expect(importerAliveMs(3)).toBe(10 * 60000);
    expect(importerAliveMs(10)).toBe(30 * 60000);
    expect(importerAliveMs(60)).toBe(180 * 60000);
  });
  it.each([[0], [-5], [NaN], [null], [undefined]])("an unusable interval (%j) falls back to ten minutes", (value) => {
    expect(importerAliveMs(value)).toBe(ETSY_IMPORTER_MIN_ALIVE_MS);
  });
});

describe("otherLiveImporters", () => {
  it("lists the other stations with a live heartbeat, the newest first, with the minutes since it", () => {
    const rows = [row("POLY-PC", 7), row("QC-PC", 1), row("COTTON PC", 0)];
    expect(otherLiveImporters(rows, "Cotton PC", NOW)).toEqual([
      { workstation: "QC-PC", minutesAgo: 1 },
      { workstation: "POLY-PC", minutesAgo: 7 },
    ]);
  });

  it("never lists this station - names are compared ignoring case and outer spaces", () => {
    expect(otherLiveImporters([row("cotton pc", 1), row(" COTTON PC ", 2)], "Cotton PC", NOW)).toEqual([]);
  });

  it("a heartbeat older than its window is gone: ten minutes at least, three intervals for a slow station", () => {
    expect(otherLiveImporters([row("A", 11, 2)], "X", NOW)).toEqual([]);
    expect(otherLiveImporters([row("A", 9, 2)], "X", NOW)).toHaveLength(1);
    expect(otherLiveImporters([row("B", 25, 10)], "X", NOW)).toHaveLength(1);
    expect(otherLiveImporters([row("B", 31, 10)], "X", NOW)).toEqual([]);
  });

  it("a clock that runs ahead counts as 'just now', not as a negative age", () => {
    expect(otherLiveImporters([row("A", -5)], "X", NOW)).toEqual([{ workstation: "A", minutesAgo: 0 }]);
  });

  it.each([
    ["an unreadable time", { workstation: "A", intervalMin: 2, lastTickAt: "never" }],
    ["no time", { workstation: "A", intervalMin: 2 }],
    ["no name", { workstation: "", intervalMin: 2, lastTickAt: ago(1) }],
    ["a name that is not text", { workstation: 5, intervalMin: 2, lastTickAt: ago(1) }],
    ["null", null],
  ])("a row with %s is not a live importer", (_label, bad) => {
    expect(otherLiveImporters([bad], "X", NOW)).toEqual([]);
  });

  it.each([[null], [undefined], [{}], ["x"]])("rows that are not a list (%j) give none", (rows) => {
    expect(otherLiveImporters(rows, "X", NOW)).toEqual([]);
  });
});
