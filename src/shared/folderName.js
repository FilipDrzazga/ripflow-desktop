// ONE folder name under storagePath - the single check for every folder name that comes
// from the shop profile (printers[].hotfolder, folders.*). The profile is a free-form blob
// in a shared DB row, so a separator or ".." in it must not become a path outside that
// root. Moved here from createXML.js in ETAP 2d-2 so the profile's folders.* use the same
// rule instead of a copy; pure, so createXML.js stays importable without db.js.
export const FOLDER_NAME_RE = /^[A-Za-z0-9_-]+$/;

export const isFolderName = (value) => typeof value === "string" && FOLDER_NAME_RE.test(value);
