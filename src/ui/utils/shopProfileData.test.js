import { describe, it, expect } from "vitest";
import { getSewingCompanies, getScanRule } from "./shopProfileData";

// Minimal profile builder — only the key getSewingCompanies reads.
const withCompanies = (sewingCompanies) => ({ schemaVersion: 1, sewingCompanies });

describe("getSewingCompanies — sentinel (unreadable profile)", () => {
  it("returns an empty list when the profile is null", () => {
    expect(getSewingCompanies(null)).toEqual([]);
  });

  it("returns an empty list when the profile is undefined", () => {
    expect(getSewingCompanies(undefined)).toEqual([]);
  });
});

describe("getSewingCompanies — shape guard", () => {
  it("returns an empty list when the profile carries no sewingCompanies key", () => {
    expect(getSewingCompanies({ schemaVersion: 1 })).toEqual([]);
  });

  // The profile is a free-form JSON blob in one column, so a hand-edited or
  // half-imported row can put anything under this key. Nothing but an array is a list.
  it("returns an empty list for a non-array value", () => {
    expect(getSewingCompanies(withCompanies("Olya"))).toEqual([]);
    expect(getSewingCompanies(withCompanies({ 0: "Olya" }))).toEqual([]);
    expect(getSewingCompanies(withCompanies(42))).toEqual([]);
    expect(getSewingCompanies(withCompanies(null))).toEqual([]);
  });
});

describe("getSewingCompanies — element filtering", () => {
  it("drops non-string elements", () => {
    expect(getSewingCompanies(withCompanies([1, true, null, undefined, {}, ["x"]]))).toEqual([]);
  });

  it("drops empty and whitespace-only names", () => {
    expect(getSewingCompanies(withCompanies(["", "   ", "\t\n"]))).toEqual([]);
  });

  // The name reaches file_stages.sewing_company as free text and is shown on a card,
  // so a stray element must not become a blank, unclickable submenu entry.
  it("keeps only the usable names out of a mixed array", () => {
    expect(getSewingCompanies(withCompanies(["Olya", "", 7, null, "Vagabond", "  "])))
      .toEqual(["Olya", "Vagabond"]);
  });

  it("returns an empty list for an empty array", () => {
    expect(getSewingCompanies(withCompanies([]))).toEqual([]);
  });
});

describe("getSewingCompanies — trimming and passthrough", () => {
  it("trims surrounding whitespace off the names it keeps", () => {
    expect(getSewingCompanies(withCompanies(["  Olya ", "\tVagabond\n"])))
      .toEqual(["Olya", "Vagabond"]);
  });

  // Pins the helper to ONE key. Every other test builds its input through withCompanies,
  // so none of them would notice a tolerant read like
  // `profile.sewingCompanies ?? profile.companies` — and a second accepted key is how a
  // half-migrated profile starts dispatching to a list nobody edited.
  it("reads the sewingCompanies key, not a neighbouring one", () => {
    expect(getSewingCompanies({ sewing: ["Olya"], companies: ["Olya"] })).toEqual([]);
  });
});

// ── getScanRule ───────────────────────────────────────────────────────────────

// Minimal profile builder — only the key getScanRule reads.
const withRules = (scanRules) => ({ schemaVersion: 1, scanRules });

// Alex's four stations, as seeded by DEFAULT_PROFILE. Copied rather than imported:
// defaultProfile.js is a main-process module, and importing it would make these tests
// pass or fail on a change to Alex's data instead of on this reader's logic.
const ALEX_RULES = [
  { role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true },
  { role: "polyester", from: "printed", to: "heatpress", notifyWhenEmpty: true },
  { role: "rollpress", from: "heatpress", to: "qc", notifyWhenEmpty: true },
  { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
];

describe("getScanRule — sentinel (unreadable profile)", () => {
  // The gate that matters most here: an unreadable profile reaches the one profile reader
  // wired to the barcode scanner, and answering it with a rule would move real files on a
  // configuration nobody could read.
  it("returns null when the profile is null", () => {
    expect(getScanRule(null, "cotton")).toBeNull();
  });

  it("returns null when the profile is undefined", () => {
    expect(getScanRule(undefined, "cotton")).toBeNull();
  });
});

describe("getScanRule — role argument", () => {
  // Role "" is the default station and has never moved anything on a scan.
  it("returns null for the empty role", () => {
    expect(getScanRule(withRules(ALEX_RULES), "")).toBeNull();
  });

  // Even a hand-edited profile that claims a rule for "" must not get one: the empty role
  // means "no role set on this PC", not "a station called empty string".
  it("returns null for the empty role even when a rule claims it", () => {
    const rules = [{ role: "", from: "printed", to: "heatpress", notifyWhenEmpty: true }];
    expect(getScanRule(withRules(rules), "")).toBeNull();
  });

  it("returns null for a role no rule mentions", () => {
    expect(getScanRule(withRules(ALEX_RULES), "embroidery")).toBeNull();
  });

  it("returns null for a non-string role", () => {
    expect(getScanRule(withRules(ALEX_RULES), null)).toBeNull();
    expect(getScanRule(withRules(ALEX_RULES), undefined)).toBeNull();
    expect(getScanRule(withRules(ALEX_RULES), 7)).toBeNull();
  });

  // Pins the match to exact equality. A case-insensitive or trimming compare is the shape
  // getPrinterByCode already carries as debt (2e); this reader must not repeat it quietly.
  it("matches the role exactly, not case-insensitively", () => {
    expect(getScanRule(withRules(ALEX_RULES), "Cotton")).toBeNull();
    expect(getScanRule(withRules(ALEX_RULES), " cotton")).toBeNull();
  });
});

describe("getScanRule — shape guard", () => {
  it("returns null when the profile carries no scanRules key", () => {
    expect(getScanRule({ schemaVersion: 1 }, "cotton")).toBeNull();
  });

  // The profile is a free-form JSON blob in one column. A map is the shape this was
  // deliberately NOT given (prototype keys), so it must not be read as one either.
  it("returns null when scanRules is not an array", () => {
    expect(getScanRule(withRules({ cotton: { from: "printed", to: "heatpress" } }), "cotton")).toBeNull();
    expect(getScanRule(withRules("cotton"), "cotton")).toBeNull();
    expect(getScanRule(withRules(42), "cotton")).toBeNull();
    expect(getScanRule(withRules(null), "cotton")).toBeNull();
  });

  it("returns null for an empty rule array", () => {
    expect(getScanRule(withRules([]), "cotton")).toBeNull();
  });

  // A rule naming a role but no usable transition is worse than no rule: an empty stage
  // reaching advanceStage takes the UNGUARDED db statement (db.js:948) and drops the
  // concurrency check the whole Production layer relies on.
  it("returns null for a rule with an empty or missing from", () => {
    expect(getScanRule(withRules([{ role: "cotton", from: "", to: "heatpress" }]), "cotton")).toBeNull();
    expect(getScanRule(withRules([{ role: "cotton", from: "   ", to: "heatpress" }]), "cotton")).toBeNull();
    expect(getScanRule(withRules([{ role: "cotton", to: "heatpress" }]), "cotton")).toBeNull();
    expect(getScanRule(withRules([{ role: "cotton", from: 7, to: "heatpress" }]), "cotton")).toBeNull();
  });

  // The equivalence the caller depends on: it filters with `f.stage === rule.from` and
  // then hands advanceStage `f.stage` as the concurrency guard. Those two are the same
  // string only while `from` is a single stage, so a rule offering a SET of stages must
  // be refused here rather than half-applied there. This is the reachable half of that
  // proof — the filter itself sits in Production.jsx, which has no test harness
  // (rejected in 50f64c8).
  it("returns null for a from that is a set of stages rather than one", () => {
    const rules = [{ role: "cotton", from: ["printed", "heatpress"], to: "qc" }];
    expect(getScanRule(withRules(rules), "cotton")).toBeNull();
  });

  it("returns null for a rule with an empty or missing to", () => {
    expect(getScanRule(withRules([{ role: "cotton", from: "printed", to: "" }]), "cotton")).toBeNull();
    expect(getScanRule(withRules([{ role: "cotton", from: "printed" }]), "cotton")).toBeNull();
    expect(getScanRule(withRules([{ role: "cotton", from: "printed", to: null }]), "cotton")).toBeNull();
  });

  it("skips non-object entries without throwing", () => {
    const rules = [null, "cotton", 7, ["cotton"], ALEX_RULES[0]];
    expect(getScanRule(withRules(rules), "cotton")).toEqual(ALEX_RULES[0]);
  });

  // A malformed rule for the asked role must not be repaired by a later well-formed one —
  // that would make a broken profile behave as if it were fine. A rule with no usable
  // transition is not a match, so first-match-wins never sees it.
  it("falls through a malformed rule to a later valid one for the same role", () => {
    const rules = [
      { role: "cotton", from: "", to: "heatpress", notifyWhenEmpty: true },
      { role: "cotton", from: "printed", to: "qc", notifyWhenEmpty: true },
    ];
    expect(getScanRule(withRules(rules), "cotton")).toEqual({
      role: "cotton",
      from: "printed",
      to: "qc",
      notifyWhenEmpty: true,
    });
  });
});

describe("getScanRule — notifyWhenEmpty", () => {
  // The frozen-debt field. It is the only reason the QC station keeps its silence, so a
  // reader that loses it turns a deliberate quiet into an unasked-for toast.
  it("keeps a real false", () => {
    expect(getScanRule(withRules(ALEX_RULES), "qc").notifyWhenEmpty).toBe(false);
  });

  it("keeps a real true", () => {
    expect(getScanRule(withRules(ALEX_RULES), "cotton").notifyWhenEmpty).toBe(true);
  });

  // Deliberately NOT getFeature's strict === true. There, the closed direction withholds
  // a feature; here it withholds a WARNING, and an unexplained silent scanner is the risk
  // this cut exists to close. So anything a sloppy import can produce — 1, "true", the
  // STRING "false", null — has to warn. Only a literal false may quiet a station.
  it("warns for any value that is not a literal false", () => {
    const t = (v) =>
      getScanRule(withRules([{ role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: v }]), "cotton")
        .notifyWhenEmpty;
    expect(t("true")).toBe(true);
    expect(t(1)).toBe(true);
    expect(t("yes")).toBe(true);
    expect(t({})).toBe(true);
    expect(t(0)).toBe(true);
    expect(t(null)).toBe(true);
    // The nastiest of them: a JSON round-trip or a CSV import that stringifies booleans
    // would otherwise silence a station that nobody asked to be silent.
    expect(t("false")).toBe(true);
  });

  it("defaults to warning when the field is absent", () => {
    const rules = [{ role: "cotton", from: "printed", to: "heatpress" }];
    expect(getScanRule(withRules(rules), "cotton").notifyWhenEmpty).toBe(true);
  });
});

describe("getScanRule — resolution and passthrough", () => {
  it("returns each of Alex's four rules unchanged", () => {
    for (const rule of ALEX_RULES) {
      expect(getScanRule(withRules(ALEX_RULES), rule.role)).toEqual(rule);
    }
  });

  // First match wins is a decision, not a side effect of .find() — pinned so a rewrite to
  // last-wins or a merge has to break a test rather than silently change behaviour.
  it("takes the first matching rule when a role appears twice", () => {
    const rules = [
      { role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true },
      { role: "cotton", from: "heatpress", to: "qc", notifyWhenEmpty: false },
    ];
    expect(getScanRule(withRules(rules), "cotton")).toEqual(rules[0]);
  });

  it("trims surrounding whitespace off the stages it returns", () => {
    const rules = [{ role: "cotton", from: " printed ", to: "\theatpress\n", notifyWhenEmpty: true }];
    expect(getScanRule(withRules(rules), "cotton")).toEqual({
      role: "cotton",
      from: "printed",
      to: "heatpress",
      notifyWhenEmpty: true,
    });
  });

  // Pins the helper to ONE key, as the sewingCompanies suite above does. A tolerant read
  // like `profile.scanRules ?? profile.rules` is how a half-migrated profile starts moving
  // files on a list nobody edited.
  it("reads the scanRules key, not a neighbouring one", () => {
    expect(getScanRule({ rules: ALEX_RULES, scan: ALEX_RULES }, "cotton")).toBeNull();
  });

  // The caller hands from/to straight to advanceStage, so an unvalidated passthrough field
  // would arrive somewhere nobody checked it.
  it("returns only the four known fields", () => {
    const rules = [{ role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true, danger: "x" }];
    expect(Object.keys(getScanRule(withRules(rules), "cotton")).sort()).toEqual([
      "from",
      "notifyWhenEmpty",
      "role",
      "to",
    ]);
  });
});
