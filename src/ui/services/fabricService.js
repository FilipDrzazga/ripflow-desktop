import { withTimeout } from "@/utils/ipcWithTimeout";

export const getFabrics = () =>
  withTimeout(window.api.getFabrics(), 5_000, "getFabrics");
export const saveFabric = (oldName, fabric) =>
  withTimeout(window.api.saveFabric(oldName, fabric), 30_000, "saveFabric");
export const deleteFabric = (name) =>
  withTimeout(window.api.deleteFabric(name), 30_000, "deleteFabric");
export const setAllFabrics = (fabrics) =>
  withTimeout(window.api.setAllFabrics(fabrics), 30_000, "setAllFabrics");
