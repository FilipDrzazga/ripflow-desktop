// Fictional demo data for the UI screenshots. Pure data and pure functions - no I/O, no Electron.
//
// Everything here is invented: the shop, printers, hotfolders, materials, customers and order
// numbers. It deliberately shares nothing with profiles/ or with any real database (a screenshot
// pack goes to an outside designer).

export const DEMO_SHOP = {
  schemaVersion: 4,
  printers: [
    { code: "ARCA", materialClass: "Cottons", hotfolder: "HOT_COTTON", color: { bg: "#E6F1FB", text: "#0C447C" } },
    { code: "BOREAL", materialClass: "Polyesters", hotfolder: "HOT_POLY", color: { bg: "#EEEDFE", text: "#3C3489" } },
    { code: "CIRRUS", materialClass: "Polyesters", hotfolder: "HOT_POLY", color: { bg: "#E1F5EE", text: "#085041" } },
  ],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
    { code: "TEA_TOWEL", width: 700, height: 500 },
  ],
  folders: { printed: "PRINTED", ripError: "HOT_ERROR", customOrder: "HOT_CUSTOM" },
  sewingCompanies: ["Sewing Studio A", "Sewing Studio B"],
  customOrders: { materialClass: "Polyesters" },
  integrations: { shopify: { storeHandle: "demo-store" } },
  features: { customOrders: true, analytics: true, ripErrors: true, labelPrinting: true, shopify: true, sewing: true },
  scanRules: [
    { role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true },
    { role: "polyester", from: "printed", to: "heatpress", notifyWhenEmpty: true },
    { role: "rollpress", from: "heatpress", to: "qc", notifyWhenEmpty: true },
    { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
  ],
};

const fabric = (name, type, extra = {}) => ({
  name,
  type,
  xmlWidth: type === "Cottons" ? 1420 : 1550,
  rollWidth: type === "Cottons" ? 1420 : 1550,
  isVelvet: 0,
  isLinen: 0,
  isBlossom: 0,
  alias: null,
  ...extra,
});

export const DEMO_FABRICS = [
  fabric("Natural Canvas", "Cottons", { preferredPrinter: "ARCA" }),
  fabric("Linen Blend Natural", "Cottons", { xmlWidth: 1370, isLinen: 1 }),
  fabric("Organic Twill", "Cottons"),
  fabric("Cotton Drill", "Cottons", { alias: "Drill" }),
  fabric("Satin Gloss", "Polyesters", { preferredPrinter: "BOREAL" }),
  fabric("Velvet Soft", "Polyesters", { isVelvet: 1 }),
  fabric("Chiffon Light", "Polyesters"),
  fabric("Stretch Jersey", "Polyesters"),
];

// Small deterministic PRNG so every run builds the same files.
export const makeRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const FIRST = ["Mia", "Noah", "Ava", "Liam", "Zoe", "Ethan", "Ivy", "Leo", "Nora", "Finn", "Ruby", "Jude", "Cleo", "Theo"];
const LAST = ["Hartley", "Brooks", "Lindqvist", "Okafor", "Marlowe", "Castell", "Fenwick", "Aldous", "Penhale", "Rowntree", "Vance", "Ashby"];

const LM_FORMAT = "Linear Meter - 1m increments";
const FQ_FORMAT = "Fat Quarter - 65 x 48 cm";
const SAMPLE_FORMAT = "Sample Print - 20 x 20 cm";

// One filename in the shape the parser reads (see parseFileName.test.js for the anonymised originals).
export const buildFileName = ({ order, first, last, x, y, material, qty, kind, xwd }) => {
  const head = `ON${order}_${first}_${last}_${x}of${y}`;
  if (kind === "LM") return `${head}_${material}_${qty}x_${LM_FORMAT}_XWD${xwd}_FF.pdf`;
  if (kind === "FQ") return `${head}_${material}_${qty}x_${FQ_FORMAT}_XWD${xwd}_FF.pdf`;
  if (kind === "SAMPLE") return `${head}_${material}_${qty}x_${SAMPLE_FORMAT}_XWD${xwd}_FF.pdf`;
  if (kind === "BAD_FORMAT") return `${head}_${material}_${qty}x_Mystery Format_XWD${xwd}_FF.pdf`;
  throw new Error(`unknown file kind: ${kind}`);
};

// Builds `count` file specs for one material, cycling the print types. Order numbers run on.
export const buildFiles = ({ material, count, kinds, rng, orderStart }) => {
  const out = [];
  let order = orderStart;
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const first = FIRST[Math.floor(rng() * FIRST.length)];
    const last = LAST[Math.floor(rng() * LAST.length)];
    const parts = 1 + Math.floor(rng() * 3);
    const x = 1 + Math.floor(rng() * parts);
    const qty = kind === "LM" ? 1 + Math.floor(rng() * 6) : 1 + Math.floor(rng() * 3);
    const xwd = Math.floor(rng() * 0xffffffff).toString(16).padStart(8, "0");
    if (i % 2 === 0) order += 1 + Math.floor(rng() * 9);
    out.push({
      material,
      kind,
      name: buildFileName({ order: `4${String(order).padStart(5, "0")}`, first, last, x, y: parts, material, qty, kind, xwd }),
    });
  }
  return out;
};

// Files lying in the inbox (storagePath\<material>\*.pdf) when the app starts.
export const buildInboxPlan = (rng) => {
  const lm = ["LM", "FQ", "SAMPLE", "LM"];
  const plan = [
    { material: "Natural Canvas", count: 6, kinds: lm },
    { material: "Linen Blend Natural", count: 4, kinds: ["LM", "SAMPLE"] },
    { material: "Organic Twill", count: 4, kinds: ["LM", "FQ"] },
    { material: "Cotton Drill", count: 3, kinds: ["LM", "SAMPLE"] },
    { material: "Satin Gloss", count: 5, kinds: lm },
    { material: "Velvet Soft", count: 4, kinds: ["LM", "FQ", "SAMPLE"] },
    { material: "Chiffon Light", count: 3, kinds: ["LM", "SAMPLE"] },
    { material: "Stretch Jersey", count: 3, kinds: ["LM", "FQ"] },
  ];
  let orderStart = 1200;
  const files = [];
  for (const p of plan) {
    files.push(...buildFiles({ ...p, rng, orderStart }));
    orderStart += p.count * 6;
  }
  // Two files the parser must flag: an unknown fabric (not in the catalogue) and an unreadable format.
  files.push(...buildFiles({ material: "Mystery Weave", count: 1, kinds: ["LM"], rng, orderStart: 9000 }));
  files.push(...buildFiles({ material: "Natural Canvas", count: 1, kinds: ["BAD_FORMAT"], rng, orderStart: 9100 }));
  return files;
};

// Batches already printed (they become PRINTED\<day>\<batch> folders plus file_stages rows).
// `stages` is the final production stage of each file; `daysAgo` and `time` place the batch in history.
export const BATCH_PLAN = [
  { daysAgo: 0, time: "081530", material: "Natural Canvas", printer: "ARCA", kinds: ["LM", "FQ", "SAMPLE", "LM"], stages: ["printed", "printed", "heatpress", "qc"] },
  { daysAgo: 0, time: "093210", material: "Satin Gloss", printer: "BOREAL", kinds: ["LM", "SAMPLE", "LM"], stages: ["printed", "printed", "printed"] },
  { daysAgo: 1, time: "141205", material: "Organic Twill", printer: "ARCA", kinds: ["LM", "FQ"], stages: ["heatpress", "qc", "packed", "packed", "shipped"] },
  { daysAgo: 1, time: "153540", material: "Velvet Soft", printer: "CIRRUS", kinds: ["LM", "SAMPLE"], stages: ["to_sewing", "to_sewing", "from_sewing"] },
  { daysAgo: 2, time: "101100", material: "Linen Blend Natural", printer: "ARCA", kinds: ["LM", "SAMPLE"], stages: ["packed", "shipped", "shipped"] },
  { daysAgo: 3, time: "163000", material: "Stretch Jersey", printer: "BOREAL", kinds: ["LM", "FQ"], stages: ["shipped", "shipped", "packed", "qc"] },
];

// Stage chain a file walks from "printed" to reach each final stage.
export const STAGE_CHAIN = {
  printed: [],
  heatpress: ["heatpress"],
  qc: ["heatpress", "qc"],
  packed: ["heatpress", "qc", "packed"],
  shipped: ["heatpress", "qc", "packed", "shipped"],
  to_sewing: ["heatpress", "qc", "to_sewing"],
  from_sewing: ["heatpress", "qc", "to_sewing", "from_sewing"],
};

export const DEMO_CUSTOM_ORDERS = [
  { poNumber: "PO-DEMO-1001", materialName: "Satin Gloss", printer: "BOREAL", daysAgo: 4, totalFiles: 6, missingFiles: 0, totalMeters: 14.5, status: "complete" },
  { poNumber: "PO-DEMO-1002", materialName: "Velvet Soft", printer: "CIRRUS", daysAgo: 2, totalFiles: 4, missingFiles: 1, totalMeters: 8.2, status: "partial" },
];

export const DEMO_WORKSTATION = "DEMO-STATION-1";
