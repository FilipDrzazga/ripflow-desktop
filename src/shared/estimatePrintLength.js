import {
  LM_ROLL_POLY,
  LM_ROLL_COTTON,
  LM_ROLL_COTTON_DEFAULT,
  MARGIN_COTTON,
  MARGIN_POLY,
} from "./printWidths.js";

export const estimatePrintLength = (files, config = null) => {
  const globals = config?.globals ?? null;
  const allFabrics = config?.fabrics ?? null;

  const getMargin = (materialType) => {
    if (globals) {
      return materialType === "Cottons"
        ? (globals.marginCotton ?? MARGIN_COTTON)
        : (globals.marginPoly ?? MARGIN_POLY);
    }
    return materialType === "Cottons" ? MARGIN_COTTON : MARGIN_POLY;
  };

  const getRollWidth = (file) => {
    const material = (file.material ?? "").toString().trim();
    if (allFabrics) {
      const fabric = allFabrics.find((f) => f.name === material);
      if (fabric) return fabric.rollWidth;
      return file.materialType !== "Cottons"
        ? (globals?.defaultRollWidthPoly ?? LM_ROLL_POLY)
        : (globals?.defaultRollWidthCotton ?? LM_ROLL_COTTON_DEFAULT);
    }
    if (file.materialType !== "Cottons") return LM_ROLL_POLY;
    return LM_ROLL_COTTON[material] ?? LM_ROLL_COTTON_DEFAULT;
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
