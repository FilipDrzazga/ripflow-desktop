// Stub for src/electron/helpers/db.js, injected by loader.mjs into fabricCache.js.
// The harness must never open the live ripflow.db: initDb() WRITES (CREATE TABLE /
// ALTER TABLE / seed), and the baseline has to be reproducible on any machine, offline.
// The catalog comes from the profile file captured in ETAP 0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const profile = path.join(here, "..", "..", "profiles", "fashion-formula-fabrics.json");
const fabrics = JSON.parse(fs.readFileSync(profile, "utf8"));
const shopProfilePath = path.join(here, "..", "..", "profiles", "fashion-formula-profile.json");
const shopProfile = JSON.parse(fs.readFileSync(shopProfilePath, "utf8"));

// No fabric_globals here: db.getFabricGlobals is gone (1.0.26) and the class numbers come from
// the shop profile below (materialClasses), exactly as on a station.
export const getAllFabrics = () => fabrics.map((f) => ({ ...f }));

// The shop profile, so loadShopProfile() gets a row instead of throwing. Without this
// the harness runs with cachedProfile === null, and the moment any module on the XML
// path reads the profile it takes its fail-closed branch and every batch diffs — a
// failure of the harness, not of the code under test.
//
// Source is profiles/fashion-formula-profile.json (ETAP 3-5): Alex's LIVE shop_profile row,
// exported from a copy of his database (2026-09-28) in the format profile:export writes. Until
// 3-5 it was DEFAULT_PROFILE, which ETAP 3-6 empties into a skeleton - the net must keep
// rendering Alex's batches against Alex's profile, not against the seed of a fresh install.
// Like the fabric catalogue above, the baseline never reads the live database.
//
// Returns a deep copy. The real getShopProfile JSON.parses a column on every call, so
// each caller owns its object; handing out the module-level constant would let one
// consumer mutate the "database" for the next.
export const getShopProfile = () => structuredClone(shopProfile);
