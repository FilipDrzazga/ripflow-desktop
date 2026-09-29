import { describe, it, expect } from "vitest";
import { isToastHiddenByWizard } from "./setupWizard.js";

// ETAP 4 (4-wizard-c): the startup scan's "Paths not set" toast is dropped while the wizard is open.

describe("isToastHiddenByWizard", () => {
  it("drops the paths-not-set toast while the wizard is open", () => {
    expect(isToastHiddenByWizard({ code: "ERR_PATHS_NOT_SET" }, true)).toBe(true);
  });

  it("shows it when the wizard is closed", () => {
    expect(isToastHiddenByWizard({ code: "ERR_PATHS_NOT_SET" }, false)).toBe(false);
    expect(isToastHiddenByWizard({ code: "ERR_PATHS_NOT_SET" }, undefined)).toBe(false);
  });

  it("every other scan error still shows, wizard or not", () => {
    expect(isToastHiddenByWizard({ code: "EACCES" }, true)).toBe(false);
    expect(isToastHiddenByWizard({ title: "Paths not set" }, true)).toBe(false);
    expect(isToastHiddenByWizard(undefined, true)).toBe(false);
  });
});
