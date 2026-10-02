// Catalogue block 4b: what the station role changes in Production. Run once per role (--role=qc|rollpress|packing|none).
import { openNav } from "../lib/ui.mjs";

export const NAME = "roles";
export const VARIANT = "v0";

const SEARCH = 'input[placeholder="Id, customer, fabric"]';
const SATIN = "PRINTED_093210-Satin Gloss-BOREAL";
const CANVAS = "PRINTED_081530-Natural Canvas-ARCA";

const scan = async (page, batch) => {
  await page.setValue(SEARCH, batch);
  await page.sleep(300);
  await page.pressKey("Enter");
  await page.sleep(800);
};

export const run = async ({ page, step, ctx }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await openNav(page, "Production");
  await page.waitForText("Production", { selector: "h2" });
  await page.sleep(1800);

  if (ctx.role === "qc") {
    await step("RL-01", async ({ shot }) => {
      await shot("qc-awaiting-qc");
    });
    await step("RL-04", async ({ shot }) => {
      await scan(page, SATIN);
      await shot("qc-scan-empty-is-silent");
    });
  } else if (ctx.role === "rollpress") {
    await step("RL-03", async ({ shot }) => {
      await scan(page, CANVAS);
      await shot("rollpress-moved-to-qc");
    });
  } else if (ctx.role === "packing") {
    await step("RL-05", async ({ shot }) => {
      await scan(page, CANVAS);
      await shot("role-not-in-scan-rules");
    });
  } else if (ctx.role === "none") {
    await step("RL-06", async ({ shot }) => {
      await scan(page, CANVAS);
      await shot("no-role-scan-only-filters");
    });
  } else {
    throw new Error(`no role steps for ${ctx.role}`);
  }
};
