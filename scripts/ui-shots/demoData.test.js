import { describe, expect, it, vi } from "vitest";

// Same isolation as parseFileName.test.js: the parser is imported with its one data-layer edge mocked.
vi.mock("../../src/electron/helpers/fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Unknown",
}));

import { parsePrintFileName } from "../../src/electron/helpers/parseFileName.js";
import { DEFAULT_PROFILE } from "../../src/electron/helpers/defaultProfile.js";
import { validateShopProfile } from "../../src/electron/helpers/validateShopProfile.js";
import { BATCH_PLAN, DEMO_FABRICS, DEMO_SHOP, STAGE_CHAIN, buildFiles, buildInboxPlan, makeRng } from "./demoData.mjs";

const parse = (name) => parsePrintFileName(name, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${name}`, shopConfig: DEMO_SHOP });

describe("demo shop profile", () => {
  it("passes the same validator as a profile import", () => {
    const verdict = validateShopProfile(DEMO_SHOP, { schemaVersion: DEFAULT_PROFILE.schemaVersion });
    expect(verdict.errors).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  it("has a fabric for every material the plans use, in a class a printer serves", () => {
    const classes = new Set(DEMO_SHOP.printers.map((p) => p.materialClass));
    const names = new Set(DEMO_FABRICS.map((f) => f.name));
    for (const f of DEMO_FABRICS) expect(classes.has(f.type)).toBe(true);
    for (const b of BATCH_PLAN) {
      expect(names.has(b.material)).toBe(true);
      const printer = DEMO_SHOP.printers.find((p) => p.code === b.printer);
      expect(printer?.materialClass).toBe(DEMO_FABRICS.find((f) => f.name === b.material).type);
    }
  });
});

describe("demo files", () => {
  it("are deterministic for a seed", () => {
    expect(buildInboxPlan(makeRng(7))).toEqual(buildInboxPlan(makeRng(7)));
  });

  it("parse cleanly, except the two files that exist to show an error", () => {
    const files = buildInboxPlan(makeRng(20261002));
    const flagged = files.filter((f) => f.kind === "BAD_FORMAT" || f.material === "Mystery Weave");
    expect(flagged).toHaveLength(2);
    for (const f of files.filter((x) => !flagged.includes(x))) {
      const out = parse(f.name);
      expect(out.errors, f.name).toEqual([]);
      expect(out.material, f.name).toBe(f.material);
    }
    expect(parse(flagged.find((f) => f.kind === "BAD_FORMAT").name).errors.length).toBeGreaterThan(0);
  });

  it("give every file of a batch a distinct name", () => {
    const rng = makeRng(3);
    const names = BATCH_PLAN.flatMap((b, i) => buildFiles({ material: b.material, count: b.stages.length, kinds: b.kinds, rng, orderStart: 7000 + i * 60 }).map((f) => f.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("batch plan", () => {
  it("only asks for stages the chain knows", () => {
    for (const b of BATCH_PLAN) for (const s of b.stages) expect(STAGE_CHAIN[s], s).toBeDefined();
  });
});

describe("variants and custom-order demo data (UI-3)", () => {
  it("V1 switches every feature off and the profile still passes the import validator", async () => {
    const { withAllFeaturesOff } = await import("./demoData.mjs");
    const shop = withAllFeaturesOff(DEMO_SHOP);
    expect(Object.keys(shop.features)).toEqual(Object.keys(DEMO_SHOP.features));
    expect(Object.values(shop.features).every((v) => v === false)).toBe(true);
    expect(validateShopProfile(shop, { schemaVersion: DEFAULT_PROFILE.schemaVersion }).ok).toBe(true);
    // the original is not touched
    expect(DEMO_SHOP.features.sewing).toBe(true);
  });

  it("the demo CSV is read back by the real custom-order parser", async () => {
    const { buildDemoCsv, DEMO_CUSTOM_ART } = await import("./demoData.mjs");
    const { parseCSVContent } = await import("../../src/electron/helpers/parseCustomOrderCSV.js");
    const art = DEMO_CUSTOM_ART.partial;
    const parsed = parseCSVContent(buildDemoCsv({ po: art.po, material: art.material, rows: art.files.map((file, i) => ({ file, meters: 2 + i })) }));
    expect(parsed.poNumber).toBe(art.po);
    expect(parsed.materialName).toBe(art.material);
    expect(parsed.files.map((f) => f.fileName)).toEqual(art.files);
    expect(parsed.files[1].metersToprint).toBe(3);
  });

  it("the partial order has exactly one artwork file missing from the folder", async () => {
    const { DEMO_CUSTOM_ART } = await import("./demoData.mjs");
    const { complete, partial } = DEMO_CUSTOM_ART;
    expect(complete.files.every((f) => complete.present.includes(f))).toBe(true);
    expect(partial.files.filter((f) => !partial.present.includes(f))).toHaveLength(1);
  });

  it("the two sewing parcels go to different companies (batch index parity)", () => {
    const sewing = BATCH_PLAN.map((b, i) => ({ i, b })).filter(({ b }) => b.stages.includes("to_sewing"));
    expect(sewing.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sewing.map(({ i }) => i % 2)).size).toBe(2);
  });

  it("keeps one old unfinished batch for the red day pill and the Stuck tab", () => {
    const old = BATCH_PLAN.find((b) => b.daysAgo >= 8);
    expect(old).toBeDefined();
    expect(old.stages.every((s) => s !== "shipped")).toBe(true);
  });
});
