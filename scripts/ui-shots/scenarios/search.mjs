// Catalogue block: the Ctrl+F order search window (plan C3) - empty, too short, results by customer and by order,
// the keyboard highlight, a held file, nothing found, from another view, over a modal, and the barcode scanner
// typing into the window. Variant V0, role cotton, demo data only. Nothing here changes data.
import { closeOverlays, openContextMenu, clickMenuItem, openNav, parkMouse, scanBarcode } from "../lib/ui.mjs";

export const NAME = "search";
export const VARIANT = "v0";

const WINDOW = '[role=dialog][aria-label="Find an order"]';
const INPUT = `${WINDOW} input`;
const FILE_NAME = '[class*="file_name_text"]';

const typeText = async (page, text) => {
  for (const ch of text) {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
  }
  await page.sleep(350);
};

const clearInput = async (page) => {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, INPUT);
  await page.sleep(200);
};

const openWindow = async (page) => {
  await page.pressCtrl("f");
  await page.waitForText("Order number, customer or file name", { selector: "input", exact: false }).catch(() => {});
  if (!(await page.exists(WINDOW))) throw new Error("Ctrl+F did not open the search window");
  await page.sleep(300);
};

const closeWindow = async (page) => {
  await page.pressKey("Escape");
  await page.sleep(250);
  if (await page.exists(WINDOW)) throw new Error("Escape did not close the search window");
};

// "ON401234_Ruby_Stone_1of2_..." -> { order, last }
const partsOf = (stem) => {
  const t = stem.split("_");
  return { order: t[0], last: t[2] };
};

// The most common value of `pick` over the stems, optionally only values seen at least `min` times.
const mostCommon = (stems, pick, min = 1) => {
  const counts = new Map();
  for (const s of stems) {
    const v = pick(partsOf(s));
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = [...counts.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
};

const sizes = [
  [1920, 1080],
  [1366, 728],
  [960, 560],
];

export const run = async ({ page, step }) => {
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1500);

  // What the demo station holds, read from the screen: inbox names, then the Production stems, then the held file.
  const inboxStems = await page.evaluate(() => [...document.querySelectorAll('[class*="file_name_text"]')].map((e) => e.textContent.replace(/\.pdf$/i, "")));
  const heldStem = await page.evaluate(() => document.querySelector('[class*="list_item_held"] [class*="file_name_text"]')?.textContent.replace(/\.pdf$/i, "") ?? null);
  await openNav(page, "Production");
  await page.sleep(1200);
  const prodStems = await page.evaluate(() => [...document.querySelectorAll("[data-file-id]")].map((e) => e.getAttribute("data-file-id")));
  await openNav(page, "Print");
  const all = [...inboxStems, ...prodStems].filter((s) => s.startsWith("ON"));
  const lastName = mostCommon(all, (p) => p.last, 2);
  const orderId = mostCommon(all, (p) => p.order, 2);
  const heldOrder = heldStem ? partsOf(heldStem).order : null;
  console.log(`[search] last name "${lastName}", order "${orderId}", held order "${heldOrder}" (${all.length} files seen)`);
  if (!lastName || !orderId || !heldOrder) throw new Error("the demo data gave nothing to search for");

  await step("SR-01", async ({ shot }) => {
    await openWindow(page);
    await parkMouse(page);
    await shot("empty");
  });

  await step("SR-02", async ({ shot }) => {
    await typeText(page, "ab");
    await shot("too-short");
    await clearInput(page);
  });

  await step("SR-03", async ({ shot }) => {
    await typeText(page, lastName);
    for (const [w, h] of sizes) {
      await page.setViewport(w, h);
      await page.sleep(500);
      await parkMouse(page);
      await shot(`customer-${w}x${h}`);
    }
    await page.setViewport(1920, 1080);
    await page.sleep(400);
    await parkMouse(page);
  });

  await step("SR-04", async ({ shot }) => {
    // retype: the viewport changes of SR-03 left a hover highlight under the old pointer position
    await clearInput(page);
    await typeText(page, lastName);
    // two presses with no wait between them: both must count
    await page.pressKey("ArrowDown");
    await page.pressKey("ArrowDown");
    await page.sleep(250);
    const sel = await page.evaluate(() => [...document.querySelectorAll('[role=option]')].findIndex((e) => e.getAttribute("aria-selected") === "true"));
    if (sel !== 2) throw new Error(`two ArrowDown should highlight the third row, got ${sel}`);
    const ad = await page.evaluate((sel) => document.querySelector(sel).getAttribute("aria-activedescendant"), INPUT);
    if (!ad) throw new Error("the input has no aria-activedescendant");
    await shot("keyboard-highlight");
  });

  await step("SR-05", async ({ shot }) => {
    await clearInput(page);
    await typeText(page, orderId);
    await shot("by-order-id");
  });

  await step("SR-06", async ({ shot }) => {
    await clearInput(page);
    await typeText(page, heldOrder);
    const held = await page.evaluate(() => [...document.querySelectorAll('[role=option]')].some((e) => e.textContent.startsWith("Held")));
    if (!held) throw new Error("the held file did not show as Held");
    await shot("held-file");
  });

  await step("SR-07", async ({ shot }) => {
    await clearInput(page);
    await typeText(page, "zzzzzz");
    await shot("not-found");
  });

  await step("SR-08", async ({ shot }) => {
    // a second Ctrl+F selects the text of the field instead of opening another window
    await clearInput(page);
    await typeText(page, lastName);
    await page.pressCtrl("f");
    await page.sleep(250);
    const state = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return { windows: document.querySelectorAll('[role=dialog][aria-label="Find an order"]').length, selected: el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0, focused: document.activeElement === el };
    }, INPUT);
    if (state.windows !== 1 || !state.selected || !state.focused) throw new Error(`second Ctrl+F: ${JSON.stringify(state)}`);
    await shot("second-ctrl-f-selects");
    await closeWindow(page);
  });

  await step("SR-09", async ({ shot }) => {
    // from another view, and the scanner: a barcode typed with the window open lands in the box and moves nothing
    await openNav(page, "Production");
    await page.sleep(900);
    const before = await page.evaluate(() => document.querySelectorAll('[class*="card_selected"]').length);
    await openWindow(page);
    await scanBarcode(page, "PRINTED_081530-Natural Canvas-ARCA");
    await page.sleep(400);
    const typed = await page.evaluate((sel) => document.querySelector(sel).value, INPUT);
    if (typed !== "PRINTED_081530-Natural Canvas-ARCA") throw new Error(`the scan did not land in the box: "${typed}"`);
    await shot("from-production-after-scan");
    await closeWindow(page);
    const after = await page.evaluate(() => document.querySelectorAll('[class*="card_selected"]').length);
    if (before !== after) throw new Error("the scan changed the Production selection");
    await openNav(page, "Print");
  });

  await step("SR-10", async ({ shot }) => {
    // over a modal the shortcut does nothing: open the Hold modal, press Ctrl+F, only the modal is there
    await openContextMenu(page, "Linear Meter", { selector: FILE_NAME });
    await clickMenuItem(page, "Hold");
    await page.waitForText("Hold file", { selector: "p" });
    await page.pressCtrl("f");
    await page.sleep(400);
    if (await page.exists(WINDOW)) throw new Error("Ctrl+F opened the search over a modal");
    await shot("blocked-over-modal");
    await page.clickText("Cancel", { selector: "button" });
    await page.sleep(300);
    await closeOverlays(page);
  });
};
