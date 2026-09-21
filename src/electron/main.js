// MUST stay the FIRST import: ES modules evaluate in import order, so sandboxBoot.js moves
// userData into the local sandbox before getSettings.js (via ./ipc/index.js) builds its Store.
import { SANDBOX_ROOT } from "./sandboxBoot.js";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import process from "process";
import { registerIpcHandlers } from "./ipc/index.js";
import { setDbErrorSink } from "./helpers/db.js";
import { setPrintedRootSink } from "./ipc/readPrintedFolder.js";
import { getSettings } from "./helpers/getSettings.js";
import { findUnsafeSettings } from "./helpers/sandboxGuard.js";
const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let win = null;

const createWindow = () => {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    frame: false,
    show: false,
    icon: join(__dirname, "assets/ripflow_icon.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  ipcMain.on("window:minimize", () => win.minimize());
  ipcMain.on("window:close", () => win.close());

  ipcMain.handle("dialog:confirm", async (_event, message) => {
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Cancel", "OK"],
      defaultId: 1,
      cancelId: 0,
      message,
    });
    return response === 1;
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(app.getAppPath(), "dist/index.html"));
  }
};

// awaited: registerIpcHandlers became async so the one-time shop-profile migration can
// finish before anything reads the profile. Ordering is unchanged for everything else -
// createWindow still runs first among the steps below, the ipcMain handlers registered
// further down are still in place before any renderer exists to call them, and
// setDbErrorSink was already wired AFTER createWindow, so the migration never had a sink
// to emit through anyway (its degraded flag is picked up by the renderer startup snapshot).
app.whenReady().then(async () => {
  // Run from the repo (not installed): refuse to start unless every path setting lives in
  // the local sandbox. Checked BEFORE registerIpcHandlers - i.e. before initDb and every other
  // startup write. The installed build never enters this branch.
  if (!app.isPackaged) {
    const unsafe = findUnsafeSettings(getSettings(), SANDBOX_ROOT);
    if (unsafe.length > 0) {
      const lines = unsafe.map((u) => `- ${u.key} = ${JSON.stringify(u.value)} (${u.reason})`).join("\n");
      const message =
        "RipFlow was started from the repository, so it may only use its local sandbox.\n\n" +
        `Sandbox: ${SANDBOX_ROOT}\n\nThese settings point outside it:\n${lines}\n\n` +
        `Fix or delete ${join(app.getPath("userData"), "config.json")} (deleting it re-seeds safe paths).`;
      console.error(`[sandbox] refusing to start:\n${message}`);
      dialog.showErrorBox("RipFlow dev sandbox - refusing to start", message);
      app.exit(1);
      return;
    }
  }

  await registerIpcHandlers();
  createWindow();

  // Bridge critical-DB-write signals to the renderer (one degraded banner). Same
  // win?.webContents.send pattern as the auto-updater events below.
  setDbErrorSink((channel, payload) => win?.webContents.send(channel, payload));
  // Same bridge for PRINTED root reachability - one banner, emitted on transition only.
  setPrintedRootSink((channel, payload) => win?.webContents.send(channel, payload));

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    win?.webContents.send("update:available", info.version);
  });
  autoUpdater.on("download-progress", (progress) => {
    win?.webContents.send("update:progress", Math.floor(progress.percent));
  });
  autoUpdater.on("update-downloaded", () => {
    win?.webContents.send("update:ready");
  });
  autoUpdater.on("update-not-available", () => {
    win?.webContents.send("update:not-available");
  });
  autoUpdater.on("error", (err) => {
    win?.webContents.send("update:error", err.message);
  });

  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  }

  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("update:check", () => {
    // Run from the repo: never reach electron-updater. Installed build unchanged.
    if (!app.isPackaged) return { success: false, reason: "sandbox" };
    const timeout = setTimeout(() => {
      win?.webContents.send("update:error", "Update check timed out. Check your internet connection.");
    }, 12000);
    return autoUpdater.checkForUpdates().finally(() => clearTimeout(timeout));
  });
  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
