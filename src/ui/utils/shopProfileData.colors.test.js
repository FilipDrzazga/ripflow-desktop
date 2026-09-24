import { describe, it, expect } from "vitest";
import { getPrinterColor, getMaterialClassColor, getPrinters } from "./shopProfileData.js";
import { DEFAULT_PROFILE } from "../../electron/helpers/defaultProfile.js";

// ETAP 2e step 4: printer badge colours come from printers[].color instead of the
// PRINTER_COLORS constant (src/ui/constants/printerColors.js, removed in this step).
// The constant's values are written out below, so the parity case keeps proving that
// Alex's screens look the same after the file is gone.
const REMOVED_PRINTER_COLORS = {
  DGEN: { bg: "#E6F1FB", color: "#0C447C" },
  YOKO: { bg: "#EEEDFE", color: "#3C3489" },
  YUMI: { bg: "#E1F5EE", color: "#085041" },
};

describe("getPrinterColor", () => {
  it("gives Alex's three printers exactly the colours of the removed constant", () => {
    for (const code of Object.keys(REMOVED_PRINTER_COLORS)) {
      expect(getPrinterColor(DEFAULT_PROFILE, code)).toEqual(REMOVED_PRINTER_COLORS[code]);
    }
  });

  it("finds the printer whatever case the code arrives in", () => {
    expect(getPrinterColor(DEFAULT_PROFILE, "yoko")).toEqual(REMOVED_PRINTER_COLORS.YOKO);
  });

  it("answers null - the component's own grey - for what it cannot use", () => {
    expect(getPrinterColor(DEFAULT_PROFILE, "MIMAKI2")).toBeNull(); // not in the profile
    expect(getPrinterColor(null, "DGEN")).toBeNull(); // profile unreadable
    expect(getPrinterColor(DEFAULT_PROFILE, "")).toBeNull();
    expect(getPrinterColor(DEFAULT_PROFILE, null)).toBeNull();
    const withColor = (color) => ({ printers: [{ code: "X1", materialClass: "Silk", color }] });
    expect(getPrinterColor(withColor(undefined), "X1")).toBeNull();
    expect(getPrinterColor(withColor({ bg: "#fff" }), "X1")).toBeNull(); // no text colour
    expect(getPrinterColor(withColor({ bg: "red", text: "#000" }), "X1")).toBeNull(); // not hex
    expect(getPrinterColor(withColor({ bg: "#fff;background:url(x)", text: "#000" }), "X1")).toBeNull();
    expect(getPrinterColor(withColor({ bg: "#fff", text: "#000" }), "X1")).toEqual({ bg: "#fff", color: "#000" });
  });

  it("uses the same rows getPrinters offers: first occurrence of a code wins", () => {
    const profile = {
      printers: [
        { code: "DGEN", materialClass: "Cottons", color: { bg: "#111111", text: "#222222" } },
        { code: "dgen", materialClass: "Cottons", color: { bg: "#333333", text: "#444444" } },
        { code: "BAD-CODE", materialClass: "Cottons", color: { bg: "#555555", text: "#666666" } },
      ],
    };
    expect(getPrinters(profile).map((p) => p.code)).toEqual(["DGEN"]);
    expect(getPrinterColor(profile, "DGEN")).toEqual({ bg: "#111111", color: "#222222" });
    expect(getPrinterColor(profile, "BAD-CODE")).toBeNull();
  });
});

describe("getMaterialClassColor", () => {
  it("reproduces the removed hardwiring on Alex's profile: Cottons = DGEN, Polyesters = YOKO", () => {
    expect(getMaterialClassColor(DEFAULT_PROFILE, "Cottons")).toEqual(REMOVED_PRINTER_COLORS.DGEN);
    expect(getMaterialClassColor(DEFAULT_PROFILE, "Polyesters")).toEqual(REMOVED_PRINTER_COLORS.YOKO);
  });

  it("null for a class without a printer or an unreadable profile", () => {
    expect(getMaterialClassColor(DEFAULT_PROFILE, "Silk")).toBeNull();
    expect(getMaterialClassColor(null, "Cottons")).toBeNull();
  });
});
