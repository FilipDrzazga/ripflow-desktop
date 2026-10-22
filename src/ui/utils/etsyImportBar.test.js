import { describe, it, expect } from "vitest";
import {
  barTitle,
  canRetry,
  dismissNotice,
  etsyOrderIdOf,
  initialXwdInput,
  isInterrupted,
  lineKey,
  lineMeta,
  lineTitle,
  listingNotice,
  readXwdInput,
  retryConfirmMessage,
  retryNotice,
  stateChip,
  stateHint,
} from "./etsyImportBar";
import { ETSY_IMPORT_INTERRUPTED_REASON, ETSY_IMPORT_STATE } from "../../shared/constants";

const row = (over = {}) => ({
  receiptId: "3456789012",
  transactionId: "501",
  state: ETSY_IMPORT_STATE.NEEDS_REVIEW,
  reason: "No XWD pattern number in the SKU, the variations or the title of the order line.",
  title: "Peony Garden Velvet",
  quantity: 2,
  listingId: "1234567890",
  manualXwd: null,
  ...over,
});

describe("readXwdInput", () => {
  it("six digits are the number, an empty field is 'judge the line again'", () => {
    expect(readXwdInput("173706")).toEqual({ ok: true, value: "173706" });
    expect(readXwdInput("  173706 ")).toEqual({ ok: true, value: "173706" });
    expect(readXwdInput("")).toEqual({ ok: true, value: null });
    expect(readXwdInput("   ")).toEqual({ ok: true, value: null });
    expect(readXwdInput(undefined)).toEqual({ ok: true, value: null });
  });

  it.each(["12345", "1234567", "12345a", "XWD173706", "17 3706"])("refuses %j - never padded or trimmed into shape", (text) => {
    expect(readXwdInput(text)).toMatchObject({ ok: false });
  });
});

describe("the field and the actions", () => {
  it("the field starts from the number a person typed before", () => {
    expect(initialXwdInput(row({ manualXwd: "173706" }))).toBe("173706");
    expect(initialXwdInput(row())).toBe("");
  });

  it("Retry is for a line that waits for a person; a RETRY already waits for the importer", () => {
    expect(canRetry(row({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW }))).toBe(true);
    expect(canRetry(row({ state: ETSY_IMPORT_STATE.FAILED }))).toBe(true);
    expect(canRetry(row({ state: ETSY_IMPORT_STATE.RETRY }))).toBe(false);
  });

  it("the interrupted copy is recognised by the engine's own reason text", () => {
    expect(isInterrupted(row({ reason: ETSY_IMPORT_INTERRUPTED_REASON }))).toBe(true);
    expect(isInterrupted(row())).toBe(false);
    expect(retryConfirmMessage(row({ reason: ETSY_IMPORT_INTERRUPTED_REASON }))).toContain(ETSY_IMPORT_INTERRUPTED_REASON);
  });
});

describe("what the bar says", () => {
  it("the line key and the order number the rest of the app uses", () => {
    expect(lineKey(row())).toBe("3456789012:501");
    expect(etsyOrderIdOf(row())).toBe("ET3456789012");
  });

  it("title, and the meta line with only the parts the row has", () => {
    expect(lineTitle(row())).toBe("Peony Garden Velvet");
    expect(lineTitle(row({ title: "  " }))).toBe("Order line without a title");
    expect(lineTitle(row({ title: null }))).toBe("Order line without a title");
    expect(lineMeta(row())).toBe("Order ET3456789012 - qty 2 - listing 1234567890");
    expect(lineMeta(row({ quantity: null, listingId: null }))).toBe("Order ET3456789012");
  });

  it("the title counts lines and names how many wait for the importer", () => {
    expect(barTitle([row()])).toBe("1 Etsy order line needs a person");
    expect(barTitle([row(), row({ transactionId: "502" })])).toBe("2 Etsy order lines need a person");
    expect(barTitle([row(), row({ transactionId: "502", state: ETSY_IMPORT_STATE.RETRY })])).toBe(
      "2 Etsy order lines need a person (1 waiting for the importer)",
    );
  });

  it("chips and the waiting hint depend on the state and on whether this station imports", () => {
    expect(stateChip(row())).toEqual({ tone: "warn", text: "Needs a person" });
    expect(stateChip(row({ state: ETSY_IMPORT_STATE.FAILED }))).toEqual({ tone: "bad", text: "Failed" });
    expect(stateChip(row({ state: ETSY_IMPORT_STATE.RETRY }))).toEqual({ tone: "wait", text: "Retry requested" });
    expect(stateHint(row(), false)).toBeNull();
    expect(stateHint(row({ state: ETSY_IMPORT_STATE.RETRY }), true)).toMatch(/this station imports it/);
    expect(stateHint(row({ state: ETSY_IMPORT_STATE.RETRY }), false)).toMatch(/importer station picks it up at its next check of Etsy/);
  });
});

describe("answers -> notices", () => {
  it("retry: updated:true is a success that names who copies", () => {
    expect(retryNotice({ success: true, updated: true, importerHere: true }, row())).toMatchObject({ type: "Success" });
    expect(retryNotice({ success: true, updated: true, importerHere: false }, row()).message).toMatch(/at its next check of Etsy/);
  });

  it("updated:false is a Warning, apart from a failure (rule 18's split), and never an Error", () => {
    expect(retryNotice({ success: true, updated: false }, row())).toMatchObject({ type: "Warning" });
    expect(dismissNotice({ success: true, updated: false }, row())).toMatchObject({ type: "Warning" });
  });

  it("a refusal keeps the type main gave it, anything else is an Error", () => {
    const warn = { success: false, error: { type: "Warning", title: "Etsy import", message: "The XWD number must be exactly six digits" } };
    expect(retryNotice(warn, row())).toEqual({ type: "Warning", title: "Etsy import", message: warn.error.message });
    expect(dismissNotice({ success: false, error: { title: "x", message: "y" } }, row())).toMatchObject({ type: "Error" });
    expect(retryNotice(undefined, row())).toMatchObject({ type: "Error", message: expect.stringContaining("No answer") });
  });

  it("dismiss success, and the listing opener says nothing unless it failed", () => {
    expect(dismissNotice({ success: true, updated: true }, row())).toMatchObject({ type: "Success" });
    expect(listingNotice({ success: true })).toBeNull();
    expect(listingNotice({ success: false, error: { message: "no browser" } })).toMatchObject({ type: "Error", message: "no browser" });
  });
});

describe("withoutTyped (W2: the field goes back to the database's number after a written Retry)", () => {
  it("drops one line's entry and keeps the others, without touching the original", async () => {
    const { withoutTyped } = await import("./etsyImportBar");
    const typed = { "1:2": "173706", "3:4": "100234" };
    expect(withoutTyped(typed, "1:2")).toEqual({ "3:4": "100234" });
    expect(typed).toEqual({ "1:2": "173706", "3:4": "100234" });
  });

  it("a line that was never typed in is the same object back", async () => {
    const { withoutTyped } = await import("./etsyImportBar");
    const typed = { "3:4": "100234" };
    expect(withoutTyped(typed, "1:2")).toBe(typed);
  });
});
