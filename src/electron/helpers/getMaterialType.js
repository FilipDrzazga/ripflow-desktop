import { getFabricTypeFromCache } from "./fabricCache.js";

const normalize = (s) => (s ?? "").toString().trim();

// The material class of a fabric, or "Unknown".
//
// The catalogue in the DB is the ONLY source. There used to be two hardcoded Sets here -
// 33 cotton and 88 polyester names from Alex's catalogue, 121 unique - consulted whenever
// the cache could not answer. They are gone, and their removal is the point of this cut
// rather than a side effect. Counts measured, not estimated:
// git show <pre-cut sha>:src/electron/helpers/getMaterialType.js | grep -c '^    "'
//
// A guessed class is not a degraded answer, it is a WRONG one at any shop but the one
// the list was copied from: at client #2 a fabric absent from their catalogue would be
// classified by Alex's list, routed to the printer that class implies, and printed on
// the wrong machine. Same shape as the Shopify handle fallback removed in bc68fbe -
// substituting another shop's data instead of admitting we do not know.
//
// "Unknown" is therefore the honest answer for both a fabric outside the catalogue and
// a catalogue that could not be read. The two are told apart where it matters - at the
// point where the operator is blocked (DataPrintSelection) - not here: this function
// returns a class, and "we could not read the DB" is not a class.
export function getMaterialType(material) {
  const m = normalize(material);
  if (!m) return "Unknown";

  // null = cache not loaded; a string = the catalogue answered, "Unknown" included.
  const fromCache = getFabricTypeFromCache(m);
  return fromCache ?? "Unknown";
}
