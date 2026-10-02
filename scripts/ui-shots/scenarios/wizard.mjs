// Catalogue block 9: the first-run wizard, storage with a ready shop profile (variant V3).
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "wizard";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);

  await step("WZ-01", async ({ shot }) => {
    await shot("step1-empty");
  });

  await step("WZ-02", async ({ shot }) => {
    await typePaths(page, ctx.layout.storagePath, ctx.layout.xmlPath);
    await shot("step1-filled");
  });

  await step("WZ-03", async ({ shot }) => {
    await saveAndContinue(page);
    await page.waitForText("already in the database", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
    await shot("step2-profile-ready");
  });

  await step("WZ-06", async ({ shot }) => {
    await page.clickText("Continue", { selector: "[role=dialog] button" });
    await page.waitForText("folders can be read", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
    await shot("step3-folders-ok");
  });

  await step("WZ-09", async ({ shot }) => {
    await page.clickText("Restart RipFlow", { selector: "[role=dialog] button" });
    await page.sleep(900);
    await shot("toast-restart-by-hand");
    await shot("toast-info-renders-red", "GL-07");
  });
};
