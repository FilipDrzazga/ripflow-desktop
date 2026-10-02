import { describe, it, expect } from "vitest";
import { nextSelectedPrinter } from "./printerSelection";

const next = (current, manual, auto, classChanged = false) => nextSelectedPrinter({ current, manual, auto, classChanged });

describe("nextSelectedPrinter", () => {
  it("a hand-picked printer stays when unticking a file makes a preference appear", () => {
    // mixed selection (auto null), operator picks YUMI, then unticks the file without a preference
    expect(next("YUMI", true, "YOKO")).toBe("YUMI");
  });

  it("a hand-picked printer stays when adding a file clears the preference", () => {
    // auto was YOKO, operator switched to YUMI, then adds a file with no preference
    expect(next("YUMI", true, null)).toBe("YUMI");
  });

  it("the bar's own pick follows: YOKO -> null -> YOKO", () => {
    expect(next("YOKO", false, null)).toBeNull();
    expect(next(null, false, "YOKO")).toBe("YOKO");
  });

  it("nothing chosen takes the auto pick (first selection, after Rip or Clear)", () => {
    expect(next(null, false, "DGEN")).toBe("DGEN");
    expect(next(undefined, true, "YUMI")).toBe("YUMI");
  });

  it("a class change resets even a hand-picked printer", () => {
    expect(next("YUMI", true, "DGEN", true)).toBe("DGEN");
    expect(next("YUMI", true, null, true)).toBeNull();
  });
});
