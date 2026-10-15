// Responsiveness sweep of the first-run wizard (variant V3: a station with no paths yet): every step and its worst
// state at every window size, shots + overflow probe. The wizard is not in the main sweep because it only exists
// before the paths are saved - its own scenarios, same sizes, same table. Once a storage with a ready profile has been
// opened the shop data stays loaded until a restart, so the empty-profile and unreadable-database states are separate
// runs (sweep-wizard-empty, sweep-wizard-corrupt).
//
//   node scripts/ui-shots/run.mjs --scenario=sweep-wizard --out=agents/chat/artefakty/resp-5/przed
//   node scripts/ui-shots/overflowMap.mjs --dir=agents/chat/artefakty/resp-5/przed --manifest=sweep-wizard
import { wizardView } from "../lib/wizardSweep.mjs";
import { openWizard, saveAndContinue, typePaths } from "../lib/wizardFlow.mjs";

export const NAME = "sweep-wizard";
export const VARIANT = "v3";

export const run = async ({ page, step, ctx }) => {
  await openWizard(page);
  const view = wizardView(page, step);

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
  // Back to step 1 and the storage without printer hotfolders: the longest step 3 (a problem per folder).
  await view("SW-wizard-folders-problems", async () => {
    for (let i = 0; i < 2; i++) {
      await page.clickText("Back", { selector: "[role=dialog] button", exact: true });
      await page.sleep(500);
    }
    await typePaths(page, ctx.layout.storageNoHotPath, ctx.layout.xmlPath);
    await saveAndContinue(page);
    await page.waitForText("already in the database", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.clickText("Continue", { selector: "[role=dialog] button" });
    await page.waitForText("cannot be read", { selector: "p", exact: false, timeoutMs: 20000 });
    await page.sleep(500);
  });
};
