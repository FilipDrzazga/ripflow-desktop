import { describe, it, expect, vi } from "vitest";
import { storesPreferredPrinter, preferredPrinterColumnError } from "./fabricInput.js";

// D8: on a DB whose start could not add fabrics.preferred_printer, fabrics:save / fabrics:setAll
// refuse ONLY a write that sets a preference, with a reason the operator can act on, and ask the
// DB (which retries the ALTER) only then.

describe("storesPreferredPrinter", () => {
  it("is true only when a code is sent", () => {
    expect(storesPreferredPrinter({ name: "A", preferredPrinter: "YOKO" })).toBe(true);
    expect(storesPreferredPrinter({ name: "A" })).toBe(false);
    expect(storesPreferredPrinter({ name: "A", preferredPrinter: null })).toBe(false);
    expect(storesPreferredPrinter({ name: "A", preferredPrinter: "" })).toBe(false);
  });
});

describe("preferredPrinterColumnError", () => {
  it("no row sets a preference: no error, and the DB is not asked", () => {
    const hasColumn = vi.fn(() => false);
    expect(preferredPrinterColumnError([{ name: "A" }, { name: "B", preferredPrinter: null }], hasColumn)).toBeNull();
    expect(hasColumn).not.toHaveBeenCalled();
  });

  it("a preference and the column is there: no error", () => {
    expect(preferredPrinterColumnError([{ name: "A", preferredPrinter: "YOKO" }], () => true)).toBeNull();
  });

  it("a preference and no column: refused, naming the first such fabric, asked once", () => {
    const hasColumn = vi.fn(() => false);
    const error = preferredPrinterColumnError([{ name: "A" }, { name: "Organza", preferredPrinter: "YUMI" }, { name: "Voile", preferredPrinter: "YOKO" }], hasColumn);
    expect(error).toMatch(/preferred printer of "Organza" cannot be saved/);
    expect(error).toMatch(/Save it without one, or restart RipFlow/);
    expect(hasColumn).toHaveBeenCalledTimes(1);
  });
});
