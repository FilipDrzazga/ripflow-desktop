// The custom-order XML (Minerva / polyester orders), as a pure function: no electron, no
// settings, no randomness inside. The caller passes the artwork folder and the nesting id,
// so the output can be pinned by a test (ETAP 2d-1 - hole (b) of the Etap 2 gate: this XML
// had no baseline at all). Moved out of ipc/customOrderHandlers.js byte for byte; the
// handler still reads the settings and draws the UUID exactly as before.
import path from "path";
import { LM_XML_POLY } from "../../shared/printWidths.js";

const escapeXml = (value) => {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

export const buildCustomOrderXML = (group, batchId, { customOrderFolderPath, nestingId }) => {
  const { poNumber, materialName, printer, files } = group;
  const foundFiles = files.filter((f) => f.found);
  const totalMeters = foundFiles.reduce((sum, f) => sum + f.metersToprint, 0).toFixed(1);

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
  <PhysicalGroup>Min_${escapeXml(materialName)}_${escapeXml(totalMeters)}m_PO${escapeXml(poNumber)}</PhysicalGroup>
  <Documents>
${documentsXml}
  </Documents>
</RipFlowJob>`;
};
