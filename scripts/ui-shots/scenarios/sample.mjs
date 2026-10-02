// Trial scenario (UI-1): a handful of screens to prove the pipeline end to end.
// Real scenarios follow the approved catalogue (UI-2); they use the same `shot` / `page` helpers.
export const NAME = "sample";

const openNav = async (page, label) => {
  await page.clickText(label, { selector: "nav button span", within: "nav" });
  await page.sleep(600);
};

export const run = async ({ page, shot }) => {
  // Print: the inbox as the operator first sees it.
  await page.waitForText("Natural Canvas", { exact: false });
  await page.sleep(1200);
  await shot({ id: "print-inbox", view: "Print", state: "inbox with files, holds and invalid files", file: "print/01-inbox.png" });

  // Print: one file selected (the selection bar appears at the bottom).
  await page.clickText("ON401291_Ruby_Aldous", { exact: false });
  await page.sleep(700);
  await shot({ id: "print-selected", view: "Print", state: "one file selected", file: "print/02-selected.png" });

  await page.clickText("Clear Selection");
  await page.sleep(500);

  // Batch history.
  await openNav(page, "Batch");
  await page.sleep(1200);
  await shot({ id: "batch-history", view: "Batch", state: "days with batches", file: "batch/01-history.png" });

  // Production board.
  await openNav(page, "Production");
  await page.sleep(1500);
  await shot({ id: "production-board", view: "Production", state: "board with files in every stage", file: "production/01-board.png" });

  // Settings > Paths.
  await openNav(page, "Settings");
  await page.clickText("Paths", { selector: "button", within: "main, body" });
  await page.sleep(700);
  await shot({ id: "settings-paths", view: "Settings", state: "Paths section", file: "settings/02-paths.png" });
};
