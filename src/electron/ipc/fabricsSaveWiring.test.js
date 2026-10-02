import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// dlug-2 (D7, D9): ipc/index.js cannot be imported from a test, and the two rules live in
// helpers/fabricInput.js. What no unit test sees is the lines that connect them to the handlers:
// fabrics:save must refuse an ADD of an existing name and store the printer code the way the
// profile spells it, and fabrics:setAll must store the profile's spelling too. This reads the
// source and pins those lines (the same cut as printerResolverWiring.test.js).

const src = readFileSync(fileURLToPath(new URL("./index.js", import.meta.url)), "utf8");
const code = src
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

// the body of one ipcMain.handle("<channel>", ...) up to the next handler
const handler = (channel) => {
  const start = code.indexOf(`ipcMain.handle("${channel}"`);
  expect(start, `handler ${channel} exists`).toBeGreaterThan(-1);
  const next = code.indexOf("ipcMain.handle(", start + 1);
  return code.slice(start, next === -1 ? undefined : next);
};

describe("fabrics:save", () => {
  const body = handler("fabrics:save");

  it("refuses an add of an existing name BEFORE writing", () => {
    expect(body).toMatch(/fabricAddError\(\s*oldName,\s*fabric,\s*getAllFabrics\(\)\s*\)/);
    expect(body.indexOf("fabricAddError(")).toBeLessThan(body.indexOf("saveFabric("));
    expect(body).toMatch(/if \(addError\) return \{ success: false, error: addError \}/);
  });

  it("writes the fabric with the profile's spelling of the printer code", () => {
    expect(body).toMatch(/saveFabric\([^;]*withProfilePrinterCode\(\s*fabric,\s*getPrinters\(\)\s*\)\)/);
  });
});

describe("fabrics:setAll", () => {
  it("writes every row with the profile's spelling of the printer code", () => {
    expect(handler("fabrics:setAll")).toMatch(/setAllFabrics\(\s*fabrics\.map\(\(f\) => withProfilePrinterCode\(f,\s*getPrinters\(\)\)\)\s*\)/);
  });
});

describe("the imports", () => {
  it("both helpers come from fabricInput.js", () => {
    expect(code).toMatch(/import \{[^}]*\bfabricAddError\b[^}]*\bwithProfilePrinterCode\b[^}]*\} from "\.\.\/helpers\/fabricInput\.js";/);
  });
});
