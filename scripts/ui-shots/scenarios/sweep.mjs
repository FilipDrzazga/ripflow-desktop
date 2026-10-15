// Responsiveness sweep: every view at every window size, shots + overflow probe (lib/overflowProbe.mjs).
// Each view is reached ONCE, then the viewport is changed under it - so a layout that only breaks on the way
// down (or only on the way up) is seen as it really is. Nothing is changed in the demo data.
//
//   node scripts/ui-shots/run.mjs --scenario=sweep --out=agents/chat/artefakty/resp-0/przed
//   node scripts/ui-shots/overflowMap.mjs --dir=agents/chat/artefakty/resp-0/przed   (the table)
//   --only=SW-print,SW-batch narrows the views (a re-take of a step replaces just its rows).
import { closeOverlays, openFirstHistoryBatch, openNav, openSettings, parkMouse } from "../lib/ui.mjs";
import { SWEEP_SIZES } from "../lib/overflowTable.mjs";

export const NAME = "sweep";
export const VARIANT = "v0";

const lens = async (page, label) => {
  await page.clickText(label, { selector: "button", within: "main", exact: true });
  await page.sleep(700);
};

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1200);

  // Photographs the current screen at every size; the page is left at the last (largest) one.
  const atEverySize = async (shot) => {
    for (const size of SWEEP_SIZES) {
      const [w, h] = size.split("x").map(Number);
      await page.setViewport(w, h);
      await page.sleep(700);
      await parkMouse(page);
      await shot(size);
    }
  };

  const view = (id, prepare) =>
    step(id, async ({ shot }) => {
      await closeOverlays(page);
      await prepare();
      await atEverySize(shot);
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
  await view("SW-production", async () => {
    await openNav(page, "Production");
    await page.sleep(1500);
  });
  await view("SW-production-orders", async () => {
    await lens(page, "Orders");
  });
  await view("SW-production-receive", async () => {
    await lens(page, "Receive");
  });
  await view("SW-custom", async () => {
    await openNav(page, "Custom Orders");
  });
  await view("SW-analytics", async () => {
    await openNav(page, "Analytics");
    await page.sleep(1200);
  });
  await view("SW-logs", async () => {
    await openNav(page, "Logs");
  });
  for (const section of ["General", "Paths", "Fabrics", "Rollback Reasons", "Shop Profile", "Updates", "Database", "Maintenance"]) {
    await view(`SW-settings-${section.toLowerCase().replace(/ /g, "-")}`, async () => {
      await openSettings(page, section);
    });
  }
};
