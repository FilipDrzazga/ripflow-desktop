import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import process from "process";
import { registerIpcHandlers } from "./ipc/index.js";
import { setDbErrorSink } from "./helpers/db.js";
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

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // Bridge critical-DB-write signals to the renderer (one degraded banner). Same
  // win?.webContents.send pattern as the auto-updater events below.
  setDbErrorSink((channel, payload) => win?.webContents.send(channel, payload));

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
