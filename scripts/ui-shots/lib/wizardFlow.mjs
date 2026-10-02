// The first-run wizard, driven by hand-typed paths (the folder picker is a native window and is skipped).
import { setNthValue } from "./ui.mjs";

export const openWizard = async (page) => {
  await page.waitForText("Set up this station", { selector: "h2", timeoutMs: 60000 });
  await page.sleep(900);
};

export const typePaths = async (page, storage, xml) => {
  await setNthValue(page, "[role=dialog] input", 0, storage);
  await setNthValue(page, "[role=dialog] input", 1, xml);
  await page.sleep(500);
};

export const saveAndContinue = async (page) => {
  await page.clickText("Save and continue", { selector: "[role=dialog] button" });
  await page.sleep(2500);
};
