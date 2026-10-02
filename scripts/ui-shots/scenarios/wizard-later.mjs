// "Set up later" with no paths saved: Settings > Paths opens with both paths empty (variant V3).
import { openWizard } from "../lib/wizardFlow.mjs";

export const NAME = "wizard-later";
export const VARIANT = "v3";

export const run = async ({ page, step }) => {
  await openWizard(page);
  await step("ST-07", async ({ shot }) => {
    await page.clickText("Set up later", { selector: "button" });
    await page.sleep(1200);
    await shot("paths-after-set-up-later");
  });
};
