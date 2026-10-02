// Starting Electron for the demo: the seed (a main script that exits) and the app (a window we drive over CDP).
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertDemoHome, assertInside, demoEnv, demoLayout, resetDemoSandbox, writeDemoConfig } from "./demoPaths.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(here, "..", "..", "..");
const require = createRequire(import.meta.url);
// The electron package exports the path of its binary.
const electronBinary = () => require(path.join(REPO, "node_modules", "electron"));

export const isPortOpen = (port, host = "localhost") =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });

export const waitFor = async (fn, { timeoutMs = 30000, everyMs = 250, what = "condition" } = {}) => {
  const end = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out waiting for ${what}${lastError ? ` (${lastError.message})` : ""}`);
};

// Fresh demo: wipes <demo-home>\ripflow-sandbox, writes the config and runs seed-main.mjs.
export const seedDemo = async ({ demoHome, role = "cotton", variant = "v0" }) => {
  const home = assertDemoHome(demoHome);
  resetDemoSandbox(home);
  writeDemoConfig(home, { workstationRole: role === "none" ? "" : role });
  const env = demoEnv(home, { UI_SHOTS_DEMO_HOME: home, UI_SHOTS_ROLE: role, UI_SHOTS_VARIANT: variant, ELECTRON_ENABLE_LOGGING: "0" });
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBinary(), [path.join(REPO, "scripts", "ui-shots", "seed-main.mjs")], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) throw new Error(`seed failed (exit ${code}):\n${out.split("\n").filter((l) => l.trim() !== "").slice(-15).join("\n")}`);
  if (variant === "v4") corruptDemoDb(home);
  return out;
};

// Variant V4: the shared database is not a database any more (a state no click can make).
const corruptDemoDb = (home) => {
  const layout = demoLayout(home);
  const dbFile = path.join(layout.storagePath, "ripflow.db");
  assertInside(home, dbFile);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true });
  fs.writeFileSync(dbFile, "this is not a SQLite database - demo variant V4".repeat(40), "utf8");
};

// Starts the app (repo mode, so the sandbox guard stays on) with remote debugging on localhost only.
export const startApp = ({ demoHome, cdpPort }) => {
  const home = assertDemoHome(demoHome);
  const env = demoEnv(home, { UI_SHOTS_DEMO_HOME: home });
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBinary(), [".", `--remote-debugging-port=${cdpPort}`, "--remote-debugging-address=127.0.0.1"], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, getLog: () => log };
};

export const stopApp = async (child) => {
  if (!child || child.exitCode !== null) return;
  // taskkill /T: the app, its renderer and GPU processes - only the tree we started.
  await new Promise((resolve) => {
    const k = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    k.on("exit", resolve);
    k.on("error", resolve);
  });
};

// Starts our own Vite dev server when 5173 is free (the app loads http://localhost:5173 in repo mode).
// A server that is already there is reused, never stopped: it serves the same repo.
export const ensureVite = async () => {
  if (await isPortOpen(5173)) return { started: false, stop: async () => {} };
  const viteBin = path.join(REPO, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteBin, "--port", "5173"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  await waitFor(() => isPortOpen(5173), { what: "vite on 5173", timeoutMs: 45000 });
  return { started: true, stop: () => stopApp(child) };
};
