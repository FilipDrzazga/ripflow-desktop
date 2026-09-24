// Reads plain DATA out of a shop profile in the renderer.
//
// Deliberately NOT part of featureVisibility.js: that file answers "is this feature
// visible to this client", this one answers "what does this client's config contain".
// They diverge as soon as ETAP 2e lands printers here — a printer list is data, not a
// gate, and mixing the two would make one file own both questions.
//
// It is a module of pure functions for one reason: the renderer's profile gates have no
// standing guard (the rendering harness was rejected in 50f64c8), and a pure function is
// the only shape of this cut that can carry a test at all. Same reasoning as
// featureVisibility.js.

// The sewing companies this shop dispatches to, as a clean list of names.
//
// Mirrors getPrinters in electron/helpers/shopProfile.js, including its shape
// check: the profile is a free-form JSON blob in a single column, so a hand-edited or
// half-imported row can carry anything under this key.
//
// Returns [] and never null. That is the documented exception to the null-sentinel
// discipline used elsewhere for the profile: this is a LIST, so an empty array is a
// legal answer meaning "this shop has no sewing companies", and every caller has to
// handle that case regardless. It is the same call getAllFabrics makes.
//
// Fail-closed on every unknown shape — an unreadable profile (null) yields no companies
// rather than a guessed default, because a wrong sewing company is a parcel sent to the
// wrong address.
export const getSewingCompanies = (profile) => {
  // null / undefined = the profile could not be read. We know nothing, so we offer nothing.
  if (!profile) return [];
  const list = profile.sewingCompanies;
  if (!Array.isArray(list)) return [];
  return list
    .filter((name) => typeof name === "string" && name.trim() !== "")
    .map((name) => name.trim());
};

// What a barcode scan does at a station with this workstationRole, or null when it does
// nothing. The role itself stays per-machine in electron-store: the profile carries the
// RULES, the station carries its identity. That split is why this takes `role` as an
// argument rather than reading it.
//
// Returns the rule object or null. Unlike getSewingCompanies above this reads a SINGLE
// record, so it has no spare value for "legitimately empty" — null already means "no rule
// for this role", the same reasoning db.getShopProfile follows.
//
// Fail-closed on every unknown shape, and here that is heavier than in the other profile
// readers: this is the first one wired to the operator's physical input. A malformed rule
// must degrade to "the scan only filters the view", never to a guessed stage transition —
// a wrong `to` would move real files through the shop's pipeline on nobody's authority.
//
// FIRST MATCH WINS, as a decision rather than as the incidental behaviour of .find(). The
// profile is a free-form blob, so two rows can carry the same role; taking the first makes
// that resolvable by reading the array top to bottom, where a last-wins or merged rule
// would depend on knowing this function.
export const getScanRule = (profile, role) => {
  // null / undefined = the profile could not be read. We know nothing, so we move nothing.
  if (!profile) return null;
  // An empty role is the default station: it has never had a rule and must not match one.
  if (typeof role !== "string" || role === "") return null;
  const rules = profile.scanRules;
  if (!Array.isArray(rules)) return null;

  const isStage = (v) => typeof v === "string" && v.trim() !== "";
  const rule = rules.find(
    (r) => r && typeof r === "object" && r.role === role && isStage(r.from) && isStage(r.to),
  );
  if (!rule) return null;

  // Only a literal false silences a station, and that is the ONLY route to silence.
  //
  // This deliberately does NOT mirror getFeature, though it looks like it should. There,
  // strict === true is fail-closed because the closed direction is "withhold a feature".
  // Here the same direction means "say nothing", and silence on the scanner is the exact
  // risk this cut exists to close: an operator cannot tell a batch that had nothing to
  // advance from a reader that did not fire. So a value mangled by an import — 1, "true",
  // "false", null — resolves to warning, not to quiet. Quiet has to be asked for.
  return {
    role: rule.role,
    from: rule.from.trim(),
    to: rule.to.trim(),
    notifyWhenEmpty: rule.notifyWhenEmpty !== false,
  };
};

// The printers this shop can print on, as clean { code, materialClass } rows (ETAP 2e
// step 3 - the renderer lists used to come from the PRINTER constant).
//
// A LIST, so [] and never null, like getSewingCompanies: [] means "no printer to offer",
// and the print view says why (an unreadable profile vs. no printer for the class).
// Shape-checked per row because the profile is a free-form blob: a row without a usable
// code or class is dropped, not guessed. The code is upper-cased and must look like the
// codes batch folders carry (letters and digits, src/shared/batchFolderName.js), so a
// row the main process could never route or parse back is never offered. Order is the
// profile's, first occurrence of a code wins.
const PRINTER_CODE_RE = /^[A-Za-z0-9]+$/;

// The usable printers[] rows, in profile order, first occurrence of a code wins - shared
// by getPrinters and getPrinterColor so a row is either valid for both or for neither.
const usablePrinterRows = (profile) => {
  // null / undefined = the profile could not be read. We know nothing, so we offer nothing.
  if (!profile) return [];
  const list = profile.printers;
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const code = typeof p.code === "string" ? p.code.trim() : "";
    const materialClass = typeof p.materialClass === "string" ? p.materialClass.trim() : "";
    if (!PRINTER_CODE_RE.test(code) || materialClass === "") continue;
    const upper = code.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push({ code: upper, materialClass, color: p.color });
  }
  return out;
};

export const getPrinters = (profile) =>
  usablePrinterRows(profile).map(({ code, materialClass }) => ({ code, materialClass }));

// A printer's badge colours from the profile (ETAP 2e step 4 - they used to be the
// PRINTER_COLORS constant), in the shape the components use: { bg, color }. The profile
// stores the text colour as `text`. null when the printer is unknown or its colours are
// not both hex values - each component keeps its OWN grey fallback, so an unknown printer
// looks exactly as it did before this step. Hex only: the value goes into a style object,
// and a profile edited by hand must not be able to put anything else there.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
export const getPrinterColor = (profile, code) => {
  if (typeof code !== "string" || code === "") return null;
  const want = code.trim().toUpperCase();
  const row = usablePrinterRows(profile).find((r) => r.code === want);
  const c = row?.color;
  if (!c || typeof c !== "object" || !HEX_COLOR_RE.test(c.bg) || !HEX_COLOR_RE.test(c.text)) return null;
  return { bg: c.bg, color: c.text };
};

// A material class borrows the colours of its FIRST printer in the profile (Analytics
// badges). Before this step it was hardwired: Cottons -> DGEN, Polyesters -> YOKO - which
// is exactly what this answers on Alex's profile. null when the class has no printer.
export const getMaterialClassColor = (profile, materialClass) => {
  const first = usablePrinterRows(profile).find((r) => r.materialClass === materialClass);
  return first ? getPrinterColor(profile, first.code) : null;
};

// The printer the print view pre-selects for a material class: the ONLY printer of that
// class, or null when there are none or several (the operator chooses). For Alex's seed
// that is exactly the old hardcoded rule - Cottons -> DGEN, Polyesters -> no default.
export const defaultPrinterFor = (printers, materialClass) => {
  if (!Array.isArray(printers) || typeof materialClass !== "string" || materialClass === "") return null;
  const ofClass = printers.filter((p) => p?.materialClass === materialClass);
  return ofClass.length === 1 ? ofClass[0].code : null;
};
