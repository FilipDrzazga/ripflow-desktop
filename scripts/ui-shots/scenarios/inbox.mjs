// Inbox polling states: the new-files badge and pill, a file that vanished, the preview of a missing file (variant V0).
import fs from "node:fs";
import path from "node:path";
import { buildFileName } from "../demoData.mjs";
import { closeOverlays, openNav, waitForCondition } from "../lib/ui.mjs";

export const NAME = "inbox";
export const VARIANT = "v0";

const FILE_NAME = '[class*="file_name_text"]';

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
  await page.sleep(1500);

  // a new file arrives while the operator is on another view
  const donorName = await page.evaluate(() => [...document.querySelectorAll('[class*="file_name_text"]')].find((e) => e.textContent.includes("Natural Canvas"))?.textContent);
  const donor = findInboxFile(ctx.layout, donorName);
  const newName = buildFileName({ order: "409001", first: "Piper", last: "Hollis", x: 1, y: 1, material: "Natural Canvas", qty: 2, kind: "LM", xwd: "0a0b0c0d" });
  fs.copyFileSync(donor, path.join(path.dirname(donor), newName));
  await openNav(page, "Batch");

  await step("GL-02", async ({ shot }) => {
    await waitForCondition(page, () => !!document.querySelector('[class*="nav_badge"]'), { what: "the nav badge", timeoutMs: 70000 });
    await page.sleep(500);
    await shot("nav-badge-new-files");
  });

  await step("PR-44", async ({ shot }) => {
    await openNav(page, "Print");
    await page.waitForText("new file", { selector: "button", exact: false, timeoutMs: 15000 });
    await page.sleep(600);
    await shot("pill-new-files");
    await page.clickText("new file", { selector: "button", exact: false });
    await page.sleep(2500);
  });

  // a file leaves the inbox while it is on the list
  const victimName = await page.evaluate(() => [...document.querySelectorAll('[class*="file_name_text"]')].find((e) => e.textContent.includes("Chiffon Light") && e.textContent.includes("Linear"))?.textContent);
  const victim = findInboxFile(ctx.layout, victimName);
  fs.rmSync(victim);

  await step("PR-39", async ({ shot }) => {
    await page.rightClickText(victimName.slice(0, 40), { selector: FILE_NAME, exact: false });
    await page.waitForText("Quick Preview", { selector: "[role=menuitem]" });
    await page.clickText("Quick Preview", { selector: "[role=menuitem]" });
    await waitForCondition(page, () => !!document.querySelector('[class*="error_text"]'), { what: "the preview error", timeoutMs: 20000 });
    await page.sleep(500);
    await shot("preview-error-file-gone");
    await page.clickSelector('button[aria-label="Close preview"]');
    await page.sleep(400);
    await closeOverlays(page);
  });

  await step("PR-45", async ({ shot }) => {
    await waitForCondition(page, () => !!document.querySelector('[class*="gone_badge"]'), { what: "the Gone badge", timeoutMs: 70000 });
    await page.sleep(800);
    await shot("pill-files-gone-and-badge");
  });

  await step("PR-43", async ({ shot }) => {
    const idx = await page.evaluate(() => [...document.querySelectorAll('[class*="file_name_text"]')].findIndex((e) => e.parentElement.querySelector('[class*="gone_badge"]')));
    await page.clickSelector(FILE_NAME, { nth: idx });
    await page.sleep(700);
    await shot("gone-badge-on-selected-file");
  });
};
