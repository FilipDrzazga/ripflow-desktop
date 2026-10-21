// Etsy's "Fabric" variation -> a row of the shared Fabrics catalogue (plan E3b, round 4).
//
// Etsy spells a material its own way ("3 Pass Blackout FR", "Crepe De Chine"), the catalogue another
// ("3-Pass Blackout FR", "Crepe de Chine"). Two steps, never a guess:
//   1. the table etsy_fabric_map (shared DB, rule 16) - the pairs that differ by more than spelling;
//   2. the same name once case, spaces and punctuation are ignored - only when exactly ONE Fabrics row has it.
// Anything else is no match: the import records the item for a person, it never picks the nearest name.

// "3 Pass Blackout FR" and "3-Pass Blackout FR" -> "3passblackoutfr". Accents are dropped (NFKD + the
// combining-mark block, written as escapes), everything that is not a letter or digit goes.
export const etsyKey = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// The seven pairs of plan round 4 that are more than a spelling (FILIP 2026-10-21: "masz racje co do
// wszystkich"), as [Etsy name, Fabrics name]. Written into etsy_fabric_map ONLY by the start that creates
// the table, and only a pair whose Fabrics name is in `fabrics` to the character (db.js) - on another
// shop's database it seeds nothing, and a pair the shop deleted later does not come back.
export const ETSY_FABRIC_SEED = Object.freeze([
  ["Calico Cotton Plain", "Calico Plain Cotton"],
  ["Organic Interlock", "Organic Jersey Interlock"],
  ["GOTS Organic Panama", "Organic Panama Natural"],
  ["Eco Lycra", "Recycled Eco Lycra"],
  ["Eco French Terry", "Stretch Lycra French Terry"],
  ["Canvas", "Cora Canvas"],
  ["Cuddle Fleece", "Eco Fleece"],
]);

// -> { fabric } (a row of `fabrics`) or { reason }.
//   etsyValue: the variation's value as Etsy sent it
//   map:       [{ etsyKey, fabricName }] (getEtsyFabricMap)
//   fabrics:   [{ name, ... }] (getAllFabrics)
export const resolveEtsyFabric = (etsyValue, { map, fabrics }) => {
  const key = etsyKey(etsyValue);
  if (!key) return { reason: "The Fabric variation of the order is empty." };
  const list = Array.isArray(fabrics) ? fabrics : [];

  const mapped = (Array.isArray(map) ? map : []).find((row) => row.etsyKey === key);
  if (mapped) {
    const fabric = list.find((f) => f.name === mapped.fabricName);
    return fabric
      ? { fabric }
      : { reason: `Etsy fabric "${etsyValue}" is mapped to "${mapped.fabricName}", which is not in Fabrics.` };
  }

  const same = list.filter((f) => etsyKey(f.name) === key);
  if (same.length === 1) return { fabric: same[0] };
  if (same.length > 1) {
    return { reason: `Etsy fabric "${etsyValue}" matches ${same.length} Fabrics rows (${same.map((f) => f.name).join(", ")}) - add it to the Etsy -> Fabrics table.` };
  }
  return { reason: `Etsy fabric "${etsyValue}" is not in Fabrics and not in the Etsy -> Fabrics table.` };
};
