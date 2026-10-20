// The length allowance of a fabric (table fabric_length_extra, Settings > Fabrics): a material that
// shrinks in the heat press is printed LONGER by this percent. ONE place decides the stretched
// height, and both the XML <Height> (createXML.js) and the metres (estimatePrintLength.js) read it,
// so the two cannot disagree. Its own module so a test that stubs the estimator does not stub this.

// Anything that is not a finite number above 0 is "no allowance".
export const validLengthExtraPercent = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

// height * (1 + percent/100), to 0.01 mm. With no allowance the height is returned AS GIVEN (same
// value, same type), so a fabric without one is byte for byte what it was before the feature.
export const stretchedHeight = (height, percent) => {
  const p = validLengthExtraPercent(percent);
  if (p === 0) return height;
  return Number((Number(height) * (1 + p / 100)).toFixed(2));
};
