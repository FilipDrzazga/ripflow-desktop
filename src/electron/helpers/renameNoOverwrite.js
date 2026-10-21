import fs from "node:fs";

// rename that REFUSES to overwrite: a name that is taken is EEXIST, never a silent replace. On Windows a
// plain fs.rename overwrites, which would destroy a full inbox original during a rollback (the PRINTED copy
// of a PDF is page 1 only - rule 19), and would replace a file that is already waiting in the inbox when an
// Etsy import lands on the same name. The one implementation: batchHistoryHandlers and the Etsy import share it.
//
// The check and the rename are two steps, so a file that appears between them is still replaced. Both callers
// work inside a folder only they write to at that moment (a batch folder, or the import's own .tmp name), and
// the answer to the other case is the same as before this was shared.
export const renameNoOverwrite = async (src, dest) => {
  try {
    await fs.promises.access(dest);
    throw Object.assign(new Error(`Destination already exists: ${dest}`), { code: "EEXIST" });
  } catch (e) {
    if (e.code !== "ENOENT") throw e; // ENOENT = the name is free; EEXIST / anything else -> rethrow
  }
  await fs.promises.rename(src, dest);
};
