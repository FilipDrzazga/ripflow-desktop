// The Inbox bar's split by material class (ETAP 4, 4-types-b part 2), as a pure function -
// utils/overviewBars.js builds the per-group segments on top of it. One row per class of the
// shop profile, in profile order and always shown (as Cottons / Polyesters always were); then ONE "Unknown" row
// for every file whose class is not a class of the profile - "Unknown" itself, an empty class,
// or a name the profile does not list - drawn only when it has files. Each row: its file count,
// its estimated length and its share of the total LENGTH (not of the file count).

import { estimateMaterialLengthByGroups } from "../../shared/estimatePrintLength";
import { materialClassNames } from "./materialClasses";

export const UNKNOWN_ROW = "Unknown";

// groups: store.files ([{ items: [...] }]); config: store.fabricConfig (rule 23 - passed on).
export const inboxClassSplit = (groups, profile, config) => {
  const classes = materialClassNames(profile);
  const items = (groups || []).flatMap((g) => g.items || []);
  const classOf = (item) => (classes.includes(item.materialType) ? item.materialType : UNKNOWN_ROW);

  const counts = {};
  for (const item of items) counts[classOf(item)] = (counts[classOf(item)] || 0) + 1;

  // the "Unknown" row sums the lengths of every material type outside the profile
  const otherTypes = [...new Set(items.map((i) => i.materialType).filter((t) => !classes.includes(t)))];
  const lengthOf = (name) =>
    name === UNKNOWN_ROW
      ? otherTypes.reduce((sum, t) => sum + estimateMaterialLengthByGroups(groups, t, config), 0)
      : estimateMaterialLengthByGroups(groups, name, config);

  const rows = [...classes, UNKNOWN_ROW]
    .map((name, slot) => ({
      name,
      slot: name === UNKNOWN_ROW ? -1 : slot,
      count: counts[name] || 0,
      length: Number(lengthOf(name).toFixed(2)),
    }))
    .filter((row) => row.slot >= 0 || row.count > 0);

  const total = rows.reduce((sum, row) => sum + row.length, 0);
  return {
    rows: rows.map((row) => ({ ...row, share: total ? (row.length / total) * 100 : 0 })),
    totalLength: Number(total.toFixed(2)),
    fileCount: items.length,
  };
};
