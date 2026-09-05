// parsePrintFileName.js
import { POLY_MATERIALS } from "./getMaterialType.js";
import { getXmlWidthFromCache } from "./fabricCache.js";
import {
  DIMS_SAMPLE,
  DIMS_FQ,
  DIMS_TEA_TOWEL,
} from "../../shared/printWidths.js";

function nowIso() {
  return new Date().toISOString();
}

function addError(out, code, message) {
  out.errors.push({ code, message });
}

function addWarning(out, message) {
  out.warnings.push(message);
}

// --- Print type labels (human-readable) + stable codes
const PRINT_TYPE_LABEL = {
  LM: "Linear Meter",
  FQ: "Fat Quarter",
  SAMPLE: "Sample",
  CUSHION: "Cushion",
  TEA_TOWEL: "Tea Towel",
  UNKNOWN: "UNKNOWN",
};

function toPrintTypeLabel(code) {
  return PRINT_TYPE_LABEL[code] || "UNKNOWN";
}

function tokenizeFilename(fileName) {
  // Keep original for meta, but parse using base name
  const name = String(fileName || "").trim();

  // Split by "_" and trim each token, drop empty tokens (because sometimes you have " Natural _45...")
  const rawTokens = name
    .split("_")
    .map((t) => t.trim())
    .filter(Boolean);

  // Merge tokens starting with "(" into the previous token (with a space).
  // Handles material names like "Eco Lotus Twill_(Water Repellant)" which should
  // be a single token: "Eco Lotus Twill (Water Repellant)".
  const mergedTokens = [];
  for (const t of rawTokens) {
    if (t.startsWith("(") && mergedTokens.length > 0) {
      mergedTokens[mergedTokens.length - 1] += " " + t;
    } else {
      mergedTokens.push(t);
    }
  }

  // Extract extension if last token ends with .pdf (or other)
  let ext = "";
  if (mergedTokens.length) {
    const last = mergedTokens[mergedTokens.length - 1];
    const m = last.match(/\.([a-z0-9]+)$/i);
    if (m) ext = m[1].toLowerCase();
  }

  // For tokens array, strip ".pdf" ONLY from the last token to make internalId easier,
  // but keep ext separately in file meta.
  const tokens = mergedTokens.slice();
  if (tokens.length) {
    tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/\.pdf$/i, "");
  }

  return { tokens, ext: ext || "pdf" };
}

function findIndex(tokens, predicate) {
  for (let i = 0; i < tokens.length; i++) {
    if (predicate(tokens[i], i)) return i;
  }
  return -1;
}

function findLastIndex(tokens, predicate) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (predicate(tokens[i], i)) return i;
  }
  return -1;
}

function parseOrderId(tokens) {
  // Usually token[0] but safer to search
  const i = findIndex(tokens, (t) => /^ON\d+$/i.test(t));
  return i >= 0 ? tokens[i].toUpperCase() : null;
}

function parseXOfY(tokens) {
  const i = findIndex(tokens, (t) => /^\d+of\d+$/i.test(t));
  if (i < 0) return { xOfY: null, x: null, y: null, index: -1 };

  const v = tokens[i].toLowerCase();
  const m = v.match(/^(\d+)of(\d+)$/);
  const x = m ? Number(m[1]) : null;
  const y = m ? Number(m[2]) : null;

  return { xOfY: tokens[i], x, y, index: i };
}

function detectKind(tokens, fileNameLower) {
  // Use both tokens and raw filename to be robust
  const joined = tokens.join(" ").toLowerCase();

  if (joined.includes("custom square cushion") || fileNameLower.includes("custom square cushion")) {
    return "CUSHION";
  }

  if (joined.includes("custom tea towel") || fileNameLower.includes("custom tea towel")) {
    return "TEA_TOWEL";
  }

  // XWD-based
  const xwdIndex = findIndex(tokens, (t) => /^XWD[0-9a-f]+$/i.test(t));
  if (xwdIndex >= 0) return "XWD_BASED";

  return "UNKNOWN";
}

function detectPrintTypeFromText(textLower) {
  if (textLower.includes("linear meter")) return "LM";
  if (textLower.includes("fat quarter")) return "FQ";
  if (textLower.includes("sample print")) return "SAMPLE";
  if (textLower.includes("cushion")) return "CUSHION";
  if (textLower.includes("tea towel")) return "TEA_TOWEL";
  return "UNKNOWN";
}

function parseQtyToken(token) {
  // "3x" => 3
  const m = String(token || "")
    .trim()
    .match(/^(\d+)\s*x$/i);
  if (!m) return null;
  return Number(m[1]);
}

function extractSizeFromText(text) {
  // e.g. "Fat Quarter - 65 x 48 cm", "Sample Print - 20 x 20 cm", or cushion token "45 x 45 cm"
  const s = String(text || "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm/i);
  if (!m) return null;
  return `${m[1]} x ${m[2]} cm`;
}

function stripPrefixBeforeDash(s) {
  // "Linear Meter - 1m increments" => "1m increments"
  // "Sample Print - 20 x 20 cm" => "20 x 20 cm"
  const idx = s.indexOf("-");
  if (idx < 0) return s.trim();
  return s.slice(idx + 1).trim();
}

function toMm(value, unit) {
  if (!Number.isFinite(value)) return null;
  return String(unit || "").toLowerCase() === "cm" ? value * 10 : value;
}

function parseDimensionsFromText(text) {
  // e.g. "45 x 45 cm" => 450 x 450 (mm), "450 x 450 mm" => 450 x 450
  const s = String(text || "")
    .trim()
    .replace(/,/g, ".");

  const m = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(cm|mm)\b/i);
  if (!m) return { width: null, height: null };

  const w = Number(m[1]);
  const h = Number(m[2]);
  const unit = m[3];

  return {
    width: toMm(w, unit),
    height: toMm(h, unit),
  };
}

// Product dimensions, resolved from the config the CALLER hands in.
//
// The parser never imports the shop profile. It could not: shopProfile.js reaches db.js,
// which reaches electron and better-sqlite3, and parseFileName.test.js keeps the parser
// importable by mocking ONE module (./fabricCache.js) - a second, unmocked route would
// break all 27 characterization tests. Taking the config as an argument is also the
// precondition for ETAP 5: a parser that reaches for global caches by import cannot be
// lifted into parsers/<client>.js without dragging that chain along.
//
// No config, a config of the wrong shape, or no entry for this code => the built-in
// constants, i.e. exactly what the parser did before this argument existed. Nothing is
// removed; DIMS_* stay as the degraded answer until a later cut decides what SHOULD
// happen at a client whose profile could not be read.
const BUILT_IN_DIMS = {
  SAMPLE: DIMS_SAMPLE,
  FQ: DIMS_FQ,
  TEA_TOWEL: DIMS_TEA_TOWEL,
};

function resolveProductDims(code, shopConfig) {
  const builtIn = BUILT_IN_DIMS[code] ?? null;
  if (!shopConfig) return builtIn;
  const list = shopConfig.productTypes;
  if (!Array.isArray(list)) return builtIn;
  // Shape-checked per record, like every other profile reader: the profile is a
  // free-form JSON blob, and a half-imported row must degrade to the built-in rather
  // than put NaN into <Width>.
  const hit = list.find(
    (t) =>
      t &&
      typeof t === "object" &&
      t.code === code &&
      Number.isFinite(t.width) &&
      Number.isFinite(t.height),
  );
  return hit ? { width: hit.width, height: hit.height } : builtIn;
}

function applyDimensions(out, text) {
  const { width, height } = parseDimensionsFromText(text);
  out.width = width;
  out.height = height;
}

function applyLmDimensions(out, shopConfig) {
  if (out.printTypeCode === "LM") {
    if (!Number.isFinite(out.qty) || out.qty <= 0) return;

    const material = (out.material ?? "").trim();
    const isPoly = POLY_MATERIALS.has(material);
    out.width = getXmlWidthFromCache(material, isPoly);
    out.height = out.qty * 1000;
    return;
  }

  if (out.printTypeCode === "SAMPLE") {
    const dims = resolveProductDims("SAMPLE", shopConfig);
    out.width = dims.width;
    out.height = dims.height;
    return;
  }

  if (out.printTypeCode === "FQ") {
    const dims = resolveProductDims("FQ", shopConfig);
    out.width = dims.width;
    out.height = dims.height;
  }
}

function applyTeaTowelDimensions(out, shopConfig) {
  if (out.printTypeCode === "TEA_TOWEL") {
    const dims = resolveProductDims("TEA_TOWEL", shopConfig);
    out.width = dims.width;
    out.height = dims.height;
  }
}

/**
 * Cushion format:
 * ONxxxx _ nameParts... _ xOfY _ Custom Square Cushion _ material _ size _ option _ qty _ FF _ internalId(.pdf)
 */
function parseCushion(tokens, baseOut) {
  const out = baseOut;

  // Core anchors
  out.orderId = parseOrderId(tokens);

  const { xOfY, x, y, index: xOfYIndex } = parseXOfY(tokens);
  out.xOfY = xOfY;
  out.x = x;
  out.y = y;

  // Find FF index (prefer exact token "FF" but allow "FF.pdf" already stripped)
  const ffIndex = findLastIndex(tokens, (t) => t.toUpperCase() === "FF");
  if (ffIndex < 0) addWarning(out, "FF token not found (expected 'FF')");

  // internalId is token after FF, OR last token if FF missing
  let internalId = null;
  if (ffIndex >= 0 && tokens[ffIndex + 1]) {
    internalId = tokens[ffIndex + 1];
  } else if (tokens.length) {
    // last token is usually internal id when .pdf stripped, but can be artworkId in XWD-based
    internalId = tokens[tokens.length - 1];
  }

  // If internalId looks like XWD... then probably wrong kind
  if (internalId && /^XWD/i.test(internalId)) {
    internalId = null;
    addWarning(out, "Detected XWD-like tail in cushion parser; internalId not set.");
  }

  out.internalId = internalId;
  out.artworkId = null;

  // nameParts: tokens between orderId token and xOfY token.
  const orderIndex = findIndex(tokens, (t) => /^ON\d+$/i.test(t));
  if (orderIndex >= 0 && xOfYIndex > orderIndex + 1) {
    const parts = tokens.slice(orderIndex + 1, xOfYIndex);
    out.customerName = parts.join(" ").trim() || null;
  } else {
    out.customerName = null;
  }

  // productName and other fields:
  // After xOfYIndex, expect:
  // productName, material, size, variant, qty before FF
  const after = xOfYIndex >= 0 ? tokens.slice(xOfYIndex + 1) : [];

  // Try to locate product token containing "cushion"
  const productRelIndex = findIndex(after, (t) => t.toLowerCase().includes("cushion"));
  const productAbsIndex = productRelIndex >= 0 ? xOfYIndex + 1 + productRelIndex : -1;

  out.productName = productAbsIndex >= 0 ? tokens[productAbsIndex] : "Custom Square Cushion";

  let material = null;
  let size = null;
  let variant = null;

  if (productAbsIndex >= 0) {
    material = tokens[productAbsIndex + 1] || null;
    size = tokens[productAbsIndex + 2] || null;
    variant = tokens[productAbsIndex + 3] || null;
  } else if (xOfYIndex >= 0) {
    material = tokens[xOfYIndex + 2] || null;
    size = tokens[xOfYIndex + 3] || null;
    variant = tokens[xOfYIndex + 4] || null;
  }

  out.material = material;
  out.size = size ? size.trim() : null;
  out.variant = variant ? variant.trim() : null;
  applyDimensions(out, out.size);

  // qty: token just before FF (common in cushion)
  let qty = null;
  if (ffIndex >= 1) {
    const qtyToken = tokens[ffIndex - 1];
    const n = Number(qtyToken);
    if (Number.isFinite(n)) qty = n;
  }
  out.qty = qty;

  out.printTypeCode = "CUSHION";
  out.printType = toPrintTypeLabel(out.printTypeCode);

  return out;
}

/**
 * Tea towel format (cushion-like):
 * ONxxxx _ nameParts... _ xOfY _ Custom Tea Towel _ material _ variant... _ qty _ FF _ internalId(.pdf)
 *
 * Example:
 * ON311600_Amy_Lee_9of9_Custom Tea Towel_Drill _ Fully Sewn_4_FF_2185
 * ON311503_Stephen_Deazley_3of3_Custom Tea Towel_Drill _ DIY Sew at Home_1_FF_2121.pdf
 */
function parseTeaTowel(tokens, baseOut, shopConfig) {
  const out = baseOut;

  out.orderId = parseOrderId(tokens);

  const { xOfY, x, y, index: xOfYIndex } = parseXOfY(tokens);
  out.xOfY = xOfY;
  out.x = x;
  out.y = y;

  const ffIndex = findLastIndex(tokens, (t) => t.toUpperCase() === "FF");
  if (ffIndex < 0) addWarning(out, "FF token not found (expected 'FF')");

  out.internalId = ffIndex >= 0 && tokens[ffIndex + 1] ? tokens[ffIndex + 1] : tokens.at(-1) || null;
  out.artworkId = null;

  // customerName between orderId and xOfY
  const orderIndex = findIndex(tokens, (t) => /^ON\d+$/i.test(t));
  if (orderIndex >= 0 && xOfYIndex > orderIndex + 1) {
    out.customerName =
      tokens
        .slice(orderIndex + 1, xOfYIndex)
        .join(" ")
        .trim() || null;
  } else {
    out.customerName = null;
  }

  // locate product token containing "tea towel"
  const after = xOfYIndex >= 0 ? tokens.slice(xOfYIndex + 1) : [];
  const productRelIndex = findIndex(after, (t) => t.toLowerCase().includes("tea towel"));
  const productAbsIndex = productRelIndex >= 0 ? xOfYIndex + 1 + productRelIndex : -1;

  out.productName = productAbsIndex >= 0 ? tokens[productAbsIndex] : "Custom Tea Towel";

  // material is token after product
  out.material = productAbsIndex >= 0 ? tokens[productAbsIndex + 1] || null : null;

  // qty is usually number right before FF
  let qty = null;
  if (ffIndex >= 1) {
    const n = Number(tokens[ffIndex - 1]);
    if (Number.isFinite(n)) qty = n;
  }
  out.qty = qty;

  // variant is everything between material and qty (up to ffIndex-1)
  const variantStart = productAbsIndex >= 0 ? productAbsIndex + 2 : -1;
  const variantEnd = ffIndex >= 0 ? ffIndex - 1 : tokens.length; // exclusive

  if (variantStart >= 0 && variantStart < variantEnd) {
    out.variant = tokens.slice(variantStart, variantEnd).join(" ").trim() || null;
  } else {
    out.variant = null;
  }

  out.size = null;

  out.printTypeCode = "TEA_TOWEL";
  out.printType = toPrintTypeLabel(out.printTypeCode);
  applyTeaTowelDimensions(out, shopConfig);

  return out;
}

/**
 * XWD-based format:
 * ONxxxx _ nameParts... _ xOfY _ material _ qty(x) _ type+variant _ XWD... _ FF(.pdf)
 */
function parseXwdBased(tokens, baseOut, shopConfig) {
  const out = baseOut;

  out.orderId = parseOrderId(tokens);

  const { xOfY, x, y, index: xOfYIndex } = parseXOfY(tokens);
  out.xOfY = xOfY;
  out.x = x;
  out.y = y;

  // artworkId
  const xwdIndex = findIndex(tokens, (t) => /^XWD[0-9a-f]+$/i.test(t));
  out.artworkId = xwdIndex >= 0 ? tokens[xwdIndex] : null;

  // FF token
  const ffIndex = findLastIndex(tokens, (t) => t.toUpperCase() === "FF");
  if (ffIndex < 0) addWarning(out, "FF token not found (expected 'FF')");

  out.internalId = null;

  // customerName: between orderId token and xOfY
  const orderIndex = findIndex(tokens, (t) => /^ON\d+$/i.test(t));
  if (orderIndex >= 0 && xOfYIndex > orderIndex + 1) {
    out.customerName =
      tokens
        .slice(orderIndex + 1, xOfYIndex)
        .join(" ")
        .trim() || null;
  } else {
    out.customerName = null;
  }

  // material and qty usually right after xOfY
  out.material = xOfYIndex >= 0 ? tokens[xOfYIndex + 1] || null : null;

  // qty token like "1x", "3x", "2x"
  const qtyToken = xOfYIndex >= 0 ? tokens[xOfYIndex + 2] : null;
  out.qty = parseQtyToken(qtyToken);

  // type/variant chunk: from xOfYIndex+3 up to (xwdIndex-1)
  let typeVariant = null;
  if (xOfYIndex >= 0 && xwdIndex > xOfYIndex) {
    const start = xOfYIndex + 3;
    const end = xwdIndex; // exclusive
    if (start < end) typeVariant = tokens.slice(start, end).join(" _ ").trim();
  }

  const tvLower = (typeVariant || "").toLowerCase();
  out.printTypeCode = detectPrintTypeFromText(tvLower);
  out.printType = toPrintTypeLabel(out.printTypeCode);

  // size extraction depends on printType
  let size = null;
  let variant = null;

  if (out.printTypeCode === "LM") {
    variant = typeVariant ? stripPrefixBeforeDash(typeVariant) : null;
    size = null;
  } else if (out.printTypeCode === "FQ" || out.printTypeCode === "SAMPLE") {
    size = typeVariant ? extractSizeFromText(typeVariant) : null;
    variant = typeVariant ? stripPrefixBeforeDash(typeVariant) : null;
  } else {
    size = typeVariant ? extractSizeFromText(typeVariant) : null;
    variant = typeVariant ? stripPrefixBeforeDash(typeVariant) : null;
  }

  out.size = size;
  out.variant = variant;
  out.productName = null;
  applyDimensions(out, out.size);
  applyLmDimensions(out, shopConfig);

  return out;
}

function validateCommon(out) {
  // orderId
  if (!out.orderId) {
    addError(out, "MISSING_ORDER_ID", "OrderId not found (expected ON123456).");
  }

  // xOfY
  if (!out.xOfY) {
    addError(out, "MISSING_XOFY", "xOfY not found (expected e.g. 2of6).");
  } else if (!/^\d+of\d+$/i.test(out.xOfY)) {
    addError(out, "BAD_XOFY", `xOfY has invalid format: "${out.xOfY}".`);
  } else {
    // sanity check x <= y
    if (Number.isFinite(out.x) && Number.isFinite(out.y)) {
      if (!(out.y > 0) || !(out.x > 0) || out.x > out.y) {
        addError(out, "BAD_XOFY", `xOfY seems invalid (x=${out.x}, y=${out.y}).`);
      }
    }
  }

  // printType
  if (!out.printTypeCode || out.printTypeCode === "UNKNOWN") {
    addError(out, "MISSING_PRINT_TYPE", "Print type could not be detected.");
  }

  // material
  if (!out.material || !String(out.material).trim()) {
    addError(out, "MISSING_MATERIAL", "Material not found.");
  }

  // qty
  if (out.qty == null) {
    addError(out, "MISSING_QTY", "Quantity not found.");
  } else if (!Number.isFinite(out.qty) || out.qty <= 0) {
    addError(out, "BAD_QTY", `Quantity invalid: "${out.qty}".`);
  }

  // ff is optional; treat missing as warning only
  if (!out.ff) {
    addWarning(out, "FF token missing (treated as warning).");
  }
}

function validateByType(out) {
  if (out.printTypeCode === "CUSHION") {
    if (!out.internalId) {
      addError(out, "MISSING_INTERNAL_ID", "Cushion internal id not found (expected token after FF).");
    }
    if (!out.size || !String(out.size).trim()) {
      addError(out, "MISSING_SIZE", "Cushion size not found.");
    }
  }

  if (out.printTypeCode === "TEA_TOWEL") {
    if (!out.internalId) {
      addError(out, "MISSING_INTERNAL_ID", "Tea Towel internal id not found (expected token after FF).");
    }
    if (!out.variant || !String(out.variant).trim()) {
      addError(out, "MISSING_VARIANT", "Tea Towel variant not found (e.g. Fully Sewn / DIY Sew at Home).");
    }
  }

  if (out.printTypeCode === "LM" || out.printTypeCode === "FQ" || out.printTypeCode === "SAMPLE") {
    // XWD-based must have artworkId
    if (!out.artworkId) {
      addError(out, "MISSING_ARTWORK_ID", "ArtworkId (XWD...) not found.");
    }
  }

  if (out.printTypeCode === "FQ" || out.printTypeCode === "SAMPLE") {
    if (!out.size) {
      addError(out, "MISSING_SIZE", `${out.printType} requires size (e.g. 65 x 48 cm / 20 x 20 cm).`);
    }
  }

  if (out.size && (out.width == null || out.height == null)) {
    addWarning(out, "Size exists but width/height could not be parsed.");
  }
}

function parsePrintFileName(fileName, options = {}) {
  const name = String(fileName || "");
  const fileNameLower = name.toLowerCase();

  const { tokens, ext } = tokenizeFilename(name);

  const out = {
    file: {
      name,
      ext,
      dir: options.dir || null,
      fullPath: options.fullPath || null,
    },

    orderId: null,
    customerName: null,
    xOfY: null,
    x: null,
    y: null,
    printTypeCode: "UNKNOWN",
    printType: "UNKNOWN",
    material: null,
    qty: null,
    size: null,
    width: null,
    height: null,
    variant: null,
    productName: null,
    artworkId: null,
    internalId: null,
    ff: false,
    tokens,
    warnings: [],
    errors: [],
    status: "INVALID",
    detectedAt: nowIso(),
  };

  // quick flags
  out.ff = tokens.some((t) => t.toUpperCase() === "FF");

  // detect kind → parse
  const kind = detectKind(tokens, fileNameLower);

  if (kind === "CUSHION") {
    parseCushion(tokens, out);
  } else if (kind === "TEA_TOWEL") {
    parseTeaTowel(tokens, out, options.shopConfig);
  } else if (kind === "XWD_BASED") {
    parseXwdBased(tokens, out, options.shopConfig);
  } else {
    // best effort: still try to pull orderId/xOfY to show something in UI
    out.orderId = parseOrderId(tokens);
    const xo = parseXOfY(tokens);
    out.xOfY = xo.xOfY;
    out.x = xo.x;
    out.y = xo.y;

    out.printTypeCode = detectPrintTypeFromText(tokens.join(" ").toLowerCase());
    out.printType = toPrintTypeLabel(out.printTypeCode);

    addError(out, "UNKNOWN_FORMAT", "Filename format not recognized (neither Cushion nor Tea Towel nor XWD-based).");
  }

  // If parsed kind is XWD-based, but printType still UNKNOWN, add error
  if (kind === "XWD_BASED" && out.printTypeCode === "UNKNOWN") {
    addError(out, "MISSING_PRINT_TYPE", "Could not detect LM/FQ/SAMPLE from filename text.");
  }

  // Validation
  validateCommon(out);
  validateByType(out);

  out.status = out.errors.length ? "INVALID" : "READY";

  return out;
}

export { parsePrintFileName };
