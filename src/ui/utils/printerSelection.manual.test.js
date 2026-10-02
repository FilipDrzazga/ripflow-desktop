import { describe, it, expect } from "vitest";
import { NO_PRINTER, nextPrinterSelection, nextSelectedPrinter, pickPrinterByHand } from "./printerSelection";

// D10: the hand pick is an explicit flag set by the radio, not a comparison with the bar's last auto pick.
const step = (current, auto, classChanged = false) => nextPrinterSelection({ current, auto, classChanged });

describe("nextSelectedPrinter with the explicit manual flag", () => {
  it("manual true keeps the printer after the preference it converged with goes away (the D10 convergence)", () => {
    // manual YOKO, the shared preference became YOKO, then it goes away (auto is null again)
    expect(nextSelectedPrinter({ current: "YOKO", manual: true, auto: null, classChanged: false })).toBe("YOKO");
  });

  it("manual false follows auto whatever the current printer is", () => {
    expect(nextSelectedPrinter({ current: "YOKO", manual: false, auto: "YUMI", classChanged: false })).toBe("YUMI");
  });

  it("a class change resets even a manual pick", () => {
    expect(nextSelectedPrinter({ current: "YUMI", manual: true, auto: "DGEN", classChanged: true })).toBe("DGEN");
  });

  it("nothing chosen takes auto even when manual is true", () => {
    expect(nextSelectedPrinter({ current: null, manual: true, auto: "DGEN", classChanged: false })).toBe("DGEN");
  });
});

describe("printer selection state (D10 scenario)", () => {
  it("manual YOKO converges with the preference YOKO and still survives the preference going away", () => {
    let sel = step(NO_PRINTER, null); // mixed selection: no auto pick
    sel = pickPrinterByHand("YOKO"); // operator clicks YOKO
    sel = step(sel, "YOKO"); // untick a file: the shared preference becomes YOKO
    expect(sel).toEqual({ printer: "YOKO", manual: true });
    sel = step(sel, null); // add a file with no preference
    expect(sel.printer).toBe("YOKO");
    sel = step(sel, "YUMI"); // another shared preference appears
    expect(sel.printer).toBe("YOKO");
  });

  it("an auto pick is never a hand pick: it follows the preference around", () => {
    let sel = step(NO_PRINTER, "YOKO");
    expect(sel).toEqual({ printer: "YOKO", manual: false });
    sel = step(sel, null);
    expect(sel.printer).toBeNull();
    sel = step(sel, "YUMI");
    expect(sel).toEqual({ printer: "YUMI", manual: false });
  });

  it("a class change clears the flag with the printer", () => {
    const sel = step(pickPrinterByHand("YUMI"), "DGEN", true);
    expect(sel).toEqual({ printer: "DGEN", manual: false });
    // the new class's auto pick is not manual: it follows the preference
    expect(step(sel, "DGEN2").printer).toBe("DGEN2");
  });

  it("an emptied selection (class changes to none) clears the flag", () => {
    expect(step(pickPrinterByHand("YOKO"), null, true)).toEqual({ printer: null, manual: false });
  });

  it("clicking a radio sets the flag", () => {
    expect(pickPrinterByHand("YUMI")).toEqual({ printer: "YUMI", manual: true });
  });
});
