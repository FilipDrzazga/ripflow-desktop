import { describe, it, expect } from "vitest";
import { PRODUCTION_STAGE as S } from "../../shared/constants";
import { shipTargetIds, otherUnpackedCount } from "./receiveShip";

const row = (file_id, stage, order_id = "1001") => ({ file_id, stage, order_id });

describe("shipTargetIds", () => {
  const files = [row("a", S.TO_SEWING), row("b", S.PACKED), row("c", S.SHIPPED)];

  it("takes the whole order when nothing is picked, minus rows that cannot ship", () => {
    expect(shipTargetIds(files, new Set())).toEqual({ ids: ["a", "b"], fromSelection: false });
  });

  it("takes only the picked items when there is a pick", () => {
    expect(shipTargetIds(files, new Set(["b"]))).toEqual({ ids: ["b"], fromSelection: true });
  });

  it("ignores picked ids that are not in the open order", () => {
    expect(shipTargetIds(files, new Set(["zzz"]))).toEqual({ ids: ["a", "b"], fromSelection: false });
  });

  it("a pick of already shipped items yields nothing instead of falling back to the whole order", () => {
    expect(shipTargetIds(files, new Set(["c"]))).toEqual({ ids: [], fromSelection: true });
  });
});

describe("otherUnpackedCount", () => {
  const order = { orderId: "1001", isUnknown: false, files: [row("a", S.PACKED), row("b", S.PACKED)] };

  it("counts same-order files outside the list that are before packed", () => {
    const all = [
      ...order.files,
      row("c", S.QC),
      row("d", S.TO_SEWING),
      row("e", S.PACKED),
      row("f", S.SHIPPED),
      row("g", S.QC, "2002"),
    ];
    expect(otherUnpackedCount(all, order)).toBe(2);
  });

  it("does not count the files the list already shows", () => {
    expect(otherUnpackedCount([row("a", S.TO_SEWING), row("b", S.PACKED)], order)).toBe(0);
  });

  it("is 0 for the unknown-order bucket and for no order", () => {
    expect(otherUnpackedCount([row("x", S.QC, "")], { ...order, isUnknown: true, orderId: null })).toBe(0);
    expect(otherUnpackedCount([row("x", S.QC)], null)).toBe(0);
  });
});
