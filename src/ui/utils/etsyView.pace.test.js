import { describe, it, expect } from "vitest";
import { etsyPaceLine } from "./etsyView.js";

describe("etsyPaceLine - the import's pace beside Etsy's allowance", () => {
  it("names the day's requests for the interval: 1 to 11 a tick", () => {
    expect(etsyPaceLine(2, null)).toMatch(/^Every 2 min the import makes 720 to 7,920 Etsy requests a day\./);
    expect(etsyPaceLine(5, null)).toMatch(/^Every 5 min the import makes 288 to 3,168 Etsy requests a day\./);
    expect(etsyPaceLine(60, null)).toMatch(/^Every 60 min the import makes 24 to 264 Etsy requests a day\./);
  });

  it("before Etsy has answered on this station: says how to read the limit, never invents one", () => {
    expect(etsyPaceLine(2, null)).toMatch(/press Test connection to read it\.$/);
    expect(etsyPaceLine(2, { perDay: null, remainingToday: 400 })).toMatch(/press Test connection/);
  });

  it("with Etsy's numbers: the daily limit and what is left", () => {
    expect(etsyPaceLine(2, { perDay: 10000, remainingToday: 9412, perSecond: 10, at: "2026-10-22T12:00:00.000Z" })).toBe(
      "Every 2 min the import makes 720 to 7,920 Etsy requests a day. Etsy allows this app 10,000 a day (9,412 left in the last 24 h).",
    );
    expect(etsyPaceLine(3, { perDay: 5000, remainingToday: null })).toBe(
      "Every 3 min the import makes 480 to 5,280 Etsy requests a day. Etsy allows this app 5,000 a day.",
    );
  });
});
