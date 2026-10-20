import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// ipc/index.js cannot be imported from a test; this pins the lines that connect the length allowance
// (db.js fabric_length_extra) to the fabrics handlers (the same cut as fabricsSaveWiring.test.js).

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

describe("the length allowance in the fabrics handlers", () => {
  it("fabrics:save writes it after the fabric, under the old name, and reports a failed write", () => {
    const body = handler("fabrics:save");
    expect(body).toMatch(/setFabricLengthExtra\(\s*oldName,\s*fabric\.name,\s*fabric\.lengthExtraPercent\s*\)/);
    expect(body.indexOf("saveFabric(")).toBeLessThan(body.indexOf("setFabricLengthExtra("));
    expect(body).toMatch(/if \(ok && !extraOk\) \{\s*return \{ success: false, error:/);
  });

  it("fabrics:delete drops it with the fabric", () => {
    expect(handler("fabrics:delete")).toMatch(/if \(ok\) deleteFabricLengthExtra\(name\)/);
  });

  it("fabrics:setAll replaces them with the catalogue and reports a failed write", () => {
    const body = handler("fabrics:setAll");
    expect(body).toMatch(/setAllFabricLengthExtras\(fabrics\)/);
    expect(body).toMatch(/if \(ok && !extrasOk\) \{\s*return \{ success: false, error:/);
  });

  it("the three db functions are imported", () => {
    expect(code).toMatch(/import \{[^}]*\bsetFabricLengthExtra\b[^}]*\bdeleteFabricLengthExtra\b[^}]*\bsetAllFabricLengthExtras\b[^}]*\} from "\.\.\/helpers\/db\.js";/);
  });
});
