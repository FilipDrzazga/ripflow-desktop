import { COTTON_LM_WIDTHS, DEFAULT_LM_WIDTH } from "../electron/helpers/getMaterialType.js";

const POLYESTER_MATERIAL_WIDTH = 1550;
const POLYESTER_MARGIN = 5;
const COTTONS_MARGIN = 10;

function getRollWidth(file) {
  if (file.materialType !== "Cottons") return POLYESTER_MATERIAL_WIDTH;
  const material = (file.material ?? "").toString().trim();
  return COTTON_LM_WIDTHS[material] ?? DEFAULT_LM_WIDTH;
}

export const estimatePrintLength = (files) => {
  const groupsByWidth = new Map();

  for (const file of files) {
    const width = Number(file.width);
    const height = Number(file.height);
    const quantity = Number(file.printTypeCode === "LM" ? 1 : file.qty);
    const margin = file.materialType === "Cottons" ? COTTONS_MARGIN : POLYESTER_MARGIN;
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

export const estimateMaterialLengthByGroups = (groups, materialType) => {
  const totalLength = (groups || [])
    .filter((group) => group.items.some((item) => item.materialType === materialType))
    .reduce((sum, group) => {
      const groupItems = group.items.filter((item) => item.materialType === materialType);
      return sum + estimatePrintLength(groupItems).fixedTotalLengthM;
    }, 0);

  return Number(totalLength.toFixed(2));
};
