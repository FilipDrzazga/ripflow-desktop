// "12%" for 10 and up (and whole numbers), "4.5%" below that; 0% for anything not finite.
export const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
};
