const POLYESTER_MATERIAL_WIDTH = 1550;
const COTTONS_MATERIAL_WIDTH = 1450;
const POLYESTER_MARGIN = 5; //mm
const COTTONS_MARGIN = 10; //mm

export const estimatePrintLength = (files) => {
  const hasCotton = files.some((file) => file.materialType === "Cottons");
  const MATERIAL_WIDTH = hasCotton ? COTTONS_MATERIAL_WIDTH : POLYESTER_MATERIAL_WIDTH;
  const MATERIAL_MARGIN = hasCotton ? COTTONS_MARGIN : POLYESTER_MARGIN;

  const expandedItems = [];

  for (const file of files) {
    const width = Number(file.width);
    const height = Number(file.height);
    const quantity = Number(file.printTypeCode === "LM" ? 1 : file.qty);

    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    for (let i = 0; i < quantity; i++) {
      expandedItems.push({ width, height: height + MATERIAL_MARGIN });
    }
  }

  expandedItems.sort((a, b) => b.height - a.height);

  let currentRowWidth = 0;
  let currentRowHeight = 0;
  let totalLengthMm = 0;
  let rowsCount = 0;

  for (const item of expandedItems) {
    if (currentRowWidth + item.width <= MATERIAL_WIDTH) {
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

  const totalLengthM = totalLengthMm / 1000;

  const fixedTotalLengthM = Number(totalLengthM.toFixed(2));

  return {
    totalLengthMm,
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
