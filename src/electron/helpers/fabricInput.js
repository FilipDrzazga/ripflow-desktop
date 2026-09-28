// The gate of fabrics:save (ETAP 4, 4-types-b round 2). A fabric row needs a name AND a material
// class: fabrics.type is the class every file of that fabric gets (getMaterialType), and it goes
// to PrintFactory as <MaterialType>. Since the class names come from the shop profile, a station
// with no classes (fresh install before the import, unreadable profile) offered an empty type in
// Settings > Fabrics; saved, it gave every file of that fabric the class "" - neither a class
// nor "Unknown". The Save button is disabled then, but this is the real gate: main refuses.
// Pure: ipc/index.js is unreachable from a test, so the rule lives here.

// null when the fabric may be saved, else the message for the operator.
export const fabricSaveError = (fabric) => {
  if (typeof fabric?.name !== "string" || !fabric.name.trim()) return "Fabric name is required.";
  if (typeof fabric.type !== "string" || !fabric.type.trim()) {
    return "Choose a material class for the fabric. If there is none to choose, the shop profile has no material classes yet - import it in Settings > Shop Profile.";
  }
  return null;
};
