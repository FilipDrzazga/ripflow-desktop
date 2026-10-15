// Shared by the wizard sweep scenarios: one view = the wizard in some state, photographed at every sweep size.
import { atEverySize } from "./sweepSizes.mjs";

export const wizardView = (page, step) => (id, prepare) =>
  step(id, async ({ shot }) => {
    await prepare();
    await atEverySize(page, shot);
    await page.setViewport(1920, 1080);
  });
