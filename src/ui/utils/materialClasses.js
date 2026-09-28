// The shop's material classes for the UI (ETAP 4, 4-types-b). The NAMES come from the shop
// profile (materialClasses[].name, profile order): a client that calls its classes "Cotton" /
// "Poly" sees those words on every tab, badge and filter, and they are the same strings the
// catalogue's fabrics.type and every file's materialType carry.
//
// The LOOK of a class comes from its SLOT - the first class gets what "Cottons" always had
// (leaf icon, green / blue), the second what "Polyesters" had (polygon, blue / violet). There are
// two slots on purpose: a third class is frozen in PRODUCTIZATION until client #2. On Alex's
// profile slot 0 = Cottons and slot 1 = Polyesters, so his screens do not change.
//
// No profile (unreadable, not loaded) -> no classes: the tabs and sections that need them are
// not drawn, never guessed from another shop's names (rule 24). Pure: carries a test.

export const MATERIAL_CLASS_SLOTS = 2;

// Unique, non-empty names in profile order, at most MATERIAL_CLASS_SLOTS.
export const materialClassNames = (profile) => {
  const list = Array.isArray(profile?.materialClasses) ? profile.materialClasses : [];
  const out = [];
  for (const cls of list) {
    const name = typeof cls?.name === "string" ? cls.name.trim() : "";
    if (name === "" || out.includes(name)) continue;
    out.push(name);
    if (out.length === MATERIAL_CLASS_SLOTS) break;
  }
  return out;
};

// Each class name joined with the look of its slot: [{ name, slot, ...slotLooks[slot] }].
export const withSlotLooks = (profile, slotLooks) =>
  materialClassNames(profile).map((name, slot) => ({ name, slot, ...(slotLooks[slot] ?? {}) }));

// The slot of one class name, or -1 (not a class of this profile - "Unknown" included).
export const materialClassSlot = (profile, name) => materialClassNames(profile).indexOf(name);
