import { describe, it, expect } from "vitest";
import { APP_VIEW } from "../constants/appViews";
import { makeSearchTarget, isSearchTargetFor, SEARCH_TARGET_VIEWS } from "./searchTarget";
import { searchOrders } from "./orderSearch";

describe("makeSearchTarget", () => {
  it("keeps view, file and day and adds the nonce", () => {
    expect(makeSearchTarget({ view: APP_VIEW.PRODUCTION, fileId: "f1", dayKey: "14-10-2026" }, 7)).toEqual({
      view: APP_VIEW.PRODUCTION,
      fileId: "f1",
      dayKey: "14-10-2026",
      nonce: 7,
    });
  });

  it("a missing or empty day is null, not undefined or an empty string", () => {
    expect(makeSearchTarget({ view: APP_VIEW.PRINT, fileId: "a_1" }, 1).dayKey).toBeNull();
    expect(makeSearchTarget({ view: APP_VIEW.PRINT, fileId: "a_1", dayKey: "" }, 1).dayKey).toBeNull();
  });

  it("refuses a row that leads nowhere: no target, a view the jump does not serve, no file id", () => {
    expect(makeSearchTarget(null, 1)).toBeNull();
    expect(makeSearchTarget(undefined, 1)).toBeNull();
    expect(makeSearchTarget({ view: "settings", fileId: "f1" }, 1)).toBeNull();
    expect(makeSearchTarget({ view: APP_VIEW.PRODUCTION, fileId: "" }, 1)).toBeNull();
    expect(makeSearchTarget({ view: APP_VIEW.PRODUCTION, fileId: 12 }, 1)).toBeNull();
    expect(makeSearchTarget({ view: APP_VIEW.PRODUCTION }, 1)).toBeNull();
  });

  it("serves exactly the two views that own files: Print (Inbox, Held) and Production", () => {
    expect(SEARCH_TARGET_VIEWS).toEqual([APP_VIEW.PRINT, APP_VIEW.PRODUCTION]);
  });
});

describe("isSearchTargetFor", () => {
  const task = makeSearchTarget({ view: APP_VIEW.PRODUCTION, fileId: "f1" }, 1);

  it("is true only for the view the task is addressed to", () => {
    expect(isSearchTargetFor(task, APP_VIEW.PRODUCTION)).toBe(true);
    expect(isSearchTargetFor(task, APP_VIEW.PRINT)).toBe(false);
  });

  it("is false with no task", () => {
    expect(isSearchTargetFor(null, APP_VIEW.PRODUCTION)).toBe(false);
    expect(isSearchTargetFor(undefined, APP_VIEW.PRODUCTION)).toBe(false);
  });
});

describe("every row the search produces carries a target the jump accepts", () => {
  const files = [
    {
      printGroup: "Cotton",
      items: [
        { id: "folder_ON100001", orderId: "ON100001", customerName: "Ada", file: { name: "ON100001_Ada_Tee.pdf" } },
      ],
    },
  ];
  const productionStages = {
    ON100002_Bob_Tee: {
      file_id: "ON100002_Bob_Tee",
      order_id: "ON100002",
      customer_name: "Bob",
      stage: "qc",
      batch_path: "F:\\PRINTED\\14-10-2026\\PRINTED_101500-GROUP-DGEN",
      updated_at: "2026-10-14T10:20:00.000Z",
    },
  };

  it("Inbox rows lead to Print, stage rows to Production, each with the file id the view looks up", () => {
    const result = searchOrders("ON10000", { files, productionStages });
    const rows = result.groups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const task = makeSearchTarget(row.target, 1);
      expect(task, row.fileName).not.toBeNull();
      expect(task.fileId).toBe(row.fileId);
    }
    expect(rows.map((r) => makeSearchTarget(r.target, 1).view).sort()).toEqual([APP_VIEW.PRINT, APP_VIEW.PRODUCTION]);
  });
});
