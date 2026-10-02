// Wizard against a storage with the database but without the printer hotfolders (variant V3).
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "wizard-nohot";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);
  await typePaths(page, ctx.layout.storageNoHotPath, ctx.layout.xmlPath);
  await saveAndContinue(page);
  await page.waitForText("already in the database", { selector: "p", exact: false, timeoutMs: 20000 });

  await step("WZ-07", async ({ shot }) => {
    await page.clickText("Continue", { selector: "[role=dialog] button" });
    await page.waitForText("cannot be read", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
    await shot("step3-folders-with-problems");
  });
};
