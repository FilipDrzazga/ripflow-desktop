// Variant V4: the shared database is not a database (a state no click can make) - what the app shows then.
import { openNav, openSettings } from "../lib/ui.mjs";

export const NAME = "v4";
export const VARIANT = "v4";

export const run = async ({ page, step }) => {
  await page.sleep(3000);

  await step("GL-13", async ({ shot }) => {
    await page.waitForText("could not be loaded", { selector: "div", exact: false, timeoutMs: 40000 });
    await shot("banner-profile-not-loaded");
  });

  await step("GL-12", async ({ shot }) => {
    // the database banner appears once a read or write fails; try the views that touch the database
    await openNav(page, "Production");
    await page.sleep(2500);
    await page.waitForText("Database unavailable", { selector: "div", exact: false, timeoutMs: 20000 });
    await shot("banner-database-unavailable");
  });

  await step("ST-25", async ({ shot }) => {
    await openSettings(page, "Shop Profile");
    await page.waitForText("could not be read", { selector: "div", exact: false, timeoutMs: 15000 });
    await page.sleep(500);
    await shot("shop-profile-unreadable");
  });
};
