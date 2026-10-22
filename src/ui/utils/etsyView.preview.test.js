import { describe, it, expect } from "vitest";
import { previewOrderNotes, previewLineView } from "./etsyView";

// "Check newest order" (the dry run): how the answer of main is worded.
const receipt = (over = {}) => ({ receiptId: "3456789012", created: "2026-10-22T09:00:00.000Z", afterStart: true, shipped: false, ...over });

describe("previewOrderNotes", () => {
  it("a new, unshipped order on a station that is ready: only the 'ready' note", () => {
    expect(previewOrderNotes({ receipt: receipt(), lines: [], gate: null })).toEqual([{ tone: "ok", text: "The background import is ready on this station." }]);
  });

  it("an order placed before the import was switched on is skipped - and says so", () => {
    const notes = previewOrderNotes({ receipt: receipt({ afterStart: false }), lines: [], gate: null });
    expect(notes[0]).toMatchObject({ tone: "warn" });
    expect(notes[0].text).toMatch(/placed before the import was switched on/);
  });

  it("an already shipped order is skipped - and says so", () => {
    expect(previewOrderNotes({ receipt: receipt({ shipped: true }), lines: [], gate: null })[0].text).toMatch(/already shipped/);
  });

  it("no start date: the import would take nothing", () => {
    expect(previewOrderNotes({ receipt: receipt({ afterStart: null }), lines: [], gate: null })[0].text).toMatch(/no start date/);
  });

  it("the reason the real tick does not run here is shown (the thing a switched-on station keeps quiet)", () => {
    const gate = "features.etsy is off in the shop profile (or the profile is not loaded)";
    const notes = previewOrderNotes({ receipt: receipt(), lines: [], gate });
    expect(notes.at(-1)).toEqual({ tone: "warn", text: `The background import does not run on this station now: ${gate}.` });
  });

  it("a shop with no paid order", () => {
    expect(previewOrderNotes({ receipt: null, lines: [], gate: null })).toEqual([{ tone: "off", text: "The shop has no paid order yet." }]);
    expect(previewOrderNotes(null)).toEqual([{ tone: "off", text: "The shop has no paid order yet." }]);
  });
});

describe("previewLineView", () => {
  it("a line the import would take: the file, the folder and the library file", () => {
    const view = previewLineView({ ok: true, title: "Rose fabric", quantity: 3, fileName: "ET1_a.jpg", folder: "Drill", libraryFile: "ROSE XWD173706_d.jpg", recordedState: null });
    expect(view).toEqual({
      ok: true,
      headline: "Rose fabric | qty 3",
      rows: [
        { label: "Would make", value: "ET1_a.jpg" },
        { label: "In folder", value: "Drill" },
        { label: "From library file", value: "ROSE XWD173706_d.jpg" },
      ],
    });
  });

  it("a line it would refuse: the reason, and the suggestion when there is one", () => {
    const view = previewLineView({ ok: false, title: null, quantity: null, reason: "No XWD pattern number.", suggestedXwd: "173706", recordedState: null });
    expect(view.ok).toBe(false);
    expect(view.headline).toBe("Order line without a title");
    expect(view.rows).toEqual([
      { label: "Would NOT import", value: "No XWD pattern number." },
      { label: "Suggestion", value: "XWD173706 - the library file that matches the listing title" },
    ]);
  });

  it("what the import list already holds for the line is worded for a person", () => {
    const row = (state) => previewLineView({ ok: true, fileName: "a", folder: "b", libraryFile: "c", recordedState: state }).rows.at(-1);
    expect(row("done")).toEqual({ label: "Already in the import list", value: "already imported" });
    expect(row("needs_review").value).toMatch(/Etsy bar/);
    expect(row("something_new").value).toBe("something_new");
  });
});
