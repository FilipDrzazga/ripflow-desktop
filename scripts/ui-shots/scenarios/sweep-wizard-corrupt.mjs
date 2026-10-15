// Wizard sweep, step 2 on a storage whose database file is garbage (variant V3): the "could not be opened" alert.
import { wizardView } from "../lib/wizardSweep.mjs";
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "sweep-wizard-corrupt";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);
  await wizardView(page, step)("SW-wizard-database-unreadable", async () => {
    await typePaths(page, ctx.layout.storageCorruptPath, ctx.layout.xmlPath);
    await saveAndContinue(page);
    await page.waitForText("could not be opened", { selector: "strong", exact: false, timeoutMs: 25000 });
    await page.sleep(500);
  });
};
