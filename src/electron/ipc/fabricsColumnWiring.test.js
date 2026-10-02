import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// dlug-5 (D8): ipc/index.js cannot be imported from a test. The rule (fabricInput.js
// preferredPrinterColumnError) and the DB check (db.js ensureFabricPreferredPrinter) have tests of
// their own; this pins the lines that connect them to fabrics:save and fabrics:setAll - refuse
// BEFORE the write, with the reason (the same cut as fabricsSaveWiring.test.js).

const src = readFileSync(fileURLToPath(new URL("./index.js", import.meta.url)), "utf8");
const code = src
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const handler = (channel) => {
  const start = code.indexOf(`ipcMain.handle("${channel}"`);
  expect(start, `handler ${channel} exists`).toBeGreaterThan(-1);
  const next = code.indexOf("ipcMain.handle(", start + 1);
  return code.slice(start, next === -1 ? undefined : next);
};

describe.each([
  ["fabrics:save", /preferredPrinterColumnError\(\s*\[fabric\],\s*ensureFabricPreferredPrinter\s*\)/, "saveFabric("],
  ["fabrics:setAll", /preferredPrinterColumnError\(\s*fabrics,\s*ensureFabricPreferredPrinter\s*\)/, "setAllFabrics("],
])("%s", (channel, call, write) => {
  const body = handler(channel);

  it("refuses a preference the DB cannot hold, with the reason, BEFORE writing", () => {
    expect(body).toMatch(call);
    expect(body).toMatch(/if \(columnError\) return \{ success: false, error: columnError \}/);
    expect(body.indexOf("preferredPrinterColumnError(")).toBeLessThan(body.indexOf(write));
  });
});

describe("the imports", () => {
  it("the rule from fabricInput.js, the check from db.js", () => {
    expect(code).toMatch(/import \{[^}]*\bpreferredPrinterColumnError\b[^}]*\} from "\.\.\/helpers\/fabricInput\.js";/);
    expect(code).toMatch(/import \{[^}]*\bensureFabricPreferredPrinter\b[^}]*\} from "\.\.\/helpers\/db\.js";/);
  });
});
