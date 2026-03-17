const POLYESTER_MATERIAL_WIDTH = 1550;
const COTTONS_MATERIAL_WIDTH = 1450;

export const estimatePrintLength = (files) => {
  console.log(files);
  const hasCotton = files.some((file) => file.materialType === "Cottons");
  const MATERIAL_WIDTH = hasCotton ? COTTONS_MATERIAL_WIDTH : POLYESTER_MATERIAL_WIDTH;

  const expandedItems = [];

  for (const file of files) {
    let qty = null;
    const width = Number(file.width);
    const height = Number(file.height);

    if (file.printTypeCode === "LM") {
      qty = 1;
    } else {
      qty = file.qty;
    }

    const quantity = Number(qty);

    for (let i = 0; i < quantity; i++) {
      expandedItems.push({ width, height });
    }
  }

  expandedItems.sort((a, b) => b.height - a.height);

  let currentRowWidth = 0;
  let currentRowHeight = 0;
  let totalLengthMm = 0;
  let rowsCount = 0;

  console.log(expandedItems);

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
