import { describe, it, expect } from "vitest";
import { inboxClassSplit, UNKNOWN_ROW } from "./inboxClassSplit.js";

// ETAP 4 (4-types-b part 2): the Inbox card's rows come from the profile's classes.

const CONFIG = { classes: {}, fabrics: [] }; // class constants for Cottons / Polyesters
const ALEX = { materialClasses: [{ name: "Cottons" }, { name: "Polyesters" }] };
const fq = (materialType) => ({ printTypeCode: "FQ", materialType, material: "X", width: 600, height: 400, qty: 1 });
const groups = (...items) => [{ items }];

describe("inboxClassSplit", () => {
  it("Alex: a row per class in profile order, always shown, with count, length and share of LENGTH", () => {
    const { rows, totalLength, fileCount } = inboxClassSplit(groups(fq("Cottons"), fq("Cottons"), fq("Polyesters")), ALEX, CONFIG);
    expect(rows.map((r) => [r.name, r.slot, r.count])).toEqual([["Cottons", 0, 2], ["Polyesters", 1, 1]]);
    expect(rows[0].length).toBeGreaterThan(0);
    expect(fileCount).toBe(3);
    expect(totalLength).toBeCloseTo(rows[0].length + rows[1].length, 2);
    expect(rows[0].share + rows[1].share).toBeCloseTo(100, 5);
  });

  it("a class with no files still has its row (0 files, 0 m)", () => {
    const { rows } = inboxClassSplit(groups(fq("Cottons")), ALEX, CONFIG);
    expect(rows[1]).toMatchObject({ name: "Polyesters", count: 0, length: 0, share: 0 });
  });

  it("renamed classes: the rows carry the profile's names", () => {
    const p = { materialClasses: [{ name: "Poly" }, { name: "Cotton" }] };
    const { rows } = inboxClassSplit(groups(fq("Cotton")), p, CONFIG);
    expect(rows.map((r) => [r.name, r.slot, r.count])).toEqual([["Poly", 0, 0], ["Cotton", 1, 1]]);
  });

  it("everything outside the profile's classes lands in ONE Unknown row, shown only when it has files", () => {
    expect(inboxClassSplit(groups(fq("Cottons")), ALEX, CONFIG).rows.some((r) => r.name === UNKNOWN_ROW)).toBe(false);
    const { rows } = inboxClassSplit(groups(fq("Unknown"), fq(""), fq("Silk"), fq("Cottons")), ALEX, CONFIG);
    expect(rows.at(-1)).toMatchObject({ name: UNKNOWN_ROW, slot: -1, count: 3 });
  });

  it("no profile: no class rows - every file is Unknown", () => {
    const { rows } = inboxClassSplit(groups(fq("Cottons")), null, CONFIG);
    expect(rows.map((r) => [r.name, r.count])).toEqual([[UNKNOWN_ROW, 1]]);
  });

  it("an empty inbox: the class rows at zero, total 0", () => {
    const { rows, totalLength, fileCount } = inboxClassSplit([], ALEX, CONFIG);
    expect(rows.map((r) => r.count)).toEqual([0, 0]);
    expect([totalLength, fileCount]).toEqual([0, 0]);
  });
});
