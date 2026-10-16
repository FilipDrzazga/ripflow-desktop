import { ipcMain } from "electron";
import { toIpcError } from "../helpers/ipcError.js";
import { createCloudMetres } from "../helpers/cloudMetres.js";
import { hasCloudKey, getCloudKey, setCloudKey, clearCloudKey } from "../helpers/cloudKey.js";

// PrintFactory Cloud, read-only (see helpers/cloudMetres.js). The key never crosses to the
// renderer: it goes in through cloud:set-key and only "is one set" comes back.
const metres = createCloudMetres({ getKey: getCloudKey });

const fail = (err, stage) => ({ success: false, error: toIpcError(err, stage, "PrintFactory Cloud") });

export function registerCloudHandlers() {
  ipcMain.handle("cloud:has-key", () => ({ success: true, data: { configured: hasCloudKey() } }));

  ipcMain.handle("cloud:set-key", (_event, key) => {
    try {
      setCloudKey(key);
      metres.reset();
      return { success: true };
    } catch (err) {
      return fail(err, "cloud:set-key");
    }
  });

  ipcMain.handle("cloud:clear-key", () => {
    try {
      clearCloudKey();
      metres.reset();
      return { success: true };
    } catch (err) {
      return fail(err, "cloud:clear-key");
    }
  });

  // Tests the key the operator just typed, or the stored one when the field is empty.
  ipcMain.handle("cloud:test", async (_event, typedKey) => {
    try {
      const key = typeof typedKey === "string" && typedKey.trim() !== "" ? typedKey.trim() : getCloudKey();
      if (!key) return { success: false, error: toIpcError({ code: "CLOUD_NO_KEY", message: "No key to test." }, "cloud:test", "PrintFactory Cloud") };
      await metres.testKey(key);
      return { success: true };
    } catch (err) {
      return fail(err, "cloud:test");
    }
  });

  ipcMain.handle("cloud:get-day-metres", async () => {
    try {
      return { success: true, data: await metres.getDayMetres() };
    } catch (err) {
      return fail(err, "cloud:get-day-metres");
    }
  });
}
