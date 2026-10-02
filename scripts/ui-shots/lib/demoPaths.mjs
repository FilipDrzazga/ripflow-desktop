// Paths and guards shared by the UI-shots tools (seed-main.mjs, run.mjs).
//
// The demo station lives under a DEMO HOME (default C:\ripflow-demo). The app is started with
// USERPROFILE / HOME / APPDATA / LOCALAPPDATA pointing into it, so sandboxBoot.js (which uses
// os.homedir()) puts its sandbox at <demo-home>\ripflow-sandbox and the sandbox guard keeps
// checking every path setting. The real sandbox in the user's own home is never opened.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const win = path.win32;

export const DEFAULT_DEMO_HOME = "C:\\ripflow-demo";

export const resolveDemoHome = (value) => win.resolve(value || process.env.UI_SHOTS_DEMO_HOME || DEFAULT_DEMO_HOME);

// Fail-closed: the generator may only write and delete under a folder that is named like a demo
// home and is not (and does not contain) the real home of the current user.
export const assertDemoHome = (demoHome) => {
  const resolved = win.resolve(demoHome);
  const real = win.resolve(os.userInfo().homedir);
  if (!win.basename(resolved).toLowerCase().startsWith("ripflow-demo")) {
    throw new Error(`demo home must be a folder named ripflow-demo*: ${resolved}`);
  }
  if (resolved.toLowerCase() === real.toLowerCase() || real.toLowerCase().startsWith(resolved.toLowerCase() + win.sep)) {
    throw new Error(`demo home must not be the real home folder or a parent of it: ${resolved}`);
  }
  if (/^[\\/]{2}/.test(resolved) || /^o:/i.test(resolved)) {
    throw new Error(`demo home must be a local folder: ${resolved}`);
  }
  return resolved;
};

export const demoLayout = (demoHome) => {
  const root = win.join(demoHome, "ripflow-sandbox");
  return {
    demoHome,
    root,
    userData: win.join(root, "userData"),
    configPath: win.join(root, "userData", "config.json"),
    storagePath: win.join(root, "storage"),
    xmlPath: win.join(root, "xml"),
    customOrderFolderPath: win.join(root, "custom"),
  };
};

// true when `target` is `base` or lies under it (case-insensitive, like Windows).
export const isUnder = (target, base) => {
  const rel = win.relative(win.resolve(base).toLowerCase(), win.resolve(target).toLowerCase());
  return rel === "" || (rel.split(win.sep)[0] !== ".." && !win.isAbsolute(rel));
};

// Every generator write goes through this: a path outside the demo home is refused.
export const assertInside = (demoHome, target) => {
  if (!isUnder(target, demoHome)) throw new Error(`refusing to touch a path outside the demo home: ${target}`);
  return target;
};

// The environment the app and the seed run with: every "home"-like variable points into the demo home.
export const demoEnv = (demoHome, extra = {}) => ({
  ...process.env,
  USERPROFILE: demoHome,
  HOME: demoHome,
  APPDATA: win.join(demoHome, "AppData", "Roaming"),
  LOCALAPPDATA: win.join(demoHome, "AppData", "Local"),
  HOMEDRIVE: win.parse(demoHome).root.replace(/[\\/]$/, ""),
  HOMEPATH: demoHome.slice(win.parse(demoHome).root.length - 1),
  ...extra,
});

// Fresh start: removes ONLY <demo-home>\ripflow-sandbox, then recreates the empty folders.
export const resetDemoSandbox = (demoHome) => {
  const layout = demoLayout(assertDemoHome(demoHome));
  assertInside(layout.demoHome, layout.root);
  fs.rmSync(layout.root, { recursive: true, force: true });
  for (const dir of [layout.userData, layout.storagePath, layout.xmlPath, layout.customOrderFolderPath]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(win.join(demoHome, "AppData", "Roaming"), { recursive: true });
  fs.mkdirSync(win.join(demoHome, "AppData", "Local"), { recursive: true });
  return layout;
};

export const writeDemoConfig = (demoHome, overrides = {}) => {
  const layout = demoLayout(assertDemoHome(demoHome));
  const config = {
    storagePath: layout.storagePath,
    xmlPath: layout.xmlPath,
    customOrderFolderPath: layout.customOrderFolderPath,
    labelPrintMode: "manual",
    labelPrinterName: "",
    workstationName: "DEMO-STATION-1",
    workstationRole: "cotton",
    shippedRetentionDays: 30,
    batchHistoryEagerDays: 7,
    clientId: "all",
    ...overrides,
  };
  fs.mkdirSync(layout.userData, { recursive: true });
  fs.writeFileSync(layout.configPath, JSON.stringify(config, null, 2), "utf8");
  return config;
};
