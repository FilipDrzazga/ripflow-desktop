import { BrowserWindow } from "electron";
import bwipjs from "bwip-js";
import { getSettings } from "./getSettings.js";

const buildLabelHtml = ({ batchName, barcodeBase64 }) => {
  const displayName = batchName.length > 48 ? `${batchName.slice(0, 45)}…` : batchName;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: 102mm 76mm; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 102mm; background: #fff; color: #000; font-family: Helvetica, Arial, sans-serif; }
  .batch-name { font-size: 8pt; font-weight: bold; margin-bottom: 4mm; word-break: break-all; text-align: center; }
  .barcode { display: flex; justify-content: center; }
  .barcode img { width: 50%; display: block; }
</style>
</head>
<body>
  <div class="batch-name">${displayName}</div>
  <div class="barcode"><img src="data:image/png;base64,${barcodeBase64}"></div>
</body>
</html>`;
};

// Resolves with null on success, or an error string on failure.
const printHtml = (html, labelPrinterName) =>
  new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 620,
      backgroundColor: "#ffffff",
      webPreferences: { contextIsolation: true },
    });

    let printError = null;

    const cleanup = () => {
      try { win.close(); } catch { /* already closed */ }
      resolve(printError);
    };

    const loadTimeout = setTimeout(() => {
      console.error("[label] did-finish-load timeout — aborting print");
      printError = "Page load timeout";
      cleanup();
    }, 15000);

    win.webContents.once("did-finish-load", () => {
      clearTimeout(loadTimeout);
      const printOptions = {
        silent: true,
        printBackground: false,
        pageSize: { width: 102000, height: 76000 },
        ...(labelPrinterName ? { deviceName: labelPrinterName } : {}),
      };
      try {
        win.webContents.print(printOptions, (success, failureReason) => {
          if (!success && failureReason) {
            console.error("[label] print failed:", failureReason);
            printError = failureReason;
          }
          cleanup();
        });
      } catch (err) {
        console.error("[label] print call threw:", err);
        printError = err.message;
        cleanup();
      }
    });

    win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      clearTimeout(loadTimeout);
      console.error("[label] load failed:", errorCode, errorDescription);
      printError = errorDescription;
      cleanup();
    });

    win.loadURL(`data:text/html,${encodeURIComponent(html)}`).catch((err) => {
      clearTimeout(loadTimeout);
      console.error("[label] loadURL rejected:", err);
      printError = err.message;
      cleanup();
    });
  });

export const printBatchLabel = async ({ batchName }) => {
  try {
    const { labelPrinterName } = getSettings();

    const barcodeText = batchName.match(/^PRINTED_(\d{6})/)?.[1] ?? batchName;

    const barcodeBuffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: barcodeText,
      scale: 1,
      height: 10,
      includetext: false,
    });

    const barcodeBase64 = barcodeBuffer.toString("base64");
    const html = buildLabelHtml({ batchName, barcodeBase64 });
    const printError = await printHtml(html, labelPrinterName);

    if (printError) {
      return { success: false, error: printError };
    }
    return { success: true };
  } catch (err) {
    console.error("[label] printBatchLabel failed:", err);
    return { success: false, error: err.message };
  }
};
