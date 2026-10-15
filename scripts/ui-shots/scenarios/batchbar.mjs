// Batch history top bar: height and number of lines at every sweep size (numbers, not eyes; a line = children sharing one vertical centre). A bar that wraps
// shows up as a taller bar with more than one line; the probe of the sweep does not see it (nothing is cut).
//
//   node scripts/ui-shots/run.mjs --scenario=batchbar --out=agents/chat/artefakty/resp-2/barra-po
//   -> <out>/topbar.json: [{ size, height, lines }]
import fs from "node:fs";
import path from "node:path";
import { openNav, parkMouse } from "../lib/ui.mjs";
import { SWEEP_SIZES } from "../lib/overflowTable.mjs";

export const NAME = "batchbar";
export const VARIANT = "v0";

export const run = async ({ page, ctx }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1200);
  await openNav(page, "Batch");
  await page.sleep(1200);
  const out = [];
  for (const size of SWEEP_SIZES) {
    const [w, h] = size.split("x").map(Number);
    await page.setViewport(w, h);
    await page.sleep(700);
    await parkMouse(page);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('[class*="topbar"]');
      const tops = new Set([...bar.children].map((c) => { const r = c.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2); }));
      return { height: Math.round(bar.getBoundingClientRect().height), lines: tops.size };
    });
    out.push({ size, ...m });
  }
  fs.mkdirSync(ctx.outDir, { recursive: true });
  fs.writeFileSync(path.join(ctx.outDir, "topbar.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[shots] topbar:", JSON.stringify(out));
};
