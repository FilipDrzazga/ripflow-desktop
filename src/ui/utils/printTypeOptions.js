// The "All Types" filter of the Print view (ETAP 4, 4-types-f): which print types it offers.
//
// Two kinds of type, told apart by where their SIZE comes from:
// - LM and CUSHION are sized from the file itself (the fabric catalogue's width for LM, the size
//   in the name for a cushion) - every shop has them, they are always offered;
// - SAMPLE, FQ and TEA_TOWEL have a fixed size that comes ONLY from the shop profile's
//   productTypes[] (4-types-e: no entry = the file is refused). They are offered only when the
//   profile carries them, so a shop without tea towels does not see a Tea Towel filter.
// No profile -> only LM and Cushion. The ORDER is the old fixed list's. New type codes are ETAP 5
// (a parser per client), so this list never grows past the codes the parser knows.
// PRINT_TYPE_MAP (constants/printTypeMap.js) stays complete: it is the icon of a file's type, and
// a refused file still shows what it is.

const OPTIONS = [
  { value: "LM", label: "Linear Meter", fromProfile: false },
  { value: "FQ", label: "Fat Quarter", fromProfile: true },
  { value: "SAMPLE", label: "Sample", fromProfile: true },
  { value: "CUSHION", label: "Cushion", fromProfile: false },
  { value: "TEA_TOWEL", label: "Tea Towel", fromProfile: true },
];

const profileTypeCodes = (profile) =>
  new Set((Array.isArray(profile?.productTypes) ? profile.productTypes : []).map((t) => t?.code).filter((c) => typeof c === "string"));

export const printTypeOptions = (profile) => {
  const codes = profileTypeCodes(profile);
  return OPTIONS.filter((o) => !o.fromProfile || codes.has(o.value)).map(({ value, label }) => ({ value, label }));
};
