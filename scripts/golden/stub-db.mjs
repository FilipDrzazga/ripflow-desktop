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
