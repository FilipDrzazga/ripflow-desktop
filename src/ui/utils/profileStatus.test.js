import { describe, it, expect } from "vitest";
import { resolveProfileResult, PROFILE_STATUS } from "./profileStatus";

const PROFILE = { schemaVersion: 1, features: { customOrders: true } };

describe("resolveProfileResult — loaded", () => {
  it("returns the profile when success is true and data is a real profile", () => {
    expect(resolveProfileResult({ success: true, data: PROFILE })).toEqual({
      status: PROFILE_STATUS.LOADED,
      profile: PROFILE,
    });
  });

  it("passes the profile object through by reference, not a copy", () => {
    const res = resolveProfileResult({ success: true, data: PROFILE });
    expect(res.profile).toBe(PROFILE);
  });

  it("accepts a profile with one key — shape validation is not this function's job", () => {
    expect(resolveProfileResult({ success: true, data: { schemaVersion: 1 } }).status).toBe(
      PROFILE_STATUS.LOADED,
    );
  });
});

describe("resolveProfileResult — failed", () => {
  // After 2c-null-a, main answers null ONLY when it could not read the database: the
  // !db guard throws, and a genuinely absent row still yields DEFAULT_PROFILE.
  it("treats success with data null as a failure, not a fresh install", () => {
    expect(resolveProfileResult({ success: true, data: null })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });

  it("treats success with data undefined as a failure", () => {
    expect(resolveProfileResult({ success: true, data: undefined })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });

  it("treats success with no data field at all as a failure", () => {
    expect(resolveProfileResult({ success: true })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });

  // An empty object carries no configuration. Calling it loaded would hide the gated
  // tabs (isViewEnabled fail-closes without a features block) AND suppress the banner
  // that explains why — fewer tabs, no reason given.
  it("treats an empty object as a failure, not a loaded profile with no fields", () => {
    expect(resolveProfileResult({ success: true, data: {} })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });

  it("rejects non-plain-object payloads (array, string, number)", () => {
    expect(resolveProfileResult({ success: true, data: [] }).status).toBe(PROFILE_STATUS.FAILED);
    expect(resolveProfileResult({ success: true, data: [1, 2] }).status).toBe(PROFILE_STATUS.FAILED);
    expect(resolveProfileResult({ success: true, data: "abc" }).status).toBe(PROFILE_STATUS.FAILED);
    expect(resolveProfileResult({ success: true, data: 7 }).status).toBe(PROFILE_STATUS.FAILED);
  });

  it("fails when success is false, whatever data carries", () => {
    expect(resolveProfileResult({ success: false })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
    expect(resolveProfileResult({ success: false, data: PROFILE })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });

  // Strict === true, like getFeature: a truthy success is not a success.
  it("fails on a truthy-but-not-boolean success", () => {
    expect(resolveProfileResult({ success: 1, data: PROFILE }).status).toBe(PROFILE_STATUS.FAILED);
    expect(resolveProfileResult({ success: "true", data: PROFILE }).status).toBe(
      PROFILE_STATUS.FAILED,
    );
  });

  it("fails on a result with no success field", () => {
    expect(resolveProfileResult({ data: PROFILE })).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });

  it("fails on null and undefined results", () => {
    expect(resolveProfileResult(null)).toEqual({ status: PROFILE_STATUS.FAILED, profile: null });
    expect(resolveProfileResult(undefined)).toEqual({
      status: PROFILE_STATUS.FAILED,
      profile: null,
    });
  });
});

describe("PROFILE_STATUS", () => {
  it("carries exactly the three states the store can be in", () => {
    expect(PROFILE_STATUS).toEqual({ LOADING: "loading", LOADED: "loaded", FAILED: "failed" });
  });
});
