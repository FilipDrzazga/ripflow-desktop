import { describe, it, expect } from "vitest";
import { materialClassNames, withSlotLooks, materialClassSlot, MATERIAL_CLASS_SLOTS } from "./materialClasses.js";

// ETAP 4 (4-types-b): class NAMES from the profile, the LOOK from the slot.

const ALEX = { materialClasses: [{ name: "Cottons" }, { name: "Polyesters" }] };
const LOOKS = [{ icon: "leaf" }, { icon: "polygon" }];

describe("materialClassNames", () => {
  it("the profile's names in profile order", () => {
    expect(materialClassNames(ALEX)).toEqual(["Cottons", "Polyesters"]);
    expect(materialClassNames({ materialClasses: [{ name: "Poly" }, { name: "Cotton" }] })).toEqual(["Poly", "Cotton"]);
  });

  it("no profile / no classes -> [] (nothing guessed)", () => {
    for (const p of [null, undefined, {}, { materialClasses: "x" }, { materialClasses: [] }]) expect(materialClassNames(p)).toEqual([]);
  });

  it("trims, skips empty / non-string / duplicate names", () => {
    const p = { materialClasses: [{ name: " Cotton " }, { name: "" }, null, { name: 3 }, { name: "Cotton" }, { name: "Poly" }] };
    expect(materialClassNames(p)).toEqual(["Cotton", "Poly"]);
  });

  it("at most two slots - a third class stays frozen", () => {
    expect(MATERIAL_CLASS_SLOTS).toBe(2);
    expect(materialClassNames({ materialClasses: [{ name: "A" }, { name: "B" }, { name: "C" }] })).toEqual(["A", "B"]);
  });
});

describe("withSlotLooks / materialClassSlot", () => {
  it("Alex: Cottons gets slot 0's look, Polyesters slot 1's - his screens unchanged", () => {
    expect(withSlotLooks(ALEX, LOOKS)).toEqual([
      { name: "Cottons", slot: 0, icon: "leaf" },
      { name: "Polyesters", slot: 1, icon: "polygon" },
    ]);
  });

  it("a renamed class takes the look of its slot", () => {
    expect(withSlotLooks({ materialClasses: [{ name: "Cotton" }] }, LOOKS)).toEqual([{ name: "Cotton", slot: 0, icon: "leaf" }]);
  });

  it("slot of a name, -1 for a name outside the profile", () => {
    expect(materialClassSlot(ALEX, "Polyesters")).toBe(1);
    expect(materialClassSlot(ALEX, "Unknown")).toBe(-1);
    expect(materialClassSlot(null, "Cottons")).toBe(-1);
  });
});
