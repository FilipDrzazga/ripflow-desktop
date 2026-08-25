// Captures the baseline: renders every real batch with the current production code and
// writes one masked XML per batch into golden/, plus golden/_inputs.json so that
// compare-golden runs offline against a frozen input set.
//
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/capture-golden.mjs
//
// Reads Alex's ripflow.db READ-ONLY, and only to harvest the input rows. Customer names,
// order numbers and artwork ids are pseudonymised before parsing (see anonymise.mjs) so
// none of his data ever reaches the repository.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadPipeline, renderBatch, goldenFileName, GOLDEN_DIR } from "./harness.mjs";
import { maskXml } from "./mask.mjs";
import { anonymiseRows } from "./anonymise.mjs";

const DB_PATH = process.argv[2] ?? "O:/SPPrintReadyArtwork/ripflow.db";

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const raw = db
  .prepare("SELECT file_id, batch_path, print_type, material FROM file_stages ORDER BY batch_path, file_id")
  .all();
db.close();

const { rows, nameMap, orderMap, xwdMap, unmatched, badXwd } = anonymiseRows(raw);
// Refuse rather than let a real value slip through unrecognised.
if (unmatched.length) {
  console.error(`REFUSING TO CAPTURE: ${unmatched.length} file_id(s) did not match the anonymiser pattern`);
  for (const u of unmatched.slice(0, 5)) console.error(`  ${u}`);
  process.exit(1);
}
if (badXwd.length) {
  console.error(`REFUSING TO CAPTURE: ${badXwd.length} artwork id(s) are not XWD + 32 hex`);
  for (const b of badXwd.slice(0, 5)) console.error(`  ${b}`);
  process.exit(1);
}

const byBatch = new Map();
for (const r of rows) {
  if (!byBatch.has(r.batch_path)) byBatch.set(r.batch_path, []);
  byBatch.get(r.batch_path).push(r);
}
const batches = [...byBatch.entries()].sort((a, b) => a[0].localeCompare(b[0]));

fs.rmSync(GOLDEN_DIR, { recursive: true, force: true });
fs.mkdirSync(GOLDEN_DIR, { recursive: true });
fs.writeFileSync(path.join(GOLDEN_DIR, "_inputs.json"), JSON.stringify(batches.map(([, r]) => r), null, 2) + "\n");

const pipeline = await loadPipeline();
let written = 0;
for (const [batchPath, batchRows] of batches) {
  const xml = maskXml(renderBatch(batchRows, pipeline));
  fs.writeFileSync(path.join(GOLDEN_DIR, goldenFileName(batchPath)), xml + "\n");
  written++;
}
console.log(`captured ${written} batches (${rows.length} files) into golden/`);
console.log(`pseudonymised ${nameMap.size} customers, ${orderMap.size} order numbers, ${xwdMap.size} artwork ids`);
