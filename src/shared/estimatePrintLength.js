import {
  LM_ROLL_POLY,
  LM_ROLL_COTTON_DEFAULT,
  MARGIN_COTTON,
  MARGIN_POLY,
} from "./printWidths.js";

// The class constants of printWidths.js, for the two class names it knows. ETAP 4 (4-types-a):
// the numbers of a class come from the profile BY NAME (config.classes, built by
// estimateConfigFrom); these stand in only when the profile gives none, and only for these two
// names. Before, every name that was not "Cottons" - "Unknown" and a renamed class included -
// took the Polyesters numbers.
const CLASS_CONSTANTS = {
  Cottons: { margin: MARGIN_COTTON, defaultRollWidth: LM_ROLL_COTTON_DEFAULT },
  Polyesters: { margin: MARGIN_POLY, defaultRollWidth: LM_ROLL_POLY },
};

// A class number: the profile's, else the constant of a known class, else null - and a file
// whose class has no number is left out of the estimate instead of being measured with
// another class's numbers.
const classNumber = (classes, materialType, field) => {
  const own = classes?.[materialType]?.[field];
  if (Number.isFinite(own)) return own;
  return CLASS_CONSTANTS[materialType]?.[field] ?? null;
};

export const estimatePrintLength = (files, config = null) => {
  const classes = config?.classes ?? null;
  const allFabrics = config?.fabrics ?? null;

  const getMargin = (materialType) => classNumber(classes, materialType, "margin");

  const getRollWidth = (file) => {
    const material = (file.material ?? "").toString().trim();
    if (allFabrics) {
      const fabric = allFabrics.find((f) => f.name === material);
      if (fabric) return fabric.rollWidth;
    }
    // Not in the catalogue, or no catalogue at all (the degraded path): the CLASS roll width.
    // Until ETAP 2g-2 a cotton was looked up in LM_ROLL_COTTON, a per-fabric map keyed by Alex's
    // fabric names - another shop's data standing in for a catalogue we could not read (same
    // shape as 0bf8aa6 / bc68fbe). Pinned by estimatePrintLength.degraded.test.js; the golden
    // net never runs the no-catalogue path.
    return classNumber(classes, file.materialType, "defaultRollWidth");
  };

  const groupsByWidth = new Map();

  for (const file of files) {
    const width = Number(file.width);
    const height = Number(file.height);
    const baseQty = Number(file.printTypeCode === "LM" ? 1 : file.qty);
    const bothSides = file.printTypeCode === "CUSHION" && /both sides/i.test(file.variant ?? "");
    const quantity = bothSides ? baseQty * 2 : baseQty;
    const margin = getMargin(file.materialType);
    const rollWidth = getRollWidth(file);

    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    // a class with no numbers (4-types-a): not measured with someone else's
    if (margin === null || rollWidth === null || rollWidth === undefined) continue;

    if (!groupsByWidth.has(rollWidth)) groupsByWidth.set(rollWidth, []);

    for (let i = 0; i < quantity; i++) {
      groupsByWidth.get(rollWidth).push({ width, height: height + margin });
    }
  }

  let totalLengthMm = 0;
  let rowsCount = 0;

  for (const [rollWidth, items] of groupsByWidth) {
    items.sort((a, b) => b.height - a.height);

    let currentRowWidth = 0;
    let currentRowHeight = 0;

    for (const item of items) {
      if (currentRowWidth + item.width <= rollWidth) {
        currentRowWidth += item.width;
        currentRowHeight = Math.max(currentRowHeight, item.height);
      } else {
        totalLengthMm += currentRowHeight;
        rowsCount += 1;
        currentRowWidth = item.width;
        currentRowHeight = item.height;
      }
    }

    if (currentRowWidth > 0) {
      totalLengthMm += currentRowHeight;
      rowsCount += 1;
    }
  }

  const totalLengthM = totalLengthMm / 1000;
  const fixedTotalLengthM = Number(totalLengthM.toFixed(2));

  return {
    totalLengthMm,
    totalLengthM,
    fixedTotalLengthM,
    rowsCount,
  };
};

export const estimateMaterialLengthByGroups = (groups, materialType, config = null) => {
  const totalLength = (groups || [])
    .filter((group) => group.items.some((item) => item.materialType === materialType))
    .reduce((sum, group) => {
      const groupItems = group.items.filter((item) => item.materialType === materialType);
      return sum + estimatePrintLength(groupItems, config).fixedTotalLengthM;
    }, 0);

  return Number(totalLength.toFixed(2));
};
