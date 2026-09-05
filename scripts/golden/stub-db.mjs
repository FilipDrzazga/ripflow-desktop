// Stub for src/electron/helpers/db.js, injected by loader.mjs into fabricCache.js.
// The harness must never open the live ripflow.db: initDb() WRITES (CREATE TABLE /
// ALTER TABLE / seed), and the baseline has to be reproducible on any machine, offline.
// The catalog comes from the profile file captured in ETAP 0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PROFILE } from "../../src/electron/helpers/defaultProfile.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const profile = path.join(here, "..", "..", "profiles", "fashion-formula-fabrics.json");
const fabrics = JSON.parse(fs.readFileSync(profile, "utf8"));

// Alex's fabric_globals, read once from his DB and confirmed equal to
// DEFAULT_FABRIC_GLOBALS. Spelled out here so the harness needs no database at all.
const globals = {
  marginCotton: 10,
  marginPoly: 5,
  defaultXmlWidthCotton: 1420,
  defaultXmlWidthPoly: 1420,
  defaultRollWidthCotton: 1420,
  defaultRollWidthPoly: 1550,
};

export const getAllFabrics = () => fabrics.map((f) => ({ ...f }));
export const getFabricGlobals = () => ({ ...globals });

// The shop profile, so loadShopProfile() gets a row instead of throwing. Without this
// the harness runs with cachedProfile === null, and the moment any module on the XML
// path reads the profile it takes its fail-closed branch and every batch diffs — a
// failure of the harness, not of the code under test.
//
// Source is DEFAULT_PROFILE, not a copy: it IS what initDb seeds into a fresh
// shop_profile row, so the harness sees exactly what Alex's station sees. Importing it
// is safe from here — defaultProfile.js has zero imports of its own, so it pulls in
// neither electron nor better-sqlite3, and loader.mjs only intercepts db.js and
// getSettings.js, so this specifier passes through untouched.
//
// Returns a deep copy. The real getShopProfile JSON.parses a column on every call, so
// each caller owns its object; handing out the module-level constant would let one
// consumer mutate the "database" for the next.
export const getShopProfile = () => structuredClone(DEFAULT_PROFILE);
