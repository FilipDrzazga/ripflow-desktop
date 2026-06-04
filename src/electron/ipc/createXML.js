import { getStorageRootPath, getXmlRootPath } from "../helpers/getRootPath.js";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { estimatePrintLength } from "../../shared/estimatePrintLength.js";
import { toIpcError } from "../helpers/ipcError.js";
import { PRINTER } from "../../shared/constants.js";
import { getFabricByName } from "../helpers/fabricCache.js";

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

const toXMLError = (error, stage) => toIpcError(error, stage, "XML generation failed");

const normalizeBatchId = (createdBatchId) => {
  if (typeof createdBatchId === "string") {
    return createdBatchId.trim();
  }

  if (createdBatchId && typeof createdBatchId.batchId === "string") {
    return createdBatchId.batchId.trim();
  }

  return "";
};

const getFabricFlag = (item, flagKey, fallbackKeyword) => {
  const fabric = getFabricByName((item.material ?? "").trim());
  if (fabric) return !!fabric[flagKey];
  // Fallback to string matching when material not in DB
  return (
    item.material?.toLowerCase().includes(fallbackKeyword) ||
    item.file?.name?.toLowerCase().includes(fallbackKeyword)
  );
};

const isVelvet = (item) => getFabricFlag(item, "isVelvet", "velvet");
const isLinen = (item) => getFabricFlag(item, "isLinen", "linen");
const isBlossom = (item) => getFabricFlag(item, "isBlossom", "blossom");

const getWorkflowFolderName = (printer) => {
  if (printer === PRINTER.DGEN) return "AUTOMATION_WORKFLOW_COTTON";
  if (printer === PRINTER.YOKO || printer === PRINTER.YUMI) return "AUTOMATION_WORKFLOW_POLY";
  throw Object.assign(new Error(`Unrecognized printer: "${printer}". Expected DGEN, YOKO, or YUMI.`), {
    code: "ERR_INVALID_PRINTER",
    stage: "validate",
    title: "Invalid printer",
    type: "Error",
  });
};

const buildPFJobXML = (batch, batchId) => {
  const ROOT_PATH = getXmlRootPath();
  const PRINTED_ROOT_PATH = `${ROOT_PATH}\\PRINTED`;
  const normalizedBatchId = batchId.replace(/\//g, "\\");
  const BASE_FINAL_PATH = `${PRINTED_ROOT_PATH}\\${normalizedBatchId}`;

  const getPrintGroupArr = batch.map((item) => item.printGroup);
  const uniquePrintGroups = [...new Set(getPrintGroupArr)];
  const printGroup = uniquePrintGroups.length === 1 ? uniquePrintGroups[0] : "SAMPLES";

  const id = randomUUID();
  const estimated = estimatePrintLength(batch);
  const logisticGroup = `${id}_${estimated.fixedTotalLengthM}m`;

  const xml = `
    <RipFlowJob>
      <BatchId>${escapeXml(batchId)}</BatchId>
      <Printer>${escapeXml(batch[0]?.printer)}</Printer>
      <NestingGroup>${escapeXml(id)}</NestingGroup>
      <LogisticGroup>${escapeXml(logisticGroup)}</LogisticGroup>
      <PhysicalGroup>${escapeXml(printGroup)}_${escapeXml(estimated.fixedTotalLengthM)}m</PhysicalGroup>
      <DocumentCount>${batch.length}</DocumentCount>
      <Documents>
          ${batch
            .map((item) => {
              const sourcePath = path.resolve(String(item?.file?.fullPath || ""));
              const fileName = path.basename(sourcePath);
              const finalPath = `${BASE_FINAL_PATH}\\${fileName}`;
              return `
        <Document>
          <Path>${escapeXml(finalPath)}</Path>
          <Name>${escapeXml(item?.file?.name)}</Name>
          <Copies>${escapeXml(item.printTypeCode) === "LM" ? 1 : escapeXml(item.qty)}</Copies>
          <DocumentId>${escapeXml(item.artworkId)}</DocumentId>
          <Width>${escapeXml(item.width)}</Width>
          <Height>${escapeXml(item.height)}</Height>
          <Material>${escapeXml(item.material)}</Material>
          <MaterialType>${escapeXml(item.materialType)}</MaterialType>
          <OrderId>${escapeXml(item.orderId)}</OrderId>
          <PrintTypeCode>${escapeXml(item.printTypeCode)}</PrintTypeCode>
          <IsVelvet>${isVelvet(item)}</IsVelvet>
          <IsLinen>${isLinen(item)}</IsLinen>
          <IsBlossom>${isBlossom(item)}</IsBlossom>
        </Document>`;
            })
            .join("\n")}
      </Documents>
    </RipFlowJob>`;
  return xml;
};

export async function submitBatchToPrintFactory(batch, createdBatchId, batchFolderPath) {
  const result = {
    success: false,
    errors: [],
    warnings: [],
    finalXmlPath: null,
    localXmlPath: null,
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

    const ROOT_PATH = getStorageRootPath();
    const AUTOMATION_WORKFLOW_PATH = `${ROOT_PATH}\\${getWorkflowFolderName(batch[0]?.printer)}`;

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
    const xmlFileName = `${safeBatchId}.xml`;
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

    if (typeof batchFolderPath === "string" && batchFolderPath.trim() !== "") {
      const localTempXmlPath = path.join(batchFolderPath, `${xmlFileName}.tmp`);
      const localFinalXmlPath = path.join(batchFolderPath, xmlFileName);
      try {
        await fs.promises.writeFile(localTempXmlPath, xml, "utf8");
        await fs.promises.rename(localTempXmlPath, localFinalXmlPath);
        result.localXmlPath = localFinalXmlPath;
      } catch (localErr) {
        try {
          await fs.promises.unlink(localTempXmlPath);
        } catch {
          // Ignore temp cleanup error.
        }
        result.warnings.push(`Failed to write local XML copy to batch folder: ${localErr.message}`);
      }
    }

    stage = STAGES.DONE;
  } catch (err) {
    result.errors = [toXMLError(err, stage)];
  }
  return result;
}
