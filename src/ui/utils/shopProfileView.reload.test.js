import { describe, it, expect } from "vitest";
import { reloadResultNotice } from "./shopProfileView.js";

// ETAP 4 (4-retry): what "Reload shop data" and the banner's Retry tell the operator, from main's
// answer (helpers/reloadShopData.js). Success only when BOTH caches hold a fresh read.

const OK = { success: true, dbOpen: true, reopened: false, profile: "reloaded", fabrics: "reloaded" };

describe("reloadResultNotice", () => {
  it("both reloaded -> Success; a reconnect is said out loud", () => {
    expect(reloadResultNotice(OK)).toEqual({
      type: "Success",
      title: "Shop data reloaded",
      message: "The shop profile and the fabric list are up to date.",
    });
    expect(reloadResultNotice({ ...OK, reopened: true }).message).toMatch(/^The database was reconnected/);
  });

  it("the database still cannot be opened -> Error that points at the network", () => {
    const n = reloadResultNotice({ ...OK, dbOpen: false, profile: "missing", fabrics: "missing" });
    expect(n.type).toBe("Error");
    expect(n.title).toBe("Database still unreachable");
  });

  it("a cache with nothing loaded -> Error naming it", () => {
    const n = reloadResultNotice({ ...OK, fabrics: "missing" });
    expect(n).toEqual({ type: "Error", title: "Shop data not loaded", message: "Could not read the fabric list. Try again in a moment." });
  });

  it("both caches failed -> one Error naming both", () => {
    const n = reloadResultNotice({ ...OK, profile: "missing", fabrics: "missing" });
    expect(n.message).toBe("Could not read the shop profile and fabric list. Try again in a moment.");
  });

  it("an answer without a cache status is not a success", () => {
    expect(reloadResultNotice({ success: true, dbOpen: true }).type).toBe("Error");
  });

  it("the IPC itself failed (timeout, throw in main) -> Error with its message", () => {
    expect(reloadResultNotice({ success: false, error: "shopData:reload timed out" })).toEqual({
      type: "Error",
      title: "Reload failed",
      message: "shopData:reload timed out",
    });
    expect(reloadResultNotice(undefined).title).toBe("Reload failed");
  });
});
