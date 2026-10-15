// Wizard sweep, step 2 on a storage with no shop profile yet (variant V3): the Import profile file state.
import { wizardView } from "../lib/wizardSweep.mjs";
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "sweep-wizard-empty";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);
  await wizardView(page, step)("SW-wizard-profile-empty", async () => {
    await typePaths(page, ctx.layout.storageEmptyPath, ctx.layout.xmlPath);
    await saveAndContinue(page);
    await page.waitForText("Import profile file", { selector: "[role=dialog] button", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
  });
};
