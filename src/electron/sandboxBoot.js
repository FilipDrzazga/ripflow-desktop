// Dev sandbox boot. Imported ONLY for its side effect, and it MUST stay the FIRST import in
// main.js: ES modules evaluate in import order, so this runs before getSettings.js (reached
// through ./ipc/index.js) constructs its electron-store Store and reads config.json.
//
// Why: electron-store keeps config.json in app.getPath("userData"), which Electron derives
// from the package name. Run from the repo (`npm run dev`), that is %APPDATA%\ripflow-desktop
// - the SAME directory the installed app uses. Measured on Cotton PC (KROK A2 recon): a dev
// start therefore ran on the LIVE station config (storagePath/xmlPath =
// \\FAS-LON-SRV01\..., Munbyn label printer, automatic label printing), and the start alone
// writes to the shared DB, deletes rows (cleanupShippedStages, pruneOrphanHolds) and removes
// .tmp-* folders on the share. That is how the 2026-07-31 incident happened.
//
// Installed build (app.isPackaged): does NOTHING - no setPath, no file writes.
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const bootSandbox = () => {
  if (app.isPackaged) return null;

  const sandboxRoot = path.join(os.homedir(), "ripflow-sandbox");
  const userData = path.join(sandboxRoot, "userData");
  // setPath throws for a directory that does not exist, so create it first.
  fs.mkdirSync(userData, { recursive: true });
  app.setPath("userData", userData);

  const configPath = path.join(userData, "config.json");
  if (!fs.existsSync(configPath)) {
    const storagePath = path.join(sandboxRoot, "storage");
    const xmlPath = path.join(sandboxRoot, "xml");
    const customOrderFolderPath = path.join(sandboxRoot, "custom");
    for (const dir of [storagePath, xmlPath, customOrderFolderPath]) fs.mkdirSync(dir, { recursive: true });
    const seed = {
      storagePath,
      xmlPath,
      customOrderFolderPath,
      labelPrintMode: "manual",
      labelPrinterName: "",
      workstationName: "DEV-SANDBOX",
      workstationRole: "cotton",
    };
    fs.writeFileSync(configPath, JSON.stringify(seed, null, 2), "utf8");
  }

  return sandboxRoot;
};

// Absolute sandbox root when run from the repo; null in the installed build.
export const SANDBOX_ROOT = bootSandbox();
