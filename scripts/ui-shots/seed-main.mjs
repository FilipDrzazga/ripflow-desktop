// Builds the DEMO station: run as the Electron MAIN script, never imported.
//
//   USERPROFILE=<demo-home> electron scripts/ui-shots/seed-main.mjs     (run.mjs does this)
//
// It runs the app's own startup (registerIpcHandlers: initDb, caches) and then fills the demo through
// the app's own code - saveShopProfile, saveFabric, submitBatch (the real createBatch + XML pipeline),
// advanceFileStage - so the data has exactly the shape the app writes. Only what the app cannot make
// itself (inbox PDFs, history dates) is written directly.
//
// Fail-closed: it refuses to run unless os.homedir() IS the demo home, and every direct write is
// checked to lie inside it. The user's real sandbox in their own home is never opened.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { SANDBOX_ROOT } from "../../src/electron/sandboxBoot.js";
import { app } from "electron";
import { assertDemoHome, assertInside, demoLayout, resolveDemoHome, writeDemoConfig } from "./lib/demoPaths.mjs";
import {
  BATCH_PLAN,
  DEMO_CUSTOM_ORDERS,
  DEMO_FABRICS,
  DEMO_SHOP,
  DEMO_WORKSTATION,
  DEMO_CUSTOM_ART,
  INBOX_AGES,
  STAGE_CHAIN,
  withAllFeaturesOff,
  buildFiles,
  buildInboxPlan,
  makeRng,
} from "./demoData.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, "..", "..");
const src = (rel) => pathToFileURL(path.join(REPO, "src", rel)).href;
const win = path.win32;

const fail = (message) => {
  console.error(`[seed] ${message}`);
  app.exit(1);
};

const pad2 = (n) => String(n).padStart(2, "0");
const dayName = (d) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VARIANT = process.env.UI_SHOTS_VARIANT || "v0";
const roleValue = (role) => (role === "none" ? "" : role);
const demoHome = assertDemoHome(resolveDemoHome());
const layout = demoLayout(demoHome);

// A colourful but boring page 1: the thumbnail and the preview need something to render.
const PALETTES = [
  [[0.16, 0.38, 0.62], [0.95, 0.77, 0.25], [0.88, 0.36, 0.3]],
  [[0.22, 0.55, 0.45], [0.98, 0.9, 0.7], [0.35, 0.3, 0.55]],
  [[0.75, 0.3, 0.45], [0.2, 0.2, 0.3], [0.95, 0.85, 0.8]],
  [[0.9, 0.55, 0.2], [0.15, 0.45, 0.5], [0.96, 0.95, 0.88]],
];

const writePdf = async (PDFDocument, rgb, StandardFonts, filePath, label, seed) => {
  assertInside(demoHome, filePath);
  const rng = makeRng(seed);
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const palette = PALETTES[seed % PALETTES.length];
  page.drawRectangle({ x: 0, y: 0, width: 600, height: 400, color: rgb(...palette[2]) });
  for (let i = 0; i < 14; i++) {
    const c = palette[Math.floor(rng() * 2)];
    const size = 40 + rng() * 120;
    page.drawCircle({ x: rng() * 600, y: rng() * 400, size, color: rgb(...c), opacity: 0.55 });
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label.slice(0, 60), { x: 16, y: 14, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, await doc.save());
};

const main = async () => {
  if (path.resolve(os.homedir()).toLowerCase() !== demoHome.toLowerCase()) {
    return fail(`os.homedir() is ${os.homedir()}, expected the demo home ${demoHome} - start through run.mjs`);
  }
  if (SANDBOX_ROOT !== layout.root) return fail(`sandbox root is ${SANDBOX_ROOT}, expected ${layout.root}`);

  // The config must exist BEFORE getSettings.js builds its Store (the dynamic imports below).
  writeDemoConfig(demoHome, process.env.UI_SHOTS_ROLE ? { workstationRole: roleValue(process.env.UI_SHOTS_ROLE) } : {});

  const { registerIpcHandlers } = await import(src("electron/ipc/index.js"));
  const db = await import(src("electron/helpers/db.js"));
  const { saveShopProfile } = await import(src("electron/helpers/saveShopProfile.js"));
  const { validateShopProfile } = await import(src("electron/helpers/validateShopProfile.js"));
  const { DEFAULT_PROFILE } = await import(src("electron/helpers/defaultProfile.js"));
  const { getProfile } = await import(src("electron/helpers/shopProfile.js"));
  const { invalidateFabricCache, loadFabricCache } = await import(src("electron/helpers/fabricCache.js"));
  const { parsePrintFileName } = await import(src("electron/helpers/parseFileName.js"));
  const { getMaterialType } = await import(src("electron/helpers/getMaterialType.js"));
  const { submitBatch } = await import(src("electron/ipc/submitBatch.js"));
  const { ROLLBACK_REASONS } = await import(src("ui/constants/rollbackReasons.js"));
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const Database = (await import("better-sqlite3")).default;

  await registerIpcHandlers();

  // saveShopProfile does not validate (the import path does), so the demo profile goes through the import validator first.
  const SHOP = VARIANT === "v1" ? withAllFeaturesOff(DEMO_SHOP) : DEMO_SHOP;
  const verdict = validateShopProfile(SHOP, { schemaVersion: DEFAULT_PROFILE.schemaVersion });
  if (!verdict.ok) return fail(`the demo shop profile is invalid: ${verdict.errors.join("; ")}`);
  // Then through the app's compare-and-swap write.
  const saved = saveShopProfile(SHOP, DEMO_WORKSTATION);
  if (!saved.success) return fail(`saveShopProfile refused the demo profile: ${JSON.stringify(saved)}`);

  for (const f of DEMO_FABRICS) {
    if (!db.saveFabric(null, f)) return fail(`saveFabric failed for ${f.name}`);
  }
  invalidateFabricCache();
  loadFabricCache();

  db.setReasonDefinitions(ROLLBACK_REASONS.map((r) => ({ code: r.code, label: r.label, iconName: r.iconName })));

  const settingsStorage = layout.storagePath;
  for (const printer of DEMO_SHOP.printers) fs.mkdirSync(path.join(layout.storagePath, printer.hotfolder), { recursive: true });
  fs.mkdirSync(path.join(layout.storagePath, DEMO_SHOP.folders.ripError), { recursive: true });
  fs.mkdirSync(path.join(layout.storagePath, DEMO_SHOP.folders.customOrder), { recursive: true });

  if (VARIANT === "v2") {
    // Empty shop: the profile, the catalogue and the reason list exist, nothing was ever printed. The PRINTED
    // folder exists too - a missing one would raise the "Printed folder not found" banner on every screen.
    fs.mkdirSync(path.join(layout.storagePath, "PRINTED"), { recursive: true });
    console.log("[seed] variant v2: profile, catalogue and reasons only");
    app.exit(0);
    return;
  }

  // 1) Inbox: PDFs the operator sees in Print.
  const rng = makeRng(20261002);
  const inbox = buildInboxPlan(rng);
  let seed = 1;
  for (const f of inbox) {
    await writePdf(PDFDocument, rgb, StandardFonts, path.join(settingsStorage, f.material, f.name), f.name, seed++);
  }
  console.log(`[seed] inbox: ${inbox.length} files`);

  // The age badge of a file counts days from its CREATION time, which Node cannot set - PowerShell can.
  const agePs = inbox
    .map((f, i) => {
      const target = path.join(settingsStorage, f.material, f.name);
      assertInside(demoHome, target);
      return `(Get-Item -LiteralPath '${target.replaceAll("'", "''")}').CreationTime = (Get-Date).AddDays(-${INBOX_AGES[i % INBOX_AGES.length]})`;
    })
    .join(String.fromCharCode(10));
  const agePsFile = path.join(layout.root, "set-ages.ps1");
  assertInside(demoHome, agePsFile);
  fs.writeFileSync(agePsFile, agePs, "utf8");
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", agePsFile], { stdio: "ignore" });
  fs.rmSync(agePsFile, { force: true });

  // 2) Batches through the real pipeline, then moved to their day in history.
  const real = new Database(path.join(settingsStorage, "ripflow.db"));
  assertInside(demoHome, path.join(settingsStorage, "ripflow.db"));
  const now = new Date();
  let orderStart = 7000;
  const batchPaths = [];
  for (const [bi, plan] of BATCH_PLAN.entries()) {
    const files = buildFiles({ material: plan.material, count: plan.stages.length, kinds: plan.kinds, rng, orderStart });
    orderStart += 60;
    const items = [];
    for (const f of files) {
      const fullPath = path.join(settingsStorage, plan.material, f.name);
      await writePdf(PDFDocument, rgb, StandardFonts, fullPath, f.name, seed++);
      const meta = parsePrintFileName(f.name, { fullPath, dir: path.dirname(fullPath), shopConfig: getProfile() });
      items.push({ id: `${plan.material}_${f.name}`, printGroup: plan.material, materialType: getMaterialType(meta.material), printer: plan.printer, ...meta });
    }
    const res = await submitBatch(items);
    if (!res.success) return fail(`batch ${bi} failed: ${JSON.stringify(res.errors)}`);
    await sleep(1100); // batch folder names carry the second

    const [todayFolder, batchFolder] = res.batchId.split("/");
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - plan.daysAgo);
    const newDay = dayName(day);
    const newBatchFolder = batchFolder.replace(/^PRINTED_\d{6}/, `PRINTED_${plan.time}`);
    const from = path.join(settingsStorage, "PRINTED", todayFolder, batchFolder);
    const toDir = path.join(settingsStorage, "PRINTED", newDay);
    assertInside(demoHome, from);
    assertInside(demoHome, toDir);
    fs.mkdirSync(toDir, { recursive: true });
    const to = path.join(toDir, newBatchFolder);
    fs.renameSync(from, to);
    real.prepare("UPDATE file_stages SET batch_path = ? WHERE batch_path = ?").run(to, from);
    batchPaths.push({ to, plan, items });

    // Walk each file along its stage chain with the app's own guarded transitions.
    for (const [fi, item] of items.entries()) {
      const stem = path.parse(item.file.name).name;
      const target = plan.stages[fi];
      let prev = "printed";
      for (const step of STAGE_CHAIN[target]) {
        if (step === "to_sewing") db.setSewingSent(stem, DEMO_WORKSTATION, prev, DEMO_SHOP.sewingCompanies[bi % 2]);
        else db.advanceFileStage(stem, step, DEMO_WORKSTATION, prev);
        prev = step;
      }
      // Re-date the history: first entry at the batch time, every later step 40 minutes on.
      const t0 = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(plan.time.slice(0, 2)), Number(plan.time.slice(2, 4)), Number(plan.time.slice(4, 6)));
      const hist = real.prepare("SELECT id FROM file_stage_history WHERE file_id = ? ORDER BY id").all(stem);
      hist.forEach((h, i) => real.prepare("UPDATE file_stage_history SET entered_at = ? WHERE id = ?").run(new Date(t0.getTime() + i * 40 * 60000).toISOString(), h.id));
      const last = new Date(t0.getTime() + Math.max(0, hist.length - 1) * 40 * 60000).toISOString();
      real.prepare("UPDATE file_stages SET updated_at = ?, updated_by = ? WHERE file_id = ?").run(last, DEMO_WORKSTATION, stem);
      real.prepare("UPDATE file_stages SET sewing_sent_at = ? WHERE file_id = ? AND sewing_sent_at IS NOT NULL").run(last, stem);
    }
  }
  console.log(`[seed] batches: ${batchPaths.length}`);

  // 3) Holds, RIP errors, rollback history, logs, custom orders.
  const held = inbox.filter((f) => f.kind === "LM").slice(0, 2);
  for (const [i, f] of held.entries()) db.holdFile(`${f.material}_${f.name}`, i === 0 ? "Waiting for the customer to confirm the colours" : "");

  const sample = batchPaths[0].items[0];
  db.insertRipError({
    jobGuid: "demo-job-0001",
    fileId: path.parse(sample.file.name).name,
    batchId: "demo-batch-1",
    nestingGroup: "Nesting 1",
    failedNode: "Render",
    errorMessage: "Demo error: the artwork could not be rendered (missing embedded font).",
  });

  const reasons = ROLLBACK_REASONS.filter((r) => r.code !== "OTHER");
  for (let i = 0; i < 12; i++) {
    const b = batchPaths[i % batchPaths.length];
    const item = b.items[i % b.items.length];
    const reason = reasons[i % reasons.length];
    const id = `demo-rb-${i}`;
    db.insertRollbackReason({
      id,
      fileId: path.parse(item.file.name).name,
      batchPath: b.to,
      reasonCode: reason.code,
      reasonLabel: reason.label,
      workstation: DEMO_WORKSTATION,
      orderId: item.orderId,
      customer: item.customerName,
      fabric: item.material,
      process: "Print",
      printType: item.printTypeCode,
      meters: item.printTypeCode === "LM" ? (item.height ?? 0) / 1000 : 0.4,
    });
    const when = new Date(now.getTime() - (i % 5) * 86400000 - i * 3600000).toISOString();
    real.prepare("UPDATE rollback_reasons SET timestamp = ? WHERE id = ?").run(when, id);
  }

  for (const [i, msg] of ["Batch created", "Files moved to PRINTED", "XML sent to PrintFactory"].entries()) {
    db.insertLog({
      id: `demo-log-${i}`,
      timestamp: new Date(now.getTime() - (3 - i) * 60000).toISOString(),
      type: "Info",
      stage: "submit",
      code: "OK",
      message: msg,
      detail: null,
      workstation: DEMO_WORKSTATION,
    });
  }

  // Artwork the custom-order CSVs refer to: a .tif per name that is "present" (the rest shows as missing).
  for (const art of Object.values(DEMO_CUSTOM_ART)) {
    for (const name of art.present) {
      const tif = path.join(layout.customOrderFolderPath, name + ".tif");
      assertInside(demoHome, tif);
      fs.writeFileSync(tif, "demo artwork");
    }
  }
  const historyFiles = (art) => art.files.map((fileName, i) => ({ fileName, found: art.present.includes(fileName), meters: 1.5 + i * 0.75 }));
  const historyArt = [DEMO_CUSTOM_ART.complete, DEMO_CUSTOM_ART.partial];

  for (const [oi, o] of DEMO_CUSTOM_ORDERS.entries()) {
    db.insertCustomOrder({
      poNumber: o.poNumber,
      materialName: o.materialName,
      printer: o.printer,
      date: new Date(now.getTime() - o.daysAgo * 86400000).toISOString(),
      totalFiles: o.totalFiles,
      missingFiles: o.missingFiles,
      totalMeters: o.totalMeters,
      status: o.status,
      files: historyFiles(historyArt[oi]),
    });
  }

  if (VARIANT === "v3") {
    // First run: the data above is the "other station's" shop. This station has no paths yet, and the wizard is
    // pointed by hand at the full storage (profile ready), an empty one (no profile) and a copy of the database
    // alone (profile ready but the printer hotfolders missing).
    fs.mkdirSync(layout.storageEmptyPath, { recursive: true });
    fs.mkdirSync(layout.storageNoHotPath, { recursive: true });
    const noHotDb = path.join(layout.storageNoHotPath, "ripflow.db");
    assertInside(demoHome, noHotDb);
    real.exec(`VACUUM INTO '${noHotDb.replaceAll("'", "''")}'`);
    writeDemoConfig(demoHome, { storagePath: "", xmlPath: "", customOrderFolderPath: "", ...(process.env.UI_SHOTS_ROLE ? { workstationRole: roleValue(process.env.UI_SHOTS_ROLE) } : {}) });
    // a storage whose database is not one: the wizard's "database could not be opened" step
    fs.mkdirSync(layout.storageCorruptPath, { recursive: true });
    assertInside(demoHome, path.join(layout.storageCorruptPath, "ripflow.db"));
    fs.writeFileSync(path.join(layout.storageCorruptPath, "ripflow.db"), "this is not a SQLite database - demo".repeat(40), "utf8");
  }

  real.close();
  console.log("[seed] done");
  app.exit(0);
};

app.whenReady().then(main).catch((err) => fail(err?.stack ?? String(err)));
