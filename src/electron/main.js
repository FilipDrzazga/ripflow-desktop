import { app, BrowserWindow, Menu } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
console.log(__filename);
const __dirname = dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
    },
  });

  // DEV: Vite
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    // PROD: po buildzie Vite -> dist/ui/index.html
    win.loadFile(join(app.getAppPath(), "dist/ui/index.html"));
  }
}

app.whenReady().then(() => {
  // Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
