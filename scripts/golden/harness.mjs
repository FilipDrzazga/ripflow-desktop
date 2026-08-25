// Shared plumbing for capture-golden / compare-golden.
// Builds real batch inputs from Alex's file_stages rows and renders them with the
// PRODUCTION buildPFJobXML, so the baseline tracks the code we actually ship.
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(here, "..", "..");
export const GOLDEN_DIR = path.join(REPO, "golden");
const BS = String.fromCharCode(92);

register(pathToFileURL(path.join(here, "loader.mjs")).href, import.meta.url);

const src = (rel) => pathToFileURL(path.join(REPO, "src", rel)).href;

export async function loadPipeline() {
  const { buildPFJobXML } = await import(src("electron/ipc/createXML.js"));
  const { parsePrintFileName } = await import(src("electron/helpers/parseFileName.js"));
  const { getMaterialType } = await import(src("electron/helpers/getMaterialType.js"));
  const { loadFabricCache } = await import(src("electron/helpers/fabricCache.js"));
  loadFabricCache(); // real cache code, fed by the stubbed db.js
  return { buildPFJobXML, parsePrintFileName, getMaterialType };
}

const lastSeg = (p) => p.split("/").pop().split(BS).pop();
const dropLast = (p) => p.slice(0, p.length - lastSeg(p).length - 1);

// batchId as createBatch.js builds it: `${DD-MM-YYYY}/${PRINTED_HHMMSS-GROUP-PRINTER}`
export const batchIdOf = (batchPath) => `${lastSeg(dropLast(batchPath))}/${lastSeg(batchPath)}`;
export const printerOf = (batchPath) => (batchPath.match(/-(DGEN|YOKO|YUMI)$/i)?.[1] ?? "UNKNOWN").toUpperCase();

// Mirrors readFolders.js:105-115 (parsed meta + printGroup + materialType), plus the
// printer the UI attaches at submit time. printGroup is the inbox folder name, which
// is the material name.
export function buildItems(rows, pipeline) {
  const { parsePrintFileName, getMaterialType } = pipeline;
  return rows.map((r) => {
    const fileName = `${r.file_id}.pdf`;
    const dir = `${r.batch_path}`;
    const fullPath = `${dir}${BS}${fileName}`;
    const meta = parsePrintFileName(fileName, { fullPath, dir });
    if (!meta) throw new Error(`parse failed: ${fileName}`);
    return {
      id: `${r.material}_${fileName}`,
      printGroup: r.material,
      materialType: getMaterialType(meta.material),
      printer: printerOf(r.batch_path),
      ...meta,
    };
  });
}

// Deterministic file name for one batch: DD-MM-YYYY__PRINTED_HHMMSS-GROUP-PRINTER.xml
export const goldenFileName = (batchPath) =>
  `${batchIdOf(batchPath).replace("/", "__").replace(/[^a-zA-Z0-9_.-]/g, "_")}.xml`;

export function renderBatch(rows, pipeline) {
  const items = buildItems(rows, pipeline);
  return pipeline.buildPFJobXML(items, batchIdOf(rows[0].batch_path));
}
