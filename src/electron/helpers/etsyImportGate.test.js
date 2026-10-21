import { describe, it, expect } from "vitest";
import { etsyImportGate } from "./etsyImportGate.js";

const OPEN = {
  paused: false,
  dbOpen: true,
  featureOn: true,
  enabled: true,
  storageSet: true,
  libraryPath: "D:\\ETSY",
  since: 1760000000,
  etsyStatus: { connected: true, shopId: 777 },
};

describe("etsyImportGate (W3: fail closed)", () => {
  it("every fact in place: the tick may run", () => {
    expect(etsyImportGate(OPEN)).toBeNull();
  });

  it.each([
    ["the station sleeps or is locked", { paused: true }],
    ["there is no database", { dbOpen: false }],
    ["features.etsy is off", { featureOn: false }],
    ["features.etsy of a profile that is not loaded is not 'on'", { featureOn: undefined }],
    ["this station is not the importer", { enabled: false }],
    ["a truthy non-boolean switch is not 'on'", { enabled: "true" }],
    ["the storage folder is not set", { storageSet: false }],
    ["the library folder is not set", { libraryPath: "" }],
    ["no start date", { since: null }],
    ["a start date that is not a whole positive number", { since: "1760000000" }],
    ["the Etsy key cannot be read", { etsyStatus: null }],
    ["not connected", { etsyStatus: { connected: false, shopId: 777 } }],
    ["connected without a shop", { etsyStatus: { connected: true, shopId: null } }],
  ])("%s -> a reason", (_label, change) => {
    const reason = etsyImportGate({ ...OPEN, ...change });
    expect(typeof reason).toBe("string");
    expect(reason.length).toBeGreaterThan(5);
  });

  it("an unknown fact (nothing passed at all) is a 'no'", () => {
    expect(etsyImportGate({})).not.toBeNull();
  });
});
