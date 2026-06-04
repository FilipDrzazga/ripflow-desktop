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

export const getXmlWidthFromCache = (name, isPoly) => {
  const f = getFabricByName(name);
  if (f) return f.xmlWidth;
  const g = getCachedGlobals();
  return isPoly ? (g.defaultXmlWidthPoly ?? 1420) : (g.defaultXmlWidthCotton ?? 1420);
};
