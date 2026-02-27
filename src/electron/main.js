import { app, BrowserWindow } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import process from "process";
import { registerIpcHandlers } from "./ipc/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mainWindow = () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 1300,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
    },
  });

  // DEV: Vite
  if (!app.isPackaged) {
    // win.maximize();
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools();
  } else {
    // PROD: po buildzie Vite -> dist/ui/index.html
    win.loadFile(join(app.getAppPath(), "dist/ui/index.html"));
  }
};

app.whenReady().then(() => {
  // Menu.setApplicationMenu(null);
  registerIpcHandlers();
  mainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
