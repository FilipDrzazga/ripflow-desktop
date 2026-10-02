// Catalogue block 8: Settings, every section and its states (variant V0). Nothing is saved except General (toasts).
import { closeOverlays, openNav, openSettings, parkMouse } from "../lib/ui.mjs";

export const NAME = "settings";
export const VARIANT = "v0";

const VIEW_BODY = '[class*="view_body"]';

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });

  // ---- General ----
  await openNav(page, "Settings");
  await page.waitForText("Workstation Name", { selector: "label" });
  await page.sleep(800);

  await step("ST-01", async ({ shot }) => {
    await shot("general");
  });

  await step("ST-02", async ({ shot }) => {
    await page.clickSelector('button[aria-label="Workstation Role"]');
    await page.sleep(500);
    await shot("role-select-open");
    await closeOverlays(page);
  });

  await step("GL-04", async ({ shot }) => {
    await page.clickText("Save", { selector: "button" });
    await page.sleep(800);
    await shot("toast-success");
  });

  await step("GL-08", async ({ shot }) => {
    // two more quick saves: three toasts stack up
    await page.sleep(400);
    await page.clickText("Save", { selector: "button" });
    await page.sleep(350);
    await page.clickText("Save", { selector: "button" });
    await page.sleep(900);
    await shot("toasts-stacked");
    await page.hoverSelector('[class*="alert_container"] > div', { nth: 0 });
    await page.sleep(700);
    await shot("toasts-stacked-expanded", "GL-09");
    await parkMouse(page);
    await page.sleep(3500);
  });

  // ---- Paths ----
  await step("ST-04", async ({ shot }) => {
    await openSettings(page, "Paths");
    await shot("paths");
  });

  await step("ST-05", async ({ shot }) => {
    await page.setValue("main input", "");
    await page.sleep(500);
    await shot("paths-storage-required");
  });

  await step("ST-06", async ({ shot }) => {
    await openSettings(page, "General");
    await openSettings(page, "Paths");
    await page.clickText("Automatic", { selector: "button", within: "main" });
    await page.sleep(500);
    await shot("paths-label-mode-changed");
  });

  // ---- Fabrics ----
  await step("ST-08", async ({ shot }) => {
    await openSettings(page, "Fabrics");
    await page.waitForText("Materials", { selector: "p" });
    await page.sleep(800);
    await shot("fabrics");
  });

  await step("ST-09", async ({ shot }) => {
    await page.clickText("Cottons", { selector: '[class*="filter_btn"]', exact: false });
    await page.sleep(600);
    await shot("fabrics-filter-class");
    await page.clickText("All", { selector: '[class*="filter_btn"]', exact: false });
    await page.sleep(400);
  });

  await step("ST-10", async ({ shot }) => {
    await page.setValue('input[placeholder="Search…"]', "zzzzqqq");
    await page.sleep(500);
    await shot("fabrics-search-empty");
    await page.setValue('input[placeholder="Search…"]', "");
    await page.sleep(300);
  });

  await step("ST-11", async ({ shot }) => {
    await page.clickSelector('button[title="Edit"]', { nth: 0 });
    await page.waitForText("Preferred printer", { selector: "span" });
    await page.sleep(600);
    await shot("fabric-edit-panel");
  });

  await step("ST-13", async ({ shot }) => {
    await page.clickSelector('button[aria-label="Preferred printer"]');
    await page.sleep(500);
    await shot("preferred-printer-select-open");
    await closeOverlays(page);
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
  });

  await step("ST-14", async ({ shot }) => {
    await page.setValue('input[placeholder="Search…"]', "Organic Twill");
    await page.sleep(500);
    await page.clickSelector('button[title="Edit"]', { nth: 0 });
    await page.waitForText("Not a", { selector: "span", exact: false });
    await page.sleep(500);
    await shot("preferred-printer-stale");
    await page.clickText("Cancel", { selector: "button" });
    await page.setValue('input[placeholder="Search…"]', "");
    await page.sleep(300);
  });

  await step("ST-12", async ({ shot }) => {
    await page.clickText("Add material", { selector: "button" });
    await page.waitForText("New material", { selector: "p" });
    await page.sleep(500);
    await shot("fabric-new-panel");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(300);
  });

  await step("ST-15", async ({ shot }) => {
    await openSettings(page, "Fabrics");
    await page.sleep(800);
    await page.clickSelector('input[class*="globals_input"]', { nth: 0 });
    await page.setValue('input[class*="globals_input"]', "0");
    await page.sleep(500);
    await shot("global-parameters-invalid");
  });

  // ---- Rollback Reasons ----
  await step("ST-16", async ({ shot }) => {
    await openSettings(page, "Rollback Reasons");
    await page.sleep(500);
    await shot("rollback-reasons");
  });

  await step("ST-17", async ({ shot }) => {
    await page.clickSelector('button[class*="edit_btn"]', { nth: 0 });
    await page.sleep(500);
    await shot("reason-edit-row");
  });

  await step("ST-18", async ({ shot }) => {
    await page.clickSelector('button[class*="icon_trigger"]');
    await page.sleep(500);
    await shot("reason-icon-picker");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(300);
  });

  await step("ST-19", async ({ shot }) => {
    await page.clickText("Add reason", { selector: "button" });
    await page.sleep(400);
    await page.setValue('input[placeholder="Reason label…"]', "Colour bleed");
    await page.sleep(400);
    await shot("reason-add-row");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(300);
  });

  await step("ST-20", async ({ shot }) => {
    // OTHER is the last row
    const count = await page.evaluate(() => document.querySelectorAll('button[class*="edit_btn"]').length);
    await page.clickSelector('button[class*="edit_btn"]', { nth: count - 1 });
    await page.sleep(500);
    await shot("reason-edit-other-locked");
    await page.clickText("Cancel", { selector: "button" });
  });

  // ---- Shop Profile ----
  await step("ST-21", async ({ shot }) => {
    await openSettings(page, "Shop Profile");
    await page.waitForText("Printers", { selector: "h3", exact: false });
    await page.sleep(800);
    await shot("shop-profile-top");
  });

  await step("ST-22", async ({ shot }) => {
    await page.scrollContainer('[class*="view_cards"]', "end");
    await page.scrollContainer(VIEW_BODY, "end");
    await page.sleep(600);
    await shot("shop-profile-bottom");
  });

  // ---- System ----
  await step("ST-26", async ({ shot }) => {
    await openSettings(page, "Updates");
    await page.sleep(800);
    await shot("updates");
  });

  await step("ST-27", async ({ shot }) => {
    await page.clickText("Check for updates", { selector: "button" });
    await page.sleep(800);
    await shot("updates-checking");
  });

  await step("ST-28", async ({ shot }) => {
    await page.waitForText("timed out", { selector: "p", exact: false, timeoutMs: 25000 });
    await page.sleep(400);
    await shot("updates-error-timeout");
  });

  await step("ST-29", async ({ shot }) => {
    await openSettings(page, "Database");
    await page.sleep(600);
    await shot("database");
  });

  await step("ST-30", async ({ shot }) => {
    await page.clickText("Backup Now", { selector: "button" });
    await page.waitForText("Backup created", { selector: "div", exact: false });
    await page.sleep(700);
    await shot("database-backup-done");
  });

  await step("ST-31", async ({ shot }) => {
    await page.sleep(3500);
    await openSettings(page, "Maintenance");
    await page.sleep(600);
    await shot("maintenance");
  });
};
