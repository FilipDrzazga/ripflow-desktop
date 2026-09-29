// The gate of fabrics:save (ETAP 4, 4-types-b round 2). A fabric row needs a name AND a material
// class: fabrics.type is the class every file of that fabric gets (getMaterialType), and it goes
// to PrintFactory as <MaterialType>. Since the class names come from the shop profile, a station
// with no classes (fresh install before the import, unreadable profile) offered an empty type in
// Settings > Fabrics; saved, it gave every file of that fabric the class "" - neither a class
// nor "Unknown". The Save button is disabled then, but this is the real gate: main refuses.
// Pure: ipc/index.js is unreachable from a test, so the rule lives here.

// fabrics:setAll (the whole catalogue at once, 4-types-d): the same gate per row. The FIRST bad
// row refuses the whole list - setAll replaces the catalogue, and half of one is worse than the old
// one - and the message names the row (1-based, as a person counts) and the fabric.
export const fabricListError = (fabrics, printers) => {
  if (!Array.isArray(fabrics)) return "Fabrics must be an array.";
  for (let i = 0; i < fabrics.length; i++) {
    const error = fabricSaveError(fabrics[i], printers);
    if (error) {
      const name = typeof fabrics[i]?.name === "string" && fabrics[i].name.trim() ? ` ("${fabrics[i].name.trim()}")` : "";
      return `Row ${i + 1}${name}: ${error} Nothing was saved.`;
    }
  }
  return null;
};

// null when the fabric may be saved, else the message for the operator.
// `printers` = the shop profile's printers[] (getPrinters(): [] with no readable profile). Only
// read when the fabric names a preferred printer, which must be a printer of the fabric's OWN
// class: a Polyesters fabric preferring DGEN would pre-select a printer the selection bar keeps
// disabled for that class, i.e. a suggestion nobody can follow.
export const fabricSaveError = (fabric, printers) => {
  if (typeof fabric?.name !== "string" || !fabric.name.trim()) return "Fabric name is required.";
  if (typeof fabric.type !== "string" || !fabric.type.trim()) {
    return "Choose a material class for the fabric. If there is none to choose, the shop profile has no material classes yet - import it in Settings > Shop Profile.";
  }
  const preferred = fabric.preferredPrinter;
  if (preferred === undefined || preferred === null || preferred === "") return null;
  if (typeof preferred !== "string") return "Preferred printer must be a printer code.";
  const printer = (Array.isArray(printers) ? printers : []).find((pr) => pr?.code === preferred);
  if (!printer) {
    return `Preferred printer "${preferred}" is not a printer in the shop profile. Choose another one, or none.`;
  }
  if (printer.materialClass !== fabric.type) {
    return `Preferred printer ${preferred} prints ${printer.materialClass}, not ${fabric.type}. Choose a printer of the fabric's class, or none.`;
  }
  return null;
};

// The preferred printer a write stores. undefined = the caller did not send the field (a JSON
// exported before the column existed, a renderer that dropped it): KEEP what the row has, so a
// save or an import never clears a preference nobody touched. null or "" = cleared on purpose.
export const preferredPrinterToStore = (given, existing) => {
  if (given === undefined) return existing ?? null;
  return given || null;
};
