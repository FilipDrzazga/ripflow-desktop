import { describe, it, expect } from "vitest";
import { inboxBarData, pipelineBarData, alertsBarData, formatRefreshAgo, TOP_GROUPS_PER_CLASS } from "./overviewBars.js";
import { PRODUCTION_STAGE } from "../../shared/constants.js";

const CONFIG = { classes: {}, fabrics: [] }; // class constants for Cottons / Polyesters (rule 23: always passed)
const ALEX = { materialClasses: [{ name: "Cottons" }, { name: "Polyesters" }] };
const fq = (materialType, qty = 1) => ({ printTypeCode: "FQ", materialType, material: "X", width: 600, height: 400, qty });
const group = (printGroup, ...items) => ({ printGroup, items });
const cls = (data, name) => data.classes.find((c) => c.name === name);

describe("inboxBarData", () => {
  it("segments are per class and group, shares are of the WHOLE inbox and add up to 100", () => {
    const data = inboxBarData([group("G1", fq("Cottons", 3)), group("G2", fq("Cottons")), group("P1", fq("Polyesters", 2))], ALEX, CONFIG);
    const all = data.classes.flatMap((c) => c.segments);
    expect(all.map((s) => s.key)).toEqual(["Cottons|group|G1", "Cottons|group|G2", "Polyesters|group|P1"]);
    expect(all.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 5);
    expect(all.reduce((sum, s) => sum + s.length, 0)).toBeCloseTo(data.totalLength, 1);
  });

  it("a class's segment lengths agree with the length of its row", () => {
    const data = inboxBarData([group("G1", fq("Cottons", 3)), group("G2", fq("Cottons")), group("G3", fq("Cottons", 2))], ALEX, CONFIG);
    const c = cls(data, "Cottons");
    expect(c.segments.reduce((sum, s) => sum + s.length, 0)).toBeCloseTo(c.length, 1);
  });

  it("segments of a class are longest first; the 4th group onwards fold into ONE Others segment", () => {
    // wide qty steps: the estimate packs pieces into rows, so small steps are not monotone
    const g = [group("A", fq("Cottons", 10)), group("B", fq("Cottons", 50)), group("C", fq("Cottons", 40)), group("D", fq("Cottons", 30)), group("E", fq("Cottons", 20))];
    const c = cls(inboxBarData(g, ALEX, CONFIG), "Cottons");
    expect(c.segments.map((s) => s.label)).toEqual(["B", "C", "D", "Others"]);
    expect(TOP_GROUPS_PER_CLASS).toBe(3);
    const others = c.segments.at(-1);
    expect(others).toMatchObject({ key: "Cottons|others", isOthers: true, othersCount: 2 });
    // the tooltip list carries EVERY group, shares of the class
    expect(c.groups.map((x) => x.label)).toEqual(["B", "C", "D", "E", "A"]);
    expect(c.groups.reduce((sum, x) => sum + x.percentage, 0)).toBeCloseTo(100, 5);
  });

  it("no Others segment while the class has at most three groups", () => {
    const c = cls(inboxBarData([group("A", fq("Cottons")), group("B", fq("Cottons")), group("C", fq("Cottons"))], ALEX, CONFIG), "Cottons");
    expect(c.segments.some((s) => s.isOthers)).toBe(false);
  });

  it("keys are names, not positions: reordering the groups keeps every key", () => {
    const a = group("A", fq("Cottons", 5));
    const b = group("B", fq("Cottons", 1));
    const keys = (g) => cls(inboxBarData(g, ALEX, CONFIG), "Cottons").segments.map((s) => s.key).sort();
    expect(keys([a, b])).toEqual(keys([b, a]));
    // the same group keeps its key when another group overtakes it in rank
    const bigger = group("C", fq("Cottons", 9));
    expect(keys([a, b, bigger])).toEqual(expect.arrayContaining(["Cottons|group|A", "Cottons|group|B"]));
  });

  it("zero means no segment: an empty class has none, and so does an empty inbox", () => {
    const data = inboxBarData([group("G1", fq("Cottons"))], ALEX, CONFIG);
    expect(cls(data, "Polyesters").segments).toEqual([]);
    const empty = inboxBarData([], ALEX, CONFIG);
    expect(empty.classes.flatMap((c) => c.segments)).toEqual([]);
    expect([empty.totalLength, empty.fileCount]).toEqual([0, 0]);
  });

  it("files outside the profile's classes are counted as Unknown but, with no class numbers, not measured - no segment", () => {
    const data = inboxBarData([group("G1", fq("Silk"), fq("Unknown")), group("G2", fq("Cottons"))], ALEX, CONFIG);
    const unknown = cls(data, "Unknown");
    expect(unknown).toMatchObject({ slot: -1, count: 2, length: 0, segments: [] });
    expect(cls(data, "Cottons").segments).toHaveLength(1);
  });

  it("an Unknown class that does have numbers (profile config) draws its own segments", () => {
    const config = { classes: { Silk: { margin: 0, defaultRollWidth: 1500 } }, fabrics: [] };
    const data = inboxBarData([group("G1", fq("Silk", 5))], ALEX, config);
    const unknown = cls(data, "Unknown");
    expect(unknown.segments.map((s) => s.key)).toEqual(["Unknown|group|G1"]);
    expect(unknown.segments[0].length).toBeCloseTo(unknown.length, 1);
    expect(unknown.segments[0].length).toBeGreaterThan(0);
  });

  it("a group is split between the classes by the material of its files", () => {
    const data = inboxBarData([group("MIX", fq("Cottons"), fq("Polyesters"))], ALEX, CONFIG);
    expect(cls(data, "Cottons").segments.map((s) => s.key)).toEqual(["Cottons|group|MIX"]);
    expect(cls(data, "Polyesters").segments.map((s) => s.key)).toEqual(["Polyesters|group|MIX"]);
  });

  it("no profile: every file is Unknown, nothing is guessed from another shop's classes", () => {
    const data = inboxBarData([group("G1", fq("Cottons"))], null, CONFIG);
    expect(data.classes.map((c) => c.name)).toEqual(["Unknown"]);
  });
});

describe("formatRefreshAgo", () => {
  const T = Date.UTC(2026, 9, 2, 12, 0, 0);
  it("buckets minutes, hours and days", () => {
    expect(formatRefreshAgo(T - 20_000, T)).toBe("just now");
    expect(formatRefreshAgo(T - 5 * 60_000, T)).toBe("5 min ago");
    expect(formatRefreshAgo(T - 3 * 3_600_000, T)).toBe("3 h ago");
    expect(formatRefreshAgo(T - 50 * 3_600_000, T)).toBe("2 d ago");
  });
  it("a missing or unreadable timestamp reads as not available", () => {
    expect(formatRefreshAgo(null, T)).toBe("not available");
    expect(formatRefreshAgo("nonsense", T)).toBe("not available");
  });
});

describe("pipelineBarData", () => {
  const NOW = new Date(2026, 9, 2, 12, 0, 0);
  const stages = (...list) => Object.fromEntries(list.map((stage, i) => [`f${i}`, { stage }]));
  const S = PRODUCTION_STAGE;

  it("Sewing is to_sewing + from_sewing under ONE key", () => {
    const data = pipelineBarData(stages(S.TO_SEWING, S.FROM_SEWING, S.FROM_SEWING, S.QC), {}, NOW);
    expect(data.stages.find((s) => s.label === "Sewing")).toMatchObject({ key: S.TO_SEWING, count: 3 });
    expect(data.stages.map((s) => s.label)).toEqual(["Printed", "Heat Press", "QC", "Sewing", "Packed"]);
  });

  it("segments are the non-empty stages, keyed by stage, shares add up to 100", () => {
    const data = pipelineBarData(stages(S.PRINTED, S.PRINTED, S.QC, S.PACKED), {}, NOW);
    expect(data.segments.map((s) => s.key)).toEqual([S.PRINTED, S.QC, S.PACKED]);
    expect(data.segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 5);
    expect(data.total).toBe(4);
    // the chips keep the zero stages, the bar does not
    expect(data.stages).toHaveLength(5);
  });

  it("an empty pipeline has no segments", () => {
    expect(pipelineBarData({}, {}, NOW)).toMatchObject({ total: 0, segments: [], shippedToday: 0 });
  });

  it("shipped today is a flow from the history: once per file, today only, never a segment", () => {
    const today = new Date(2026, 9, 2, 8, 30).toISOString();
    const yesterday = new Date(2026, 9, 1, 8, 30).toISOString();
    const history = {
      a: [{ stage: S.SHIPPED, entered_at: today }, { stage: S.SHIPPED, entered_at: today }],
      b: [{ stage: S.SHIPPED, entered_at: yesterday }],
      c: [{ stage: S.PACKED, entered_at: today }],
      d: [{ stage: S.SHIPPED, entered_at: today }],
    };
    const data = pipelineBarData(stages(S.PACKED), history, NOW);
    expect(data.shippedToday).toBe(2);
    expect(data.segments.map((s) => s.key)).toEqual([S.PACKED]);
    expect(data.total).toBe(1);
  });
});

describe("alertsBarData", () => {
  const base = { ripErrors: { a: {}, b: {} }, heldIds: new Set(["x"]), openReprints: [1, 2, 3] };
  const ON = { features: { ripErrors: true } };

  it("feature on: RIP errors, Hold and Reprints, in that order, with their counts", () => {
    const data = alertsBarData({ ...base, shopProfile: ON });
    expect(data.items.map((a) => [a.id, a.count])).toEqual([["rip", 2], ["hold", 1], ["reprint", 3]]);
    expect(data.total).toBe(6);
    expect(data.segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 5);
  });

  it("feature off: no RIP entry at all, whatever the store holds", () => {
    const data = alertsBarData({ ...base, shopProfile: { features: { ripErrors: false } } });
    expect(data.items.map((a) => a.id)).toEqual(["hold", "reprint"]);
    expect(data.total).toBe(4);
  });

  it("unreadable profile (null): fail closed, the RIP entry is hidden", () => {
    expect(alertsBarData({ ...base, shopProfile: null }).items.map((a) => a.id)).toEqual(["hold", "reprint"]);
  });

  it("the flag must be exactly true, and it must be the ripErrors flag", () => {
    expect(alertsBarData({ ...base, shopProfile: { features: { ripErrors: 1 } } }).items.map((a) => a.id)).not.toContain("rip");
    expect(alertsBarData({ ...base, shopProfile: { features: { analytics: true } } }).items.map((a) => a.id)).not.toContain("rip");
  });

  it("zero counts stay as chips but are not segments", () => {
    const data = alertsBarData({ ripErrors: {}, heldIds: new Set(), openReprints: [1], shopProfile: ON });
    expect(data.items).toHaveLength(3);
    expect(data.segments.map((s) => s.key)).toEqual(["reprint"]);
    expect(alertsBarData({ ripErrors: {}, heldIds: new Set(), openReprints: [], shopProfile: ON }).segments).toEqual([]);
  });
});
