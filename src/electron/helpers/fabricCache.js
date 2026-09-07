import { getAllFabrics, getFabricGlobals } from "./db.js";
import { DEFAULT_FABRIC_GLOBALS } from "./defaultFabrics.js";

// null = not loaded (DB unreadable); array = loaded (empty only when the table is empty)
let cachedFabrics = null;
let cachedGlobals = null;

export const loadFabricCache = () => {
  try {
    cachedFabrics = getAllFabrics();
    cachedGlobals = getFabricGlobals();
  } catch (err) {
    console.error("[fabricCache] loadFabricCache failed:", err);
    cachedFabrics = null;
    cachedGlobals = null;
  }
};

export const invalidateFabricCache = () => {
  cachedFabrics = null;
  cachedGlobals = null;
};

export const getCachedFabrics = () => cachedFabrics ?? [];

export const getCachedGlobals = () => cachedGlobals ?? { ...DEFAULT_FABRIC_GLOBALS };

// Config for estimatePrintLength: the DB-backed globals plus the catalog, or null when
// the cache is not loaded. Deliberately null and NOT { fabrics: [] } - an empty array is
// truthy, so the estimator would enter its DB branch with an empty catalog and lose the
// static per-material roll widths. null keeps it on the printWidths.js fallbacks.
export const getEstimateConfig = () =>
  cachedFabrics === null ? null : { globals: getCachedGlobals(), fabrics: cachedFabrics };

export const getFabricByName = (name) => {
  if (cachedFabrics === null) return null;
  return cachedFabrics.find((f) => f.name === name) ?? null;
};

// Returns "Cottons" | "Polyesters" | null (null = cache not loaded)
export const getFabricTypeFromCache = (name) => {
  if (cachedFabrics === null) return null;
  const f = cachedFabrics.find((fab) => fab.name === name);
  return f ? f.type : "Unknown";
};

// Single gate that strips any character illegal in a Windows folder name / XML
// path member. Keeps sanitization at the point of use so dirty aliases entering
// via setAllFabrics/import or a hand-edited ripflow.db can never reach the path.
const sanitizeAlias = (s) => (s ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");

// Returns the sanitized path alias for a material, or null when the cache is not
// loaded, the material is unknown, or no (usable) alias is set.
export const getAliasFromCache = (name) => {
  const f = getFabricByName(name);
  const alias = sanitizeAlias(f?.alias);
  return alias ? alias : null;
};

// The XML width of one fabric, or null when the catalogue cannot answer.
//
// null means exactly one thing: we do not know. Both "the catalogue is not loaded" and
// "this fabric is not in it" collapse here on purpose - neither gives a width, and a
// caller that has no width must not print. Telling those two apart is the operator
// message's job, not this function's.
//
// It used to take an isPoly flag from the caller and, failing a hit, answer with the
// class default (or with Alex's static per-material map). Both are gone. The flag was
// computed in parseFileName.js from a hardcoded Set of Alex's polyester names, so an
// unknown fabric got a width derived from another shop's catalogue, and the two paths
// disagreed on five of his own 132 fabrics (see the BUG 4 section in CLAUDE.md).
// The class also has ONE home now - fabrics.type - instead of being re-derived by the
// caller from a list this module knew nothing about.
export const getXmlWidthFromCache = (name) => {
  const f = getFabricByName(name);
  return f ? f.xmlWidth : null;
};
