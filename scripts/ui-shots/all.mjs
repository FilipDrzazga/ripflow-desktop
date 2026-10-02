// Runs every scenario of the designer pack one after the other (each starts from a fresh demo station).
//
//   node scripts/ui-shots/all.mjs [--only=print,batch]
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const RUNS = [
  ["print"],
  ["batch"],
  ["production"],
  ["custom"],
  ["analytics"],
  ["logs"],
  ["settings"],
  ["inbox"],
  ["flows"],
  ["v1"],
  ["v2"],
  ["v4"],
  ["wizard"],
  ["wizard-empty"],
  ["wizard-nohot"],
  ["wizard-corrupt"],
  ["wizard-later"],
  ["roles", "--role=qc"],
  ["roles", "--role=rollpress"],
  ["roles", "--role=packing"],
  ["roles", "--role=none"],
];

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

let failed = 0;
for (const [scenario, ...extra] of RUNS) {
  if (only && !only.has(scenario)) continue;
  console.log(`\n=== ${scenario} ${extra.join(" ")}`);
  const res = spawnSync(process.execPath, [path.join(here, "run.mjs"), `--scenario=${scenario}`, ...extra], { stdio: "inherit" });
  if (res.status !== 0) {
    failed++;
    console.log(`=== ${scenario}: exit ${res.status}`);
  }
}
console.log(`\nall done, ${failed} run(s) with a non-zero exit`);
