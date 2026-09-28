import { PRODUCTION_STAGE } from "../../shared/constants.js";
import { isFolderName } from "../../shared/folderName.js";
import { isHexColor } from "../../shared/hexColor.js";

// Validates a shop profile before it may replace the stored one (ETAP 3-2, used by the import in
// 3-3). Pure, and it imports only from src/shared: the import orchestrator can then be tested
// with db.js mocked and nothing else, and the rules carry their own tests.
//
// Returns { ok, errors } - ALL errors, not the first one. The file is prepared by hand at
// onboarding; fixing it one error per import attempt would be the slow way to learn the list.
// Each error names its place ("printers[1].code: ...") so it can be found in the file.
//
// The readers of the profile (shopProfile.js, shopProfileData.js, parseFileName.js) stay
// lenient on purpose - they degrade on a bad row. This is the one place that is strict, because
// it is the one place that can stop a bad profile before an operator meets it.
//
// schemaVersion is checked FIRST and alone: the rest describes one shape, and a file of another
// version would only produce a screen of errors that say nothing. The caller passes the version
// this build writes (PROFILE_SCHEMA_VERSION) - kept out of the imports so this stays shared-only.

// The oldest version an exported file can carry: export ships with ETAP 3, at v3. An older file
// could only be hand-made, and migrating it up would take the class numbers from this database's
// seed - another shop's numbers (FILIP 2026-09-28, ODP 25).
export const MIN_IMPORT_SCHEMA_VERSION = 3;

// Printer codes end up in batch folder names, PRINTED_hhmmss-GROUP-CODE[_n]
// (src/shared/batchFolderName.js): a dash or an underscore in a code breaks parsing it back.
// Upper case only, because getPrinterByCode and the renderer upper-case the code they compare.
const PRINTER_CODE_RE = /^[A-Z0-9]+$/;

// A Shopify store handle as it appears in admin.shopify.com/store/<handle>.
const STORE_HANDLE_RE = /^[a-z0-9][a-z0-9-]*$/;

// The product codes parseFileName.js resolves through productTypes (resolveProductDims). A code
// outside this list would be a row nobody reads (new codes need a parser of their own - ETAP 5).
// Since ETAP 4 (4-types-d) the profile lists the SUBSET the shop makes: a missing code is a type
// this shop does not have, and parseFileName refuses such a file (4-types-e).
export const PRODUCT_TYPE_CODES = ["SAMPLE", "FQ", "TEA_TOWEL"];

export const FEATURE_FLAGS = ["customOrders", "analytics", "ripErrors", "labelPrinting", "shopify", "sewing"];

export const MAX_SEWING_COMPANY_LENGTH = 40;

// Two class slots in the UI (materialClasses.js); a third class is frozen until client #2.
export const MAX_MATERIAL_CLASSES = 2;

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "printers",
  "materialClasses",
  "productTypes",
  "folders",
  "scanRules",
  "sewingCompanies",
  "integrations",
  "features",
];
// Allowed but optional (v4, 4-types-c): an exported row always carries it (the migration writes
// it), a hand-made file without it means "not configured" - an error only when the feature is on.
const OPTIONAL_TOP_LEVEL_KEYS = ["customOrders"];
const CUSTOM_ORDER_KEYS = ["materialClass"];
const PRINTER_KEYS = ["code", "materialClass", "hotfolder", "color"];
const CLASS_RECORD_KEYS = ["name", "margin", "defaultRollWidth"];
const PRODUCT_TYPE_KEYS = ["code", "width", "height"];
const FOLDER_KEYS = ["printed", "ripError", "customOrder"];
const SCAN_RULE_KEYS = ["role", "from", "to", "notifyWhenEmpty"];
const STAGES = Object.values(PRODUCTION_STAGE);

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const show = (v) => JSON.stringify(v) ?? String(v);

export const validateShopProfile = (profile, { schemaVersion } = {}) => {
  const errors = [];
  const err = (msg) => errors.push(msg);

  if (!isPlainObject(profile)) return { ok: false, errors: ["The profile must be a JSON object."] };

  // ── schemaVersion, alone ─────────────────────────────────────────────────
  const v = profile.schemaVersion;
  if (!Number.isInteger(v)) {
    return { ok: false, errors: [`schemaVersion: must be an integer (got ${show(v)}).`] };
  }
  if (v > schemaVersion) {
    return {
      ok: false,
      errors: [`schemaVersion: ${v} is newer than this version of RipFlow understands (${schemaVersion}) - update RipFlow first.`],
    };
  }
  if (v < MIN_IMPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`schemaVersion: ${v} is older than any exported profile (${MIN_IMPORT_SCHEMA_VERSION}) - export the profile again from a current RipFlow.`],
    };
  }
  if (v !== schemaVersion) {
    // An exported file between the minimum and this build is migrated up by the caller before it
    // gets here; reaching this line is a wiring error, not a bad file.
    return { ok: false, errors: [`schemaVersion: ${v} must be migrated to ${schemaVersion} before validation.`] };
  }

  // ── keys ─────────────────────────────────────────────────────────────────
  // An unknown key is refused, not ignored: it would sit in the shared row with no reader
  // (rule 24), and it is usually a typo of a key that is then missing.
  const onlyKeys = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(`${where}: unknown key "${k}".`);
  };
  onlyKeys(profile, [...TOP_LEVEL_KEYS, ...OPTIONAL_TOP_LEVEL_KEYS], "profile");
  for (const k of TOP_LEVEL_KEYS) if (!(k in profile)) err(`profile: missing key "${k}".`);

  // ── materialClasses (first: printers refer to them) ──────────────────────
  const classNames = new Set();
  if (!Array.isArray(profile.materialClasses) || profile.materialClasses.length === 0) {
    if ("materialClasses" in profile) err("materialClasses: must be a non-empty list.");
  } else {
    // One or two classes, named by the shop (ETAP 4, 4-types-d): the estimator, the editor, the
    // tabs and badges all work by class NAME now (4-types-a/b). Two slots - a third class is frozen
    // in PRODUCTIZATION until client #2. The name goes to PrintFactory as <MaterialType> and must
    // match the shop's own PrintFactory setup; "Unknown" is taken - it is what getMaterialType
    // answers for a fabric outside the catalogue, and the Inbox card's row for such files.
    if (profile.materialClasses.length > MAX_MATERIAL_CLASSES) {
      err(`materialClasses: at most ${MAX_MATERIAL_CLASSES} classes (got ${profile.materialClasses.length}).`);
    }
    profile.materialClasses.forEach((c, i) => {
      const at = `materialClasses[${i}]`;
      if (!isPlainObject(c)) return err(`${at}: must be an object.`);
      onlyKeys(c, CLASS_RECORD_KEYS, at);
      if (!isText(c.name) || c.name !== c.name.trim()) {
        err(`${at}.name: must be a name without outer spaces (got ${show(c.name)}).`);
      } else if (c.name.toLowerCase() === "unknown") {
        err(`${at}.name: "${c.name}" is reserved - it is the class of a fabric outside the catalogue.`);
      } else if (classNames.has(c.name)) err(`${at}.name: "${c.name}" is listed twice.`);
      else classNames.add(c.name);
      if (!Number.isFinite(c.margin) || c.margin < 0) err(`${at}.margin: must be a number >= 0 (got ${show(c.margin)}).`);
      if (!Number.isFinite(c.defaultRollWidth) || c.defaultRollWidth <= 0) {
        err(`${at}.defaultRollWidth: must be a number > 0 (got ${show(c.defaultRollWidth)}).`);
      }
    });
  }

  // ── printers ─────────────────────────────────────────────────────────────
  if (!Array.isArray(profile.printers) || profile.printers.length === 0) {
    if ("printers" in profile) err("printers: must be a non-empty list - without a printer nothing can be printed.");
  } else {
    const codes = new Set();
    profile.printers.forEach((p, i) => {
      const at = `printers[${i}]`;
      if (!isPlainObject(p)) return err(`${at}: must be an object.`);
      onlyKeys(p, PRINTER_KEYS, at);
      if (typeof p.code !== "string" || !PRINTER_CODE_RE.test(p.code)) {
        err(`${at}.code: must be capital letters and digits only (got ${show(p.code)}) - it becomes part of the batch folder name.`);
      } else if (codes.has(p.code)) err(`${at}.code: "${p.code}" is listed twice.`);
      else codes.add(p.code);
      if (!isText(p.materialClass)) err(`${at}.materialClass: must be a non-empty text.`);
      else if (!classNames.has(p.materialClass)) err(`${at}.materialClass: "${p.materialClass}" is not in materialClasses.`);
      if (!isFolderName(p.hotfolder)) err(`${at}.hotfolder: must be one folder name - letters, digits, "_" or "-" (got ${show(p.hotfolder)}).`);
      if ("color" in p) {
        if (!isPlainObject(p.color)) err(`${at}.color: must be an object { bg, text }.`);
        else {
          onlyKeys(p.color, ["bg", "text"], `${at}.color`);
          if (!isHexColor(p.color.bg)) err(`${at}.color.bg: must be a hex colour like "#E6F1FB" (got ${show(p.color.bg)}).`);
          if (!isHexColor(p.color.text)) err(`${at}.color.text: must be a hex colour like "#0C447C" (got ${show(p.color.text)}).`);
        }
      }
    });
  }

  // ── productTypes ─────────────────────────────────────────────────────────
  if (!Array.isArray(profile.productTypes)) {
    if ("productTypes" in profile) err("productTypes: must be a list.");
  } else {
    const seen = new Set();
    profile.productTypes.forEach((t, i) => {
      const at = `productTypes[${i}]`;
      if (!isPlainObject(t)) return err(`${at}: must be an object.`);
      onlyKeys(t, PRODUCT_TYPE_KEYS, at);
      if (!PRODUCT_TYPE_CODES.includes(t.code)) err(`${at}.code: must be one of ${PRODUCT_TYPE_CODES.join(", ")} (got ${show(t.code)}).`);
      else if (seen.has(t.code)) err(`${at}.code: "${t.code}" is listed twice.`);
      else seen.add(t.code);
      if (!Number.isFinite(t.width) || t.width <= 0) err(`${at}.width: must be a number > 0 (got ${show(t.width)}).`);
      if (!Number.isFinite(t.height) || t.height <= 0) err(`${at}.height: must be a number > 0 (got ${show(t.height)}).`);
    });
    // A SUBSET is enough since ETAP 4 (4-types-d): a shop without tea towels lists no TEA_TOWEL, and
    // parseFileName refuses such a file (4-types-e) instead of sizing it with another shop's numbers.
  }

  // ── folders ──────────────────────────────────────────────────────────────
  const folders = profile.folders;
  if (!isPlainObject(folders)) {
    if ("folders" in profile) err("folders: must be an object.");
  } else {
    onlyKeys(folders, FOLDER_KEYS, "folders");
    for (const k of FOLDER_KEYS) {
      if (k in folders && !isFolderName(folders[k])) {
        err(`folders.${k}: must be one folder name - letters, digits, "_" or "-" (got ${show(folders[k])}).`);
      }
    }
  }

  // ── scanRules ────────────────────────────────────────────────────────────
  if (!Array.isArray(profile.scanRules)) {
    if ("scanRules" in profile) err("scanRules: must be a list.");
  } else {
    const roles = new Set();
    profile.scanRules.forEach((r, i) => {
      const at = `scanRules[${i}]`;
      if (!isPlainObject(r)) return err(`${at}: must be an object.`);
      onlyKeys(r, SCAN_RULE_KEYS, at);
      if (!isText(r.role)) err(`${at}.role: must be a non-empty text.`);
      else if (roles.has(r.role)) err(`${at}.role: "${r.role}" has two rules - only the first would ever apply.`);
      else roles.add(r.role);
      for (const k of ["from", "to"]) {
        if (!STAGES.includes(r[k])) err(`${at}.${k}: must be one of ${STAGES.join(", ")} (got ${show(r[k])}).`);
      }
      if ("notifyWhenEmpty" in r && typeof r.notifyWhenEmpty !== "boolean") {
        err(`${at}.notifyWhenEmpty: must be true or false (got ${show(r.notifyWhenEmpty)}).`);
      }
    });
  }

  // ── sewingCompanies ──────────────────────────────────────────────────────
  const companies = profile.sewingCompanies;
  if (!Array.isArray(companies)) {
    if ("sewingCompanies" in profile) err("sewingCompanies: must be a list.");
  } else {
    const seen = new Set();
    companies.forEach((name, i) => {
      const at = `sewingCompanies[${i}]`;
      if (!isText(name)) return err(`${at}: must be a non-empty text.`);
      if (name !== name.trim()) err(`${at}: "${name}" has spaces at the start or end.`);
      if (name.trim().length > MAX_SEWING_COMPANY_LENGTH) {
        err(`${at}: longer than ${MAX_SEWING_COMPANY_LENGTH} characters - it is shown on production cards.`);
      }
      const key = name.trim().toLowerCase();
      if (seen.has(key)) err(`${at}: "${name.trim()}" is listed twice.`);
      seen.add(key);
    });
  }

  // ── integrations ─────────────────────────────────────────────────────────
  const integrations = profile.integrations;
  let storeHandle = "";
  if (!isPlainObject(integrations)) {
    if ("integrations" in profile) err("integrations: must be an object.");
  } else {
    onlyKeys(integrations, ["shopify"], "integrations");
    const shopify = integrations.shopify;
    if (!isPlainObject(shopify)) err("integrations.shopify: must be an object { storeHandle }.");
    else {
      onlyKeys(shopify, ["storeHandle"], "integrations.shopify");
      if (typeof shopify.storeHandle !== "string") err("integrations.shopify.storeHandle: must be a text (empty when not used).");
      else if (shopify.storeHandle !== "" && !STORE_HANDLE_RE.test(shopify.storeHandle)) {
        err(`integrations.shopify.storeHandle: must be lower-case letters, digits and "-" (got ${show(shopify.storeHandle)}).`);
      } else storeHandle = shopify.storeHandle;
    }
  }

  // ── features ─────────────────────────────────────────────────────────────
  // Strictly boolean: getFeature reads === true, so "true" or 1 from a hand-edited file would
  // import cleanly and leave the feature silently off.
  const features = profile.features;
  if (!isPlainObject(features)) {
    if ("features" in profile) err("features: must be an object.");
  } else {
    onlyKeys(features, FEATURE_FLAGS, "features");
    for (const f of FEATURE_FLAGS) {
      if (typeof features[f] !== "boolean") err(`features.${f}: must be true or false (got ${show(features[f])}).`);
    }

    // ── consistency: a feature that is on must have what it needs ───────────
    // Otherwise the import passes and the operator finds out: a Shopify menu item that fails on
    // every click, a sewing menu that never appears, a folder the feature cannot find.
    if (features.shopify === true && storeHandle === "") {
      err("features.shopify is on, but integrations.shopify.storeHandle is empty.");
    }
    if (features.sewing === true && Array.isArray(companies) && !companies.some(isText)) {
      err("features.sewing is on, but sewingCompanies is empty.");
    }
    if (features.ripErrors === true && isPlainObject(folders) && !isFolderName(folders.ripError)) {
      err("features.ripErrors is on, but folders.ripError is not set.");
    }
    if (features.customOrders === true && isPlainObject(folders) && !isFolderName(folders.customOrder)) {
      err("features.customOrders is on, but folders.customOrder is not set.");
    }
  }

  // ── customOrders (v4, 4-types-c): the class custom orders are printed in ──
  // null = not configured (custom orders refuse); otherwise one of THIS profile's classes - it
  // goes to PrintFactory as <MaterialType> and picks the printers of that class.
  if (isPlainObject(profile.customOrders)) {
    onlyKeys(profile.customOrders, CUSTOM_ORDER_KEYS, "customOrders");
    const mc = profile.customOrders.materialClass;
    if (mc !== null && !classNames.has(mc)) {
      err(`customOrders.materialClass: must be null or one of the materialClasses names (got ${show(mc)}).`);
    }
  } else if ("customOrders" in profile) err("customOrders: must be an object.");
  // 4-types-d: a shop that turns custom orders on must say which class they are printed in -
  // otherwise every Generate is refused (CUSTOM_ORDER_CLASS_MISSING). A v4 rule: the field exists
  // from v4, and an older file is migrated up before it gets here.
  if (v >= 4 && profile.features?.customOrders === true && !isText(profile.customOrders?.materialClass)) {
    err("features.customOrders is on, but customOrders.materialClass is not set.");
  }

  return { ok: errors.length === 0, errors };
};
