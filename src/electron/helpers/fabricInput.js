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

// The printer of the profile a code names, ignoring case - the way getPrinterByCode (shopProfile.js)
// reads a code, so a code that routes a job is also a code a fabric may prefer. `printers` is passed
// in (not read from the cache) for the same reason as in fabricSaveError.
const printerByCode = (printers, code) => {
  const wanted = code.toUpperCase();
  return (Array.isArray(printers) ? printers : []).find((pr) => typeof pr?.code === "string" && pr.code.toUpperCase() === wanted);
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
  const printer = printerByCode(printers, preferred);
  if (!printer) {
    return `Preferred printer "${preferred}" is not a printer in the shop profile. Choose another one, or none.`;
  }
  if (printer.materialClass !== fabric.type) {
    return `Preferred printer ${printer.code} prints ${printer.materialClass}, not ${fabric.type}. Choose a printer of the fabric's class, or none.`;
  }
  return null;
};

// The fabric as it is STORED: a preferred printer written the way the profile spells it ("yoko" ->
// "YOKO"). fabricSaveError accepts any case, but Print and Settings compare the stored code with
// the profile's own (preferredPrinterState, preferredPrinterForItem), so a "yoko" kept as typed
// would be read as stale. Call it after fabricSaveError passed; a fabric with no code to fix
// (none, cleared, not sent) comes back as the same object.
export const withProfilePrinterCode = (fabric, printers) => {
  const preferred = fabric?.preferredPrinter;
  if (typeof preferred !== "string" || preferred === "") return fabric;
  const printer = printerByCode(printers, preferred);
  return printer && printer.code !== preferred ? { ...fabric, preferredPrinter: printer.code } : fabric;
};

// fabrics:save as an ADD (D9): the Add form sends no oldName, and a name that already has a row
// would overwrite it (INSERT OR REPLACE) - every field of the old material gone, silently. An edit
// (oldName) is not checked here. `existing` = the catalogue (getAllFabrics: null when it cannot be
// read - the write fails by itself then). Names compare exactly, like the primary key.
export const fabricAddError = (oldName, fabric, existing) => {
  if (oldName) return null;
  if (!Array.isArray(existing) || !existing.some((f) => f?.name === fabric?.name)) return null;
  return `A material named "${fabric.name}" already exists. Edit that one instead, or choose another name.`;
};

// The preferred printer a write stores. undefined = the caller did not send the field (a JSON
// exported before the column existed, a renderer that dropped it): KEEP what the row has, so a
// save or an import never clears a preference nobody touched. null or "" = cleared on purpose.
export const preferredPrinterToStore = (given, existing) => {
  if (given === undefined) return existing ?? null;
  return given || null;
};
