import { describe, it, expect } from "vitest";
import { nextSelectedPrinter } from "./printerSelection";

const next = (current, lastAuto, auto, classChanged = false) => nextSelectedPrinter({ current, lastAuto, auto, classChanged });

describe("nextSelectedPrinter", () => {
  it("a hand-picked printer stays when unticking a file makes a preference appear", () => {
    // mixed selection (auto null), operator picks YUMI, then unticks the file without a preference
    expect(next("YUMI", null, "YOKO")).toBe("YUMI");
  });

  it("a hand-picked printer stays when adding a file clears the preference", () => {
    // auto was YOKO, operator switched to YUMI, then adds a file with no preference
    expect(next("YUMI", "YOKO", null)).toBe("YUMI");
  });

  it("the bar's own pick follows: YOKO -> null -> YOKO", () => {
    expect(next("YOKO", "YOKO", null)).toBeNull();
    expect(next(null, null, "YOKO")).toBe("YOKO");
  });

  it("nothing chosen takes the auto pick (first selection, after Rip or Clear)", () => {
    expect(next(null, null, "DGEN")).toBe("DGEN");
    expect(next(undefined, "YOKO", "YUMI")).toBe("YUMI");
  });

  it("a class change resets even a hand-picked printer", () => {
    expect(next("YUMI", "YOKO", "DGEN", true)).toBe("DGEN");
    expect(next("YUMI", "YOKO", null, true)).toBeNull();
  });
});
