const pad2 = (n) => String(n).padStart(2, "0");

const slug = (value, fallback = "NA") => {
  const s = (value ?? "").toString().trim();
  if (!s) return fallback;
  return s
    .toUpperCase()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 24);
};

export const createBatchId = ({
  date = new Date(),
  materialGroup, // "cotton" | "polyester"
  printer, // string
  count, // number
  materialsInBatch = [], // array of material names (strings)
} = {}) => {
  const YYYY = date.getFullYear();
  const MM = pad2(date.getMonth() + 1);
  const DD = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());

  const group = materialGroup === "cotton" ? "COT" : materialGroup === "polyester" ? "POLY" : "UNK";

  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;

  const printerTag = slug(printer, "PRN");

  // unique materials (case-insensitive)
  const uniq = [];
  const seen = new Set();
  for (const m of materialsInBatch) {
    const raw = (m ?? "").toString().trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(raw);
  }

  // cotton: always single material (per your rule) -> show that name if present
  // polyester: if multiple different materials -> MIX, else show the single one
  let materialTag = "NA";
  if (materialGroup === "cotton") {
    materialTag = slug(uniq[0], "COTTON");
  } else if (materialGroup === "polyester") {
    materialTag = uniq.length > 1 ? "MIX" : slug(uniq[0], "POLY");
  } else {
    materialTag = uniq.length > 1 ? "MIX" : slug(uniq[0], "NA");
  }

  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}_${group}_${materialTag}_${safeCount}_${printerTag}`;
};

export const formatDay = (date = new Date()) => {
  const YYYY = date.getFullYear();
  const MM = pad2(date.getMonth() + 1);
  const DD = pad2(date.getDate());
  return `${YYYY}-${MM}-${DD}`;
};
