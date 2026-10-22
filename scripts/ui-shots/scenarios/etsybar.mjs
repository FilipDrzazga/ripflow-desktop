// Plan E4b: the Etsy bar above the Inbox table (variant V5: features.etsy on, five open lines). Run once per size:
//   node scripts/ui-shots/run.mjs --scenario=etsybar --viewport=1920x1080 --out=<dir>
// Nothing here writes to the demo data: the one Retry click is refused in the page (five digits) before any IPC.
import { parkMouse } from "../lib/ui.mjs";

export const NAME = "etsybar";
export const VARIANT = "v5";

const BAR_TEXT = "Etsy order lines need a person";
// The newest line is the one with a retry already requested (its field is disabled): the enabled ones start below it.
const FREE_FIELD = 'input[placeholder="six digits"]:not([disabled])';

// Puts the bar's top edge near the top of the Print view and its list at the first line - what a person sees after
// opening the bar. (Finding the text scrolls the page to the last match; a shot should not show that.)
const frame = async (page) => {
  await page.evaluate(() => {
    const bar = document.querySelector('section[aria-label^="Etsy order lines"]');
    if (!bar) return;
    const list = bar.querySelector("ul");
    if (list) list.scrollTop = 0;
    bar.scrollIntoView({ block: "start" });
  });
  await page.sleep(300);
  await parkMouse(page);
};

export const run = async ({ page, step }) => {
  await page.waitForText(BAR_TEXT, { selector: "span", exact: false, timeoutMs: 40000 });
  await page.sleep(1200);

  await step("EB-01", async ({ shot }) => {
    await parkMouse(page);
    await shot("bar-closed");
  });

  await step("EB-02", async ({ shot }) => {
    await page.clickText(BAR_TEXT, { selector: "button", exact: false });
    await page.waitForText("Peony Garden", { selector: "span", exact: false });
    await frame(page);
    await shot("bar-open");
  });

  await step("EB-03", async ({ shot }) => {
    await page.setValue(FREE_FIELD, "12345");
    await page.sleep(300);
    await page.clickText("Retry", { selector: "button", exact: true, nth: 1 });
    await page.waitForText("exactly six digits", { selector: "div", exact: false });
    await frame(page);
    await shot("bar-open-number-refused");
  });
};
