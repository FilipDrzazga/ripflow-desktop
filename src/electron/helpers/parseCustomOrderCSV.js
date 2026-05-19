import fs from "fs/promises";

function parseCSVRow(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

export function parseCSVContent(content) {
  const lines = content.split(/\r?\n/);

  if (lines.length < 2) {
    throw Object.assign(new Error("CSV file has no data rows."), { code: "ERR_CSV_EMPTY" });
  }

  const headers = parseCSVRow(lines[0]);
  const supplierIdx = headers.findIndex((h) => h.trim() === "Supplier Stock ID");
  const qtyIdx = headers.findIndex((h) => h.trim() === "Quantity to Print");
  const poIdx = headers.findIndex((h) => h.trim() === "PO Number");

  if (supplierIdx === -1 || qtyIdx === -1 || poIdx === -1) {
    throw Object.assign(
      new Error('CSV missing required columns: "Supplier Stock ID", "Quantity to Print", or "PO Number".'),
      { code: "ERR_CSV_MISSING_COLUMNS" }
    );
  }

  const files = [];
  let poNumber = "";
  let materialName = "";

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVRow(line);
    const supplierStockId = cols[supplierIdx]?.trim() ?? "";
    const qtyStr = cols[qtyIdx]?.trim() ?? "";
    const po = cols[poIdx]?.trim() ?? "";

    if (!supplierStockId) continue;

    // "Ice Velvet PFP, D201-M00781" → split on first ", "
    const sepIdx = supplierStockId.indexOf(", ");
    if (sepIdx === -1) continue;

    const rowMaterial = supplierStockId.slice(0, sepIdx).trim();
    const fileName = supplierStockId.slice(sepIdx + 2).trim();

    const metersToprint = parseFloat(qtyStr);
    if (!fileName || isNaN(metersToprint) || metersToprint <= 0) continue;

    if (!poNumber && po) poNumber = po;
    if (!materialName && rowMaterial) materialName = rowMaterial;

    files.push({ fileName, metersToprint });
  }

  if (files.length === 0) {
    throw Object.assign(new Error("No valid rows found in CSV."), { code: "ERR_CSV_NO_ROWS" });
  }

  return { poNumber, materialName, files };
}

export async function parseCustomOrderCSV(csvPath) {
  const content = await fs.readFile(csvPath, "utf8");
  return parseCSVContent(content);
}
