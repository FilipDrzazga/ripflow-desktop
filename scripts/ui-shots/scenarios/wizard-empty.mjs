// Wizard against an EMPTY storage folder (no shop profile yet), then the not-configured banners (variant V3).
import { closeOverlays, openNav, openSettings } from "../lib/ui.mjs";
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "wizard-empty";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);
  await typePaths(page, ctx.layout.storageEmptyPath, ctx.layout.xmlPath);
  await saveAndContinue(page);

  await step("WZ-04", async ({ shot }) => {
    await page.waitForText("Import profile file", { selector: "[role=dialog] button", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
    await shot("step2-profile-empty");
  });

  await step("GL-10", async ({ shot }) => {
    await page.clickText("Set up later", { selector: "button" });
    await page.sleep(1500);
    await page.waitForText("Shop profile not configured", { selector: "div", exact: false, timeoutMs: 15000 });
    await shot("banners-not-configured");
  });

  await step("GL-11", async ({ shot }) => {
    await openNav(page, "Batch");
    await page.sleep(1200);
    await shot("banner-printed-folder-not-found");
    await closeOverlays(page);
  });

  await step("ST-24", async ({ shot }) => {
    await openSettings(page, "Shop Profile");
    await page.waitForText("Not configured", { selector: "span", exact: false, timeoutMs: 15000 });
    await page.sleep(600);
    await shot("shop-profile-not-configured");
  });
};
