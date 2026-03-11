import { getRootPath } from "../helpers/getRootPath.js";
import path from "path";
import fs from "fs";

const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  BUILD_XML: "build_xml",
  WRITE_XML: "write_xml",
  DONE: "done",
};

const FILE_SAFE_BATCH_ID_PATTERN = /[^a-zA-Z0-9_-]/g;

const escapeXml = (value) => {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

const toXMLError = (error, stage) => {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "An unknown error occurred.",
    stage: error.stage || stage || "unknown",
    type: error.type || "Error",
    title: error.title || "XML generation failed",
  };
};

const normalizeBatchId = (createdBatchId) => {
  if (typeof createdBatchId === "string") {
    return createdBatchId.trim();
  }

  if (createdBatchId && typeof createdBatchId.batchId === "string") {
    return createdBatchId.batchId.trim();
  }

  return "";
};

const buildPFJobXML = (batch, batchId) => {
  const ROOT_PATH = getRootPath();
  const PRINTED_ROOT_PATH = path.resolve(ROOT_PATH, "PRINTED");
  const BASE_FINAL_PATH = path.join(PRINTED_ROOT_PATH, batchId);

  const xml = `
    <RipFlowJob>
      <BatchId>${escapeXml(batchId)}</BatchId>
      <Printer>${escapeXml(batch[0]?.printer)}</Printer>
      <PhysicalGroup>${escapeXml(batch[0]?.materialType)}</PhysicalGroup>
      <LogisticGroup>${escapeXml(batchId)}</LogisticGroup>
      <Documents>
          ${batch
            .map((item) => {
              const sourcePath = path.resolve(String(item?.file?.fullPath || ""));
              const fileName = path.basename(sourcePath);
              const finalPath = path.join(BASE_FINAL_PATH, fileName);
              return `
        <Document>
          <Path>${escapeXml(finalPath)}</Path>
          <Name>${escapeXml(item?.file?.name)}</Name>
          <Copies>${escapeXml(item.qty)}</Copies>
          <DocumentId>${escapeXml(item.artworkId)}</DocumentId>
          <Width>${escapeXml(item.width)}</Width>
          <Height>${escapeXml(item.height)}</Height>
          <Material>${escapeXml(item.material)}</Material>
          <MaterialType>${escapeXml(item.materialType)}</MaterialType>
          <OrderId>${escapeXml(item.orderId)}</OrderId>
          <PrintType>${escapeXml(item.printType)}</PrintType>
          <PrintTypeCode>${escapeXml(item.printTypeCode)}</PrintTypeCode>
          <Size>${item.size ? escapeXml(item.size) : ""}</Size>
          <Variant>${escapeXml(item.variant)}</Variant>
          <OriginalSourcePath>${escapeXml(sourcePath)}</OriginalSourcePath>
        </Document>`;
            })
            .join("\n")}
      </Documents>
    </RipFlowJob>`;
  return xml;
};

export async function submitBatchToPrintFactory(batch, createdBatchId) {
  const result = {
    success: false,
    errors: [],
    finalXmlPath: null,
    batchId: null,
  };

  let stage = STAGES.INIT;
  try {
    stage = STAGES.VALIDATE;
    if (!Array.isArray(batch) || batch.length === 0) {
      throw Object.assign(new Error("Batch must be a non-empty array."), {
        code: "ERR_INVALID_ARG_TYPE",
        stage,
        title: "Invalid batch input",
      });
    }

    const normalizedBatchId = normalizeBatchId(createdBatchId);
    if (!normalizedBatchId) {
      throw Object.assign(new Error("Batch ID is not a valid format."), {
        code: "ERR_INVALID_BATCH_ID",
        stage,
        title: "Invalid batch ID, XML.",
      });
    }
    result.batchId = normalizedBatchId;

    const ROOT_PATH = getRootPath();
    const AUTOMATION_WORKFLOW_PATH = path.resolve(ROOT_PATH, "AUTOMATION_WORKFLOW");

    try {
      await fs.promises.access(AUTOMATION_WORKFLOW_PATH, fs.constants.W_OK);
    } catch (err) {
      if (err.code === "ENOENT") {
        await fs.promises.mkdir(AUTOMATION_WORKFLOW_PATH, { recursive: true });
      } else {
        throw Object.assign(new Error(`Cannot access automation workflow directory: ${err.message}`), {
          code: "ERR_WORKFLOW_PATH_ACCESS",
          stage,
          title: "Automation directory access failed",
          type: "Error",
        });
      }
    }

    stage = STAGES.BUILD_XML;
    const xml = buildPFJobXML(batch, normalizedBatchId);

    if (typeof xml !== "string" || xml.trim() === "") {
      throw Object.assign(new Error("Generated XML is empty or invalid."), {
        code: "ERR_INVALID_XML",
        stage,
        title: "XML generation failed",
      });
    }

    const safeBatchId = normalizedBatchId.replace(FILE_SAFE_BATCH_ID_PATTERN, "_");
    const xmlFileName = `job-${safeBatchId}.xml`;
    const tempXmlPath = path.join(AUTOMATION_WORKFLOW_PATH, `${xmlFileName}.tmp`);
    const finalXmlPath = path.join(AUTOMATION_WORKFLOW_PATH, xmlFileName);

    stage = STAGES.WRITE_XML;

    try {
      await fs.promises.writeFile(tempXmlPath, xml, "utf8");
    } catch (err) {
      throw Object.assign(new Error(`Failed to write XML file: ${err.message}`), {
        code: "ERR_FILE_WRITE",
        stage,
        title: "File write error",
        type: "Error",
      });
    }

    try {
      await fs.promises.rename(tempXmlPath, finalXmlPath);
    } catch (err) {
      try {
        await fs.promises.unlink(tempXmlPath);
      } catch {
        // Ignore temp cleanup error to surface the primary rename failure.
      }

      throw Object.assign(new Error(`Failed to rename XML file: ${err.message}`), {
        code: "ERR_FILE_RENAME",
        stage,
        title: "File rename error",
        type: "Error",
      });
    }

    result.success = true;
    result.finalXmlPath = finalXmlPath;
    stage = STAGES.DONE;
  } catch (err) {
    result.errors = [toXMLError(err, stage)];
  }
  return result;
}
