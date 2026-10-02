// Builds the designer pack from the screenshots: screens/<view>/<ID>-<name>.png, INDEX.md and a ZIP - after a leak check.
//
//   node scripts/ui-shots/build-pack.mjs --denylist=<file> [--dir=agents/chat/artefakty/ui-dostawa] [--demo-home=C:\ripflow-demo] [--no-zip]
//
// Inputs (in <dir>): katalog.md (the approved catalogue), opisy.md (descriptions, "- **ID** - text"), shots/manifest-*.json.
// The leak check: PNGs cannot be searched for text, so the INPUTS of the demo are searched instead - the generator,
// the demo database, the demo config, the manifests and the texts that go into the pack - for every line of the
// denylist (real client / shop / server names). The denylist file lives only in the artefact folder: not in the
// repo and not in the ZIP. Any hit stops the build.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEMO_SHOP } from "./demoData.mjs";
import { demoLayout, resolveDemoHome } from "./lib/demoPaths.mjs";
import { folderOf } from "./lib/shotFolders.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, "..", "..");
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dir = path.resolve(arg("dir", path.join(REPO, "agents", "chat", "artefakty", "ui-dostawa")));
const shotsDir = path.join(dir, "shots");
const denylistFile = arg("denylist");
if (!denylistFile) throw new Error("--denylist=<file> is required (one forbidden string per line)");
const packName = "ripflow-ui-pack";
const stage = path.join(dir, "pack", packName);

const VIEW_TITLES = {
  global: "Okno, nawigacja, banery, toasty",
  print: "Print",
  "batch": "Batch History",
  production: "Production",
  "production-roles": "Production - role stacji",
  "custom-orders": "Custom Orders",
  analytics: "Analytics",
  logs: "Logs",
  settings: "Settings",
  wizard: "Kreator pierwszego uruchomienia",
};

// ---- 1. catalogue + descriptions + manifests --------------------------------------------------------------------
const catalogue = [];
for (const line of fs.readFileSync(path.join(dir, "katalog.md"), "utf8").split("\n")) {
  const m = line.match(/^\| ([A-Z]{2}-\d+) \|/);
  if (!m) continue;
  const cells = line.split("|").map((c) => c.trim());
  const p = cells[cells.length - 2];
  if (!p.startsWith("\u25cf") && !p.startsWith("\u25cb")) continue;
  const ids = m[1] === "PD-40" ? [..."abcdefg"].map((l) => `PD-40${l}`) : [m[1]];
  for (const id of ids) catalogue.push({ id, state: cells[2] });
}

const descriptions = new Map();
const opisy = fs.readFileSync(path.join(dir, "opisy.md"), "utf8");
const [opisyMain, ...systemParts] = opisy.split(/\n---\n/);
for (const line of opisyMain.split("\n")) {
  const m = line.match(/^- \*\*([A-Z]{2}-\d+[a-g]?)\*\* \u2014 (.*)$/);
  if (m) descriptions.set(m[1], m[2]);
}

const shots = new Map(); // id -> [{ file, name }]
for (const file of fs.readdirSync(shotsDir).filter((f) => /^manifest-.*\.json$/.test(f))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(shotsDir, file), "utf8"));
  for (const row of manifest.shots) {
    if (row.status !== "ok" || !fs.existsSync(path.join(shotsDir, row.file))) continue;
    const list = shots.get(row.id) ?? [];
    if (!list.some((s) => s.file === row.file)) list.push({ file: row.file, name: row.state });
    shots.set(row.id, list);
  }
}

const missingDescriptions = catalogue.filter(({ id }) => shots.has(id) && !(descriptions.has(id) || descriptions.has(id.replace(/[a-g]$/, ""))));
if (missingDescriptions.length > 0) {
  console.error(`descriptions missing for: ${missingDescriptions.map((x) => x.id).join(", ")}`);
  process.exit(2);
}

// ---- 2. leak check on the inputs --------------------------------------------------------------------------------
const deny = fs.readFileSync(denylistFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const demoHome = resolveDemoHome(arg("demo-home"));
const layout = demoLayout(demoHome);
const inputs = [
  path.join(here, "demoData.mjs"),
  path.join(here, "demoPaths.mjs"),
  path.join(here, "seed-main.mjs"),
  path.join(dir, "opisy.md"),
  path.join(dir, "katalog.md"),
  layout.configPath,
  path.join(layout.storagePath, "ripflow.db"),
  // the isolation-*.json proofs name the real home folder on purpose and do not go into the pack
  ...fs.readdirSync(shotsDir).filter((f) => /^manifest-.*\.json$/.test(f)).map((f) => path.join(shotsDir, f)),
].filter((f) => fs.existsSync(f));
const hits = [];
for (const file of inputs) {
  const text = fs.readFileSync(file).toString("latin1").toLowerCase();
  for (const word of deny) if (text.includes(word.toLowerCase())) hits.push(`${path.basename(file)}: "${word}"`);
}
console.log(`leak check: ${inputs.length} inputs, ${deny.length} denylist entries, ${hits.length} hits`);
if (hits.length > 0) {
  console.error(hits.join("\n"));
  process.exit(3);
}

// ---- 3. stage the pack ------------------------------------------------------------------------------------------
fs.rmSync(path.join(dir, "pack"), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const { STAGE_COLOR, STAGE_LABEL } = await import(pathToFileURL(path.join(REPO, "src", "shared", "constants.js")).href);

const lines = [
  "# RipFlow Desktop - paczka ekranów dla grafika",
  "",
  "Zrzuty wszystkich widoków i stanów interfejsu aplikacji RipFlow Desktop (program do obsługi druku w PrintFactory). Dane na zrzutach są wymyślone",
  "(demo): sklep, drukarki, klienci, numery zamówień - żadne prawdziwe dane klienta nie występują.",
  "",
  "- **Rozmiar okna:** 1920 x 1080 px, pełne okno aplikacji (pasek tytułu, nawigacja po lewej, treść).",
  "- **Nazwa pliku:** `screens/<widok>/<ID>-<stan>.png`; ID odpowiada wpisowi w tabeli poniżej.",
  "- **Teksty w aplikacji** są po angielsku; opisy poniżej po polsku.",
  "- **Stany niewidoczne na zrzutach:** okna systemowe Windows (potwierdzenia, wybór folderu/pliku) i podpowiedzi `title` - ich teksty są na końcu tego pliku.",
  "",
  "## Legenda kolorów",
  "",
  "**Drukarki (plakietki, radio, filtry)** - kolor drukarki jest ustawiany w profilu sklepu:",
  "",
  ...DEMO_SHOP.printers.map((p) => `- ${p.code} (${p.materialClass}): tło ${p.color.bg}, tekst ${p.color.text}`),
  "",
  "**Etapy produkcji (pigułki na kartach, plakietki, kafelki potoku):**",
  "",
  ...["printed", "heatpress", "qc", "to_sewing", "packed", "shipped"].map((s) => `- ${STAGE_LABEL[s] ?? s}: tło ${STAGE_COLOR[s].bg}, tekst ${STAGE_COLOR[s].color}`),
  "",
  "**Toasty:** Success - zielony (tło #d1fae5, tekst #047857), Warning - żółty (#fef3c7 / #b45309), Error - czerwony (#fee2e2 / #b91c1c). Typ „Info” nie ma własnego stylu i wygląda jak Error.",
  "",
  "**Wiek pliku w Print:** New / 1d - zielony, 2d - pomarańczowy, 3d - ciemnopomarańczowy, 4d i więcej - czerwony. **Status pliku:** zielony ptaszek - gotowy, czerwone X - nieprawidłowy.",
  "",
  "**Klasy materiału:** pierwsza klasa profilu (Cottons) - ikona liścia, odcienie niebieskie; druga (Polyesters) - ikona wielokąta, odcienie fioletowe; nieznana - szare pytajnik, bursztynowy akcent.",
  "",
];
let total = 0;
for (const folder of Object.keys(VIEW_TITLES)) {
  const entries = catalogue.filter(({ id }) => folderOf(id) === folder && shots.has(id));
  if (entries.length === 0) continue;
  lines.push(`## ${VIEW_TITLES[folder]}`, "", "| ID | Zrzut | Opis |", "|---|---|---|");
  for (const { id } of entries) {
    for (const s of shots.get(id)) {
      const dest = path.join(stage, "screens", s.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(shotsDir, s.file), dest);
      const text = (descriptions.get(id) ?? descriptions.get(id.replace(/[a-g]$/, ""))).replaceAll("|", "\\|");
      lines.push(`| ${id} | \`screens/${s.file}\` | ${text} |`);
      total++;
    }
  }
  lines.push("");
}
const pominiete = catalogue.filter(({ id }) => !shots.has(id));
lines.push("## Stany, których nie ma na zrzutach", "");
lines.push("Ujęte w katalogu, ale nie do sfotografowania z powodów technicznych (szczegóły w opisach ogólnych na końcu):", "");
for (const { id, state } of pominiete) lines.push(`- ${id}: ${state}`);
lines.push("", "---", "", ...systemParts.join("\n---\n").split("\n"));
const indexText = lines.join("\n");
const indexHits = deny.filter((word) => indexText.toLowerCase().includes(word.toLowerCase()));
if (indexHits.length > 0) {
  console.error(`INDEX.md leak check: ${indexHits.join(", ")}`);
  process.exit(3);
}
fs.writeFileSync(path.join(stage, "INDEX.md"), indexText, "utf8");
console.log(`pack staged: ${total} screenshots, ${pominiete.length} catalogue entries without a shot -> ${stage}`);

// ---- 4. zip -----------------------------------------------------------------------------------------------------
if (!process.argv.includes("--no-zip")) {
  const zip = path.join(dir, "pack", `${packName}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: "inherit" });
  console.log(`zip: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`);
}
