import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./useStore";
import { APP_VIEW } from "../constants/appViews";

// The Ctrl+F jump task and the Print half of it, on the real store (plan C3-3).

const item = (id, over = {}) => ({
  id,
  file: { name: `${id}.pdf` },
  materialType: "Cottons",
  printTypeCode: "LM",
  orderId: "ON100001",
  customerName: "Ada",
  material: "Cotton 220",
  ...over,
});

const FILES = [
  { printGroup: "Cottons", items: [item("c1"), item("c2", { orderId: "ON100002", customerName: "Bob" })] },
  { printGroup: "Polyesters", items: [item("p1", { materialType: "Polyesters", printTypeCode: "POSTER" })] },
];

const names = (groups) => groups.flatMap((g) => g.items.map((i) => i.id));

beforeEach(() => {
  useStore.setState({
    files: FILES,
    filteredFiles: FILES,
    activeTab: "All",
    searchQuery: "",
    sortOrder: null,
    printTypeFilter: [],
    searchTarget: null,
    searchJumpSeq: 0,
  });
});

describe("requestSearchJump / clearSearchTarget", () => {
  it("stores one task with a nonce", () => {
    const task = useStore.getState().requestSearchJump({ view: APP_VIEW.PRODUCTION, fileId: "f1", dayKey: "14-10-2026" });
    expect(task).toEqual({ view: APP_VIEW.PRODUCTION, fileId: "f1", dayKey: "14-10-2026", nonce: 1 });
    expect(useStore.getState().searchTarget).toEqual(task);
  });

  it("a row that leads nowhere stores nothing", () => {
    expect(useStore.getState().requestSearchJump({ view: "settings", fileId: "f1" })).toBeNull();
    expect(useStore.getState().requestSearchJump(null)).toBeNull();
    expect(useStore.getState().searchTarget).toBeNull();
    expect(useStore.getState().searchJumpSeq).toBe(0);
  });

  it("the SAME file picked a second time is a new nonce, also after the first task was cleared", () => {
    const { requestSearchJump, clearSearchTarget } = useStore.getState();
    const first = requestSearchJump({ view: APP_VIEW.PRODUCTION, fileId: "f1" });
    clearSearchTarget(first.nonce);
    expect(useStore.getState().searchTarget).toBeNull();
    const second = requestSearchJump({ view: APP_VIEW.PRODUCTION, fileId: "f1" });
    expect(second.nonce).toBeGreaterThan(first.nonce);
  });

  it("clearing an old nonce does not wipe a newer pick made while the old one was served", () => {
    const { requestSearchJump, clearSearchTarget } = useStore.getState();
    const first = requestSearchJump({ view: APP_VIEW.PRINT, fileId: "c1" });
    const second = requestSearchJump({ view: APP_VIEW.PRODUCTION, fileId: "f9" });
    clearSearchTarget(first.nonce);
    expect(useStore.getState().searchTarget).toEqual(second);
    clearSearchTarget(second.nonce);
    expect(useStore.getState().searchTarget).toBeNull();
  });
});

describe("revealPrintFile", () => {
  it("is a no-op for a file no filter hides", () => {
    const before = useStore.getState().filteredFiles;
    expect(useStore.getState().revealPrintFile("c1")).toEqual({ found: true, cleared: [] });
    expect(useStore.getState().filteredFiles).toBe(before);
  });

  it("lifts the material tab that hides the file, and leaves the other filters alone", () => {
    useStore.getState().setActiveTab("Polyesters");
    useStore.getState().setSortOrder("meters_desc");
    expect(names(useStore.getState().filteredFiles)).toEqual(["p1"]);

    expect(useStore.getState().revealPrintFile("c1")).toEqual({ found: true, cleared: ["tab"] });

    const s = useStore.getState();
    expect(s.activeTab).toBe("All");
    expect(s.sortOrder).toBe("meters_desc");
    expect(names(s.filteredFiles)).toContain("c1");
  });

  it("lifts the search that hides the file but keeps the tab that does not", () => {
    useStore.getState().setActiveTab("Cottons");
    useStore.getState().setSearchQuery("bob");
    expect(names(useStore.getState().filteredFiles)).toEqual(["c2"]);

    expect(useStore.getState().revealPrintFile("c1")).toEqual({ found: true, cleared: ["search"] });

    const s = useStore.getState();
    expect(s.searchQuery).toBe("");
    expect(s.activeTab).toBe("Cottons");
    expect(names(s.filteredFiles)).toEqual(["c1", "c2"]);
  });

  it("lifts the type chips that hide the file", () => {
    useStore.getState().setPrintTypeFilter(["POSTER"]);
    expect(names(useStore.getState().filteredFiles)).toEqual(["p1"]);

    expect(useStore.getState().revealPrintFile("c2")).toEqual({ found: true, cleared: ["printType"] });

    expect(useStore.getState().printTypeFilter).toEqual([]);
    expect(names(useStore.getState().filteredFiles)).toContain("c2");
  });

  it("does not touch the selection", () => {
    useStore.setState({ selectedIds: new Set(["c2"]) });
    useStore.getState().setActiveTab("Polyesters");
    useStore.getState().revealPrintFile("c1");
    expect([...useStore.getState().selectedIds]).toEqual(["c2"]);
  });

  it("says so when the file is no longer in the scan", () => {
    expect(useStore.getState().revealPrintFile("gone")).toEqual({ found: false, cleared: [] });
  });
});
