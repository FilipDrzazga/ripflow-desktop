import { getAllFabrics } from "./db.js";
import { getProfile } from "./shopProfile.js";
import { estimateConfigFrom } from "../../shared/classGlobals.js";

// null = not loaded (DB unreadable); array = loaded (empty only when the table is empty)
let cachedFabrics = null;

export const loadFabricCache = () => {
  try {
    cachedFabrics = getAllFabrics();
  } catch (err) {
    console.error("[fabricCache] loadFabricCache failed:", err);
    cachedFabrics = null;
  }
};

export const invalidateFabricCache = () => {
  cachedFabrics = null;
};

export const getCachedFabrics = () => cachedFabrics ?? [];

// Config for estimatePrintLength: the class numbers plus the catalog, or null when the
// catalog is not loaded (never { fabrics: [] } - rule 23). Since ETAP 2g-3b the class numbers
// come from the shop profile's materialClasses (their owner since profile v3), not from
// fabric_globals - estimateConfigFrom (src/shared/classGlobals.js), the SAME function the
// renderer builds store.fabricConfig with. No profile -> no numbers -> the estimator uses the
// class constants of printWidths.js for each of them (the seed's own values).
export const getEstimateConfig = () => estimateConfigFrom(cachedFabrics, getProfile());

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
// disagreed on five of his own 132 fabrics (BUG 4 - see "Print Widths — Hardcoded vs
// DB" in .claude/rules/print-xml.md).
// The class also has ONE home now - fabrics.type - instead of being re-derived by the
// caller from a list this module knew nothing about.
export const getXmlWidthFromCache = (name) => {
  const f = getFabricByName(name);
  return f ? f.xmlWidth : null;
};
