import {
  getShopProfileRaw,
  migrateShopProfileRow,
  dumpShopProfileBlob,
  signalStartupProblem,
  backupDb,
} from "./db.js";
import { migrateShopProfile, PROFILE_SCHEMA_VERSION } from "./migrateShopProfile.js";

// Orchestrates the one-time shop_profile upgrade: read the raw row, ask the pure function
// what to do, and - only when there is something to do - dump, back up and write.
//
// It lives in its own module rather than inside registerIpcHandlers for a reason that is
// about proof, not tidiness: ipc/index.js pulls in electron, electron-store and the file
// watcher, so nothing in it can be reached from a test. Here, db.js is the single edge,
// and vi.mock("./db.js") is already the convention the rest of the profile suite uses.
// Without that, the branch that ABORTS on a failed dump would have no way to be shown to
// matter, and an untested guard on a shared production database is not a guard.
//
// CALL SITE: registerIpcHandlers, after initDb and BEFORE loadShopProfile. Four reasons,
// each a property of the startup order that already exists:
//   1. loadShopProfile CACHES the row and only rebuilds on profile:set, so migrating
//      after it would leave a stale profile in memory for the whole session.
//   2. loadShopProfile runs before loadFabricCache because the profile carries what the
//      fabric layer will read - so this has to precede both.
//   3. NOT inside loadShopProfile: that is a reader, and it is also the reload path
//      profile:set calls. A backup and a write in there would fire on every profile save.
//   4. The one-time reasonDefinitions migration already occupies exactly this slot.
//
// Never throws. A failure here degrades; it must not stop the app from opening.
export const runShopProfileMigration = async () => {
  let rawBefore = null;
  try {
    rawBefore = getShopProfileRaw();
  } catch (err) {
    console.error("[profile-migration] could not read the profile row:", err);
    return;
  }
  // No row at all belongs to initDb, which seeds DEFAULT_PROFILE at the current version.
  // A migration must never CREATE a profile - that is how one shop ends up with another
  // shop's configuration as its own durable row.
  if (rawBefore === null) return;

  let parsed = null;
  try {
    parsed = JSON.parse(rawBefore);
  } catch (err) {
    console.error("[profile-migration] profile row is not valid JSON, leaving it alone:", err);
    return;
  }

  const { profile, changed, applied, skipped } = migrateShopProfile(parsed);
  for (const note of skipped) console.warn("[profile-migration] skipped:", note);
  // The steady state from the second run onwards: nothing written, nothing dumped, and
  // the asynchronous path below is never entered.
  if (!changed) return;

  // HARD precondition. The rollback artifact for this change is the old blob, and a local
  // synchronous write is the one step here that cannot fail on the network. If it fails we
  // would be changing shared configuration with no way back - so we do not change it.
  const dump = dumpShopProfileBlob(rawBefore, PROFILE_SCHEMA_VERSION);
  if (!dump.success) {
    console.error(
      "[profile-migration] ABORTED: could not write the pre-migration profile dump:",
      dump.error,
    );
    signalStartupProblem("shopProfileMigrationDump");
    return;
  }
  // The path goes to the log on purpose: an artifact nobody can find is not a rollback.
  console.log("[profile-migration] pre-migration profile saved to", dump.path);

  // BEST EFFORT, deliberately not a precondition. A whole-database backup crosses SMB, and
  // making a network round trip the gate would turn a network hiccup into a dead scanner -
  // trading the failure we are fixing for a worse one. The blob above is the artifact that
  // matters; this is defence in depth.
  try {
    const backup = await backupDb(true);
    if (backup?.success) console.log("[profile-migration] database backup:", backup.path);
    else console.warn("[profile-migration] database backup failed, continuing:", backup?.error);
  } catch (err) {
    console.warn("[profile-migration] database backup threw, continuing:", err);
  }

  // rawBefore, never JSON.stringify(parsed): the compare-and-swap matches on the column's
  // exact text, and a re-serialisation can differ in key order or whitespace. That would
  // match zero rows on every run and look identical to "already migrated".
  const { updated } = migrateShopProfileRow(
    rawBefore,
    JSON.stringify(profile),
    `migration:v${PROFILE_SCHEMA_VERSION}`,
  );
  if (updated) console.log("[profile-migration] applied:", applied.join("; "));
  else
    console.warn(
      "[profile-migration] the row changed while we were working - another station migrated it, or someone saved a profile. Nothing written.",
    );
};
