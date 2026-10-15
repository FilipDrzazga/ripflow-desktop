import { describe, it, expect } from "vitest";
import fs from "fs";

// "Is this inbox PDF finished" has ONE implementation, pdfReadiness.js; the scan and createBatch
// both call it. The wiring lives in files with no harness, so it is pinned by reading the sources
// (the same device as rangeSelectWiring.test.js).
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");

describe("one readiness check for the scan and for createBatch", () => {
  const scan = read("../ipc/readFolders.js");
  const batch = read("../ipc/createBatch.js");

  it("both import checkPdf from the same module", () => {
    expect(scan).toContain('import { checkPdf, stabilityTracker } from "../helpers/pdfReadiness.js";');
    expect(batch).toContain('import { checkPdf } from "../helpers/pdfReadiness.js";');
  });

  it("neither re-implements the condition (no end marker, no tail window in either)", () => {
    for (const src of [scan, batch]) {
      expect(src).not.toMatch(/%%EOF"/);
      expect(src).not.toMatch(/%PDF-/);
      expect(src).not.toMatch(/\b1024\b/);
    }
  });

  it("createBatch asks BEFORE the lock stage starts", () => {
    const gate = batch.indexOf("await checkPdf(entry.sourcePath)");
    const lock = batch.indexOf("stage = STAGES.LOCK;");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(lock);
  });

  it("the store blocks a copying row in printSelectBlock only - the group checkbox goes through it", () => {
    const store = read("../../ui/store/useStore.jsx");
    expect(store).toContain("!printSelectBlock(item, { heldIds: state.heldIds, lockMaterial: null })");
    expect(store).not.toMatch(/FILE_STATUS\.COPYING/); // the store never re-states the condition
  });

  it("the inbox tick re-asks on the same timer and under the same pause", () => {
    const app = read("../../ui/App.jsx");
    expect(app).toMatch(
      /if \(pollingPaused\) return; \/\/ ETAP 4 \(4-power\)\n\s+const id = setInterval\(\(\) => \{\n\s+checkInbox\(\);\n\s+recheckCopying\(\);\n\s+\}, INBOX_WATCH_INTERVAL\);/,
    );
  });
});
