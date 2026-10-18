import { describe, it, expect } from "vitest";
import {
  searchOrders,
  MIN_QUERY_LENGTH,
  MAX_RESULT_ROWS,
  ORDER_SEARCH_WHERE,
  ORDER_SEARCH_VIEW,
} from "./orderSearch";
import { PRODUCTION_STAGE } from "../../shared/constants";
import { UNKNOWN_ORDER_KEY } from "./groupByOrder";

const BATCH = "O:\\PRINTED\\14-10-2026\\PRINTED_103200-Cottons-DGEN";

const inbox = (name, overrides = {}) => ({
  id: `Cottons_${name}`,
  file: { name, ext: "pdf" },
  orderId: name.match(/ON\d+/i)?.[0]?.toUpperCase() ?? null,
  customerName: null,
  createdAt: "2026-10-17T08:00:00.000Z",
  ...overrides,
});

const stage = (fileId, overrides = {}) => ({
  file_id: fileId,
  batch_path: BATCH,
  order_id: "ON100001",
  customer_name: "Ruby Fenwick",
  stage: PRODUCTION_STAGE.HEATPRESS,
  updated_at: "2026-10-15T09:10:00.000Z",
  ...overrides,
});

const stagesOf = (...rows) => Object.fromEntries(rows.map((r) => [r.file_id, r]));
const rowsOf = (res) => res.groups.flatMap((g) => g.rows);

describe("searchOrders - query gate", () => {
  it("answers 'short' and returns nothing below the minimum length", () => {
    const snap = { productionStages: stagesOf(stage("a")) };
    for (const q of ["", "  ", "ON", " O "]) {
      const res = searchOrders(q, snap);
      expect(res.status).toBe("short");
      expect(res.groups).toEqual([]);
    }
    expect(searchOrders("x".repeat(MIN_QUERY_LENGTH), snap).status).toBe("ok");
  });

  it("tolerates a missing or empty snapshot", () => {
    expect(searchOrders("ON100001").groups).toEqual([]);
    expect(searchOrders("ON100001", {}).totalRows).toBe(0);
    expect(searchOrders(null, {}).status).toBe("short");
  });

  it("returns status ok with no groups for a query nothing matches", () => {
    const res = searchOrders("ON999999", { productionStages: stagesOf(stage("a")) });
    expect(res).toMatchObject({ status: "ok", groups: [], totalRows: 0, hiddenRows: 0 });
  });
});

describe("searchOrders - matching", () => {
  const snap = { productionStages: stagesOf(stage("ON100001_Ruby_Fenwick_x", { order_id: "ON100001", customer_name: "Ruby Fenwick" })) };

  it("ignores case and surrounding whitespace", () => {
    for (const q of ["on100001", "  ON100001  ", "RUBY", "fenwick"]) {
      expect(rowsOf(searchOrders(q, snap))).toHaveLength(1);
    }
  });

  it("matches a part of the order number", () => {
    expect(rowsOf(searchOrders("100001", snap))).toHaveLength(1);
  });

  it("needs every word of the query to match, in any field", () => {
    expect(rowsOf(searchOrders("ruby 100001", snap))).toHaveLength(1);
    expect(rowsOf(searchOrders("ruby 100002", snap))).toHaveLength(0);
  });

  it("matches on the file name when the row has no order id or customer", () => {
    const res = searchOrders("chiffon", {
      productionStages: stagesOf(stage("loose_Chiffon_Light_file", { order_id: null, customer_name: null })),
    });
    expect(rowsOf(res)).toHaveLength(1);
  });

  it("matches Inbox files by orderId, customerName and file name", () => {
    const files = [inbox("ON200002_Anna_Smith_Chiffon.pdf", { customerName: "Anna Smith" })];
    for (const q of ["ON200002", "anna smith", "chiffon"]) {
      expect(rowsOf(searchOrders(q, { files }))).toHaveLength(1);
    }
  });
});

describe("searchOrders - one source at a time", () => {
  it("Inbox: where = inbox, since = createdAt, target = Print view", () => {
    const item = inbox("ON200002_Anna_Smith_Chiffon.pdf", { createdAt: new Date("2026-10-17T08:00:00.000Z") });
    const [row] = rowsOf(searchOrders("ON200002", { files: [item] }));
    expect(row).toMatchObject({
      fileId: item.id,
      where: ORDER_SEARCH_WHERE.INBOX,
      since: "2026-10-17T08:00:00.000Z",
      reason: null,
      batch: null,
      printer: null,
      dayKey: null,
      target: { view: ORDER_SEARCH_VIEW.PRINT, fileId: item.id, dayKey: null },
    });
  });

  it("Held: an Inbox file whose id is in heldIds is HELD, with its reason", () => {
    const item = inbox("ON200002_Anna_Smith_Chiffon.pdf");
    const res = searchOrders("ON200002", {
      files: [item],
      heldIds: new Set([item.id]),
      heldReasons: new Map([[item.id, "waiting for artwork"]]),
    });
    expect(rowsOf(res)[0]).toMatchObject({ where: ORDER_SEARCH_WHERE.HELD, reason: "waiting for artwork" });
  });

  it("Held: a held id with no file in the Inbox is not a row (no phantom)", () => {
    const res = searchOrders("ON200002", { files: [], heldIds: new Set(["Cottons_ON200002_x.pdf"]) });
    expect(rowsOf(res)).toHaveLength(0);
  });

  it("Production: where = the stage, batch / printer / dayKey from batch_path, target = Production", () => {
    const row = rowsOf(searchOrders("ON100001", { productionStages: stagesOf(stage("f1")) }))[0];
    expect(row).toMatchObject({
      fileId: "f1",
      where: PRODUCTION_STAGE.HEATPRESS,
      batchPath: BATCH,
      batch: "PRINTED_103200-Cottons-DGEN",
      printer: "DGEN",
      dayKey: "14-10-2026",
      target: { view: ORDER_SEARCH_VIEW.PRODUCTION, fileId: "f1", dayKey: "14-10-2026" },
    });
  });

  it("Production: a batch_path with no day folder gives dayKey null, the row is kept", () => {
    const row = rowsOf(searchOrders("ON100001", { productionStages: stagesOf(stage("f1", { batch_path: "O:\\somewhere" })) }))[0];
    expect(row.dayKey).toBeNull();
    expect(row.target.dayKey).toBeNull();
  });

  it("Production: Shipped rows are found like any other stage", () => {
    const row = rowsOf(searchOrders("ON100001", { productionStages: stagesOf(stage("f1", { stage: PRODUCTION_STAGE.SHIPPED })) }))[0];
    expect(row.where).toBe(PRODUCTION_STAGE.SHIPPED);
  });

  it("Production: since is the newest history entry of the CURRENT stage, else updated_at", () => {
    const productionStages = stagesOf(stage("f1"), stage("f2"));
    const stageHistory = {
      f1: [
        { stage: PRODUCTION_STAGE.HEATPRESS, entered_at: "2026-10-14T10:00:00.000Z" },
        { stage: PRODUCTION_STAGE.QC, entered_at: "2026-10-16T10:00:00.000Z" },
        { stage: PRODUCTION_STAGE.HEATPRESS, entered_at: "2026-10-15T07:00:00.000Z" },
      ],
    };
    const rows = rowsOf(searchOrders("ON100001", { productionStages, stageHistory }));
    expect(rows.find((r) => r.fileId === "f1").since).toBe("2026-10-15T07:00:00.000Z");
    expect(rows.find((r) => r.fileId === "f2").since).toBe("2026-10-15T09:10:00.000Z");
  });
});

describe("searchOrders - one file, one row", () => {
  it("a stem in the Inbox AND in file_stages is ONE row: the Inbox copy, with the stage of the other noted", () => {
    const item = inbox("ON100001_Ruby_Fenwick_x.pdf");
    const res = searchOrders("ON100001", {
      files: [item],
      productionStages: stagesOf(stage("ON100001_Ruby_Fenwick_x", { stage: PRODUCTION_STAGE.QC })),
    });
    const rows = rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ where: ORDER_SEARCH_WHERE.INBOX, alsoInProduction: PRODUCTION_STAGE.QC });
    expect(res.totalRows).toBe(1);
  });

  it("an Inbox file that does not match the query does not hide the Production copy that does", () => {
    const item = inbox("ON100001_x.pdf", { orderId: null });
    const res = searchOrders("Fenwick", {
      files: [item],
      productionStages: stagesOf(stage("ON100001_x")),
    });
    const rows = rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0].where).toBe(PRODUCTION_STAGE.HEATPRESS);
  });

  it("different stems of one order are separate rows under one group", () => {
    const res = searchOrders("ON100001", {
      files: [inbox("ON100001_a.pdf")],
      productionStages: stagesOf(stage("ON100001_b"), stage("ON100001_c", { stage: PRODUCTION_STAGE.SHIPPED })),
    });
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].rows).toHaveLength(3);
    expect(res.groups[0]).toMatchObject({ orderKey: "ON100001", orderId: "ON100001", isUnknown: false });
  });

  it("order ids that differ only in case are one order", () => {
    const res = searchOrders("100001", {
      productionStages: stagesOf(stage("a", { order_id: "on100001" }), stage("b", { order_id: "ON100001 " })),
    });
    expect(res.groups).toHaveLength(1);
  });
});

describe("searchOrders - order of results", () => {
  it("rows inside an order: Inbox, Held, then the pipeline order", () => {
    const inboxItem = inbox("ON100001_i.pdf");
    const heldItem = inbox("ON100001_h.pdf");
    const res = searchOrders("ON100001", {
      files: [heldItem, inboxItem],
      heldIds: new Set([heldItem.id]),
      productionStages: stagesOf(
        stage("s", { stage: PRODUCTION_STAGE.SHIPPED }),
        stage("p", { stage: PRODUCTION_STAGE.PRINTED }),
        stage("q", { stage: PRODUCTION_STAGE.QC }),
        stage("t", { stage: PRODUCTION_STAGE.TO_SEWING }),
      ),
    });
    expect(rowsOf(res).map((r) => r.where)).toEqual([
      ORDER_SEARCH_WHERE.INBOX,
      ORDER_SEARCH_WHERE.HELD,
      PRODUCTION_STAGE.PRINTED,
      PRODUCTION_STAGE.QC,
      PRODUCTION_STAGE.TO_SEWING,
      PRODUCTION_STAGE.SHIPPED,
    ]);
  });

  it("a stage outside the pipeline (legacy rejected) sorts after Shipped, not dropped", () => {
    const res = searchOrders("ON100001", {
      productionStages: stagesOf(
        stage("r", { stage: PRODUCTION_STAGE.REJECTED }),
        stage("s", { stage: PRODUCTION_STAGE.SHIPPED }),
      ),
    });
    expect(rowsOf(res).map((r) => r.where)).toEqual([PRODUCTION_STAGE.SHIPPED, PRODUCTION_STAGE.REJECTED]);
  });

  it("orders: the exact order id first, then the most recently active", () => {
    const res = searchOrders("ON1000", {
      productionStages: stagesOf(
        stage("a", { order_id: "ON100010", updated_at: "2026-10-17T10:00:00.000Z" }),
        stage("b", { order_id: "ON100020", updated_at: "2026-10-12T10:00:00.000Z" }),
        stage("c", { order_id: "ON100030", updated_at: "2026-10-16T10:00:00.000Z" }),
      ),
    });
    expect(res.groups.map((g) => g.orderKey)).toEqual(["ON100010", "ON100030", "ON100020"]);
    const exact = searchOrders("ON100020", {
      productionStages: stagesOf(
        stage("a", { order_id: "ON100020", updated_at: "2026-10-12T10:00:00.000Z" }),
        stage("b", { order_id: "ON1000200", updated_at: "2026-10-17T10:00:00.000Z" }),
      ),
    });
    expect(exact.groups.map((g) => g.orderKey)).toEqual(["ON100020", "ON1000200"]);
  });

  it("files with no order id collect in one unknown-order bucket, last", () => {
    const res = searchOrders("fenwick", {
      productionStages: stagesOf(
        stage("a", { order_id: null, updated_at: "2026-10-17T10:00:00.000Z" }),
        stage("b", { order_id: null }),
        stage("c", { order_id: "ON100003", updated_at: "2026-10-10T10:00:00.000Z" }),
      ),
    });
    expect(res.groups.map((g) => g.orderKey)).toEqual(["ON100003", UNKNOWN_ORDER_KEY]);
    expect(res.groups[1]).toMatchObject({ isUnknown: true, orderId: "Unknown order" });
    expect(res.groups[1].rows).toHaveLength(2);
  });

  it("the group takes the first non-empty customer name", () => {
    const res = searchOrders("ON100001", {
      files: [inbox("ON100001_a.pdf")],
      productionStages: stagesOf(stage("b", { customer_name: "Ruby Fenwick" })),
    });
    expect(res.groups[0].customerName).toBe("Ruby Fenwick");
  });
});

describe("searchOrders - limit", () => {
  const many = (n, orderId) => Array.from({ length: n }, (_, i) => stage(`f${orderId}_${i}`, { order_id: orderId }));

  it("caps the rows at MAX_RESULT_ROWS and reports the rest as hiddenRows", () => {
    const res = searchOrders("ON100001", { productionStages: stagesOf(...many(MAX_RESULT_ROWS + 7, "ON100001")) });
    expect(res.totalRows).toBe(MAX_RESULT_ROWS + 7);
    expect(res.shownRows).toBe(MAX_RESULT_ROWS);
    expect(res.hiddenRows).toBe(7);
    expect(rowsOf(res)).toHaveLength(MAX_RESULT_ROWS);
  });

  it("the cap runs across groups and never leaves a group without a row", () => {
    const res = searchOrders("ON1000", {
      productionStages: stagesOf(...many(MAX_RESULT_ROWS - 1, "ON100001"), ...many(5, "ON100002"), ...many(5, "ON100003")),
    });
    expect(rowsOf(res)).toHaveLength(MAX_RESULT_ROWS);
    expect(res.hiddenRows).toBe(MAX_RESULT_ROWS - 1 + 10 - MAX_RESULT_ROWS);
    expect(res.groups.every((g) => g.rows.length > 0)).toBe(true);
  });

  it("exactly at the cap hides nothing", () => {
    const res = searchOrders("ON100001", { productionStages: stagesOf(...many(MAX_RESULT_ROWS, "ON100001")) });
    expect(res.hiddenRows).toBe(0);
  });
});

describe("searchOrders - purity", () => {
  it("does not touch its input", () => {
    const snap = {
      files: [inbox("ON100001_a.pdf")],
      heldIds: new Set(),
      heldReasons: new Map(),
      productionStages: stagesOf(stage("b")),
      stageHistory: { b: [{ stage: PRODUCTION_STAGE.HEATPRESS, entered_at: "2026-10-15T07:00:00.000Z" }] },
    };
    const before = JSON.stringify({ ...snap, heldIds: [], heldReasons: [] });
    searchOrders("ON100001", snap);
    expect(JSON.stringify({ ...snap, heldIds: [], heldReasons: [] })).toBe(before);
  });
});
