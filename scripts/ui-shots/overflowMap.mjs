// Prints the responsiveness map (view x window size) from the sweep manifest in --dir and writes it to
// <dir>/mapa.md. Exit code 1 while any cell is not ok.
//
//   node scripts/ui-shots/overflowMap.mjs --dir=agents/chat/artefakty/resp-0/przed
//   --manifest=sweep-wizard reads manifest-sweep-wizard.json (and writes mapa-sweep-wizard.md) instead of the main sweep.
import fs from "node:fs";
import path from "node:path";
import { overflowTable, problemCount } from "./lib/overflowTable.mjs";

const dirArg = process.argv.find((a) => a.startsWith("--dir="))?.slice(6);
if (!dirArg) throw new Error("--dir=<folder with manifest-sweep.json> is required");
const tag = process.argv.find((a) => a.startsWith("--manifest="))?.slice(11) ?? "sweep";
const dir = path.resolve(dirArg);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, `manifest-${tag}.json`), "utf8"));
const rows = manifest.shots;
const table = overflowTable(rows);
const details = rows
  .filter((r) => r.overflow && !r.overflow.error && r.overflow.outsideCount > 0)
  .map((r) => `- ${r.id} @ ${r.state}: ${r.overflow.outside.join("; ")}`);
const geometry = rows
  .filter((r) => r.overflow && !r.overflow.error && (r.overflow.overlapCount > 0 || r.overflow.hollowCount > 0 || r.overflow.spillCount > 0))
  .flatMap((r) => [...(r.overflow.overlaps ?? []).map((o) => `- ${r.id} @ ${r.state}: OVERLAP ${o}`), ...(r.overflow.hollow ?? []).map((o) => `- ${r.id} @ ${r.state}: HOLLOW ${o}`), ...(r.overflow.spills ?? []).map((o) => `- ${r.id} @ ${r.state}: SPILL ${o}`)]);
const problems = problemCount(rows);
const out = [`Responsiveness map (git ${manifest.gitHead}${manifest.gitDirty ? ", dirty" : ""}) - cells not ok: ${problems}`, "", table, "", "Elements outside the window (first 12 per cell):", ...details, "", "Overlapping siblings / hollow wrapped items / spills (first 12 per cell):", ...geometry, ""].join("\n");
fs.writeFileSync(path.join(dir, tag === "sweep" ? "mapa.md" : `mapa-${tag}.md`), out, "utf8");
console.log(out);
process.exitCode = problems === 0 ? 0 : 1;
