// Brings an EXISTING shop_profile row up to the schema this build expects.
//
// Why this exists at all: 2eeaa26 changed the SHAPE of the profile - it dropped
// workstationRoles and added scanRules - and did not touch schemaVersion. initDb seeds
// only when the table is empty, so a row written before that commit stays exactly as it
// was, forever, and nothing in the system signals that it is behind. Measured on the live
// database on 2026-09-10: the row seeded 2026-08-27 still carries workstationRoles and no
// scanRules, which makes getScanRule answer null at every station and a barcode scan move
// nothing.
//
// Zero imports, on purpose. Same shape as dayKey.js and shopProfileData.js: a pure
// function is the only thing here that can carry a test without mocking db.js, and db.js
// is the edge the profile tests already replace wholesale.
//
// It deliberately does NOT read DEFAULT_PROFILE. See SCAN_RULES_2F below.

export const PROFILE_SCHEMA_VERSION = 2;

// FROZEN COPY of the four scan rules as DEFAULT_PROFILE carried them at 2f. Do NOT
// re-point this at DEFAULT_PROFILE, however tempting the duplication looks:
//
//  - ETAP 3 plans to empty DEFAULT_PROFILE in favour of an imported profile. A migration
//    reading it at call time would then write scanRules: [] into a v1 row and kill the
//    scanner silently - the migration would look like it ran and would have done nothing.
//  - A migration is a HISTORICAL artifact. It describes what the shape looked like when
//    the step was written, not what the current default happens to be. Freezing its data
//    is what makes replaying it years later mean anything.
const SCAN_RULES_2F = [
  { role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true },
  { role: "polyester", from: "printed", to: "heatpress", notifyWhenEmpty: true },
  { role: "rollpress", from: "heatpress", to: "qc", notifyWhenEmpty: true },
  { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
];

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// v1 -> v2. Each operation is NAMED and carries its own condition. There is deliberately
// no bulk spread of a default over the row: that is the read-time merge we rejected
// ({ ...DEFAULT_PROFILE, ...row }) moved to write time, and it has the same defect -
// a client with a partial row would quietly receive another shop's configuration.
const stepToV2 = (profile) => {
  const out = { ...profile };
  const applied = [];
  const skipped = [];

  // The discriminator for "this row came from the pre-2f seed". workstationRoles existed
  // ONLY there, so its presence is proof, not a guess.
  const cameFromPreScanRulesSeed = has(out, "workstationRoles");

  // op A - drop a key the current shape does not have. 2f deleted it because a list of
  // legal role names is neither a shop-wide rule nor a machine's identity.
  if (cameFromPreScanRulesSeed) {
    delete out.workstationRoles;
    applied.push("drop workstationRoles");
  }

  // op B - add the key the current shape needs, but ONLY where we can prove which rules
  // belong. A row that never carried workstationRoles is not Alex's pre-2f row, and
  // handing it his four rules is exactly the substitution bc68fbe removed for the Shopify
  // handle: another shop's data instead of admitting we do not know.
  if (!Array.isArray(out.scanRules)) {
    if (cameFromPreScanRulesSeed) {
      out.scanRules = SCAN_RULES_2F.map((rule) => ({ ...rule }));
      applied.push(`add scanRules (${SCAN_RULES_2F.length} frozen 2f rules)`);
    } else {
      skipped.push(
        "scanRules missing, but this row never carried workstationRoles - not inventing another shop's rules",
      );
    }
  }

  return { profile: out, applied, skipped };
};

// Ordered by the version each step takes the row TO.
const STEPS = [{ to: 2, apply: stepToV2 }];

// row -> { profile, changed, applied, skipped }
//
// changed === false means "write nothing at all": no dump, no backup, no UPDATE. That is
// the steady state from the second run onwards, and it is what keeps this idempotent
// without a separate "already done" marker - schemaVersion IS the marker.
export const migrateShopProfile = (row) => {
  if (!isPlainObject(row)) {
    return {
      profile: null,
      changed: false,
      applied: [],
      skipped: ["no readable profile object - nothing to migrate"],
    };
  }

  // A row with no schemaVersion predates the field, so it is the oldest shape we know.
  const from = Number.isInteger(row.schemaVersion) ? row.schemaVersion : 1;

  // The first half of the ETAP 3 import rule, placed where it is actually needed: a row
  // written by a NEWER build can carry keys this one would drop on a round trip.
  if (from > PROFILE_SCHEMA_VERSION) {
    return {
      profile: row,
      changed: false,
      applied: [],
      skipped: [
        `profile schemaVersion ${from} is newer than this build (${PROFILE_SCHEMA_VERSION}) - refusing to migrate`,
      ],
    };
  }

  if (from === PROFILE_SCHEMA_VERSION) {
    return { profile: row, changed: false, applied: [], skipped: [] };
  }

  let current = row;
  let version = from;
  const applied = [];
  const skipped = [];

  for (const step of STEPS) {
    if (step.to <= version) continue;
    const result = step.apply(current);
    current = result.profile;
    applied.push(...result.applied);
    skipped.push(...result.skipped);
    // The bump belongs to the step, not to the caller: raising it without running the
    // operations would mark the row done while leaving it in the old shape.
    current.schemaVersion = step.to;
    applied.push(`set schemaVersion ${version} -> ${step.to}`);
    version = step.to;
  }

  return { profile: current, changed: applied.length > 0, applied, skipped };
};
