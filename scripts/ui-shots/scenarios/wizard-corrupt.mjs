// Wizard against a storage whose database file is garbage (variant V3 + the corrupt folder).
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "wizard-corrupt";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);
  await typePaths(page, ctx.layout.storageCorruptPath, ctx.layout.xmlPath);
  await saveAndContinue(page);

  await step("WZ-05", async ({ shot }) => {
    await page.waitForText("could not be opened", { selector: "strong", exact: false, timeoutMs: 25000 });
    await page.sleep(500);
    await shot("step2-database-unreadable");
  });
};
