import { describe, it, expect, beforeEach, vi } from "vitest";
import { FILE_STATUS } from "../../shared/constants";
import { PDF_STATE } from "../../shared/inboxReadiness";

// Rows still being copied, in the real store: never selectable (click, shift-range, group
// checkbox), and the inbox tick flips a finished one in place without touching the selection.
const api = vi.hoisted(() => ({ recheck: vi.fn() }));

vi.mock("../services/fileService", () => ({
  readFolders: vi.fn(async () => ({ success: true, data: [], warnings: [] })),
  peekInbox: vi.fn(async () => ({ success: false })),
  recheckCopying: api.recheck,
}));
vi.mock("../services/batchService");
vi.mock("../services/systemService", () => ({
  getLogs: vi.fn(), clearLogs: vi.fn(), getHeldFiles: vi.fn(), holdFile: vi.fn(), unholdFile: vi.fn(),
  pruneOrphanHolds: vi.fn(async () => ({ success: true })), getDbDegraded: vi.fn(), getPrintedRootUnreachable: vi.fn(), getPowerPaused: vi.fn(),
}));
vi.mock("../services/analyticsService", () => ({ getRollbackReasonsForFiles: vi.fn(async () => ({ success: true, data: [] })) }));
vi.mock("../services/reasonDefsService");
vi.mock("../services/fabricService");
vi.mock("../services/profileService");
vi.mock("../services/productionService");
vi.mock("../services/ripErrorService");

const { useStore } = await import("./useStore");

const item = (id, status = FILE_STATUS.READY) => ({
  id, materialType: "Cotton", status, file: { name: `${id}.pdf` }, printTypeCode: "LM", createdAt: "2026-10-15",
  ...(status === FILE_STATUS.COPYING ? { statusParsed: FILE_STATUS.READY, copyingReason: "the end of the file is still empty" } : {}),
});
const FILES = () => [{ printGroup: "G", items: [item("g1"), item("g2", FILE_STATUS.COPYING), item("g3"), item("g4", FILE_STATUS.COPYING)] }];
const ids = (s) => [...s].sort();

beforeEach(() => {
  api.recheck.mockReset();
  const files = FILES();
  useStore.setState({
    files, filteredFiles: files, heldIds: new Set(), selectedIds: new Set(), heldSelectedIds: new Set(),
    selectionAnchorId: null, selectedOverrides: new Map(), isRefreshingFiles: false,
    activeTab: "All", searchQuery: "", sortOrder: null, printTypeFilter: [],
  });
});

describe("a copying row is not selectable", () => {
  it("a click is refused", () => {
    useStore.getState().selectPrintRow("g2");
    expect(useStore.getState().selectedIds.size).toBe(0);
  });

  it("a shift-range steps over it", () => {
    useStore.getState().selectPrintRow("g1");
    const { skipped } = useStore.getState().selectPrintRow("g4", { shiftKey: true });
    expect(ids(useStore.getState().selectedIds)).toEqual(["g1", "g3"]);
    expect(skipped.copying).toBe(2);
  });

  it("the group checkbox selects the finished rows only", () => {
    useStore.getState().toggleGroupSelection(useStore.getState().filteredFiles[0].items);
    expect(ids(useStore.getState().selectedIds)).toEqual(["g1", "g3"]);
  });
});

describe("recheckCopying - the inbox tick", () => {
  it("flips the finished row in place and leaves the selection and the order alone", async () => {
    useStore.getState().selectPrintRow("g1");
    api.recheck.mockResolvedValue({ success: true, updates: [{ id: "g2", state: PDF_STATE.READY }] });
    await useStore.getState().recheckCopying();

    const { files, filteredFiles, selectedIds } = useStore.getState();
    expect(files[0].items.map((i) => [i.id, i.status])).toEqual([
      ["g1", FILE_STATUS.READY], ["g2", FILE_STATUS.READY], ["g3", FILE_STATUS.READY], ["g4", FILE_STATUS.COPYING],
    ]);
    expect(filteredFiles[0].items.find((i) => i.id === "g2").status).toBe(FILE_STATUS.READY);
    expect(ids(selectedIds)).toEqual(["g1"]);
    // and it can now be picked
    useStore.getState().selectPrintRow("g2");
    expect(ids(useStore.getState().selectedIds)).toEqual(["g1", "g2"]);
  });

  it("asks nothing when no row is copying", async () => {
    const files = [{ printGroup: "G", items: [item("g1")] }];
    useStore.setState({ files, filteredFiles: files });
    await useStore.getState().recheckCopying();
    expect(api.recheck).not.toHaveBeenCalled();
  });

  it("changes nothing on a failed answer, an empty one or while a scan is running", async () => {
    const before = useStore.getState().files;
    api.recheck.mockResolvedValueOnce({ success: false });
    await useStore.getState().recheckCopying();
    api.recheck.mockResolvedValueOnce({ success: true, updates: [] });
    await useStore.getState().recheckCopying();
    api.recheck.mockRejectedValueOnce(new Error("timeout"));
    await useStore.getState().recheckCopying();
    expect(useStore.getState().files).toBe(before);

    useStore.setState({ isRefreshingFiles: true });
    api.recheck.mockClear();
    await useStore.getState().recheckCopying();
    expect(api.recheck).not.toHaveBeenCalled();
  });
});
