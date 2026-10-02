// Small operations shared by the scenarios: navigation, scanner input, menus, waiting for the app.

export const openNav = async (page, label) => {
  await page.clickText(label, { selector: "nav button span", within: "nav" });
  await page.sleep(900);
};

export const openSettings = async (page, section) => {
  await openNav(page, "Settings");
  await page.clickText(section, { selector: "button span", within: "main" });
  await page.sleep(700);
};

// Keys typed with no input focused reach the barcode-scanner listener of Production (buffer, then Enter).
export const scanBarcode = async (page, text) => {
  for (const ch of text) {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
  }
  await page.pressKey("Enter");
};

// Moves the pointer to an empty corner of the window: closes hover states and tooltips.
export const parkMouse = (page) => page.mouseMove(1700, 1040);

// Escape a few times: closes menus, popovers and modals that listen for it.
export const closeOverlays = async (page) => {
  for (let i = 0; i < 3; i++) {
    await page.pressKey("Escape");
    await page.sleep(120);
  }
  // Production and Batch History menus ignore Escape: a click on their full-screen backdrop closes them.
  if (await page.exists("[role=menu]")) {
    await page.mouseClickAt(1700, 1040);
    await page.sleep(300);
  }
  await parkMouse(page);
};

export const clickMenuItem = async (page, label, opts = {}) => {
  await page.clickText(label, { selector: "[role=menuitem], button", exact: true, ...opts });
  await page.sleep(500);
};

// Right-click on the nth visible element matching the text, then wait for the menu.
export const openContextMenu = async (page, text, opts = {}) => {
  await page.rightClickText(text, { exact: false, ...opts });
  await page.waitForText("Cancel", { selector: "[role=menu] button", timeoutMs: 8000 });
  await page.sleep(400);
};

export const bodyText = (page) => page.evaluate(() => document.body.innerText);

export const waitForCondition = async (page, fn, { timeoutMs = 20000, everyMs = 300, what = "condition", arg } = {}) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg)) return true;
    await page.sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}`);
};

// Same React-safe value change as page.setValue, for the nth match of the selector.
export const setNthValue = (page, selector, nth, value) =>
  page.evaluate(
    (selector, nth, value) => {
      const el = document.querySelectorAll(selector)[nth];
      if (!el) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    selector,
    nth,
    value,
  );

// Batch History: makes sure the first day and its first batch are open (a day may or may not start expanded).
export const openFirstHistoryBatch = async (page) => {
  if (!(await page.exists('[class*="batch_row"]'))) {
    await page.clickSelector('[class*="day_row"]', { nth: 0 });
    await page.sleep(800);
  }
  if (!(await page.exists('[class*="file_row_selectable"]'))) {
    await page.clickSelector('[class*="batch_row"]', { nth: 0 });
    await page.sleep(900);
  }
};
