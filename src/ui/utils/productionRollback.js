// Whether the Production context menu offers "Rollback" for these rows (the whole selection, or
// the clicked row), in the Batches and the Receive lens alike. Common availability like every
// other action: every row must have a batch folder, since rollback moves the PDF out of it.
// Every stage qualifies, shipped included (FILIP 2026-10-14): a fault found after the order left
// still needs a reprint, and stepping the file back from shipped first only cost the operator a
// click. The main-process rollback never read the stage.
export const canRollbackRows = (rows) => rows.length > 0 && rows.every((row) => Boolean(row?.batch_path));
