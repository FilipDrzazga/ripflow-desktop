import { describe, it, expect } from "vitest";
import { searchOrders, ORDER_SEARCH_WHERE } from "./orderSearch";
import { UNKNOWN_ORDER_KEY } from "./groupByOrder";

// store.files is what readFolders answers: GROUPS (one per fabric folder), each with `items`. The window
// found nothing in the Inbox on the demo station because the first version read it as a flat item list.

const item = (name, overrides = {}) => ({
  id: `Natural Canvas_${name}`,
  file: { name, ext: "pdf" },
  orderId: name.match(/ON\d+/i)?.[0]?.toUpperCase() ?? null,
  customerName: null,
  createdAt: "2026-10-17T08:00:00.000Z",
  ...overrides,
});

const group = (material, ...items) => ({ material, items });
const rowsOf = (res) => res.groups.flatMap((g) => g.rows);

describe("searchOrders - store.files as groups of items", () => {
  const files = [
    group("Natural Canvas", item("ON401365_Ruby_Fenwick_1of2_Natural Canvas_3x_Linear Meter.pdf"), item("ON401209_Mia_Brooks_1of1_Natural Canvas_2x_Linear Meter.pdf")),
    group("Satin Gloss", item("ON401365_Ruby_Fenwick_2of2_Satin Gloss_1x_Sample Print.pdf")),
  ];

  it("finds the files of every group by order id and by customer", () => {
    const byOrder = searchOrders("ON401365", { files });
    expect(rowsOf(byOrder).map((r) => r.fileName)).toEqual([
      "ON401365_Ruby_Fenwick_1of2_Natural Canvas_3x_Linear Meter.pdf",
      "ON401365_Ruby_Fenwick_2of2_Satin Gloss_1x_Sample Print.pdf",
    ].sort());
    expect(byOrder.groups).toHaveLength(1);
    expect(searchOrders("brooks", { files }).totalRows).toBe(1);
  });

  it("marks a held file of a group as Held", () => {
    const res = searchOrders("ON401209", { files, heldIds: new Set(["Natural Canvas_ON401209_Mia_Brooks_1of1_Natural Canvas_2x_Linear Meter.pdf"]), heldReasons: new Map() });
    expect(rowsOf(res)[0].where).toBe(ORDER_SEARCH_WHERE.HELD);
  });

  it("skips an empty group and a group without items", () => {
    expect(searchOrders("ON401365", { files: [group("Empty"), { material: "Odd" }, ...files] }).totalRows).toBe(2);
  });

  it("still takes a flat item list (a direct call)", () => {
    expect(searchOrders("ON401209", { files: files[0].items }).totalRows).toBe(1);
  });
});

describe("searchOrders - an Inbox item the parser gave no order id", () => {
  it("is grouped under the ON number in its file name, like the Inbox list's order column", () => {
    const bad = item("ON409999_Zoe_Marlowe_1of1_Mystery Weave_2x_Linear Meter.pdf", { orderId: null });
    const res = searchOrders("ON409999", { files: [group("Mystery Weave", bad)] });
    expect(res.groups[0].orderKey).toBe("ON409999");
    expect(res.groups[0].isUnknown).toBe(false);
  });

  it("falls to the unknown bucket when the name carries no ON number either", () => {
    const odd = item("scan_0042_blue_stripe.pdf", { orderId: "" });
    const res = searchOrders("stripe", { files: [group("Natural Canvas", odd)] });
    expect(res.groups[0].orderKey).toBe(UNKNOWN_ORDER_KEY);
  });
});
