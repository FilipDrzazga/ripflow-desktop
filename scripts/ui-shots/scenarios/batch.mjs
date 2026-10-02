// Catalogue block 3: Batch History (variant V0, role cotton). The rollbacks come last because they change the data;
// the rolled-back file is then photographed back in the Print inbox (PR-41).
import fs from "node:fs";
import path from "node:path";
import { closeOverlays, openNav, parkMouse, waitForCondition } from "../lib/ui.mjs";

export const NAME = "batch";
export const VARIANT = "v0";

const DAY_ROW = '[class*="day_row"]';
const BATCH_ROW = '[class*="batch_row"]';
const FILE_ROW = '[class*="file_row_selectable"]';
const SEARCH = 'input[placeholder="Search batches or files..."]';

const dayExpanded = (page) => page.exists(BATCH_ROW);

// Opens the first day (and its first batch), whatever the state it was left in.
const openFirstDay = async (page) => {
  if (!(await dayExpanded(page))) {
    await page.clickSelector(DAY_ROW, { nth: 0 });
    await page.sleep(800);
  }
};
const openFirstBatch = async (page) => {
  await openFirstDay(page);
  if (!(await page.exists(FILE_ROW))) {
    await page.clickSelector(BATCH_ROW, { nth: 0 });
    await page.sleep(800);
  }
};
const clearSearch = async (page) => {
  await page.setValue(SEARCH, "");
  await page.sleep(800);
};
const collapseAll = async (page) => {
  await page.clickSelector('button[title="Collapse all"]');
  await page.sleep(500);
};

export const run = async ({ page, step, skip, ctx }) => {
  await openNav(page, "Batch");
  await page.waitForText("Batch history", { selector: "h2" });
  await page.sleep(1500);

  await step("BH-01", async ({ shot }) => {
    await collapseAll(page);
    await shot("days-collapsed");
  });

  await step("BH-02", async ({ shot }) => {
    await openFirstDay(page);
    await shot("day-expanded");
  });

  await step("BH-03", async ({ shot }) => {
    await openFirstBatch(page);
    await shot("batch-expanded");
  });

  skip("BH-04", "the spinner of a loading day is transient; the loaded day looks like BH-02");

  await step("BH-06", async ({ shot }) => {
    await openFirstBatch(page);
    await page.waitForText("RIP Error", { exact: false, selector: "span" });
    await shot("batch-with-rip-error");
  });

  await step("BH-07", async ({ shot }) => {
    await page.clickSelector('[class*="rip_error_badge"]');
    await page.waitForText("RIP error detail", { selector: "[role=dialog]", exact: false }).catch(() => {});
    await page.sleep(500);
    await shot("rip-error-popover");
  });

  await step("BH-08", async ({ shot }) => {
    await page.clickText("Copy", { selector: "[role=dialog] button" });
    await page.sleep(500);
    await shot("rip-error-popover-copied");
    await closeOverlays(page);
  });

  await step("BH-09", async ({ shot }) => {
    await openFirstBatch(page);
    await page.clickSelector(FILE_ROW, { nth: 0 });
    await page.clickSelector(FILE_ROW, { nth: 1 });
    await page.clickSelector(FILE_ROW, { nth: 2 });
    await page.sleep(500);
    await shot("files-selected");
  });

  await step("BH-12", async ({ shot }) => {
    await page.clickSelector(FILE_ROW, { nth: 1, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.sleep(400);
    await shot("menu-bulk");
    await closeOverlays(page);
  });

  await step("BH-10", async ({ shot }) => {
    // the menu's close handler clears the selection
    await page.clickSelector(FILE_ROW, { nth: 1, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.sleep(400);
    await shot("menu-file");
  });

  await step("BH-11", async ({ shot }) => {
    await page.hoverText("Rollback this file", { selector: "[role=menuitem]" });
    await page.sleep(600);
    await shot("menu-file-reasons");
  });

  await step("BH-14", async ({ shot }) => {
    await page.clickText("Other", { selector: "[role=menu] [role=menuitem]", exact: false });
    await page.waitForText("Describe the issue:", { selector: "p" });
    await page.sleep(400);
    await shot("other-reason-modal");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
    await closeOverlays(page);
  });

  await step("BH-15", async ({ shot }) => {
    await clearSearch(page);
    await openFirstBatch(page);
    await page.clickSelector('button[title="Rollback batch"]', { nth: 0 });
    await page.waitForText("Rollback batch", { selector: "h3" });
    await page.sleep(400);
    await shot("rollback-batch-modal");
  });

  await step("BH-16", async ({ shot }) => {
    await page.clickSelector('[class*="reason_pill"]', { nth: 0 });
    await page.sleep(400);
    await shot("rollback-batch-reason-chosen");
  });

  await step("BH-17", async ({ shot }) => {
    await page.clickText("Other", { selector: '[class*="reason_pill"]', exact: false });
    await page.sleep(400);
    await page.setValue('input[placeholder="Describe the issue..."]', "Colour shifted on the roll");
    await page.sleep(300);
    await shot("rollback-batch-other");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(400);
  });

  await step("BH-05", async ({ shot }) => {
    // a batch whose XML is gone: delete the file of the first batch of today and refresh
    const printed = path.join(ctx.layout.storagePath, "PRINTED");
    const days = fs.readdirSync(printed);
    let removed = false;
    for (const day of days) {
      for (const batch of fs.readdirSync(path.join(printed, day))) {
        const dir = path.join(printed, day, batch);
        for (const f of fs.readdirSync(dir)) {
          if (!removed && f.toLowerCase().endsWith(".xml")) {
            fs.rmSync(path.join(dir, f));
            removed = true;
          }
        }
      }
      if (removed) break;
    }
    if (!removed) throw new Error("no XML file found to remove");
    await page.clickSelector('[class*="refresh_btn"]');
    await page.sleep(2500);
    await openFirstDay(page);
    await shot("xml-missing-dot");
  });

  await step("BH-22", async ({ shot }) => {
    await page.clickText("ARCA", { selector: '[class*="printer_btn"]' });
    await page.sleep(700);
    await shot("printer-filter");
    await page.clickText("ARCA", { selector: '[class*="printer_btn"]' });
    await page.sleep(500);
  });

  await step("BH-24", async ({ shot }) => {
    // expand a day, then search for something that day does not hold
    await collapseAll(page);
    await page.clickSelector(DAY_ROW, { nth: 1 });
    await page.sleep(800);
    await page.setValue(SEARCH, "Satin Gloss");
    await page.sleep(2500);
    await page.waitForText("No matches in this day", { selector: "div" });
    await shot("search-no-matches-in-day");
  });

  await step("BH-23", async ({ shot }) => {
    await page.setValue(SEARCH, "Velvet");
    await page.sleep(4000);
    await shot("search-results");
  });

  await step("BH-25", async ({ shot }) => {
    await clearSearch(page);
    await collapseAll(page);
    await page.setValue(SEARCH, "zzzqqq");
    await page.sleep(3500);
    await page.waitForText("No results found.", { selector: "span", timeoutMs: 60000 });
    await shot("search-no-results");
    await page.setValue(SEARCH, "");
    await page.sleep(1500);
  });

  await step("BH-21", async ({ shot }) => {
    await clearSearch(page);
    await collapseAll(page);
    await openFirstDay(page);
    await page.clickSelector('button[title="Print label"]', { nth: 0 });
    await page.sleep(900);
    await shot("label-icon-and-toast");
    await parkMouse(page);
  });

  await step("BH-28", async ({ shot }) => {
    await page.sleep(3500);
    await page.clickSelector('button[title="Regenerate XML"]', { nth: 0 });
    await page.sleep(900);
    await shot("toast-xml-regenerated");
  });

  // ---- mutating part -------------------------------------------------------------------------------------------
  await step("BH-18", async ({ shot }) => {
    await page.sleep(3500);
    await openFirstBatch(page);
    await page.clickSelector(FILE_ROW, { nth: 3 }).catch(() => {});
    await page.clickSelector(FILE_ROW, { nth: 2, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.hoverText("Rollback this file", { selector: "[role=menuitem]" });
    await page.sleep(500);
    // the first reason of the list: "Missing Job"-like
    await page.clickSelector('[role=menu] [role=menu] [role=menuitem]', { nth: 0 });
    await page.sleep(1000);
    await shot("file-rolled-back");
  });

  await step("BH-19", async ({ shot }) => {
    await page.sleep(3500);
    await collapseAll(page);
    await openFirstDay(page);
    // the second batch of the day: the first one still holds the RIP error demo
    await page.clickSelector('button[title="Rollback batch"]', { nth: 1 });
    await page.waitForText("Rollback batch", { selector: "h3" });
    await page.clickSelector('[class*="reason_pill"]', { nth: 1 });
    await page.sleep(300);
    await page.clickText("Rollback", { selector: '[class*="confirm_btn"]' });
    await page.sleep(2500);
    await shot("batch-rolled-back");
  });

  await step("PR-41", async ({ shot }) => {
    await openNav(page, "Print");
    await page.waitForText("Rollback:", { selector: "span", exact: false });
    await page.sleep(500);
    await page.hoverSelector('[class*="rollback_badge"]');
    await shot("rollback-badge-in-inbox");
  });
};
