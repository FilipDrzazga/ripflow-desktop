import { getAllFabrics, getFabricGlobals } from "./db.js";
import { DEFAULT_FABRIC_GLOBALS } from "./defaultFabrics.js";
import { LM_XML_COTTON } from "../../shared/printWidths.js";

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

export const getXmlWidthFromCache = (name, isPoly) => {
  const f = getFabricByName(name);
  if (f) return f.xmlWidth;
  // Cache not loaded (DB unreadable): fall back to the static per-material map, the same
  // way getMaterialType falls back to its static sets. Looked up regardless of isPoly,
  // mirroring the by-name lookup this replaces. Poly has no per-material map — every poly
  // entry carries LM_XML_POLY, which is already the global default, so it needs no branch.
  if (cachedFabrics === null) {
    const staticWidth = LM_XML_COTTON[name];
    if (typeof staticWidth === "number") return staticWidth;
  }
  const g = getCachedGlobals();
  return isPoly ? (g.defaultXmlWidthPoly ?? 1420) : (g.defaultXmlWidthCotton ?? 1420);
};
