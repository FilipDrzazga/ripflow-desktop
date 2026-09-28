import { describe, it, expect } from "vitest";
import { staleImportNotice } from "./shopProfileView.js";

// ETAP 4 (4-stale): a valid preview on a stale station ends in this notice instead of the
// confirm. A Warning (nothing failed), and it tells the operator what to do next.

describe("staleImportNotice", () => {
  it("is a Warning that names the file and says to restart", () => {
    const n = staleImportNotice({ fileName: "client-two.json", stationStale: true });
    expect(n.type).toBe("Warning");
    expect(n.message).toContain('"client-two.json"');
    expect(n.message).toMatch(/Restart this station/);
    expect(n.message).toMatch(/Nothing was changed/);
  });

  it("without a file name it still reads", () => {
    expect(staleImportNotice(undefined).message).toContain('"the file"');
  });
});
