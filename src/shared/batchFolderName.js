// The ONE reader of a PRINTED batch folder name, for both processes and the golden
// harness: `PRINTED_<hhmmss>-<group>-<PRINTER>`, optionally followed by the collision
// suffix `_<n>` that createBatch.js appends when the folder already exists.
//
// Before ETAP 2e step 1 there were five copies of this parse, each anchoring a hardcoded
// `(DGEN|YOKO|YUMI)` at the END of the name. Two failures followed from that:
//   - a printer outside the three codes produced a folder no copy could read, so the batch
//     simply did not exist in BatchHistory (the hard visibility gate measured on 09-05);
//   - a collision-suffixed folder (`...-DGEN_1`) failed every copy the same way.
// The code is now read from the name's SHAPE, not checked against a list. Which printers
// exist is the shop profile's business (printers[]), and a batch of a printer the profile
// does not know must still be visible - it is work on the floor.
//
// The code is letters and digits only. Excluding "_" is what keeps the collision suffix
// out of it: `DGEN_1` can never become a printer called "DGEN_1".
// It is upper-cased here, at the input, so every consumer compares one form
// (getPrinterByCode is case-insensitive, the PRINTER constants are not).
// The full shape is required, not just "the last segment": temp folders
// (`.tmp-PRINTED_...-<pid>-<ms>`) end in a number that would otherwise read as a code.
// Exported for the BATCH_FOLDER_SKIPPED diagnostic, which records the pattern it failed.
export const BATCH_FOLDER_RE = /^PRINTED_\d{6}-(.+)-([A-Za-z0-9]+)(?:_\d+)?$/;

// { group, printer } for a batch folder name, or null when the name is not one.
export const parseBatchFolderName = (name) => {
  if (typeof name !== "string") return null;
  const m = name.match(BATCH_FOLDER_RE);
  if (!m) return null;
  return { group: m[1], printer: m[2].toUpperCase() };
};

// The printer code of a batch given its folder name OR a full path to it (either slash),
// or null. Callers keep their own fallback ("UNKNOWN" or null) - it differs by consumer.
export const printerOfBatch = (batchPathOrName) => {
  if (typeof batchPathOrName !== "string" || !batchPathOrName) return null;
  const name = batchPathOrName.split(/[/\\]/).pop();
  return parseBatchFolderName(name)?.printer ?? null;
};
