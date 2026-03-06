export const createBatchIds = (batchInfo) => {
  const getPrintGroupArr = batchInfo.map((item) => item.printGroup);
  const uniquePrintGroups = [...new Set(getPrintGroupArr)];
  const printGroup = uniquePrintGroups.length === 1 ? uniquePrintGroups[0] : "MIXED";

  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const batchFolders = {
    mainFolder: `${day}${month}${year}`,
    subFolder: `${hours}${minutes}${seconds}-${printGroup}-${batchInfo[0].printer}`,

  }

  return batchFolders;
};
