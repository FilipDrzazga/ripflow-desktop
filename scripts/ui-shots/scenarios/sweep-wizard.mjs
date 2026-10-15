// Responsiveness sweep of the first-run wizard (variant V3: a station with no paths yet): every step and its worst
// state at every window size, shots + overflow probe. The wizard is not in the main sweep because it only exists
// before the paths are saved - its own scenario, same sizes, same table.
//
//   node scripts/ui-shots/run.mjs --scenario=sweep-wizard --out=agents/chat/artefakty/resp-5/przed
//   node scripts/ui-shots/overflowMap.mjs --dir=agents/chat/artefakty/resp-5/przed --manifest=sweep-wizard
import { atEverySize } from "../lib/sweepSizes.mjs";
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "sweep-wizard";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);

  const view = (id, prepare) =>
    step(id, async ({ shot }) => {
      await prepare();
      await atEverySize(page, shot);
      await page.setViewport(1920, 1080);
    });

  // Back to step 1 from step 2 or 3, then the other storage folder.
  const backTo = async (clicks, storage) => {
    for (let i = 0; i < clicks; i++) {
      await page.clickText("Back", { selector: "[role=dialog] button", exact: true });
      await page.sleep(500);
    }
    await typePaths(page, storage, ctx.layout.xmlPath);
    await saveAndContinue(page);
  };

  await view("SW-wizard-paths", async () => {
    await typePaths(page, ctx.layout.storagePath, ctx.layout.xmlPath);
  });
  await view("SW-wizard-profile", async () => {
    await saveAndContinue(page);
    await page.waitForText("already in the database", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
  });
  await view("SW-wizard-folders-ok", async () => {
    await page.clickText("Continue", { selector: "[role=dialog] button" });
    await page.waitForText("folders can be read", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
  });
  await view("SW-wizard-folders-problems", async () => {
    await backTo(2, ctx.layout.storageNoHotPath);
    await page.waitForText("already in the database", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.clickText("Continue", { selector: "[role=dialog] button" });
    await page.waitForText("cannot be read", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
  });
  await view("SW-wizard-profile-empty", async () => {
    await backTo(2, ctx.layout.storageEmptyPath);
    await page.waitForText("Import profile file", { selector: "[role=dialog] button", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
  });
  await view("SW-wizard-database-unreadable", async () => {
    await backTo(1, ctx.layout.storageCorruptPath);
    await page.waitForText("could not be opened", { selector: "strong", exact: false, timeoutMs: 25000 });
    await page.sleep(500);
  });
};
