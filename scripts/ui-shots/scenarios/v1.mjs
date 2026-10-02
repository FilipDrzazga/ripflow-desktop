// Variant V1: a shop with every optional feature switched off - what disappears from nav, menus and cards.
import { closeOverlays, openContextMenu, openFirstHistoryBatch, openNav, openSettings } from "../lib/ui.mjs";

export const NAME = "v1";
export const VARIANT = "v1";

const FILE_NAME = '[class*="file_name_text"]';

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1500);

  await step("GL-03", async ({ shot }) => {
    await shot("nav-without-gated-views");
    await shot("overview-without-rip-errors-pill", "PR-51");
  });

  await step("PR-37", async ({ shot }) => {
    await openContextMenu(page, "Linear Meter", { selector: FILE_NAME });
    await shot("menu-without-shopify");
    await closeOverlays(page);
  });

  await step("BH-13", async ({ shot }) => {
    await openNav(page, "Batch");
    await page.waitForText("Batch history", { selector: "h2" });
    await page.sleep(1200);
    await openFirstHistoryBatch(page);
    await page.clickSelector('[class*="file_row_selectable"]', { nth: 0, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.sleep(400);
    await shot("menu-without-shopify");
    await closeOverlays(page);
  });

  await step("PD-22", async ({ shot }) => {
    await openNav(page, "Production");
    await page.waitForText("Production", { selector: "h2" });
    await page.sleep(1500);
    await page.clickText("QC", { selector: '[class*="stage_tab_label"]' });
    await page.sleep(700);
    await page.clickSelector("[data-file-id]", { nth: 0, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.sleep(400);
    await shot("menu-without-gated-items");
    await closeOverlays(page);
  });

  await step("ST-23", async ({ shot }) => {
    await openSettings(page, "Shop Profile");
    await page.sleep(800);
    await page.scrollContainer('[class*="view_cards"]', "end");
    await page.scrollContainer('[class*="view_body"]', "end");
    await page.sleep(600);
    await shot("shop-profile-features-off");
  });
};
