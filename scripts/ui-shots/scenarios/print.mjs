// Catalogue block 2: the Print view (variant V0, role cotton). Nothing here changes the demo data for good
// (holds / overrides are cancelled); the chains that move files (Rip, rollbacks) live in flows.mjs.
import { closeOverlays, openContextMenu, parkMouse, clickMenuItem, waitForCondition } from "../lib/ui.mjs";

export const NAME = "print";
export const VARIANT = "v0";

const LIST = '[class*="list_container"]';
const FILE_NAME = '[class*="file_name_text"]';
const SEARCH = 'input[placeholder="Search..."]';

const clearSelection = async (page) => {
  if (await page.exists('[class*="selection_container"][class*="active"]')) {
    await page.clickText("Clear Selection", { selector: "button" });
    await page.sleep(500);
  }
};

const setSearch = async (page, value) => {
  await page.setValue(SEARCH, value);
  await page.sleep(500);
};

const selectFile = async (page, nth) => {
  await page.clickSelector(FILE_NAME, { nth });
  await page.sleep(500);
};

export const run = async ({ page, step, skip }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1200);

  await step("PR-01", async ({ shot }) => {
    await shot("inbox-top");
  });

  await step("PR-02", async ({ shot }) => {
    await page.scrollContainer(LIST, 900);
    await page.sleep(500);
    await shot("list-middle");
  });

  await step("PR-03", async ({ shot }) => {
    await page.scrollContainer(LIST, "end");
    await page.sleep(500);
    await shot("list-end-invalid");
    await page.scrollContainer(LIST, 0);
  });

  await step("PR-04", async ({ shot }) => {
    await page.clickText("Cottons", { selector: "button" });
    await page.sleep(600);
    await shot("tab-cottons");
  });

  await step("PR-05", async ({ shot }) => {
    await page.clickText("Polyesters", { selector: "button" });
    await page.sleep(600);
    await shot("tab-polyesters");
    await page.clickText("All", { selector: "button" });
    await page.sleep(500);
  });

  await step("PR-06", async ({ shot }) => {
    await page.clickText("All Types", { selector: "button" });
    await page.sleep(400);
    await shot("type-dropdown");
  });

  await step("PR-07", async ({ shot }) => {
    const option = '[class*="type_dropdown"] button[class*="sort_option"]';
    if (!(await page.exists('[class*="type_dropdown"]'))) {
      await page.clickText("All Types", { selector: "button" });
      await page.sleep(400);
    }
    await page.clickSelector(option, { nth: 1 });
    await page.sleep(500);
    await shot("type-one");
    await page.clickSelector(option, { nth: 2 });
    await page.sleep(500);
    await shot("type-several", "PR-08");
    // All Types clears the filter and closes the dropdown.
    await page.clickSelector(option, { nth: 0 });
    await page.sleep(500);
  });

  await step("PR-09", async ({ shot }) => {
    await page.clickText("Sort by", { selector: "button" });
    await page.sleep(400);
    await shot("sort-dropdown");
  });

  await step("PR-10", async ({ shot }) => {
    await page.clickText("Meters", { selector: "[class*=sort_dropdown] button" });
    await page.sleep(700);
    await shot("sort-meters");
  });

  await step("PR-14", async ({ shot }) => {
    await page.clickSelector('[class*="sort_button"]');
    await page.sleep(300);
    await page.clickText("Oldest", { selector: "[class*=sort_dropdown] button" });
    await page.sleep(700);
    await shot("ages-oldest-first");
    // back to the default order
    await page.clickSelector('[class*="sort_button"]');
    await page.sleep(300);
    await page.clickText("Sort by", { selector: "[class*=sort_dropdown] button" });
    await page.sleep(600);
  });

  await step("PR-11", async ({ shot }) => {
    await setSearch(page, "Satin");
    await shot("search-hit");
  });

  await step("PR-12", async ({ shot }) => {
    await setSearch(page, "zzzzqqq");
    await shot("empty-all-done");
    await setSearch(page, "");
  });

  skip("PR-13", "the parser never gives a file the WARNING status (STATUS_MAP has the icon, no code path sets it)");

  await step("PR-15", async ({ shot }) => {
    await selectFile(page, 0);
    await shot("selected-one");
  });

  await step("PR-16", async ({ shot }) => {
    await selectFile(page, 1);
    await selectFile(page, 2);
    await shot("selected-several");
  });

  await step("PR-17", async ({ shot }) => {
    await clearSelection(page);
    await page.clickSelector('[class*="list_title"] input[type="checkbox"]', { nth: 0 });
    await page.sleep(600);
    await shot("group-selected");
    await clearSelection(page);
  });

  await step("PR-18", async ({ shot }) => {
    // the first Cotton Drill file (4th in the list): the Chiffon Light rows above it are the locked ones
    await selectFile(page, 3);
    await page.hoverSelector('[data-tooltip^="Cannot mix"]');
    await page.sleep(500);
    await shot("cannot-mix-tooltip");
    await parkMouse(page);
    await clearSelection(page);
  });

  await step("PR-19", async ({ shot }) => {
    await page.hoverSelector('[data-tooltip="File failed validation"]');
    await page.sleep(500);
    await shot("invalid-tooltip");
    await parkMouse(page);
  });

  await step("PR-20", async ({ shot }) => {
    await page.hoverSelector('[data-tooltip^="On hold"]');
    await page.sleep(500);
    await shot("held-tooltip");
    await parkMouse(page);
  });

  await step("PR-21", async ({ shot }) => {
    await page.clickSelector('[class*="list_item_held"] input[type="checkbox"]', { nth: 0 });
    await page.sleep(500);
    await page.hoverSelector('[data-tooltip^="Held files are selected"]');
    await page.sleep(500);
    await shot("held-selected-bulk-unhold");
    await parkMouse(page);
  });

  await step("PR-34", async ({ shot }) => {
    // two held files picked -> "Unhold N selected"
    await page.clickSelector('[class*="list_item_held"] input[type="checkbox"]', { nth: 1 });
    await page.sleep(400);
    await page.rightClickText("Linear Meter", { selector: '[class*="list_item_held"] span', exact: false });
    await page.waitForText("Cancel", { selector: "[role=menu] button", timeoutMs: 8000 });
    await page.sleep(400);
    await shot("menu-held-bulk");
    await closeOverlays(page);
    // un-pick both
    await page.clickSelector('[class*="list_item_held"] input[type="checkbox"]', { nth: 0 });
    await page.clickSelector('[class*="list_item_held"] input[type="checkbox"]', { nth: 1 });
    await page.sleep(400);
  });

  await step("PR-32", async ({ shot }) => {
    await page.rightClickText("Linear Meter", { selector: '[class*="list_item_held"] span', exact: false });
    await page.waitForText("Cancel", { selector: "[role=menu] button", timeoutMs: 8000 });
    await page.sleep(400);
    await shot("menu-held");
    await closeOverlays(page);
  });

  await step("PR-31", async ({ shot }) => {
    await page.scrollContainer(LIST, 0);
    await page.sleep(300);
    await openContextMenu(page, "Linear Meter", { selector: `${FILE_NAME}` });
    await shot("menu-plain");
    await closeOverlays(page);
  });

  await step("PR-33", async ({ shot }) => {
    await selectFile(page, 0);
    await selectFile(page, 1);
    await openContextMenu(page, "Linear Meter", { selector: `${FILE_NAME}` });
    await shot("menu-several-selected");
    await closeOverlays(page);
  });

  await step("PR-27", async ({ shot }) => {
    await openContextMenu(page, "Linear Meter", { selector: `${FILE_NAME}` });
    await clickMenuItem(page, "Override 2 selected");
    await page.waitForText("Set quantity override", { selector: "p" });
    await shot("override-modal-bulk");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
  });

  await step("PR-30", async ({ shot }) => {
    await openContextMenu(page, "Linear Meter", { selector: `${FILE_NAME}` });
    await clickMenuItem(page, "Hold 2 selected");
    await page.waitForText("Hold file", { selector: "p" });
    await page.setValue('input[placeholder="Reason (optional)..."]', "Colour check pending");
    await page.sleep(300);
    await shot("hold-modal-bulk");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
    await clearSelection(page);
  });

  await step("PR-29", async ({ shot }) => {
    await openContextMenu(page, "Linear Meter", { selector: `${FILE_NAME}` });
    await clickMenuItem(page, "Hold");
    await page.waitForText("Hold file", { selector: "p" });
    await page.setValue('input[placeholder="Reason (optional)..."]', "Waiting for the customer to confirm");
    await page.sleep(300);
    await shot("hold-modal");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
  });

  await step("PR-25", async ({ shot }) => {
    // a file with more than 1 metre to print, otherwise there is nothing to lower it to
    let original = null;
    for (let i = 0; i < 8 && original === null; i++) {
      await openContextMenu(page, "Linear Meter", { selector: FILE_NAME, nth: i });
      await clickMenuItem(page, "Override quantity");
      await page.waitForText("Set quantity override", { selector: "p" });
      const ph = await page.evaluate(() => document.querySelector('input[type="number"]')?.placeholder ?? "");
      if (parseFloat(ph) > 1) original = parseFloat(ph);
      else {
        await page.clickText("Cancel", { selector: "button" });
        await page.sleep(300);
      }
    }
    if (original === null) throw new Error("no LM file with more than 1 m");
    await shot("override-modal");
    // the entered value equals the original: the hint appears
    await page.setValue('input[type="number"]', String(original));
    await page.sleep(300);
    await shot("override-same-as-original", "PR-26");
    await page.setValue('input[type="number"]', String(Math.max(1, Math.floor(original) - 1)));
    await page.sleep(300);
    await page.clickText("Set override", { selector: "button" });
    await page.sleep(700);
    await shot("override-badge", "PR-28");
  });

  await step("PR-35", async ({ shot }) => {
    await page.rightClickText("Override:", { selector: '[class*="override_badge"]', exact: false });
    await page.waitForText("Cancel", { selector: "[role=menu] button", timeoutMs: 8000 });
    await page.sleep(400);
    await shot("menu-with-override");
    // leave the demo as found: clear the override
    await clickMenuItem(page, "Clear override");
    await page.sleep(400);
  });

  await step("PR-36", async ({ shot }) => {
    await openContextMenu(page, "Mystery Weave", { selector: FILE_NAME });
    await shot("menu-invalid");
    await closeOverlays(page);
  });

  await step("PR-38", async ({ shot }) => {
    await openContextMenu(page, "Linear Meter", { selector: FILE_NAME });
    await clickMenuItem(page, "Quick Preview");
    await waitForCondition(page, () => !!document.querySelector('img[class*="preview_img"]'), { what: "the preview image", timeoutMs: 30000 });
    await page.sleep(600);
    await shot("preview");
    await closeOverlays(page);
  });

  await step("PR-22", async ({ shot }) => {
    await page.clickText("Polyesters", { selector: "button" });
    await page.sleep(500);
    await page.clickText("Satin Gloss", { selector: '[class*="list_title"]', exact: false });
    await page.sleep(600);
    await selectFile(page, 0);
    await page.clickText("CIRRUS", { selector: "label" });
    await page.sleep(500);
    await shot("printer-picked-by-hand");
    await clearSelection(page);
  });

  await step("PR-23", async ({ shot }) => {
    await page.setValue(SEARCH, "Velvet Soft");
    await page.sleep(500);
    await selectFile(page, 0);
    await shot("printer-not-chosen");
    await clearSelection(page);
    await setSearch(page, "");
    await page.clickText("All", { selector: "button" });
  });

  await step("PR-47", async ({ shot }) => {
    await page.scrollContainer(LIST, 0);
    await page.hoverSelector('[class*="card_material_label_others"]');
    await page.sleep(600);
    await shot("others-tooltip");
    await parkMouse(page);
  });
};
