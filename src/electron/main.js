import { app, BrowserWindow } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
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
    win.loadURL("http://localhost:5173/");
    win.webContents.openDevTools();
  } else {
    // PROD: po buildzie Vite -> dist/ui/index.html
    win.loadFile(join(app.getAppPath(), "dist/ui/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (app.process.platform !== "darwin") app.quit();
});
