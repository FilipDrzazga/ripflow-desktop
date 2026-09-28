import fs from "fs";
import path from "path";
import { getRootPath } from "../helpers/getRootPath.js";

// ETAP 4 (4-inbox): the LIGHT look at the inbox behind "N new files - click to refresh". Every
// 30 s the Print view asks main which PDF names are in the inbox folders, to tell the operator
// that something arrived (or left) without refreshing the list for them - a refresh clears the
// selection and reorders the list under their hands.
//
// Names only: one readdir of the root and one per folder - no stat, no reading of the PDF, no
// parsing, so it stays cheap over SMB. fs.watch is not an option: on a share it does not see files
// written by other computers (CLAUDE.md, dev sandbox note). The ids use the same shape readFolders
// gives its items, `${folder}_${file}`, so the renderer can compare them with the loaded list.
// The same folders as readFolders: every directory directly under the root.
//
// { success: true, ids: string[] } | { success: false, error } - the caller shows "Can't check
// the inbox", never "nothing new" (a failed look is not an empty inbox).

export const peekInbox = async ({ root = getRootPath, fsp = fs.promises } = {}) => {
  try {
    const rootPath = root();
    const entries = await fsp.readdir(rootPath, { withFileTypes: true });
    const ids = [];
    for (const folder of entries) {
      if (!folder.isDirectory()) continue;
      let files;
      try {
        files = await fsp.readdir(path.join(rootPath, folder.name), { withFileTypes: true });
      } catch {
        continue; // a folder that vanished or cannot be read: readFolders skips it as well
      }
      for (const f of files) if (f.isFile() && /\.pdf$/i.test(f.name)) ids.push(`${folder.name}_${f.name}`);
    }
    return { success: true, ids };
  } catch (err) {
    return { success: false, error: err?.message ?? String(err) };
  }
};
