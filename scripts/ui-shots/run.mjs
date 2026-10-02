// UI screenshot driver.
//
//   node scripts/ui-shots/run.mjs --scenario=print [--variant=v0] [--role=cotton] [--out=<dir>]
//                                 [--demo-home=C:\ripflow-demo] [--cdp-port=9333]
//
// 1. fingerprints the user's real dev sandbox and live station config (they must be identical at the end),
// 2. rebuilds the demo station from scratch (seed-main.mjs, fictional data, the chosen variant),
// 3. starts the app with USERPROFILE etc. pointing into the demo home and CDP on 127.0.0.1,
// 4. runs the scenario at 1920x1080: every catalogue entry is a step; a failing step is recorded and the run goes on,
// 5. writes the PNGs, manifest-<scenario>.json and isolation-<scenario>.json into the output folder.
//
// Product code is not touched: the app runs unmodified from the repo, in its own dev sandbox mode.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectPage, saveShot } from "./lib/cdp.mjs";
import { VARIANTS, assertDemoHome, demoLayout, resolveDemoHome } from "./lib/demoPaths.mjs";
import { fingerprintTree, sameFingerprint } from "./lib/fingerprint.mjs";
import { REPO, ensureVite, isPortOpen, seedDemo, startApp, stopApp } from "./lib/launch.mjs";
import { folderOf } from "./lib/shotFolders.mjs";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const scenarioName = arg("scenario", "sample");
const demoHome = assertDemoHome(resolveDemoHome(arg("demo-home")));
const cdpPort = Number(arg("cdp-port", "9333"));
const outDir = path.resolve(arg("out", path.join(REPO, "agents", "chat", "artefakty", "ui-dostawa", "shots")));
const VIEWPORT = { width: 1920, height: 1080 };
// --only=PR-07,PR-08: run just these steps (for re-takes); state a step needs from an earlier one is NOT replayed.
const only = arg("only", "") ? new Set(arg("only", "").split(",").map((x) => x.trim())) : null;

const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

// The live station's config: the one file the real app of this PC keeps outside the sandbox.
const liveConfigDigest = () => {
  const file = path.join(os.userInfo().homedir, "AppData", "Roaming", "ripflow-desktop", "config.json");
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
};

const main = async () => {
  if (await isPortOpen(cdpPort)) throw new Error(`CDP port ${cdpPort} is already in use - pass another --cdp-port`);
  const scenario = await import(pathToFileURL(path.join(REPO, "scripts", "ui-shots", "scenarios", `${scenarioName}.mjs`)).href);
  const variant = arg("variant", scenario.VARIANT ?? "v0");
  // the roles scenario runs once per role: one manifest per run
  const tag = scenarioName === "roles" ? `roles-${arg("role", "cotton")}` : scenarioName;
  const role = arg("role", scenario.ROLE ?? "cotton");
  if (!VARIANTS.includes(variant)) throw new Error(`unknown variant ${variant}`);

  // The user's own sandbox and live config: read-only fingerprint before and after.
  const realSandbox = path.join(os.userInfo().homedir, "ripflow-sandbox");
  const before = fingerprintTree(realSandbox);
  const configBefore = liveConfigDigest();

  const startedAt = Date.now();
  const vite = await ensureVite();
  console.log(`[shots] vite: ${vite.started ? "started by this run" : "already running, REUSED"}`);
  console.log(`[shots] seeding the demo station (variant ${variant}, role ${role})...`);
  await seedDemo({ demoHome, role, variant });

  console.log("[shots] starting the app...");
  const app = startApp({ demoHome, cdpPort });
  const rows = [];
  let page = null;
  const layout = demoLayout(demoHome);
  fs.mkdirSync(outDir, { recursive: true });
  try {
    page = await connectPage(cdpPort);
    await page.setViewport(VIEWPORT.width, VIEWPORT.height);
    // The startup loader is over when the navigation bar is there.
    await page.waitForText("Settings", { selector: "nav button span", within: "nav", timeoutMs: 60000 });
    // A blinking text caret would make two frames differ for ever (the stability check) - and says nothing to a designer.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "* { caret-color: transparent !important; }";
      document.head.append(style);
    });
    await page.sleep(2500);

    let current = null;
    // shot(name) takes the id of the running step; shot(name, id) is for a step that photographs several entries.
    const shot = async (name, id = current) => {
      if (!id) throw new Error("shot() outside a step");
      const file = `${folderOf(id)}/${id}-${name}.png`;
      const row = await saveShot(page, outDir, { id, view: folderOf(id), state: name, file });
      current_rows.push(row);
      console.log(`[shots] ${row.file}${row.stable ? "" : "  (UNSTABLE: still changing)"}`);
      return row;
    };
    let current_rows = [];
    // One catalogue entry. A failure is recorded (with the page as it was) and the run goes on.
    const step = async (id, fn) => {
      if (only && !only.has(id)) return;
      current = id;
      current_rows = [];
      try {
        await fn({ shot });
        if (current_rows.length === 0) rows.push({ id, status: "no-shot" });
        else for (const r of current_rows) rows.push({ ...r, status: "ok" });
      } catch (err) {
        console.error(`[shots] ${id} FAILED: ${err.message}`);
        try {
          await saveShot(page, path.join(outDir, "_failed"), { id, view: "failed", state: "failed", file: `${id}.png` });
        } catch {
          // the page may be gone; the error text is what counts
        }
        rows.push({ id, status: "failed", error: err.message });
        for (const r of current_rows) rows.push({ ...r, status: "ok" });
        for (let i = 0; i < 3; i++) {
          await page.pressKey("Escape").catch(() => {});
          await page.sleep(150);
        }
        await page.mouseMove(1700, 1040).catch(() => {});
      }
      current = null;
    };
    const skip = (id, reason) => {
      if (only && !only.has(id)) return;
      rows.push({ id, status: "skipped", reason });
      console.log(`[shots] ${id} skipped: ${reason}`);
    };

    await scenario.run({ page, step, skip, ctx: { demoHome, layout, variant, role, outDir, app } });
  } finally {
    page?.close();
    await stopApp(app.child);
    await vite.stop();
  }

  const after = fingerprintTree(realSandbox);
  const configAfter = liveConfigDigest();
  // A partial re-take (--only) replaces just its own rows in the manifest that is already there.
  const manifestFile = path.join(outDir, `manifest-${tag}.json`);
  let allRows = rows;
  if (only && fs.existsSync(manifestFile)) {
    const touched = new Set(rows.map((r) => r.id));
    allRows = [...JSON.parse(fs.readFileSync(manifestFile, "utf8")).shots.filter((r) => !touched.has(r.id)), ...rows];
  }
  const manifest = {
    scenario: scenarioName,
    variant,
    role,
    takenAt: new Date(startedAt).toISOString(),
    viewport: VIEWPORT,
    viteStartedByRun: vite.started,
    gitHead: git("rev-parse", "--short", "HEAD"),
    gitDirty: git("status", "--porcelain", "--", "src", "package.json") !== "",
    shots: allRows,
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

  const userDataFiles = fs.existsSync(layout.userData) ? fs.readdirSync(layout.userData) : [];
  const isolation = {
    demoHome,
    realSandbox,
    realSandboxBefore: { exists: before.exists, files: before.files.length, digest: before.digest },
    realSandboxAfter: { exists: after.exists, files: after.files.length, digest: after.digest },
    realSandboxUnchanged: sameFingerprint(before, after),
    liveConfigUnchanged: configBefore === configAfter,
    appUserDataInDemo: layout.userData,
    appUserDataEntries: userDataFiles.length,
    appLogMentionsRealHome: app.getLog().includes(os.userInfo().homedir),
  };
  fs.writeFileSync(path.join(outDir, `isolation-${tag}.json`), JSON.stringify(isolation, null, 2), "utf8");
  const count = (status) => rows.filter((r) => r.status === status).length;
  console.log(`[shots] ${scenarioName}: ${count("ok")} ok, ${count("failed")} failed, ${count("skipped")} skipped, ${count("no-shot")} without a shot -> ${outDir}`);
  console.log(`[shots] real sandbox unchanged: ${isolation.realSandboxUnchanged}, live config unchanged: ${isolation.liveConfigUnchanged}`);
  if (!isolation.realSandboxUnchanged || !isolation.liveConfigUnchanged) process.exitCode = 3;
  if (rows.some((r) => r.status === "ok" && r.stable === false)) process.exitCode = process.exitCode || 4;
};

main().catch((err) => {
  console.error(`[shots] FAILED: ${err.stack ?? err}`);
  process.exit(1);
});
