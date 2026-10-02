// Catalogue block 7: Logs (variant V0). First a few actions that write log entries of every level
// (every toast is also a log line), then the view.
import { openNav, openSettings, scanBarcode } from "../lib/ui.mjs";

export const NAME = "logs";
export const VARIANT = "v0";

const SEARCH = '[class*="search_input"]';
const SEARCH_BATCH = 'input[placeholder="Id, customer, fabric"]';

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  // Success: save the General settings
  await openSettings(page, "General");
  await page.clickText("Save", { selector: "button" });
  await page.sleep(800);
  // Error + Warning from the Production scanner
  await openNav(page, "Production");
  await page.clickSelector("h2");
  await scanBarcode(page, "NOPE-12345");
  await page.sleep(1000);
  await page.setValue(SEARCH_BATCH, "PRINTED_141205-Organic Twill-ARCA");
  await page.pressKey("Enter");
  await page.sleep(1000);
  await page.setValue(SEARCH_BATCH, "");

  await openNav(page, "Logs");
  await page.waitForText("Session logs", { selector: "h2" });
  await page.sleep(1200);

  await step("LG-01", async ({ shot }) => {
    await shot("entries-all-levels");
  });

  await step("LG-02", async ({ shot }) => {
    await page.clickSelector('[class*="entry_row"]', { nth: 0 });
    await page.sleep(500);
    await shot("entry-expanded");
  });

  await step("LG-03", async ({ shot }) => {
    await page.clickText("Copy", { selector: "button" });
    await page.sleep(500);
    await shot("entry-copied");
  });

  await step("LG-04", async ({ shot }) => {
    await page.clickText("Error", { selector: '[class*="filter_btn"]' });
    await page.sleep(600);
    await shot("filter-error");
    await page.clickText("All", { selector: '[class*="filter_btn"]' });
    await page.sleep(400);
  });

  await step("LG-05", async ({ shot }) => {
    await page.setValue(SEARCH, "zzzzqqq");
    await page.sleep(600);
    await shot("no-results");
    await page.setValue(SEARCH, "");
  });
};
