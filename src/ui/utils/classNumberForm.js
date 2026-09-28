// Settings -> Fabrics "Global Parameters" (ETAP 4, 4-types-b part 2): the form of the class
// numbers, BY CLASS NAME. Before, four fixed fields (Margin Cotton, Margin Poly, Roll Width
// Cotton, Roll Width Poly) that only knew Alex's two names; a client with "Cotton" / "Poly"
// could not edit anything. Pure: the view only renders what this answers.

import { classNumbersFromProfile } from "../../shared/classGlobals";
import { MARGIN_COTTON, MARGIN_POLY, LM_ROLL_COTTON_DEFAULT, LM_ROLL_POLY } from "../../shared/printWidths";
import { materialClassNames } from "./materialClasses";

// What the estimator uses for a number the profile does not carry - shown, so the field says
// what is in effect rather than a blank. Only the two names printWidths.js knows (the same rule
// as estimatePrintLength); any other class shows an empty field the operator has to fill.
const CONSTANTS = {
  Cottons: { margin: MARGIN_COTTON, defaultRollWidth: LM_ROLL_COTTON_DEFAULT },
  Polyesters: { margin: MARGIN_POLY, defaultRollWidth: LM_ROLL_POLY },
};

const FIELDS = [
  { field: "margin", label: "Margin" },
  { field: "defaultRollWidth", label: "Roll Width" },
];

// profile -> { [className]: { margin, defaultRollWidth } } for the classes of the profile.
export const classNumberForm = (profile) => {
  const own = classNumbersFromProfile(profile);
  const out = {};
  for (const name of materialClassNames(profile)) {
    out[name] = {};
    for (const { field } of FIELDS) out[name][field] = own[name]?.[field] ?? CONSTANTS[name]?.[field] ?? "";
  }
  return out;
};

// The fields in grid order: the grid has one column per class, so each row is one number for
// every class - "Margin <class>" first, then "Roll Width <class>". On Alex's profile this is the
// old layout: Margin Cottons | Margin Polyesters / Roll Width Cottons | Roll Width Polyesters.
export const classNumberFields = (profile) => {
  const names = materialClassNames(profile);
  return FIELDS.flatMap(({ field, label }) => names.map((name) => ({ name, field, label: `${label} ${name}`, unit: "mm" })));
};

const invalidNumber = (v) => !Number(v) || Number(v) <= 0;

export const classNumberFormInvalid = (values) =>
  Object.values(values || {}).some((v) => FIELDS.some(({ field }) => invalidNumber(v?.[field])));

export const classNumberFormUnchanged = (values, initial) =>
  Object.keys(initial || {}).every((name) =>
    FIELDS.every(({ field }) => Number(values?.[name]?.[field]) === Number(initial[name][field])),
  );

export const isInvalidClassNumber = invalidNumber;
