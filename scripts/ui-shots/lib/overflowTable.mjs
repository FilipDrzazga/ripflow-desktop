// The responsiveness map: one row per view, one column per window size, cell = what the overflow probe
// (lib/overflowProbe.mjs) counted. "ok" = nothing wrong. Built from manifest rows, so the same table is
// produced for the "before" map and for the final "after" run.

export const SWEEP_SIZES = ["960x560", "1092x582", "1280x800", "1366x728", "1536x824", "1920x1080", "2560x1400"];

const cell = (row) => {
  if (!row) return "-";
  if (row.status && row.status !== "ok") return row.status;
  const o = row.overflow;
  if (!o || o.error) return "probe?";
  const parts = [];
  if (o.pageScrollX > 0) parts.push(`X+${o.pageScrollX}`);
  if (o.pageScrollY > 0) parts.push(`Y+${o.pageScrollY}`);
  if (o.outsideCount > 0) parts.push(`out ${o.outsideCount}`);
  return parts.length ? parts.join(", ") : "ok";
};

// rows: manifest `shots` of the sweep scenario; `state` is the size ("960x560"), `id` the view step.
export const overflowTable = (rows, sizes = SWEEP_SIZES) => {
  const views = [...new Set(rows.map((r) => r.id))];
  const lines = [`| view | ${sizes.join(" | ")} |`, `| --- | ${sizes.map(() => "---").join(" | ")} |`];
  for (const view of views) {
    const cells = sizes.map((size) => cell(rows.find((r) => r.id === view && r.state === size)));
    lines.push(`| ${view} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
};

// Number of cells that are not "ok" - the figure a step must bring to 0.
export const problemCount = (rows) =>
  rows.filter((r) => {
    const c = cell(r);
    return c !== "ok";
  }).length;
