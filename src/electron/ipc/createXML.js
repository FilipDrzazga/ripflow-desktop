import fs from "node:fs/promises";
import path from "node:path";
import { updateManifest, appendEvent } from "./manifest.js";

const XML_HOTFOLDER = "O:\SPPrintReadyArtwork\PRINTED\PRODUCTIZE_XML_IN";

const escapeXml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const buildProductizeXml = (manifest) => {
  const batchId = manifest?.batchId ?? "UNKNOWN_BATCH";
  const printerName = manifest?.printerName ?? "";
  const paths = manifest?.paths ?? {};
  const files = Array.isArray(manifest?.files) ? manifest.files : [];

  // ważne: do productize powinien być READY, nie nestedDir
  const outputDir = paths?.readyDir ?? "";

  const documentsXml = files
    .map((file) => {
      const docPath = file?.sourcePath ?? file?.printFilePath ?? "";
      const copies = file?.qty ?? 1;
      const printType = file?.printType ?? "";

      return `
    <Document>
      <DocumentPath>${escapeXml(docPath)}</DocumentPath>
      <PrintType>${escapeXml(printType)}</PrintType>
      <Copies>${escapeXml(copies)}</Copies>
    </Document>`;
    })
    .join("");

  // kluczowe: poprawny prolog XML
  return `<?xml version="1.0" encoding="UTF-8"?>
<RipFlowBatch>
  <BatchId>${escapeXml(batchId)}</BatchId>
  <PrinterName>${escapeXml(printerName)}</PrinterName>
  <OutputDir>${escapeXml(outputDir)}</OutputDir>

  <Documents>
    ${documentsXml}
  </Documents>
</RipFlowBatch>`;
};

export const sendBatchToProductize = async (batchRoot) => {
  try {
    const manifestPath = path.join(batchRoot, "manifest.json");
    const raw = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    const xmlString = buildProductizeXml(manifest);

    const xmlFileName = `${manifest.batchId}.xml`;
    const xmlPath = path.join(XML_HOTFOLDER, xmlFileName);
    // upewnij się że folder istnieje
    try{
        await fs.mkdir(XML_HOTFOLDER, { recursive: true });

        await fs.writeFile(xmlPath, xmlString, "utf-8");
    } catch (err) {
        console.error("Failed to write XML file:", err);
        throw new Error("Failed to write XML file: " + (err?.message ?? err));
    }



    await updateManifest(batchRoot, { status: "PRODUCTIZE_RUNNING" });
    await appendEvent(batchRoot, {
      type: "PRODUCTIZE_XML_WRITTEN",
      note: `Batch sent to productize: ${xmlFileName}`,
    });

    return { ok: true, xmlPath };
  } catch (err) {
    // jak coś wywali - zapisz w manifeście
    try {
      await updateManifest(batchRoot, { status: "ERROR", error: String(err?.message ?? err) });
      await appendEvent(batchRoot, { type: "ERROR", note: String(err?.message ?? err) });
    } catch (_) {}

    return { ok: false, error: String(err?.message ?? err) };
  }
};