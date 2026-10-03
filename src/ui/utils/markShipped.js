import { MARK_SHIPPED_FROM, PRODUCTION_STAGE } from "../../shared/constants";

// One row: can it jump to shipped from where it is? The handler asks this per file; the menu asks
// the whole-selection question below.
export const isShippableRow = (row) => MARK_SHIPPED_FROM.includes(row?.stage);

// Whether the Production context menu offers "Mark as Shipped" for these rows (the whole
// selection, or the clicked row). Common availability like every other stage action: every row
// must be able to jump. When ALL rows sit at packed the item is hidden - "Pass to Shipped" already
// says exactly that, and two entries for one move would be noise. (The handler does NOT use this
// check per file: a packed file inside a mixed selection must still be shipped.)
export const canMarkShipped = (rows) =>
  rows.length > 0 && rows.every(isShippableRow) && !rows.every((row) => row.stage === PRODUCTION_STAGE.PACKED);
