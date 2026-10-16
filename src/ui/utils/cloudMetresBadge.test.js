import { describe, it, expect } from "vitest";
import { metresLabel, printerCodeOfDevice, deviceBadges } from "./cloudMetresText.js";

const CODES = ["DGEN", "YOKO", "YUMI"];

describe("metresLabel", () => {
  it("puts the unit after the number and keeps the dash for a machine that printed nothing", () => {
    expect(metresLabel({ metres: 116.7123, jobs: 7 })).toBe("116.7 m");
    expect(metresLabel({ metres: 0, jobs: 0 })).toBe("-");
  });
});

describe("printerCodeOfDevice", () => {
  it("maps the Cloud names of the shop to the printer codes", () => {
    expect(printerCodeOfDevice("d.gen Artrix H8", CODES)).toBe("DGEN");
    expect(printerCodeOfDevice("YOKO 1", CODES)).toBe("YOKO");
    expect(printerCodeOfDevice("yumi 2", CODES)).toBe("YUMI");
  });

  it("a machine no printer owns is null, and no printers means null for every machine", () => {
    expect(printerCodeOfDevice("Mimaki 3", CODES)).toBeNull();
    expect(printerCodeOfDevice("YOKO 1", [])).toBeNull();
  });

  it("the longest matching code wins", () => {
    expect(printerCodeOfDevice("YOKO2 left", ["YOKO", "YOKO2"])).toBe("YOKO2");
  });
});

describe("deviceBadges", () => {
  it("one machine per printer is just the code", () => {
    const names = ["d.gen Artrix H8", "YOKO 1", "YUMI 2"];
    expect(deviceBadges(names, CODES)).toEqual([
      { code: "DGEN", text: "DGEN" },
      { code: "YOKO", text: "YOKO" },
      { code: "YUMI", text: "YUMI" },
    ]);
  });

  it("two machines of one printer are told apart by the last word of their name", () => {
    expect(deviceBadges(["YOKO 1", "YOKO 2", "YUMI 2"], CODES).map((b) => b.text)).toEqual(["YOKO 1", "YOKO 2", "YUMI"]);
  });

  it("a machine named exactly as its code does not repeat it", () => {
    expect(deviceBadges(["YOKO", "YOKO 2"], CODES).map((b) => b.text)).toEqual(["YOKO", "YOKO 2"]);
  });

  it("an unowned machine keeps its Cloud name and has no code", () => {
    expect(deviceBadges(["Mimaki 3"], CODES)).toEqual([{ code: null, text: "Mimaki 3" }]);
  });
});
