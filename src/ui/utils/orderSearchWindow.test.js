import { describe, it, expect } from "vitest";
import {
  emptyState,
  flattenRows,
  isOrderSearchShortcut,
  moveActiveIndex,
  orderSearchBlockedBy,
  rowKeyOf,
  sinceLabel,
  sinceTitle,
  whereColors,
  whereLabel,
} from "./orderSearchWindow";
import { ORDER_SEARCH_WHERE, searchOrders } from "./orderSearch";
import { PRODUCTION_STAGE, STAGE_COLOR, STAGE_LABEL } from "../../shared/constants";

describe("isOrderSearchShortcut", () => {
  it("is Ctrl+F and Cmd+F, in either case", () => {
    expect(isOrderSearchShortcut({ ctrlKey: true, key: "f" })).toBe(true);
    expect(isOrderSearchShortcut({ ctrlKey: true, key: "F" })).toBe(true);
    expect(isOrderSearchShortcut({ metaKey: true, key: "f" })).toBe(true);
  });

  it("follows the physical key on a layout where the character is not an f", () => {
    expect(isOrderSearchShortcut({ ctrlKey: true, key: "\u0430", code: "KeyF" })).toBe(true);
  });

  it("is not a bare F, another letter, or a Shift / Alt combination", () => {
    expect(isOrderSearchShortcut({ key: "f" })).toBe(false);
    expect(isOrderSearchShortcut({ ctrlKey: true, key: "g", code: "KeyG" })).toBe(false);
    expect(isOrderSearchShortcut({ ctrlKey: true, shiftKey: true, key: "F" })).toBe(false);
    expect(isOrderSearchShortcut({ ctrlKey: true, altKey: true, key: "f" })).toBe(false);
    expect(isOrderSearchShortcut(null)).toBe(false);
  });
});

describe("orderSearchBlockedBy", () => {
  const free = { querySelector: () => null };
  const modal = { querySelector: (sel) => (sel === '[aria-modal="true"]' ? {} : null) };

  it("is null when nothing is in front of the app", () => {
    expect(orderSearchBlockedBy({ isLoading: false, showSetup: false, doc: free })).toBeNull();
  });

  it("is blocked during startup, over the first-run wizard and over any aria-modal element", () => {
    expect(orderSearchBlockedBy({ isLoading: true, showSetup: false, doc: free })).toBe("startup");
    expect(orderSearchBlockedBy({ isLoading: false, showSetup: true, doc: free })).toBe("setup");
    expect(orderSearchBlockedBy({ isLoading: false, showSetup: false, doc: modal })).toBe("modal");
  });

  it("startup wins over the rest, so the reason is stable", () => {
    expect(orderSearchBlockedBy({ isLoading: true, showSetup: true, doc: modal })).toBe("startup");
  });
});

describe("moveActiveIndex", () => {
  it("moves down and wraps to the first row", () => {
    expect(moveActiveIndex(0, "ArrowDown", 3)).toBe(1);
    expect(moveActiveIndex(2, "ArrowDown", 3)).toBe(0);
  });

  it("moves up and wraps to the last row", () => {
    expect(moveActiveIndex(2, "ArrowUp", 3)).toBe(1);
    expect(moveActiveIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("has no row to stand on when the list is empty", () => {
    expect(moveActiveIndex(0, "ArrowDown", 0)).toBe(-1);
    expect(moveActiveIndex(-1, "ArrowUp", 0)).toBe(-1);
  });

  it("starts at the first row from no highlight, and clamps any other key", () => {
    expect(moveActiveIndex(-1, "ArrowDown", 4)).toBe(0);
    expect(moveActiveIndex(9, "x", 4)).toBe(3);
    expect(moveActiveIndex(1, "Home", 4)).toBe(0);
    expect(moveActiveIndex(1, "End", 4)).toBe(3);
  });
});

describe("sinceLabel / sinceTitle", () => {
  const now = new Date(2026, 9, 18, 12, 0, 0); // 18 Oct 2026, local noon
  const at = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo, d, h, mi, s).toISOString();

  it("reads like a person: minutes, hours, yesterday, days, then the date", () => {
    expect(sinceLabel(at(2026, 9, 18, 11, 59, 30), now)).toBe("just now");
    expect(sinceLabel(at(2026, 9, 18, 11, 48), now)).toBe("12 min ago");
    expect(sinceLabel(at(2026, 9, 18, 9, 0), now)).toBe("3 h ago");
    expect(sinceLabel(at(2026, 9, 17, 23, 30), now)).toBe("Yesterday");
    expect(sinceLabel(at(2026, 9, 14, 8, 0), now)).toBe("4 days ago");
    expect(sinceLabel(at(2026, 9, 1, 8, 0), now)).toBe("01 Oct 2026");
  });

  it("calls anything on the previous calendar day Yesterday, even 3 hours ago", () => {
    const earlyMorning = new Date(2026, 9, 18, 1, 0, 0);
    expect(sinceLabel(at(2026, 9, 17, 22, 0), earlyMorning)).toBe("Yesterday");
  });

  it("answers null for a missing or unparsable time", () => {
    expect(sinceLabel(null, now)).toBeNull();
    expect(sinceLabel("not a date", now)).toBeNull();
  });

  it("gives the exact local time for the tooltip", () => {
    expect(sinceTitle(at(2026, 9, 18, 9, 5))).toBe("18 Oct 2026, 09:05");
    expect(sinceTitle(null)).toBe("");
  });
});

describe("where labels and colours", () => {
  it("names the two pre-print places and takes the stage labels and colours from the constants", () => {
    expect(whereLabel(ORDER_SEARCH_WHERE.INBOX)).toBe("Inbox");
    expect(whereLabel(ORDER_SEARCH_WHERE.HELD)).toBe("Held");
    expect(whereLabel(PRODUCTION_STAGE.HEATPRESS)).toBe(STAGE_LABEL[PRODUCTION_STAGE.HEATPRESS]);
    expect(whereColors(PRODUCTION_STAGE.QC)).toBe(STAGE_COLOR[PRODUCTION_STAGE.QC]);
  });

  it("falls back to the raw value and a grey for a stage nobody knows", () => {
    expect(whereLabel("mystery")).toBe("mystery");
    expect(whereColors("mystery").bg).toBe("#f0f0f0");
  });
});

describe("emptyState", () => {
  const stage = (id, extra = {}) => ({
    file_id: id,
    order_id: "ON401365",
    customer_name: "Ruby Stone",
    stage: PRODUCTION_STAGE.QC,
    batch_path: "O:\\PRINTED\\17-10-2026\\PRINTED_101010-Satin Gloss-BOREAL",
    updated_at: "2026-10-17T10:00:00.000Z",
    ...extra,
  });

  it("invites a search while the box is empty or blank", () => {
    const r = searchOrders("", {});
    expect(emptyState("", r).title).toBe("Find an order");
    expect(emptyState("   ", r).title).toBe("Find an order");
  });

  it("asks for more characters under the minimum, naming the minimum", () => {
    const r = searchOrders("ab", {});
    const e = emptyState("ab", r);
    expect(e.title).toBe("Keep typing");
    expect(e.hint).toContain("3 characters");
  });

  it("says where it looked when nothing matches, and points at Batch history", () => {
    const r = searchOrders("zzzzz", { productionStages: { a: stage("a") } });
    const e = emptyState("zzzzz", r);
    expect(e.title).toBe("Not found in Inbox, Held or Production");
    expect(e.hint).toContain("Batch history");
  });

  it("is null when there are rows to show", () => {
    const r = searchOrders("ruby", { productionStages: { a: stage("a") } });
    expect(emptyState("ruby", r)).toBeNull();
  });
});

describe("flattenRows / rowKeyOf", () => {
  it("lists rows group by group in the order they are shown, with a distinct key each", () => {
    const stage = (id, order) => ({
      file_id: id,
      order_id: order,
      customer_name: "",
      stage: PRODUCTION_STAGE.PRINTED,
      batch_path: null,
      updated_at: "2026-10-17T10:00:00.000Z",
    });
    const r = searchOrders("ON40", { productionStages: { a: stage("ON401-a", "ON401"), b: stage("ON401-b", "ON401"), c: stage("ON402-c", "ON402") } });
    const rows = flattenRows(r);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(rowKeyOf)).size).toBe(3);
    expect(rows.map((x) => x.fileId)).toEqual(r.groups.flatMap((g) => g.rows.map((x) => x.fileId)));
  });
});
