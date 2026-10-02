// Variant V2: an empty shop - the profile and the catalogue exist, nothing was ever printed.
import { openNav } from "../lib/ui.mjs";

export const NAME = "v2";
export const VARIANT = "v2";

export const run = async ({ page, step, skip }) => {
  await page.waitForText("Great job! All Done.", { exact: false, timeoutMs: 60000 });
  await page.sleep(1500);

  await step("PR-49", async ({ shot }) => {
    await shot("overview-empty");
    await shot("overview-empty-all-done", "PR-12");
    await shot("inbox-card-zero", "PR-46");
    await shot("category-cards-no-materials", "PR-48");
  });

  await step("BH-26", async ({ shot }) => {
    await openNav(page, "Batch");
    await page.waitForText("No batches yet.", { selector: "span" });
    await shot("no-batches-yet");
  });

  await step("PD-38", async ({ shot }) => {
    await openNav(page, "Production");
    await page.waitForText("No jobs match the current filter.", { selector: "span" });
    await shot("no-jobs");
  });

  await step("CO-13", async ({ shot }) => {
    await openNav(page, "Custom Orders");
    await page.waitForText("No import history yet.", { selector: "div" });
    await shot("no-history");
  });

  await step("AN-12", async ({ shot }) => {
    await openNav(page, "Analytics");
    await page.waitForText("No data for this period", { selector: "span" });
    await page.sleep(500);
    await shot("no-data");
  });

  // The list can only be emptied with "Clear session" (a native confirmation window); startup alone always logs "Folders loaded".
  skip("LG-06", "the empty list needs Clear session, which asks in a native Windows window; a fresh station always has the startup log line");
};
