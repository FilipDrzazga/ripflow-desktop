import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import process from "process";
import { registerIpcHandlers } from "./ipc/index.js";
import { autoUpdater } from "electron-updater";

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
    icon: join(__dirname, "../ui/assets/image/favicon.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  ipcMain.on("window:minimize", () => win.minimize());
  ipcMain.on("window:maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
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
  autoUpdater.on("error", (err) => {
    win?.webContents.send("update:error", err.message);
  });

  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  }

  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("update:check", () => autoUpdater.checkForUpdates());
  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
