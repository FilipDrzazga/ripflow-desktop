// Catalogue block 4: Production - the three lenses, menus, modals and the scanner toasts (variant V0, role cotton).
// Everything that changes data (the cotton scan moves Printed files on) comes at the end.
import { closeOverlays, openNav, parkMouse, scanBarcode } from "../lib/ui.mjs";

export const NAME = "production";
export const VARIANT = "v0";

const CARD = "[data-file-id]";
const SEARCH = 'input[placeholder="Id, customer, fabric"]';
const WRAPPER = '[class*="cards_wrapper"]';

const BATCH = {
  satin: "PRINTED_093210-Satin Gloss-BOREAL",
  canvas: "PRINTED_081530-Natural Canvas-ARCA",
  twill: "PRINTED_141205-Organic Twill-ARCA",
  velvet: "PRINTED_153540-Velvet Soft-CIRRUS",
  chiffon: "PRINTED_142200-Chiffon Light-CIRRUS",
};

const stageTab = async (page, label) => {
  await page.clickText(label, { selector: '[class*="stage_tab_label"]' });
  await page.sleep(700);
};
const lens = async (page, label) => {
  await page.clickText(label, { selector: "button", within: "main", exact: true });
  await page.sleep(700);
};
const setSearch = async (page, value) => {
  await page.setValue(SEARCH, value);
  await page.sleep(500);
};
const menuOn = async (page, nth = 0) => {
  await page.clickSelector(CARD, { nth, button: "right" });
  await page.waitForText("Cancel", { selector: "[role=menu] button" });
  await page.sleep(400);
};
const clearSelection = async (page) => {
  // click selected cards again until none is left selected
  for (let i = 0; i < 10; i++) {
    if (!(await page.exists('[class*="card_selected"]'))) return;
    await page.clickSelector('[class*="card_selected"]', { nth: 0 });
    await page.sleep(200);
  }
};
const firstFileId = (page) => page.evaluate(() => document.querySelector("[data-file-id]")?.getAttribute("data-file-id") ?? null);

export const run = async ({ page, step, skip }) => {
  await openNav(page, "Production");
  await page.waitForText("Production", { selector: "h2" });
  await page.sleep(1800);

  const knownFileId = await firstFileId(page);
  if (!knownFileId) throw new Error("the board has no cards");

  await step("PD-01", async ({ shot }) => {
    await shot("board-all");
  });

  await step("PD-10", async ({ shot }) => {
    await page.scrollContainer(WRAPPER, "end");
    await page.sleep(500);
    await shot("stale-day-pills");
    await page.scrollContainer(WRAPPER, 0);
  });

  await step("PD-02", async ({ shot }) => {
    await stageTab(page, "Printed");
    await shot("tab-printed");
  });

  await step("PD-03", async ({ shot }) => {
    await stageTab(page, "Sew Out");
    await shot("tab-sew-out");
  });

  await step("PD-04", async ({ shot }) => {
    await stageTab(page, "Shipped");
    await shot("tab-shipped");
  });

  await step("PD-05", async ({ shot }) => {
    await stageTab(page, "Stuck");
    await shot("tab-stuck");
  });

  await step("PD-06", async ({ shot }) => {
    await stageTab(page, "All");
    await page.clickSelector('button[aria-label="Batch grouping"]');
    await page.sleep(700);
    await shot("grouping-off");
    await page.clickSelector('button[aria-label="Batch grouping"]');
    await page.sleep(500);
  });

  await step("PD-07", async ({ shot }) => {
    await page.clickSelector('button[title="Collapse all days"]');
    await page.sleep(600);
    await shot("days-collapsed");
    await page.clickSelector('button[title="Expand all days"]');
    await page.sleep(500);
  });

  await step("PD-08", async ({ shot }) => {
    await page.clickSelector('button[title="Show only this day"]', { nth: 1 });
    await page.sleep(700);
    await shot("day-filter");
    await page.clickText("×", { selector: "button", exact: false });
    await page.sleep(500);
  });

  await step("PD-11", async ({ shot }) => {
    await page.clickText("Select All", { selector: "button" });
    await page.sleep(600);
    await shot("batch-selected");
  });

  await step("PD-20", async ({ shot }) => {
    await menuOn(page, 0);
    await shot("menu-several-selected");
    await closeOverlays(page);
    await clearSelection(page);
  });

  await step("PD-12", async ({ shot }) => {
    await page.hoverSelector(CARD, { nth: 2 });
    await page.sleep(400);
    await shot("card-hover");
    await parkMouse(page);
  });

  await step("PD-13", async ({ shot }) => {
    await page.findSelector('[class*="card_type_badge_rip_error"]');
    await page.sleep(500);
    await shot("card-rip-error");
  });

  await step("PD-14", async ({ shot }) => {
    await page.clickSelector('[class*="card_type_badge_rip_error"]');
    await page.sleep(600);
    await shot("rip-error-popover");
    await closeOverlays(page);
  });

  await step("PD-17", async ({ shot }) => {
    await stageTab(page, "Printed");
    await menuOn(page, 0);
    await shot("menu-printed");
    await closeOverlays(page);
  });

  await step("PD-23", async ({ shot }) => {
    await menuOn(page, 0);
    await page.clickText("Rollback this file", { selector: "[role=menuitem]" });
    await page.waitForText("Rollback to Inbox:", { selector: "h3" });
    await page.sleep(500);
    await shot("rollback-modal-single");
  });

  await step("PD-24", async ({ shot }) => {
    await page.clickSelector('[class*="reason_dropdown_trigger"]', { nth: 0 });
    await page.sleep(400);
    await page.clickSelector('[class*="reason_dropdown_item"]', { nth: 1 });
    await page.sleep(500);
    await shot("rollback-modal-reason-chosen");
  });

  await step("PD-26", async ({ shot }) => {
    await page.clickSelector('[class*="reason_dropdown_trigger"]', { nth: 0 });
    await page.sleep(400);
    await page.clickText("Other", { selector: '[class*="reason_dropdown_item"]', exact: false });
    await page.sleep(500);
    await shot("rollback-modal-other");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
  });

  await step("PD-25", async ({ shot }) => {
    await page.clickText("Select All", { selector: "button" });
    await page.sleep(500);
    await menuOn(page, 0);
    await page.clickText("Rollback", { selector: "[role=menuitem]", exact: false });
    await page.waitForText("Rollback to Inbox:", { selector: "h3" });
    await page.sleep(400);
    await page.clickSelector('[class*="reason_dropdown_trigger"]', { nth: 0 });
    await page.sleep(500);
    await shot("rollback-modal-apply-to-all");
    await closeOverlays(page);
    await page.clickText("Cancel", { selector: "button" }).catch(() => {});
    await page.sleep(400);
    await clearSelection(page);
  });

  await step("PD-19", async ({ shot }) => {
    await stageTab(page, "Sew Out");
    await menuOn(page, 0);
    await shot("menu-to-sewing");
    await closeOverlays(page);
  });

  await step("PD-18", async ({ shot }) => {
    await stageTab(page, "QC");
    await menuOn(page, 0);
    await page.hoverText("Send to Sewing", { selector: "[role=menuitem]" });
    await page.sleep(600);
    await shot("menu-qc-send-to-sewing");
    await closeOverlays(page);
  });

  await step("PD-21", async ({ shot }) => {
    await stageTab(page, "Shipped");
    await menuOn(page, 0);
    await shot("menu-shipped");
    await closeOverlays(page);
    await stageTab(page, "All");
  });

  // ---- Orders lens ----------------------------------------------------------------------------------------------
  await step("PD-27", async ({ shot }) => {
    await lens(page, "Orders");
    await shot("orders-collapsed");
  });

  await step("PD-28", async ({ shot }) => {
    await page.clickSelector('[class*="order_header"]', { nth: 0 });
    await page.sleep(500);
    await shot("order-expanded");
  });

  skip("PD-29", "the unknown-order group needs a file without an order number; every demo file name carries one");

  await step("PD-30", async ({ shot }) => {
    await setSearch(page, "zzzzqqq");
    await shot("orders-no-match");
    await setSearch(page, "");
  });

  await step("PD-31", async ({ shot }) => {
    await lens(page, "Batches");
    await menuOn(page, 0);
    await page.clickText("Show in Orders", { selector: "[role=menuitem]" });
    await page.sleep(500);
    await shot("show-in-orders-flash");
  });

  // ---- Receive lens ---------------------------------------------------------------------------------------------
  await step("PD-32", async ({ shot }) => {
    await lens(page, "Receive");
    await shot("receive-empty");
  });

  await step("PD-33", async ({ shot }) => {
    await setSearch(page, BATCH.chiffon);
    await page.pressKey("Enter");
    await page.sleep(800);
    await shot("toast-batch-added", "PD-40e");
    await page.sleep(3500);
    await shot("receive-session-no-order", "PD-33");
  });

  await step("PD-40f", async ({ shot }) => {
    await setSearch(page, BATCH.chiffon);
    await page.pressKey("Enter");
    await page.sleep(700);
    await shot("toast-already-in-session");
  });

  await step("PD-36", async ({ shot }) => {
    // a second parcel from the other sewing company: the company chips appear
    await page.sleep(3200);
    await setSearch(page, BATCH.velvet);
    await page.pressKey("Enter");
    await page.sleep(3800);
    await shot("receive-company-filter");
  });

  await step("PD-40g", async ({ shot }) => {
    // a file-level scan in the Receive lens has no meaning there
    await setSearch(page, knownFileId);
    await page.pressKey("Enter");
    await page.sleep(800);
    await shot("toast-scan-a-batch-barcode");
  });

  await step("PD-34", async ({ shot }) => {
    await page.clickSelector('[class*="order_main"]', { nth: 0 });
    await page.sleep(2500);
    await shot("receive-order-selected");
  });

  await step("PD-37", async ({ shot }) => {
    await page.clickSelector(CARD, { nth: 0, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.sleep(400);
    await shot("receive-menu");
  });

  await step("PD-35", async ({ shot }) => {
    await page.clickText("Receive", { selector: "[role=menuitem]", exact: false });
    await page.sleep(1500);
    await shot("receive-after-receiving");
  });

  // ---- scanner / search toasts (they change data - cotton scan moves Printed on) --------------------------------
  await step("PD-38", async ({ shot }) => {
    await lens(page, "Batches");
    await setSearch(page, "zzzzqqq");
    await shot("no-jobs-match");
    await setSearch(page, "");
  });

  await step("PD-40a", async ({ shot }) => {
    await setSearch(page, knownFileId);
    await page.pressKey("Enter");
    await page.sleep(700);
    await shot("toast-order-found");
  });

  await step("PD-40b", async ({ shot }) => {
    await page.sleep(3200);
    await page.clickSelector("h2");
    await scanBarcode(page, "NOPE-12345");
    await page.sleep(800);
    await shot("toast-not-found");
    await shot("toast-error", "GL-06");
  });

  await step("PD-40d", async ({ shot }) => {
    await page.sleep(3200);
    await setSearch(page, BATCH.twill);
    await page.pressKey("Enter");
    await page.sleep(800);
    await shot("toast-nothing-to-advance");
  });

  await step("PD-09", async ({ shot }) => {
    await page.sleep(3200);
    await setSearch(page, BATCH.satin);
    await page.pressKey("Enter");
    await page.sleep(700);
    await shot("toast-files-moved", "PD-40c");
    await page.sleep(3500);
    await shot("batch-filter-chip", "PD-09");
  });
};
