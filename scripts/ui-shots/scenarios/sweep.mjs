// Responsiveness sweep: every view at every window size, shots + overflow probe (lib/overflowProbe.mjs).
// Each view is reached ONCE, then the viewport is changed under it - so a layout that only breaks on the way
// down (or only on the way up) is seen as it really is. Nothing is changed in the demo data.
//
//   node scripts/ui-shots/run.mjs --scenario=sweep --out=agents/chat/artefakty/resp-0/przed
//   node scripts/ui-shots/overflowMap.mjs --dir=agents/chat/artefakty/resp-0/przed   (the table)
//   --only=SW-print,SW-batch narrows the views (a re-take of a step replaces just its rows).
import fs from "node:fs";
import path from "node:path";
import { closeOverlays, openFirstHistoryBatch, openNav, openSettings, parkMouse, waitForCondition } from "../lib/ui.mjs";
import { atEverySize } from "../lib/sweepSizes.mjs";
import { SWEEP_SIZES } from "../lib/overflowTable.mjs";
import { DEMO_CUSTOM_ART, buildDemoCsv, buildFileName } from "../demoData.mjs";

export const NAME = "sweep";
export const VARIANT = "v0";

const lens = async (page, label) => {
  await page.clickText(label, { selector: "button", within: "main", exact: true });
  await page.sleep(700);
};

const findInboxFile = (layout, name) => {
  for (const dir of fs.readdirSync(layout.storagePath, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const candidate = path.join(layout.storagePath, dir.name, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`${name} is not in the inbox`);
};

export const run = async ({ page, step, ctx }) => {
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

  // ---- what floats over the views: menus, popovers, modals, toasts, the new-files pill ----
  // A menu, popover or dropdown is anchored where it was OPENED and never re-laid out when the window changes size, so
  // each of these is opened afresh at every size (view() opens it once and then resizes under it - fine for a view,
  // wrong for something that positions itself at open time). `open` leaves the overlay up, `shot` photographs it.
  const dismiss = async () => {
    for (let i = 0; i < 3; i++) {
      await page.pressKey("Escape");
      await page.sleep(150);
    }
    for (let i = 0; i < 3 && (await page.exists('[role=menu], [role=dialog], [class*="backdrop"]')); i++) {
      await page.mouseClickAt((page.viewport?.width ?? 1920) - 10, (page.viewport?.height ?? 1080) - 10);
      await page.sleep(300);
    }
  };
  const floating = (id, open) =>
    step(id, async ({ shot }) => {
      for (const size of SWEEP_SIZES) {
        const [w, h] = size.split("x").map(Number);
        await page.setViewport(w, h);
        await page.sleep(700);
        await dismiss();
        await open({ shot: (state = size, shotId = id) => shot(state, shotId), size });
        await dismiss();
      }
      await page.setViewport(1920, 1080);
    });
  const FILE_ROW = '[class*="file_row_selectable"]';
  const productionMenu = async (nth = 0) => {
    await page.clickSelector("[data-file-id]", { nth, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.sleep(400);
  };
  const productionRollbackModal = async () => {
    await productionMenu(0);
    await page.clickText("Rollback", { selector: "[role=menuitem]", exact: false });
    await page.waitForText("Rollback to Inbox:", { selector: "h3" });
    await page.sleep(500);
  };

  // Batch history: the tallest menu (a file, Rollback submenu with every reason open), the RIP popover, the rollback modal (+ its "Other" state).
  await step("SW-batch-prepare", async ({ shot }) => {
    await openNav(page, "Batch");
    await page.sleep(1200);
    await openFirstHistoryBatch(page);
    await shot("1920x1080");
  });
  await floating("SW-batch-menu-reasons", async ({ shot }) => {
    await page.clickSelector(FILE_ROW, { nth: 1, button: "right" });
    await page.waitForText("Cancel", { selector: "[role=menu] button" });
    await page.hoverText("Rollback this file", { selector: "[role=menuitem]" });
    await page.sleep(600);
    await shot();
  });
  await floating("SW-batch-rip-popover", async ({ shot }) => {
    await page.clickSelector('[class*="rip_error_badge"]');
    await page.sleep(600);
    await shot();
  });
  await floating("SW-batch-rollback-modal", async ({ shot }) => {
    await page.clickSelector('button[title="Rollback batch"]', { nth: 0 });
    await page.waitForText("Rollback batch", { selector: "h3" });
    await page.sleep(400);
    await shot();
    await page.clickText("Other", { selector: '[class*="reason_pill"]', exact: false });
    await page.sleep(400);
    await shot(undefined, "SW-batch-rollback-other");
  });
  // Production: the card menu, the RIP popover, the rollback modal of one file (+ its reason dropdown) and of the whole selection.
  await step("SW-production-prepare", async ({ shot }) => {
    await openNav(page, "Production");
    await page.sleep(1500);
    await shot("1920x1080");
  });
  await floating("SW-production-menu", async ({ shot }) => {
    await productionMenu(0);
    await shot();
  });
  await floating("SW-production-rip-popover", async ({ shot }) => {
    await page.clickSelector('[class*="card_type_badge_rip_error"]');
    await page.sleep(600);
    await shot();
  });
  await floating("SW-production-rollback", async ({ shot }) => {
    await productionRollbackModal();
    await shot();
    await page.clickSelector('[class*="reason_dropdown_trigger"]', { nth: 0 });
    await page.sleep(500);
    await shot(undefined, "SW-production-rollback-reasons");
  });
  await step("SW-production-select-all", async ({ shot }) => {
    await page.clickText("Select All", { selector: "button" });
    await page.sleep(600);
    await shot("1920x1080");
  });
  // The selection's modal: its last row's reason list opens where there is room, and a stress state with eight more rows
  // (clones of the first one - layout only) shows what a long list does to a low window.
  await floating("SW-production-rollback-all", async ({ shot }) => {
    await productionRollbackModal();
    await shot();
    await page.clickSelector('[class*="reason_dropdown_trigger"]', { nth: 3 });
    await page.sleep(500);
    await shot(undefined, "SW-production-rollback-all-reasons");
    await page.pressKey("Escape");
    await page.sleep(300);
    await page.evaluate(() => {
      const list = document.querySelector('[class*="qc_file_list"]');
      for (let i = 0; i < 8; i++) list.appendChild(list.children[0].cloneNode(true));
    });
    await page.sleep(400);
    await shot(undefined, "SW-production-rollback-many");
  });
  // Quick Preview of a real file (image in the modal).
  await floating("SW-print-preview", async ({ shot }) => {
    await openNav(page, "Print");
    await page.sleep(800);
    await page.rightClickText("Linear Meter", { selector: '[class*="file_name_text"]', exact: false });
    await page.waitForText("Quick Preview", { selector: "[role=menuitem]" });
    await page.clickText("Quick Preview", { selector: "[role=menuitem]" });
    await waitForCondition(page, () => !!document.querySelector('img[class*="preview_img"]'), { what: "the preview image", timeoutMs: 30000 });
    await page.sleep(600);
    await shot();
  });
  // Three saves in a row: the toast stack, then the stack expanded by hovering it (toasts last a few seconds: opened per size).
  await floating("SW-toasts", async ({ shot }) => {
    await openSettings(page, "General");
    for (let i = 0; i < 3; i++) {
      await page.clickText("Save", { selector: "button" });
      await page.sleep(350);
    }
    await page.sleep(700);
    await shot();
    await page.hoverSelector('[class*="alert_container"] > div', { nth: 0 });
    await page.sleep(700);
    await shot(undefined, "SW-toasts-expanded");
    await parkMouse(page);
    await page.sleep(4500);
  });
  // A file arrives while the operator looks at the list: the "N new files" pill floats over the top of it.
  await view("SW-print-pill", async () => {
    await page.sleep(3500);
    await openNav(page, "Print");
    const donorName = await page.evaluate(() => [...document.querySelectorAll('[class*="file_name_text"]')].find((e) => e.textContent.includes("Natural Canvas"))?.textContent);
    const donor = findInboxFile(ctx.layout, donorName);
    const newName = buildFileName({ order: "409001", first: "Piper", last: "Hollis", x: 1, y: 1, material: "Natural Canvas", qty: 2, kind: "LM", xwd: "0a0b0c0d" });
    fs.copyFileSync(donor, path.join(path.dirname(donor), newName));
    await page.waitForText("new file", { selector: "button", exact: false, timeoutMs: 70000 });
    await page.sleep(600);
  });
};
