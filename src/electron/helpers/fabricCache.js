import { getAllFabrics, getFabricGlobals } from "./db.js";
import { DEFAULT_FABRIC_GLOBALS } from "./defaultFabrics.js";

// null = not yet loaded; array = loaded (may be empty if DB unavailable)
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
  const g = getCachedGlobals();
  return isPoly ? (g.defaultXmlWidthPoly ?? 1420) : (g.defaultXmlWidthCotton ?? 1420);
};
