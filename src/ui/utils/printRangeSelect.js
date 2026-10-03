// Shift-click range selection in Print (Gmail model, same as the Production cards - see
// rangeSelect.js: the range takes the state of the anchor, the row last clicked, and ADDS to /
// removes from the selection). Pure helpers: the store owns the anchor and both selections.
//
// Two selections exist and are NEVER mixed (heldSelection.js): selectedIds (files to print) and
// heldSelectedIds (held files for a bulk Unhold). A range therefore works inside ONE of them: it
// is the held kind when anchor and target are both held, the print kind when neither is, and a
// click that crosses between them is not a range at all (the caller falls back to a plain click).
import { FILE_STATUS } from "../../shared/constants";
import { canSelectHeld } from "./heldSelection";
import { idsBetween } from "./rangeSelect";

// The material the print selection is locked to: the one material of the selected rows, or null
// while nothing is selected (or, defensively, when more than one is - nothing to lock to).
export const lockMaterialOf = (groups, selectedIds) => {
  const types = new Set();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      if (selectedIds.has(item.id)) types.add(item.materialType);
    });
  });
  return types.size === 1 ? [...types][0] : null;
};

// Why a row may NOT join the print selection right now, or null when it may. The ONE decision
// behind a single click (toggleItemSelection) and every row of a range - a second copy of these
// conditions is how a range would let through what a click refuses.
export const printSelectBlock = (item, { heldIds, lockMaterial }) => {
  if (heldIds.has(item.id)) return "held";
  if (item.status === FILE_STATUS.INVALID) return "invalid";
  if (lockMaterial && item.materialType !== lockMaterial) return "material";
  return null;
};

// What a shift-click on `targetId` does, or null when it is not a range (no anchor, anchor or
// target gone from the list, the anchor itself, or a click across the held / print boundary) -
// the caller then treats the click as a plain one.
// Otherwise { selectedIds, heldSelectedIds, skipped }: the two selections after the click (the
// same Set back when it did not touch that one) and a count per reason of the rows the range
// stepped over - only a range that SELECTS skips anything; deselecting is always allowed.
export const planRangeSelect = ({ groups, heldIds, selectedIds, heldSelectedIds, anchorId, targetId }) => {
  if (anchorId == null || anchorId === targetId) return null;
  const rows = groups.flatMap((group) => group.items);
  const range = idsBetween(rows.map((row) => row.id), anchorId, targetId);
  if (!range) return null;
  const held = heldIds.has(targetId);
  if (held !== heldIds.has(anchorId)) return null;

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const skipped = { held: 0, invalid: 0, material: 0, notHeld: 0 };

  if (held) {
    const select = heldSelectedIds.has(anchorId);
    const next = new Set(heldSelectedIds);
    for (const id of range) {
      if (!heldIds.has(id)) {
        if (select) skipped.notHeld += 1;
      } else if (!select) next.delete(id);
      else if (canSelectHeld(id, { heldIds, selectedIds })) next.add(id);
    }
    return { selectedIds, heldSelectedIds: next, skipped };
  }

  const select = selectedIds.has(anchorId);
  // The same refusal as a single click: print rows do not join while held files are selected.
  if (select && heldSelectedIds.size > 0) return { selectedIds, heldSelectedIds, skipped };
  const next = new Set(selectedIds);
  const lockMaterial = lockMaterialOf(groups, selectedIds);
  for (const id of range) {
    if (!select) {
      next.delete(id);
      continue;
    }
    const block = printSelectBlock(rowById.get(id), { heldIds, lockMaterial });
    if (block) skipped[block] += 1;
    else next.add(id);
  }
  return { selectedIds: next, heldSelectedIds, skipped };
};

// One line for the toast of a range that stepped over rows, or null when it skipped none.
export const describeSkipped = (skipped) => {
  const parts = [];
  if (skipped.held) parts.push(`${skipped.held} on hold`);
  if (skipped.invalid) parts.push(`${skipped.invalid} invalid`);
  if (skipped.material) parts.push(`${skipped.material} of another material`);
  if (skipped.notHeld) parts.push(`${skipped.notHeld} not on hold`);
  return parts.length ? `Skipped ${parts.join(", ")}.` : null;
};

// The anchor lives and dies with the selections: both empty leaves nothing to extend from.
export const anchorFor = (selectedIds, heldSelectedIds, id) =>
  selectedIds.size + heldSelectedIds.size === 0 ? null : id;
