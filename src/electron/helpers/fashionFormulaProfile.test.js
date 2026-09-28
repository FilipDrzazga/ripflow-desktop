import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateShopProfile } from "./validateShopProfile.js";
import { PROFILE_SCHEMA_VERSION } from "./migrateShopProfile.js";

// ETAP 3-5: profiles/fashion-formula-profile.json is Alex's live shop profile (exported from a copy
// of his database) - the profile the golden net renders against, and the file that brings his
// setup back through Settings -> Shop Profile -> Import. It has to stay importable: current
// schema, zero validator errors. If a profile field or rule changes, this file changes with it.

const FIXTURE = path.resolve(__dirname, "../../../profiles/fashion-formula-profile.json");
const profile = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

describe("profiles/fashion-formula-profile.json", () => {
  it("carries the schema version this build writes", () => {
    expect(profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
  });

  it("imports cleanly: zero validator errors", () => {
    expect(validateShopProfile(profile, { schemaVersion: PROFILE_SCHEMA_VERSION })).toEqual({ ok: true, errors: [] });
  });
});
