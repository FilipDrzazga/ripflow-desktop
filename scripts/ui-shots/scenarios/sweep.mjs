// Responsiveness sweep: every view at every window size, shots + overflow probe (lib/overflowProbe.mjs).
// Each view is reached ONCE, then the viewport is changed under it - so a layout that only breaks on the way
// down (or only on the way up) is seen as it really is. Nothing is changed in the demo data.
//
//   node scripts/ui-shots/run.mjs --scenario=sweep --out=agents/chat/artefakty/resp-0/przed
//   node scripts/ui-shots/overflowMap.mjs --dir=agents/chat/artefakty/resp-0/przed   (the table)
//   --only=SW-print,SW-batch narrows the views (a re-take of a step replaces just its rows).
import { closeOverlays, openFirstHistoryBatch, openNav, openSettings } from "../lib/ui.mjs";
import { atEverySize } from "../lib/sweepSizes.mjs";
import { DEMO_CUSTOM_ART, buildDemoCsv } from "../demoData.mjs";

export const NAME = "sweep";
export const VARIANT = "v0";

const lens = async (page, label) => {
  await page.clickText(label, { selector: "button", within: "main", exact: true });
  await page.sleep(700);
};

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1200);

  const view = (id, prepare) =>
    step(id, async ({ shot }) => {
      await closeOverlays(page);
      await prepare();
      await atEverySize(page, shot);
      await page.setViewport(1920, 1080);
    });

  await view("SW-print", async () => {
    await openNav(page, "Print");
  });
  await view("SW-print-filter", async () => {
    await openNav(page, "Print");
    await page.clickText("Filter", { selector: "button" });
    await page.sleep(500);
  });
  await view("SW-print-selected", async () => {
    await closeOverlays(page);
    await page.clickSelector('[class*="file_name_text"]', { nth: 0 });
    await page.sleep(500);
  });
  await view("SW-batch", async () => {
    await openNav(page, "Batch");
    await page.sleep(1200);
    await openFirstHistoryBatch(page);
  });
  await view("SW-batch-selected", async () => {
    await openFirstHistoryBatch(page);
    for (const nth of [0, 1, 2]) await page.clickSelector('[class*="file_row_selectable"]', { nth });
    await page.sleep(500);
  });
  await view("SW-batch-search", async () => {
    await closeOverlays(page);
    await page.setValue('input[placeholder="Search batches or files..."]', "ON40");
    await page.sleep(2500);
    await page.clickText("ARCA", { selector: '[class*="printer_btn"]' });
    await page.sleep(500);
  });
  await view("SW-batch-collapsed", async () => {
    await page.clickText("ARCA", { selector: '[class*="printer_btn"]' });
    await page.setValue('input[placeholder="Search batches or files..."]', "");
    await page.sleep(800);
    await page.clickSelector('button[title="Collapse all"]');
    await page.sleep(500);
  });
  await view("SW-production", async () => {
    await openNav(page, "Production");
    await page.sleep(1500);
  });
  await view("SW-production-selected", async () => {
    await page.clickText("Select All", { selector: "button" });
    await page.sleep(600);
  });
  await view("SW-production-collapsed", async () => {
    await page.clickSelector('button[title="Collapse all days"]');
    await page.sleep(600);
  });
  await view("SW-production-orders", async () => {
    await lens(page, "Orders");
  });
  await view("SW-production-orders-open", async () => {
    await page.clickSelector('[class*="order_header"]', { nth: 0 });
    await page.sleep(500);
  });
  await view("SW-production-receive", async () => {
    await lens(page, "Receive");
  });
  // A parcel of two dispatches (company chips) with the first order open: the busiest state of the lens. Scans only fill the basket, nothing is moved.
  await view("SW-production-receive-session", async () => {
    for (const batch of ["PRINTED_142200-Chiffon Light-CIRRUS", "PRINTED_153540-Velvet Soft-CIRRUS"]) {
      await page.setValue('input[placeholder="Id, customer, fabric"]', batch);
      await page.sleep(400);
      await page.pressKey("Enter");
      await page.sleep(3800);
    }
    await page.setValue('input[placeholder="Id, customer, fabric"]', "");
    await page.clickSelector('[class*="order_main"]', { nth: 0 });
    await page.sleep(2500);
  });
  await view("SW-custom", async () => {
    await openNav(page, "Custom Orders");
  });
  await view("SW-custom-history-open", async () => {
    await page.clickSelector('[class*="right_column"] [class*="card_header"]', { nth: 0 });
    await page.sleep(500);
  });
  // Two imported CSVs (one with a missing artwork file) = the busiest card header: name, badges, PO, count, printers, three buttons. Nothing is generated.
  await view("SW-custom-cards", async () => {
    await page.clickSelector('[class*="right_column"] [class*="card_header"]', { nth: 0 });
    for (const [name, art] of [["demo-complete.csv", DEMO_CUSTOM_ART.complete], ["demo-partial.csv", DEMO_CUSTOM_ART.partial]]) {
      const content = buildDemoCsv({ po: art.po, material: art.material, rows: art.files.map((file, i) => ({ file, meters: 2 + i * 0.5 })) });
      await page.dragFile('[aria-label="Import CSV files"]', { name, content, drop: true });
      await page.sleep(1500);
    }
    await page.waitForText("1 missing", { exact: false });
  });
  await view("SW-custom-card-open", async () => {
    await page.clickSelector('[class*="cards_list"] [class*="card_header"]', { nth: 1 });
    await page.sleep(600);
  });
  await view("SW-analytics", async () => {
    await openNav(page, "Analytics");
    await page.sleep(1200);
  });
  // All time = the longest Summary lists and the most rows; the reason dropdown is the one overlay of the filter bar (closed by its own "All reasons" option - Escape does not close it).
  await view("SW-analytics-all", async () => {
    await page.clickText("All time", { selector: '[class*="period_btn"]' });
    await page.sleep(900);
  });
  await view("SW-analytics-reasons", async () => {
    await page.clickText("All reasons", { selector: '[class*="reason_btn"]', exact: false });
    await page.sleep(500);
  });
  await view("SW-analytics-empty", async () => {
    await page.clickSelector('button[class*="reason_option"]', { nth: 0 });
    await page.setValue('[class*="search_input"]', "zzzzqqq");
    await page.sleep(700);
  });
  await view("SW-logs", async () => {
    await openNav(page, "Logs");
  });
  await view("SW-logs-open", async () => {
    await page.clickSelector('[class*="entry_row"]', { nth: 0 });
    await page.sleep(500);
  });
  for (const section of ["General", "Paths", "Fabrics", "Rollback Reasons", "Shop Profile", "Updates", "Database", "Maintenance"]) {
    await view(`SW-settings-${section.toLowerCase().replace(/ /g, "-")}`, async () => {
      await openSettings(page, section);
    });
  }
  // The inline editors are the widest states of Settings: a fabric row opened for editing, the add form, a reason with its icon picker open.
  await view("SW-settings-fabrics-edit", async () => {
    await openSettings(page, "Fabrics");
    await page.clickSelector('button[title="Edit"]', { nth: 0 });
    await page.sleep(600);
  });
  await view("SW-settings-fabrics-add", async () => {
    await page.clickText("Cancel", { selector: "button", within: "main", exact: true });
    await page.clickText("Add material", { selector: "button", within: "main", exact: false });
    await page.sleep(600);
  });
  await view("SW-settings-reasons-edit", async () => {
    await openSettings(page, "Rollback Reasons");
    await page.clickSelector('button[class*="edit_btn"]', { nth: 0 });
    await page.sleep(400);
    await page.clickSelector('button[title="Change icon"]');
    await page.sleep(500);
  });
  await view("SW-settings-reasons-add", async () => {
    await page.clickText("Cancel", { selector: "button", within: "main", exact: true });
    await page.clickText("Add reason", { selector: "button", within: "main", exact: false });
    await page.sleep(400);
    await page.clickSelector('button[title="Choose icon"]');
    await page.sleep(500);
  });
};
