// Chains that move files: override -> Rip -> Production / Batch History, and a partial rollback -> reprint -> Rip again
// (variant V0). The shots that need these chains: PR-24, PR-42, PD-15, PD-16, BH-20.
import { closeOverlays, clickMenuItem, openFirstHistoryBatch, openNav } from "../lib/ui.mjs";

export const NAME = "flows";
export const VARIANT = "v0";

const FILE_NAME = '[class*="file_name_text"]';
const CARD = "[data-file-id]";

// indices (in the visible list) of Print rows whose name contains every needle
const rowsWith = (page, ...needles) =>
  page.evaluate(
    (needles) =>
      [...document.querySelectorAll('[class*="file_name_text"]')]
        .map((e, i) => (needles.every((n) => e.textContent.includes(n)) && !e.closest('[class*="list_item_held"]') && !e.closest('[class*="list_item_invalid"]') ? i : -1))
        .filter((i) => i >= 0),
    needles,
  );

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1500);

  // ---- A: override one file, Rip two ----------------------------------------------------------------------------
  await step("PR-24", async ({ shot }) => {
    const lm = await rowsWith(page, "Natural Canvas", "Linear Meter");
    if (lm.length < 1) throw new Error("need a Natural Canvas LM file that is not on hold");
    let overridden = false;
    for (const idx of lm) {
      await page.clickSelector(FILE_NAME, { nth: idx, button: "right" });
      await page.waitForText("Cancel", { selector: "[role=menu] button" });
      await page.sleep(400);
      await clickMenuItem(page, "Override quantity");
      await page.waitForText("Set quantity override", { selector: "p" });
      const original = parseFloat(await page.evaluate(() => document.querySelector('input[type="number"]')?.placeholder ?? ""));
      if (original > 1) {
        await page.setValue('input[type="number"]', String(Math.floor(original) - 1));
        await page.sleep(300);
        await page.clickText("Set override", { selector: "button" });
        await page.sleep(600);
        overridden = true;
        break;
      }
      await page.clickText("Cancel", { selector: "button" });
      await page.sleep(300);
    }
    if (!overridden) throw new Error("no Natural Canvas LM file with more than 1 m");
    // select the overridden file and one more LM file of the group, then Rip
    const picked = await rowsWith(page, "Natural Canvas", "Linear Meter");
    const others = (await rowsWith(page, "Natural Canvas")).filter((i) => i !== picked[0]);
    await page.clickSelector(FILE_NAME, { nth: picked[0] });
    await page.clickSelector(FILE_NAME, { nth: others[0] });
    await page.sleep(700);
    await page.clickText("Rip", { selector: "button" });
    await page.waitForText("Batch submitted successfully", { selector: "div", exact: false, timeoutMs: 30000 });
    await page.sleep(500);
    await shot("rip-success-toast");
  });

  await step("PD-16", async ({ shot }) => {
    await page.sleep(3500);
    await openNav(page, "Production");
    await page.waitForText("Production", { selector: "h2" });
    await page.sleep(1500);
    await page.findSelector('[class*="card_type_badge_override"]');
    await page.sleep(500);
    await shot("card-override-badge");
  });

  await step("BH-20", async ({ shot }) => {
    await openNav(page, "Batch");
    await page.waitForText("Batch history", { selector: "h2" });
    await page.sleep(1500);
    await openFirstHistoryBatch(page);
    await page.findSelector('[class*="override_badge"]');
    await shot("file-override-badge");
  });

  // ---- B: partial rollback in Production, the file comes back with a Reprint badge --------------------------------
  await step("PR-42", async ({ shot }) => {
    await openNav(page, "Production");
    await page.waitForText("Production", { selector: "h2" });
    await page.sleep(1500);
    await page.clickText("Printed", { selector: '[class*="stage_tab_label"]' });
    await page.sleep(700);
    const cards = await page.evaluate(() => document.querySelectorAll("[data-file-id]").length);
    let done = false;
    for (let i = 0; i < cards && !done; i++) {
      await page.clickSelector(CARD, { nth: i, button: "right" });
      await page.waitForText("Cancel", { selector: "[role=menu] button" });
      await clickMenuItem(page, "Rollback this file");
      await page.waitForText("Rollback to Inbox:", { selector: "h3" });
      const max = parseFloat((await page.evaluate(() => document.querySelector('input[type="number"]')?.placeholder ?? "")).replace(/[^\d.]/g, ""));
      if (max > 1) {
        await page.clickSelector('[class*="reason_dropdown_trigger"]', { nth: 0 });
        await page.sleep(300);
        await page.clickSelector('[class*="reason_dropdown_item"]', { nth: 2 });
        await page.sleep(300);
        await page.setValue('input[type="number"]', "1");
        await page.evaluate(() => document.querySelector('input[type="number"]').blur());
        await page.sleep(400);
        await page.clickText("Rollback", { selector: '[class*="modal_confirm"]' });
        await page.sleep(2500);
        done = true;
      } else {
        await page.clickText("Cancel", { selector: "button" });
        await page.sleep(300);
      }
    }
    if (!done) throw new Error("no Printed card with a quantity above 1");
    await openNav(page, "Print");
    await page.waitForText("Reprint:", { selector: "span", exact: false, timeoutMs: 20000 });
    await page.sleep(600);
    await page.findSelector('[class*="reprint_badge"]');
    await shot("reprint-badge-in-inbox");
  });

  await step("PD-15", async ({ shot }) => {
    // Rip the returned file again: the reprint request rides along into Production and Batch History
    const idx = await page.evaluate(() => [...document.querySelectorAll('[class*="file_name_text"]')].findIndex((e) => e.parentElement.querySelector('[class*="reprint_badge"]')));
    await page.clickSelector(FILE_NAME, { nth: idx });
    await page.sleep(800);
    await page.evaluate(() => {
      const radios = [...document.querySelectorAll('input[type="radio"]')].filter((r) => !r.disabled);
      if (radios.length && !radios.some((r) => r.checked)) radios[0].click();
    });
    await page.sleep(500);
    await page.clickText("Rip", { selector: "button" });
    await page.waitForText("Batch submitted successfully", { selector: "div", exact: false, timeoutMs: 30000 });
    await page.sleep(3500);
    await openNav(page, "Production");
    await page.waitForText("Production", { selector: "h2" });
    await page.sleep(1500);
    await page.findSelector('[class*="card_type_badge_reprint"]');
    await page.sleep(500);
    await shot("card-reprint-badge");
  });

  await step("BH-20", async ({ shot }) => {
    await openNav(page, "Batch");
    await page.waitForText("Batch history", { selector: "h2" });
    await page.sleep(1500);
    await openFirstHistoryBatch(page);
    await page.findSelector('[class*="reprint_badge"]');
    await shot("file-reprint-badge", "BH-20");
    await closeOverlays(page);
  });
};
