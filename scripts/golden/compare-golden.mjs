// Regenerates every batch with the CURRENT code and diffs against golden/.
// Offline: inputs come from golden/_inputs.json, never from the database.
//
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/compare-golden.mjs
//
// Exit code 0 = no differences, 1 = at least one batch differs.
import fs from "node:fs";
import path from "node:path";
import { loadPipeline, renderBatch, goldenFileName, GOLDEN_DIR } from "./harness.mjs";
import { maskXml } from "./mask.mjs";

const batches = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "_inputs.json"), "utf8"));
const pipeline = await loadPipeline();

const failures = [];
for (const batchRows of batches) {
  const name = goldenFileName(batchRows[0].batch_path);
  const file = path.join(GOLDEN_DIR, name);
  if (!fs.existsSync(file)) { failures.push({ name, lines: ["missing golden file"] }); continue; }
  const expected = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const actual = (maskXml(renderBatch(batchRows, pipeline)) + "\n").split(/\r?\n/);
  const lines = [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (expected[i] !== actual[i]) {
      lines.push(`  line ${i + 1}:`);
      lines.push(`    golden : ${expected[i] ?? "(missing)"}`);
      lines.push(`    current: ${actual[i] ?? "(missing)"}`);
    }
  }
  if (lines.length) failures.push({ name, lines });
}

if (failures.length === 0) {
  console.log(`0 differences across ${batches.length} batches`);
} else {
  console.log(`${failures.length} of ${batches.length} batches DIFFER:\n`);
  for (const f of failures) console.log(`${f.name}\n${f.lines.join("\n")}\n`);
  process.exit(1);
}
