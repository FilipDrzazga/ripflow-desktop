import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Plan E2: where the Etsy secrets may and may not go. The handlers cannot be loaded under
// vitest (electron), so the sources are read.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("Etsy wiring", () => {
  it("the secrets live in an electron-store file of their own, encrypted through safeStorage", () => {
    const src = read("./etsyHandlers.js");
    expect(src).toMatch(/new Store\(\{ name: "etsy" \}\)/);
    expect(src).toContain("safeStorage.encryptString");
    expect(src).toContain("safeStorage.isEncryptionAvailable");
  });

  it("settings:get / settings:set (the station config file) never carry an Etsy secret or credential", () => {
    const src = read("../helpers/getSettings.js");
    expect(src).not.toMatch(/secret|token|keystring/i);
    expect(src).not.toMatch(/etsyCredentials|safeStorage/);
  });

  it("nothing Etsy goes to the shared database", () => {
    for (const rel of ["./etsyHandlers.js", "../helpers/etsyApi.js", "../helpers/etsyCredentials.js"]) {
      expect(read(rel)).not.toMatch(/db\.js|shopProfile/);
    }
  });

  it("registered in registerIpcHandlers; preload passes only the two key fields", () => {
    expect(read("./index.js")).toMatch(/^\s*registerEtsyHandlers\(\);$/m);
    const preload = read("../preload.js");
    expect(preload).toContain('ipcRenderer.invoke("etsy:saveKey", { keystring: key.keystring, sharedSecret: key.sharedSecret })');
    for (const channel of ["etsy:status", "etsy:connect", "etsy:test", "etsy:disconnect", "etsy:removeKey"]) {
      expect(preload).toContain(`"${channel}"`);
      expect(read("./etsyHandlers.js")).toContain(`"${channel}"`);
    }
  });

  it("the sign-in page runs in an in-memory session with no pop-ups", () => {
    const src = read("../helpers/etsyConnectWindow.js");
    expect(src).toContain('session.fromPartition("etsy-connect")');
    expect(src).not.toContain('fromPartition("persist:');
    expect(src).toContain('({ action: "deny" })');
  });
});
