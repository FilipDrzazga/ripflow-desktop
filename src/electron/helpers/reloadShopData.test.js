import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-retry): the one mechanism that reloads the shop profile AND the fabric catalogue,
// reopening the database first when startup could not open it. The real shopProfile.js and
// fabricCache.js run against a mocked db.js; the profile migration is a spy (its own tests
// cover it - here only WHEN it runs matters).

const h = vi.hoisted(() => ({
  open: true,
  initOpens: true,
  initCalls: 0,
  migrations: 0,
  profileRow: { printers: [{ code: "DGEN" }] },
  profileThrows: false,
  fabrics: [{ name: "Cotton A" }],
  initGate: null,
}));

vi.mock("./db.js", () => ({
  isDbOpen: () => h.open,
  initDb: () => {
    h.initCalls += 1;
    h.open = h.initOpens;
  },
  getShopProfile: () => {
    if (!h.open || h.profileThrows) throw new Error("no database");
    return h.profileRow;
  },
  getAllFabrics: () => (h.open ? h.fabrics : null),
}));
vi.mock("./runShopProfileMigration.js", () => ({
  runShopProfileMigration: async () => {
    if (h.initGate) await h.initGate;
    h.migrations += 1;
  },
}));

import { loadShopData, reloadShopData } from "./reloadShopData.js";
import { getProfile, invalidateShopProfile } from "./shopProfile.js";
import { getCachedFabrics, isFabricCacheLoaded, invalidateFabricCache } from "./fabricCache.js";

beforeEach(() => {
  Object.assign(h, {
    open: true,
    initOpens: true,
    initCalls: 0,
    migrations: 0,
    profileRow: { printers: [{ code: "DGEN" }] },
    profileThrows: false,
    fabrics: [{ name: "Cotton A" }],
    initGate: null,
  });
  invalidateShopProfile();
  invalidateFabricCache();
});

describe("reloadShopData", () => {
  it("a live database is not reopened: both caches re-read, no initDb, no migration", async () => {
    const res = await reloadShopData();
    expect(res).toEqual({ success: true, dbOpen: true, reopened: false, profile: "reloaded", fabrics: "reloaded" });
    expect([h.initCalls, h.migrations]).toEqual([0, 0]);
    expect(getProfile()).toEqual(h.profileRow);
    expect(getCachedFabrics()).toEqual(h.fabrics);
  });

  it("the station that started with the NAS down: the database is reopened, migrated, then both caches load", async () => {
    h.open = false;
    loadShopData(); // startup with no handle: both sentinels null
    expect([getProfile(), isFabricCacheLoaded()]).toEqual([null, false]);
    const res = await reloadShopData();
    expect(res).toEqual({ success: true, dbOpen: true, reopened: true, profile: "reloaded", fabrics: "reloaded" });
    expect([h.initCalls, h.migrations]).toEqual([1, 1]);
    expect(getProfile()).toEqual(h.profileRow);
    expect(isFabricCacheLoaded()).toBe(true);
  });

  it("the share is still gone: no migration, and both caches say missing", async () => {
    h.open = false;
    h.initOpens = false;
    const res = await reloadShopData();
    expect(res).toEqual({ success: true, dbOpen: false, reopened: false, profile: "missing", fabrics: "missing" });
    expect([h.initCalls, h.migrations]).toEqual([1, 0]);
  });

  it("a read failing during a reload drops what was loaded and says so (the rule of shop-profile.md)", async () => {
    loadShopData();
    expect(getProfile()).not.toBeNull();
    h.profileThrows = true;
    h.fabrics = null; // getAllFabrics answers null on a failed read
    const res = await reloadShopData();
    expect(res).toEqual({ success: true, dbOpen: true, reopened: false, profile: "missing", fabrics: "missing" });
    expect(getProfile()).toBeNull();
    expect(isFabricCacheLoaded()).toBe(false);
  });

  it("a throw inside the reload is an answer, not a rejected promise", async () => {
    h.open = false;
    h.initGate = Promise.reject(new Error("migration blew up"));
    h.initGate.catch(() => {});
    const res = await reloadShopData();
    expect(res).toEqual({ success: false, error: "migration blew up" });
  });

  it("one reload at a time: a second click while the first runs gets the same answer, initDb runs once", async () => {
    h.open = false;
    let release;
    h.initGate = new Promise((r) => (release = r));
    const first = reloadShopData();
    const second = reloadShopData();
    expect(second).toBe(first);
    release();
    await first;
    expect([h.initCalls, h.migrations]).toEqual([1, 1]);
  });
});
