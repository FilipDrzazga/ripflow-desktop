import { describe, it, expect, beforeEach, vi } from "vitest";
import { FILE_STATUS } from "../../shared/constants";

// The services are the only code that touches window.api (rule 10); the store imports them at the
// top, so they are replaced wholesale. Only the scan used by refreshFiles needs an answer.
vi.mock("../services/fileService", () => ({
  readFolders: vi.fn(async () => ({ success: true, data: [], warnings: [] })),
  peekInbox: vi.fn(async () => ({ success: false })),
}));
vi.mock("../services/batchService");
vi.mock("../services/systemService", () => ({
  getLogs: vi.fn(),
  clearLogs: vi.fn(),
  getHeldFiles: vi.fn(),
  holdFile: vi.fn(),
  unholdFile: vi.fn(),
  pruneOrphanHolds: vi.fn(async () => ({ success: true })),
  getDbDegraded: vi.fn(),
  getPrintedRootUnreachable: vi.fn(),
  getPowerPaused: vi.fn(),
}));
vi.mock("../services/analyticsService", () => ({ getRollbackReasonsForFiles: vi.fn(async () => ({ success: true, data: [] })) }));
vi.mock("../services/reasonDefsService");
vi.mock("../services/fabricService");
vi.mock("../services/profileService");
vi.mock("../services/productionService");
vi.mock("../services/ripErrorService");

const { useStore } = await import("./useStore");

const item = (id, materialType = "Cotton", status = FILE_STATUS.READY) => ({
  id,
  materialType,
  status,
  file: { name: `${id}.pdf` },
});
const sorted = (s) => [...s].sort();
const click = (id, shiftKey = false) => useStore.getState().selectPrintRow(id, { shiftKey });

// Drawn top to bottom: c1 c2 c3 | c4 (held) c5 | p1 p2 (Poly) | bad (invalid)
const FILES = [
  { printGroup: "Cotton A", items: [item("c1"), item("c2"), item("c3")] },
  { printGroup: "Cotton B", items: [item("c4"), item("c5")] },
  { printGroup: "Poly", items: [item("p1", "Poly"), item("p2", "Poly")] },
  { printGroup: "Bad", items: [item("bad", "Cotton", FILE_STATUS.INVALID)] },
];

beforeEach(() => {
  useStore.setState({
    filteredFiles: FILES,
    heldIds: new Set(),
    selectedIds: new Set(),
    heldSelectedIds: new Set(),
    selectionAnchorId: null,
    selectedOverrides: new Map(),
  });
});

const noMixing = () => {
  const { selectedIds, heldSelectedIds, heldIds } = useStore.getState();
  for (const id of selectedIds) expect(heldIds.has(id)).toBe(false);
  for (const id of heldSelectedIds) expect(heldIds.has(id)).toBe(true);
  expect(selectedIds.size > 0 && heldSelectedIds.size > 0).toBe(false);
};

describe("selectPrintRow - plain clicks keep their gates and set the anchor", () => {
  it("a plain click selects, anchors on the row, and a second click deselects", () => {
    click("c2");
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c2"]);
    expect(useStore.getState().selectionAnchorId).toBe("c2");
    click("c2");
    expect(useStore.getState().selectedIds.size).toBe(0);
  });

  it("a refused click (material lock) changes nothing and moves no anchor", () => {
    click("c1");
    click("p1");
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c1"]);
    expect(useStore.getState().selectionAnchorId).toBe("c1");
  });

  it("an invalid row is refused by a click, like by a range (printSelectBlock, one decision)", () => {
    click("bad");
    expect(useStore.getState().selectedIds.size).toBe(0);
    expect(useStore.getState().selectionAnchorId).toBeNull();
  });

  it("a held row goes to the held selection, never to selectedIds", () => {
    useStore.setState({ heldIds: new Set(["c4"]) });
    click("c4");
    expect(sorted(useStore.getState().heldSelectedIds)).toEqual(["c4"]);
    expect(useStore.getState().selectedIds.size).toBe(0);
    expect(useStore.getState().selectionAnchorId).toBe("c4");
    noMixing();
  });

  it("a shift-click with no anchor is a plain click", () => {
    click("c3", true);
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c3"]);
    expect(useStore.getState().selectionAnchorId).toBe("c3");
  });
});

describe("selectPrintRow - shift-click range", () => {
  it("selects from the anchor to the row clicked, across groups, and moves the anchor", () => {
    click("c2");
    const res = click("c5", true);
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c2", "c3", "c4", "c5"]);
    expect(useStore.getState().selectionAnchorId).toBe("c5");
    expect(res.skipped).toEqual({ held: 0, invalid: 0, material: 0, notHeld: 0 });
  });

  it("works upward", () => {
    click("c5");
    click("c2", true);
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c2", "c3", "c4", "c5"]);
  });

  it("keeps the material lock: Poly rows in the range are skipped and counted, not selected", () => {
    useStore.setState({
      filteredFiles: [{ printGroup: "mix", items: [item("c1"), item("p1", "Poly"), item("c2"), item("p2", "Poly"), item("c3")] }],
    });
    click("c1");
    const res = click("c3", true);
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c1", "c2", "c3"]);
    expect(res.skipped.material).toBe(2);
  });

  it("skips held and invalid rows, counting each", () => {
    useStore.setState({
      heldIds: new Set(["c2"]),
      filteredFiles: [{ printGroup: "g", items: [item("c1"), item("c2"), item("bad", "Cotton", FILE_STATUS.INVALID), item("c3")] }],
    });
    click("c1");
    const res = click("c3", true);
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c1", "c3"]);
    expect(res.skipped).toEqual({ held: 1, invalid: 1, material: 0, notHeld: 0 });
    noMixing();
  });

  it("a deselected anchor deselects the range (Gmail model)", () => {
    click("c1");
    click("c3", true); // c1 c2 c3 selected, anchor c3
    click("c3"); // deselect the anchor row
    click("c1", true); // range c1..c3 takes the state of c3 = off
    expect(useStore.getState().selectedIds.size).toBe(0);
  });

  it("a shift-click across the held / print boundary is a plain click, which the gates refuse", () => {
    useStore.setState({ heldIds: new Set(["c4"]) });
    click("c1");
    click("c4", true); // held target, print anchor: plain click on a held row while a print selection exists
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c1"]);
    expect(useStore.getState().heldSelectedIds.size).toBe(0);
    expect(useStore.getState().selectionAnchorId).toBe("c1");
    noMixing();
  });

  it("a held range selects only held rows and never touches selectedIds", () => {
    useStore.setState({ heldIds: new Set(["c1", "c3", "c5"]) });
    click("c1");
    const res = click("c5", true);
    expect(sorted(useStore.getState().heldSelectedIds)).toEqual(["c1", "c3", "c5"]);
    expect(useStore.getState().selectedIds.size).toBe(0);
    expect(res.skipped.notHeld).toBe(2);
    noMixing();
  });

  it("a range never starts a print selection while held rows are selected", () => {
    useStore.setState({ heldIds: new Set(["c1"]) });
    click("c1"); // held selection exists
    click("c3"); // plain click on a print row: refused (one selection at a time)
    click("c5", true);
    expect(useStore.getState().selectedIds.size).toBe(0);
    noMixing();
  });
});

describe("selectionAnchorId dies with the selections", () => {
  const withAnchor = () => {
    click("c1");
    click("c3", true);
    expect(useStore.getState().selectionAnchorId).toBe("c3");
  };

  it("Clear selection", () => {
    withAnchor();
    useStore.getState().toggleClearSelection();
    expect(useStore.getState().selectionAnchorId).toBeNull();
  });

  it("deselecting the last row", () => {
    click("c1");
    click("c1");
    expect(useStore.getState().selectionAnchorId).toBeNull();
  });

  it("a range that deselects everything", () => {
    click("c1");
    click("c3", true);
    click("c3"); // anchor row off, c1 c2 still on
    click("c1", true); // c1..c3 off
    expect(useStore.getState().selectedIds.size).toBe(0);
    expect(useStore.getState().selectionAnchorId).toBeNull();
  });

  it("submit / hold: the selection is replaced by an empty one", () => {
    withAnchor();
    useStore.setState({ selectedIds: new Set() });
    expect(useStore.getState().selectionAnchorId).toBeNull();
  });

  it("refreshFiles({ clearSelection: true })", async () => {
    withAnchor();
    await useStore.getState().refreshFiles({ clearSelection: true, showSuccessAlert: false });
    expect(useStore.getState().selectedIds.size).toBe(0);
    expect(useStore.getState().selectionAnchorId).toBeNull();
  });

  it("refreshFiles() without clearSelection keeps both the selection and the anchor", async () => {
    withAnchor();
    await useStore.getState().refreshFiles({ showSuccessAlert: false });
    expect(useStore.getState().selectedIds.size).toBe(3);
    expect(useStore.getState().selectionAnchorId).toBe("c3");
  });

  it("a stale anchor cannot resurrect: after a clear, a shift-click is a plain click", () => {
    withAnchor();
    useStore.getState().toggleClearSelection();
    click("c5", true);
    expect(sorted(useStore.getState().selectedIds)).toEqual(["c5"]);
  });
});
