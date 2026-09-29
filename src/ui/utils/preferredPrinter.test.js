import { describe, it, expect } from "vitest";
import { preferredPrinterOptions, preferredPrinterState, draftWithType, preferredPrinterToSend } from "./preferredPrinter";

const printers = [
  { code: "DGEN", materialClass: "Cottons" },
  { code: "YOKO", materialClass: "Polyesters" },
  { code: "YUMI", materialClass: "Polyesters" },
];

describe("preferredPrinterOptions", () => {
  it("only the printers of the fabric's class", () => {
    expect(preferredPrinterOptions(printers, "Polyesters").map((p) => p.code)).toEqual(["YOKO", "YUMI"]);
    expect(preferredPrinterOptions(printers, "Cottons").map((p) => p.code)).toEqual(["DGEN"]);
    expect(preferredPrinterOptions(null, "Cottons")).toEqual([]);
  });
});

describe("preferredPrinterState", () => {
  it("none / ok / stale", () => {
    expect(preferredPrinterState(null, printers, "Polyesters")).toBe("none");
    expect(preferredPrinterState("YOKO", printers, "Polyesters")).toBe("ok");
    expect(preferredPrinterState("DGEN", printers, "Polyesters")).toBe("stale"); // another class
    expect(preferredPrinterState("MIMAKI", printers, "Polyesters")).toBe("stale"); // not in profile
    expect(preferredPrinterState("YOKO", [], "Polyesters")).toBe("stale"); // profile unreadable
  });
});

describe("draftWithType", () => {
  it("a class change clears the preference", () => {
    expect(draftWithType({ type: "Polyesters", preferredPrinter: "YOKO" }, "Cottons")).toEqual({ type: "Cottons", preferredPrinter: null });
  });
  it("the same class keeps the draft as it is", () => {
    const d = { type: "Polyesters", preferredPrinter: "YOKO" };
    expect(draftWithType(d, "Polyesters")).toBe(d);
  });
});

describe("preferredPrinterToSend", () => {
  const original = (preferredPrinter) => ({ type: "Polyesters", preferredPrinter });

  it("a changed value is sent: another code, None, a class change's null", () => {
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: "YUMI" }, original("YOKO"))).toBe("YUMI");
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: "" }, original("YOKO"))).toBeNull();
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: null }, original("MIMAKI"))).toBeNull();
    expect(preferredPrinterToSend(draftWithType({ type: "Polyesters", preferredPrinter: "YOKO" }, "Cottons"), original("YOKO"))).toBeNull();
  });

  it("an UNCHANGED value is not sent - a stale one cannot block saving the other fields", () => {
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: "MIMAKI" }, original("MIMAKI"))).toBeUndefined();
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: "YOKO" }, original("YOKO"))).toBeUndefined();
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: null }, original(null))).toBeUndefined();
  });

  it("a new fabric (no original) sends a choice; none chosen is nothing to send", () => {
    expect(preferredPrinterToSend({ type: "Polyesters", preferredPrinter: "YOKO" }, null)).toBe("YOKO");
    expect(preferredPrinterToSend({ type: "Cottons" }, null)).toBeUndefined();
  });
});
