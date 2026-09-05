import { describe, it, expect, vi } from "vitest";

// Same isolation as parseFileName.test.js, and for the same reason: importing the parser
// must not pull in the native better-sqlite3 / electron chain. Mocking ./fabricCache.js is
// enough ONLY because the parser reads the shop config from its argument. The moment it
// reaches for shopProfile.js by import, this mock stops being sufficient and 30
// characterization tests next door stop importing at all.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Unknown",
}));

import { parsePrintFileName } from "./parseFileName.js";

const XWD = "XWD1a2b3c4d5e";

// One filename per product type that carries a fixed dimension. LM is excluded on
// purpose: its width comes from the fabric cache, not from productTypes.
const NAMES = {
  SAMPLE: `ON312405_Hanna_Wilson_1of3_Stretch Jersey_1x_Sample Print - 20 x 20 cm_${XWD}_FF.pdf`,
  FQ: `ON311936_Diana_Smith_2of6_Palatine Velvet FR_1x_Fat Quarter - 65 x 48 cm_${XWD}_FF.pdf`,
  TEA_TOWEL: "ON312896_Karol_Lewis_1of2_Custom Tea Towel_Drill _ Fully Sewn_50_FF_2998.pdf",
};

const parse = (key, options = {}) =>
  parsePrintFileName(NAMES[key], { dir: "C:\\inbox", fullPath: `C:\\inbox\\${NAMES[key]}`, ...options });

const dims = (key, options) => {
  const out = parse(key, options);
  return { width: out.width, height: out.height };
};

// The built-in constants, copied rather than imported. Importing printWidths.js would make
// this suite pass whenever the module agrees with itself; spelling the numbers out means a
// change to the constants has to be a deliberate edit here too.
const BUILT_IN = {
  SAMPLE: { width: 220, height: 200 },
  FQ: { width: 670, height: 480 },
  TEA_TOWEL: { width: 700, height: 500 },
};

const withTypes = (productTypes) => ({ schemaVersion: 1, productTypes });

describe("parsePrintFileName shopConfig — absent config keeps the old behaviour", () => {
  // The contract that lets the 30 characterization tests next door stay untouched: a caller
  // that passes no config gets exactly what the parser produced before the argument existed.
  it("uses the built-in dimensions when no options are given at all", () => {
    for (const key of Object.keys(BUILT_IN)) {
      expect(parsePrintFileName(NAMES[key])).toMatchObject(BUILT_IN[key]);
    }
  });

  it("uses the built-in dimensions when options carry no shopConfig", () => {
    for (const key of Object.keys(BUILT_IN)) {
      expect(dims(key)).toEqual(BUILT_IN[key]);
    }
  });

  it("uses the built-in dimensions when shopConfig is null or undefined", () => {
    for (const key of Object.keys(BUILT_IN)) {
      expect(dims(key, { shopConfig: null })).toEqual(BUILT_IN[key]);
      expect(dims(key, { shopConfig: undefined })).toEqual(BUILT_IN[key]);
    }
  });
});

describe("parsePrintFileName shopConfig — a supplied config is used", () => {
  // Values deliberately unlike the built-ins, so a passing assertion cannot be explained by
  // the fallback. Per type, not in bulk: three codes resolved by one lookup could all be
  // answered by the first match and nobody would notice.
  it("takes SAMPLE dimensions from the config", () => {
    const cfg = withTypes([{ code: "SAMPLE", width: 111, height: 222 }]);
    expect(dims("SAMPLE", { shopConfig: cfg })).toEqual({ width: 111, height: 222 });
  });

  it("takes FQ dimensions from the config", () => {
    const cfg = withTypes([{ code: "FQ", width: 333, height: 444 }]);
    expect(dims("FQ", { shopConfig: cfg })).toEqual({ width: 333, height: 444 });
  });

  it("takes TEA_TOWEL dimensions from the config", () => {
    const cfg = withTypes([{ code: "TEA_TOWEL", width: 555, height: 666 }]);
    expect(dims("TEA_TOWEL", { shopConfig: cfg })).toEqual({ width: 555, height: 666 });
  });

  // Resolution is per code, not "the first entry wins": a config that overrides one type
  // must leave the others on their built-ins rather than borrowing the override.
  it("leaves the other types on their built-ins when only one is configured", () => {
    const cfg = withTypes([{ code: "FQ", width: 333, height: 444 }]);
    expect(dims("SAMPLE", { shopConfig: cfg })).toEqual(BUILT_IN.SAMPLE);
    expect(dims("TEA_TOWEL", { shopConfig: cfg })).toEqual(BUILT_IN.TEA_TOWEL);
  });

  // Pins the mechanism to the numbers actually seeded, which is what makes the golden net's
  // 0/70 meaningful: the harness passes this config and the XML must not move.
  it("reproduces the built-ins when the config carries the seeded values", () => {
    const cfg = withTypes([
      { code: "SAMPLE", width: 220, height: 200 },
      { code: "FQ", width: 670, height: 480 },
      { code: "TEA_TOWEL", width: 700, height: 500 },
    ]);
    for (const key of Object.keys(BUILT_IN)) {
      expect(dims(key, { shopConfig: cfg })).toEqual(BUILT_IN[key]);
    }
  });
});

describe("parsePrintFileName shopConfig — a malformed config degrades, never throws", () => {
  // The profile is a free-form JSON blob in one column. Every wrong shape has to land on the
  // built-in rather than on NaN or an exception: this value reaches <Width> in the XML.
  it("falls back when productTypes is missing or not an array", () => {
    for (const bad of [{}, withTypes(undefined), withTypes(null), withTypes("FQ"), withTypes(42), withTypes({ FQ: {} })]) {
      expect(dims("FQ", { shopConfig: bad })).toEqual(BUILT_IN.FQ);
    }
  });

  it("falls back when no record matches the code", () => {
    expect(dims("FQ", { shopConfig: withTypes([{ code: "SAMPLE", width: 1, height: 2 }]) })).toEqual(BUILT_IN.FQ);
    expect(dims("FQ", { shopConfig: withTypes([]) })).toEqual(BUILT_IN.FQ);
  });

  // Exact match, not case-insensitive: the print type code is a parser-level enum, and a
  // profile that spells it differently is a profile that does not configure this type.
  it("matches the code exactly", () => {
    expect(dims("FQ", { shopConfig: withTypes([{ code: "fq", width: 1, height: 2 }]) })).toEqual(BUILT_IN.FQ);
    expect(dims("FQ", { shopConfig: withTypes([{ code: " FQ", width: 1, height: 2 }]) })).toEqual(BUILT_IN.FQ);
  });

  it("falls back when width is missing or not a finite number", () => {
    for (const w of [undefined, null, "670", NaN, Infinity, {}]) {
      expect(dims("FQ", { shopConfig: withTypes([{ code: "FQ", width: w, height: 480 }]) })).toEqual(BUILT_IN.FQ);
    }
  });

  it("falls back when height is missing or not a finite number", () => {
    for (const h of [undefined, null, "480", NaN, Infinity, {}]) {
      expect(dims("FQ", { shopConfig: withTypes([{ code: "FQ", width: 670, height: h }]) })).toEqual(BUILT_IN.FQ);
    }
  });

  it("skips non-object entries without throwing", () => {
    const cfg = withTypes([null, "FQ", 7, ["FQ"], { code: "FQ", width: 333, height: 444 }]);
    expect(dims("FQ", { shopConfig: cfg })).toEqual({ width: 333, height: 444 });
  });

  // A malformed record for the asked code must not block a later valid one - otherwise one
  // bad row would silently pin the whole type to the built-in.
  it("falls through a malformed record to a later valid one for the same code", () => {
    const cfg = withTypes([
      { code: "FQ", width: "670", height: 480 },
      { code: "FQ", width: 333, height: 444 },
    ]);
    expect(dims("FQ", { shopConfig: cfg })).toEqual({ width: 333, height: 444 });
  });

  it("reads the productTypes key, not a neighbouring one", () => {
    expect(dims("FQ", { shopConfig: { types: [{ code: "FQ", width: 1, height: 2 }] } })).toEqual(BUILT_IN.FQ);
  });
});

describe("parsePrintFileName shopConfig — scope of the argument", () => {
  // LM width comes from the fabric cache (mocked to 1420 above), not from productTypes. A
  // config that names LM must not reach it: that would silently move an unrelated path.
  it("does not let productTypes override the LM width", () => {
    const lm = `ON312819_Beata_Kowalska_1of1_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`;
    const cfg = withTypes([{ code: "LM", width: 999, height: 888 }]);
    const out = parsePrintFileName(lm, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${lm}`, shopConfig: cfg });
    expect(out.printTypeCode).toBe("LM");
    expect(out.width).toBe(1420);
  });

  // The argument must not disturb the rest of the parse. Diagnostic guard: it has no corpse
  // of its own and is kept deliberately, because when the resolver breaks in a way that
  // corrupts the output object, this is the test that says the damage is wider than dims.
  it("leaves every other parsed field alone", () => {
    const cfg = withTypes([{ code: "FQ", width: 333, height: 444 }]);
    const withCfg = parse("FQ", { shopConfig: cfg });
    const without = parse("FQ");
    for (const key of ["orderId", "customerName", "material", "qty", "printTypeCode", "artworkId", "status"]) {
      expect(withCfg[key]).toEqual(without[key]);
    }
  });
});
