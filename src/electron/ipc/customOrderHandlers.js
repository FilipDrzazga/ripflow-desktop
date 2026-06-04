import { ipcMain, dialog, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { getSettings } from "../helpers/getSettings.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parseCSVContent } from "../helpers/parseCustomOrderCSV.js";
import { scanCustomOrderFolder, matchFiles } from "../helpers/customOrderMatcher.js";
import { insertCustomOrder, getAllCustomOrders, clearCustomOrders } from "../helpers/db.js";
import { LM_XML_POLY } from "../../shared/printWidths.js";
import { PRINTER, CUSTOM_ORDER_STATUS } from "../../shared/constants.js";

let cachedFileNames = [];

const escapeXml = (value) => {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

const buildCustomOrderXML = (group, batchId) => {
  const { poNumber, materialName, printer, files } = group;
  const foundFiles = files.filter((f) => f.found);
  const totalMeters = foundFiles.reduce((sum, f) => sum + f.metersToprint, 0).toFixed(1);
  const nestingId = randomUUID();
  const { customOrderFolderPath } = getSettings();

  const documentsXml = foundFiles
    .map((f) => {
      const filePath = path.join(customOrderFolderPath, `${f.fileName}.tif`);
      return `    <Document>
      <Path>${escapeXml(filePath)}</Path>
      <Name>${escapeXml(f.fileName)}</Name>
      <Copies>1</Copies>
      <DocumentId>${escapeXml(f.fileName)}</DocumentId>
      <Width>${LM_XML_POLY}</Width>
      <Height>${Math.round(f.metersToprint * 1000)}</Height>
      <Material>${escapeXml(materialName)}</Material>
      <MaterialType>Polyesters</MaterialType>
      <OrderId>${escapeXml(poNumber)}</OrderId>
      <PrintTypeCode>LM</PrintTypeCode>
      <IsVelvet>false</IsVelvet>
      <IsLinen>false</IsLinen>
      <IsBlossom>false</IsBlossom>
    </Document>`;
    })
    .join("\n");

  return `<RipFlowJob>
  <BatchId>${escapeXml(batchId)}</BatchId>
  <Printer>${escapeXml(printer)}</Printer>
  <BatchType>CUSTOM_ORDER</BatchType>
  <PONumber>${escapeXml(poNumber)}</PONumber>
  <NestingGroup>${escapeXml(nestingId)}</NestingGroup>
  <LogisticGroup>${escapeXml(nestingId)}_${escapeXml(totalMeters)}m</LogisticGroup>
  <PhysicalGroup>Minerva_${escapeXml(materialName)}_${escapeXml(totalMeters)}m</PhysicalGroup>
  <Documents>
${documentsXml}
  </Documents>
</RipFlowJob>`;
};

export function registerCustomOrderHandlers() {
  ipcMain.handle("customOrder:scanFolder", async () => {
    try {
      const { customOrderFolderPath } = getSettings();
      if (!customOrderFolderPath) {
        cachedFileNames = [];
        return { success: true, count: 0 };
      }
      cachedFileNames = await scanCustomOrderFolder(customOrderFolderPath);
      return { success: true, count: cachedFileNames.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("customOrder:importCSVContent", async (_event, content) => {
    try {
      const parsed = parseCSVContent(content);
      const enriched = matchFiles(parsed, cachedFileNames);
      const totalMeters = enriched.files.reduce((sum, f) => sum + f.metersToprint, 0);
      const missingCount = enriched.files.filter((f) => !f.found).length;
      return {
        success: true,
        data: {
          poNumber: enriched.poNumber,
          materialName: enriched.materialName,
          printer: null,
          files: enriched.files,
          totalMeters,
          missingCount,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("customOrder:generateXML", async (_event, group) => {
    try {
      const { poNumber, printer, files, totalMeters } = group;

      if (!printer || (printer !== PRINTER.YOKO && printer !== PRINTER.YUMI)) {
        return { success: false, error: "Invalid printer selection. Choose YOKO or YUMI." };
      }

      const workflowPath = path.join(getStorageRootPath(), "AUTOMATION_WORKFLOW_MINERVA");
      await fs.promises.mkdir(workflowPath, { recursive: true });

      const safePo = poNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
      const dateTag = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const batchId = `CUSTOM_ORDER_${safePo}_${dateTag}_${randomUUID().split("-")[0]}`;
      const xmlFileName = `${batchId}.xml`;
      const tempPath = path.join(workflowPath, `${xmlFileName}.tmp`);
      const finalPath = path.join(workflowPath, xmlFileName);

      const xml = buildCustomOrderXML(group, batchId);
      await fs.promises.writeFile(tempPath, xml, "utf8");
      await fs.promises.rename(tempPath, finalPath);

      const missingFiles = files.filter((f) => !f.found);
      insertCustomOrder({
        poNumber: group.poNumber,
        materialName: group.materialName,
        printer,
        date: new Date().toISOString(),
        totalFiles: files.length,
        missingFiles: missingFiles.length,
        totalMeters,
        status: missingFiles.length > 0 ? CUSTOM_ORDER_STATUS.PARTIAL : CUSTOM_ORDER_STATUS.COMPLETE,
        files: files.map((f) => ({ fileName: f.fileName, meters: f.metersToprint, found: f.found })),
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("customOrder:getHistory", async () => {
    try {
      const orders = getAllCustomOrders();
      return { success: true, data: orders };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("customOrder:clearHistory", () => {
    try {
      clearCustomOrders();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("customOrder:selectCSV", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "CSV Files", extensions: ["csv"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true, files: [] };
    }
    const files = await Promise.all(
      result.filePaths.map(async (filePath) => {
        const content = await fs.promises.readFile(filePath, "utf8");
        return { name: path.basename(filePath), content };
      }),
    );
    return { success: true, canceled: false, files };
  });
}
