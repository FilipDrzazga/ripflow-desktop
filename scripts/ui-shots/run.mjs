// UI screenshot driver.
//
//   node scripts/ui-shots/run.mjs --scenario=sample [--out=<dir>] [--demo-home=C:\ripflow-demo]
//                                 [--role=cotton] [--cdp-port=9333]
//
// 1. fingerprints the user's real dev sandbox (it must be identical at the end),
// 2. rebuilds the demo station from scratch (seed-main.mjs, fictional data),
// 3. starts the app with USERPROFILE etc. pointing into the demo home and CDP on 127.0.0.1,
// 4. runs the scenario at 1920x1080 and writes the PNGs, manifest.json and isolation.json.
//
// Product code is not touched: the app runs unmodified from the repo, in its own dev sandbox mode.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectPage, saveShot } from "./lib/cdp.mjs";
import { assertDemoHome, demoLayout, resolveDemoHome } from "./lib/demoPaths.mjs";
import { fingerprintTree, sameFingerprint } from "./lib/fingerprint.mjs";
import { REPO, ensureVite, isPortOpen, seedDemo, startApp, stopApp } from "./lib/launch.mjs";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const scenarioName = arg("scenario", "sample");
const demoHome = assertDemoHome(resolveDemoHome(arg("demo-home")));
const role = arg("role", "cotton");
const cdpPort = Number(arg("cdp-port", "9333"));
const outDir = path.resolve(arg("out", path.join(REPO, "agents", "chat", "artefakty", "ui-dostawa", `shots-${scenarioName}`)));
const VIEWPORT = { width: 1920, height: 1080 };

const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

const main = async () => {
  if (await isPortOpen(cdpPort)) throw new Error(`CDP port ${cdpPort} is already in use - pass another --cdp-port`);
  const scenario = await import(pathToFileURL(path.join(REPO, "scripts", "ui-shots", "scenarios", `${scenarioName}.mjs`)).href);

  // The user's own sandbox: read-only fingerprint before and after.
  const realSandbox = path.join(os.userInfo().homedir, "ripflow-sandbox");
  const before = fingerprintTree(realSandbox);

  const startedAt = Date.now();
  const vite = await ensureVite();
  console.log(`[shots] vite: ${vite.started ? "started by this run" : "already running, reused"}`);
  console.log("[shots] seeding the demo station...");
  await seedDemo({ demoHome, role });

  console.log("[shots] starting the app...");
  const app = startApp({ demoHome, cdpPort });
  const shots = [];
  let page = null;
  try {
    page = await connectPage(cdpPort);
    await page.setViewport(VIEWPORT.width, VIEWPORT.height);
    // The startup loader is over when the navigation bar is there.
    await page.waitForText("Settings", { selector: "nav button span", within: "nav", timeoutMs: 60000 });
    await page.sleep(2500);

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const shot = async (meta) => {
      const row = await saveShot(page, outDir, meta);
      shots.push(row);
      console.log(`[shots] ${row.file}${row.stable ? "" : "  (UNSTABLE: still changing)"}`);
      return row;
    };
    await scenario.run({ page, shot });
  } finally {
    page?.close();
    await stopApp(app.child);
    await vite.stop();
  }

  const layout = demoLayout(demoHome);
  const after = fingerprintTree(realSandbox);
  const manifest = {
    scenario: scenarioName,
    takenAt: new Date(startedAt).toISOString(),
    viewport: VIEWPORT,
    role,
    gitHead: git("rev-parse", "--short", "HEAD"),
    gitDirty: git("status", "--porcelain", "--", "src", "package.json") !== "",
    shots,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const userDataFiles = fs.existsSync(layout.userData) ? fs.readdirSync(layout.userData) : [];
  const isolation = {
    demoHome,
    realSandbox,
    realSandboxBefore: { exists: before.exists, files: before.files.length, digest: before.digest },
    realSandboxAfter: { exists: after.exists, files: after.files.length, digest: after.digest },
    realSandboxUnchanged: sameFingerprint(before, after),
    appUserDataInDemo: layout.userData,
    appUserDataEntries: userDataFiles.length,
    appLogMentionsRealHome: app.getLog().includes(os.userInfo().homedir),
  };
  fs.writeFileSync(path.join(outDir, "isolation.json"), JSON.stringify(isolation, null, 2), "utf8");
  console.log(`[shots] ${shots.length} screenshots -> ${outDir}`);
  console.log(`[shots] real sandbox unchanged: ${isolation.realSandboxUnchanged}`);
  if (!isolation.realSandboxUnchanged) process.exitCode = 3;
  if (shots.some((s) => !s.stable)) process.exitCode = process.exitCode || 4;
};

main().catch((err) => {
  console.error(`[shots] FAILED: ${err.stack ?? err}`);
  process.exit(1);
});

