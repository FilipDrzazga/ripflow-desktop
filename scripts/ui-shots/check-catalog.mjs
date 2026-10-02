// Completeness check: every entry of the approved catalogue (katalog.md) must have a screenshot in a manifest, or an
// explicit reason why not. Prints the report and writes pokrycie.md next to the catalogue.
//
//   node scripts/ui-shots/check-catalog.mjs [--dir=agents/chat/artefakty/ui-dostawa]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv.find((a) => a.startsWith("--dir="))?.slice(6) ?? path.join(here, "..", "..", "agents", "chat", "artefakty", "ui-dostawa"));
const shotsDir = path.join(dir, "shots");

// 1. the catalogue: rows "| XX-NN | ... | P |" with a bullet (core) or circle (optional) in the last column
const required = [];
for (const line of fs.readFileSync(path.join(dir, "katalog.md"), "utf8").split("\n")) {
  const m = line.match(/^\| ([A-Z]{2}-\d+) \|/);
  if (!m) continue;
  const cells = line.split("|").map((c) => c.trim());
  const p = cells[cells.length - 2];
  if (!p.startsWith("\u25cf") && !p.startsWith("\u25cb")) continue;
  if (m[1] === "PD-40") for (const l of "abcdefg") required.push({ id: `PD-40${l}`, p });
  else required.push({ id: m[1], p });
}

// 2. the manifests: the best status per id (ok beats skipped beats failed)
const rank = { ok: 3, skipped: 2, failed: 1, "no-shot": 0 };
const byId = new Map();
for (const file of fs.readdirSync(shotsDir).filter((f) => /^manifest-.*\.json$/.test(f))) {
  for (const row of JSON.parse(fs.readFileSync(path.join(shotsDir, file), "utf8")).shots) {
    const cur = byId.get(row.id);
    if (!cur || rank[row.status] > rank[cur.status]) byId.set(row.id, { ...row, manifest: file });
  }
}

const groups = { ok: [], skipped: [], failed: [], missing: [] };
for (const { id, p } of required) {
  const row = byId.get(id);
  if (!row) groups.missing.push({ id, p });
  else if (row.status === "ok") {
    const file = path.join(shotsDir, row.file);
    if (fs.existsSync(file)) groups.ok.push({ id, p, file: row.file, stable: row.stable });
    else groups.missing.push({ id, p, note: `file ${row.file} is gone` });
  } else if (row.status === "skipped") groups.skipped.push({ id, p, reason: row.reason });
  else groups.failed.push({ id, p, error: row.error ?? row.status });
}

const lines = [
  "# Pokrycie katalogu przez zrzuty (wygenerowane skryptem check-catalog.mjs)",
  "",
  `Wymagane wpisy katalogu: ${required.length} | zrzut jest: ${groups.ok.length} | pominiete z powodem: ${groups.skipped.length} | blad: ${groups.failed.length} | BRAK: ${groups.missing.length}`,
  "",
];
const section = (title, rows, fmt) => {
  if (rows.length === 0) return;
  lines.push(`## ${title} (${rows.length})`, "", ...rows.map(fmt), "");
};
section("BRAK (nie ma zrzutu ani powodu)", groups.missing, (r) => `- ${r.id} ${r.p}${r.note ? ` - ${r.note}` : ""}`);
section("Blad przebiegu", groups.failed, (r) => `- ${r.id} ${r.p}: ${r.error}`);
section("Pominiete z powodem", groups.skipped, (r) => `- ${r.id} ${r.p}: ${r.reason}`);
section("Zrzuty ruchome (stable=false)", groups.ok.filter((r) => r.stable === false), (r) => `- ${r.id}: ${r.file}`);
fs.writeFileSync(path.join(dir, "pokrycie.md"), lines.join("\n"), "utf8");
console.log(lines.join("\n"));
process.exitCode = groups.missing.length + groups.failed.length > 0 ? 1 : 0;
