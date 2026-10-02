// Catalogue block 6: Analytics (variant V0). Nothing here changes data.
import { openNav, parkMouse } from "../lib/ui.mjs";

export const NAME = "analytics";
export const VARIANT = "v0";

const SEARCH = '[class*="search_input"]';

const period = async (page, label) => {
  await page.clickText(label, { selector: '[class*="period_btn"]' });
  await page.sleep(900);
};

export const run = async ({ page, step }) => {
  await openNav(page, "Analytics");
  await page.waitForText("Total rollbacks", { selector: "span" });
  await page.sleep(1500);

  await step("AN-01", async ({ shot }) => {
    await shot("seven-days");
  });

  await step("AN-02", async ({ shot }) => {
    await period(page, "30 days");
    await shot("thirty-days");
  });

  await step("AN-03", async ({ shot }) => {
    await period(page, "All time");
    await shot("all-time");
    await period(page, "7 days");
  });

  await step("AN-04", async ({ shot }) => {
    await page.clickText("Cottons", { selector: '[class*="filter_btn"]' });
    await page.sleep(700);
    await shot("filter-class");
    await page.clickText("All", { selector: '[class*="filter_btn"]', nth: 0 });
    await page.sleep(500);
  });

  await step("AN-05", async ({ shot }) => {
    await page.clickText("ARCA", { selector: '[class*="filter_btn"]' });
    await page.sleep(700);
    await shot("filter-printer");
    await page.clickText("All", { selector: '[class*="filter_btn"]', nth: 1 });
    await page.sleep(500);
  });

  await step("AN-06", async ({ shot }) => {
    await page.clickText("All reasons", { selector: '[class*="reason_btn"]', exact: false });
    await page.sleep(500);
    await shot("reasons-dropdown");
  });

  await step("AN-07", async ({ shot }) => {
    if (!(await page.exists('[class*="reason_dropdown"]'))) {
      await page.clickText("All reasons", { selector: '[class*="reason_btn"]', exact: false });
      await page.sleep(500);
    }
    await page.clickSelector('button[class*="reason_option"]', { nth: 1 });
    await page.clickSelector('button[class*="reason_option"]', { nth: 2 });
    await page.sleep(700);
    await shot("reasons-two-chosen");
    await page.clickSelector('button[class*="reason_option"]', { nth: 0 });
    await page.sleep(500);
  });

  await step("AN-08", async ({ shot }) => {
    await page.setValue(SEARCH, "Satin");
    await page.sleep(700);
    await shot("search-hit");
  });

  await step("AN-09", async ({ shot }) => {
    await page.setValue(SEARCH, "zzzzqqq");
    await page.sleep(700);
    await shot("search-empty");
    await page.setValue(SEARCH, "");
    await page.sleep(500);
  });

  await step("AN-10", async ({ shot }) => {
    await page.clickText("Split by day", { selector: "label" });
    await page.sleep(700);
    await shot("split-by-day-off");
    await page.clickText("Split by day", { selector: "label" });
    await page.sleep(500);
  });

  await step("AN-11", async ({ shot }) => {
    await page.hoverSelector('[class*="col_reason"]', { nth: 1 });
    await page.sleep(500);
    await shot("row-hover");
    await parkMouse(page);
  });
};
