import { describe, it, expect } from "vitest";
import { importOrderConfirm, importOrderNotice } from "./etsyView";

// "Import this order" (plan E5): the question before it and the notice after it.
const ok = (over = {}) => ({ success: true, ran: true, reason: null, imported: 0, needsReview: 0, failed: 0, skipped: 0, ...over });

describe("importOrderConfirm", () => {
  it("names the order, warns about an order already printed by hand and says the start date stays", () => {
    const text = importOrderConfirm("3456789012");
    expect(text).toContain("ET3456789012");
    expect(text).toMatch(/already printed by hand/);
    expect(text).toMatch(/start date does not change/);
  });
});

describe("importOrderNotice", () => {
  it("all lines imported -> Success with the count", () => {
    expect(importOrderNotice(ok({ imported: 2 }), "3456789012")).toEqual({ type: "Success", title: "Etsy order ET3456789012", message: "2 files imported." });
  });

  it("a line in the bar -> Warning with both counts", () => {
    expect(importOrderNotice(ok({ imported: 1, needsReview: 1 }), "1")).toMatchObject({ type: "Warning", message: "1 file imported, 1 line in the Etsy bar." });
  });

  it("everything already in the import list -> Success that says so", () => {
    expect(importOrderNotice(ok({ skipped: 2 }), "1").message).toBe("0 files imported, 2 lines already in the import list.");
  });

  it("busy -> Warning to try again", () => {
    expect(importOrderNotice({ success: true, busy: true }, "1")).toMatchObject({ type: "Warning", message: expect.stringMatching(/try again/) });
  });

  it("did not run (another station, shipped order) -> Warning with the reason", () => {
    const res = { success: true, ran: false, reason: "this station is not switched on as the Etsy importer (Settings > Etsy)" };
    expect(importOrderNotice(res, "1")).toMatchObject({ type: "Warning", message: `Not imported: ${res.reason}.` });
  });

  it("stopped half way -> Error with the reason and what was done", () => {
    expect(importOrderNotice(ok({ imported: 1, reason: "Cannot read the folder X" }), "1")).toMatchObject({
      type: "Error",
      message: "Stopped: Cannot read the folder X. So far: 1 file imported.",
    });
  });

  it("an IPC error -> the error's own words", () => {
    const res = { success: false, errors: [{ type: "Warning", title: "Etsy import", message: "The Etsy order is not named by its number." }] };
    expect(importOrderNotice(res, "1")).toEqual({ type: "Warning", title: "Etsy import", message: "The Etsy order is not named by its number." });
  });
});
