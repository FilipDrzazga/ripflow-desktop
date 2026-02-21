export const createBatchId = ({ date = new Date(), materialGroup, count } = {}) => {
  const pad2 = (n) => String(n).padStart(2, "0");

  const YYYY = date.getFullYear();
  const MM = pad2(date.getMonth() + 1);
  const DD = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());

  const group = materialGroup === "cotton" ? "COT" : materialGroup === "polyester" ? "POLY" : "UNK";

  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;

  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}_${group}_${safeCount}`;
};

export const formatDay = (date = new Date()) => {
  const pad2 = (n) => String(n).padStart(2, "0");
  const YYYY = date.getFullYear();
  const MM = pad2(date.getMonth() + 1);
  const DD = pad2(date.getDate());
  return `${YYYY}-${MM}-${DD}`;
};
