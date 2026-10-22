import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { previewLineView, shipByDay } from "./etsyView";

// "Check newest order": the line's ship-by date (plan ETA), the day it falls on in the station's time zone. The zone
// is pinned to London so the midnight and clock-change cases below mean the same on every machine.
beforeAll(() => {
  vi.stubEnv("TZ", "Europe/London");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const at = (iso) => Date.parse(iso) / 1000;

describe("shipByDay", () => {
  it("words a date as weekday, day, month and year", () => {
    expect(shipByDay(at("2026-10-27T12:00:00Z"))).toBe("Tue 27 Oct 2026");
  });

  it("is the station's day: 23:30 UTC in British summer time is already the next day", () => {
    expect(shipByDay(at("2026-10-23T23:30:00Z"))).toBe("Sat 24 Oct 2026");
    expect(shipByDay(at("2026-10-26T23:30:00Z"))).toBe("Mon 26 Oct 2026"); // after the clocks went back (25 Oct)
  });

  it.each([undefined, null, 0, "1761523200", 1.5, 1761523200000])("nothing for %s", (value) => {
    expect(shipByDay(value)).toBeNull();
  });
});

describe("previewLineView with a ship-by date", () => {
  it("a readable line shows 'Ship by' after the file rows", () => {
    const view = previewLineView({ ok: true, title: "Rose fabric", quantity: 3, fileName: "ET1_a.jpg", folder: "Drill", libraryFile: "ROSE.jpg", shipBy: at("2026-10-27T12:00:00Z") });
    expect(view.rows.map((r) => r.label)).toEqual(["Would make", "In folder", "From library file", "Ship by"]);
    expect(view.rows[3].value).toBe("Tue 27 Oct 2026");
  });

  it("a refused line shows it too, before the import list state", () => {
    const view = previewLineView({ ok: false, reason: "No XWD", shipBy: at("2026-10-27T12:00:00Z"), recordedState: "needs_review" });
    expect(view.rows.map((r) => r.label)).toEqual(["Would NOT import", "Ship by", "Already in the import list"]);
  });

  it("no date: no row", () => {
    const view = previewLineView({ ok: false, reason: "No XWD" });
    expect(view.rows.map((r) => r.label)).toEqual(["Would NOT import"]);
  });
});
