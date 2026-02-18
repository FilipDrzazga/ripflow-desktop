import { app, BrowserWindow, Menu, ipcMain } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import process from "process";
import fs from "fs";
import path from "path";
import { isPDF } from "./helpers/isPDF.js";
import { parsePrintFileName } from "./helpers/parseFileName.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 800,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
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

ipcMain.handle("read-folder", async () => {
  const HOME_PATH = "C:\\automation";
  const WORK_PATH = "O:\\SPPrintReadyArtwork";

  const PATH = fs.existsSync(WORK_PATH) ? WORK_PATH : HOME_PATH;
  // read all folders in MAIN folder
  const getJobsFolders = await fs.promises.readdir(PATH, { withFileTypes: true });
  // check if the FOLDERS are directory
  const jobsFolders = getJobsFolders.filter((folder) => folder.isDirectory()).map((folder) => folder.name);
  const results = [];
  //get job files inside each folder
  for (const folder of jobsFolders) {
    const mainPath = path.join(PATH, folder);

    const getFilesInside = await fs.promises.readdir(mainPath, { withFileTypes: true });

    const files = getFilesInside
      .filter((file) => file.isFile())
      .map(async (file) => {
        const ispdf = await isPDF(path.join(mainPath, file.name));
        if (!ispdf) return null;
        return file.name;
      });
    const f = await Promise.all(files);
    f.filter(Boolean).forEach((printJob) => {
      const meta = parsePrintFileName(printJob, { fullPath: path.join(mainPath, printJob) });
      if (!meta) return null;

      results.push({
        id: `${folder}_${printJob}`,
        printFilePath: path.join(mainPath, printJob),
        printFolder: folder,
        ...meta,
      });
    });
  }
  return results;
});
