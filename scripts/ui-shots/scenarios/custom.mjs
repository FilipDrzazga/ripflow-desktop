// Catalogue block 5: Custom Orders (variant V0). CSVs enter through a synthetic "drop" with an in-memory file.
import { DEMO_CUSTOM_ART, buildDemoCsv } from "../demoData.mjs";
import { closeOverlays, openNav } from "../lib/ui.mjs";

export const NAME = "custom";
export const VARIANT = "v0";

const DROP = '[aria-label="Import CSV files"]';
const CARD_HEADER = '[class*="cards_list"] [class*="card_header"]';
const HISTORY_HEADER = '[class*="right_column"] [class*="card_header"]';

const csvOf = (art) => buildDemoCsv({ po: art.po, material: art.material, rows: art.files.map((file, i) => ({ file, meters: 2 + i * 0.5 })) });

const dropCsv = async (page, name, content) => {
  await page.dragFile(DROP, { name, content, drop: true });
  await page.sleep(1500);
};

export const run = async ({ page, step }) => {
  await openNav(page, "Custom Orders");
  await page.waitForText("Custom Order History", { selector: "h2" });
  await page.sleep(1500);

  await step("CO-01", async ({ shot }) => {
    await shot("empty-import-and-history");
  });

  await step("CO-12", async ({ shot }) => {
    await page.clickSelector(HISTORY_HEADER, { nth: 0 });
    await page.sleep(500);
    await shot("history-entry-expanded");
    await page.clickSelector(HISTORY_HEADER, { nth: 0 });
    await page.sleep(300);
  });

  await step("CO-02", async ({ shot }) => {
    await page.dragFile(DROP, { drop: false });
    await page.sleep(500);
    await shot("drop-zone-dragging");
    await page.evaluate((sel) => document.querySelector(sel).dispatchEvent(new DragEvent("dragleave", { bubbles: true })), DROP);
    await page.sleep(300);
  });

  await step("CO-04", async ({ shot }) => {
    await dropCsv(page, "demo-complete.csv", csvOf(DEMO_CUSTOM_ART.complete));
    await page.waitForText(`PO ${DEMO_CUSTOM_ART.complete.po}`, { exact: false });
    await shot("card-collapsed");
  });

  await step("CO-05", async ({ shot }) => {
    await dropCsv(page, "demo-partial.csv", csvOf(DEMO_CUSTOM_ART.partial));
    await page.waitForText("1 missing", { exact: false });
    await shot("card-missing-files");
  });

  await step("CO-06", async ({ shot }) => {
    // the partial card is the second one
    await page.clickSelector(CARD_HEADER, { nth: 1 });
    await page.sleep(600);
    await shot("card-expanded");
  });

  await step("CO-10", async ({ shot }) => {
    await page.clickSelector('button[title="Generate XML"]', { nth: 1 });
    await page.sleep(700);
    await shot("toast-no-printer");
    await shot("toast-no-printer", "GL-05");
    await page.sleep(3300);
  });

  await step("CO-08", async ({ shot }) => {
    // none selected -> the "no files" warning; then two of them again
    const rows = '[class*="file_row"]';
    for (let i = 0; i < 4; i++) {
      await page.clickSelector(rows, { nth: 0 + i + 0 });
      await page.sleep(150);
    }
    await page.clickText("CIRRUS", { selector: '[class*="printer_toggle"]', nth: 1 });
    await page.sleep(300);
    await page.clickSelector('button[title="Generate XML"]', { nth: 1 });
    await page.sleep(700);
    await shot("toast-no-files", "CO-10");
    await page.sleep(3300);
    await page.clickSelector(rows, { nth: 0 });
    await page.clickSelector(rows, { nth: 1 });
    await page.sleep(500);
    await shot("some-files-deselected");
  });

  await step("CO-07", async ({ shot }) => {
    await shot("printer-chosen");
  });

  await step("CO-09", async ({ shot }) => {
    await page.clickSelector('button[title="Generate XML"]', { nth: 1 });
    await page.sleep(1500);
    await shot("generated");
  });

  await step("CO-11", async ({ shot }) => {
    await page.sleep(3000);
    await dropCsv(page, "broken.csv", "this is not a custom order export");
    await page.sleep(500);
    await shot("toast-csv-import-failed");
    await closeOverlays(page);
  });
};
