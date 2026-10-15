// Photographs the current screen at every sweep size; the page is left at the last (largest) one.
import { SWEEP_SIZES } from "./overflowTable.mjs";
import { parkMouse } from "./ui.mjs";

export const atEverySize = async (page, shot) => {
  for (const size of SWEEP_SIZES) {
    const [w, h] = size.split("x").map(Number);
    await page.setViewport(w, h);
    await page.sleep(700);
    await parkMouse(page);
    await shot(size);
  }
};
