import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// ETAP 4 (4-golden-e, S2's condition for closing golden hole (e) with a note): the golden net
// renders buildPFJobXML and never routes a job to a hotfolder, and hotfolderRouting.test.js
// routes through its OWN copy of the lookup. What neither sees is the one line that connects the
// two in production - ipc/index.js handing getPrinterByCode (shopProfile.js) to createXML.js.
// Without it every job is refused (ERR_INVALID_PRINTER); with a different function it could be
// routed by something other than the shop profile. This reads the source and pins the wiring.

const src = readFileSync(fileURLToPath(new URL("./index.js", import.meta.url)), "utf8");
const code = src
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("ipc/index.js wires hotfolder routing to the shop profile", () => {
  it("calls setPrinterResolver(getPrinterByCode) exactly once", () => {
    expect(code.match(/\bsetPrinterResolver\(\s*getPrinterByCode\s*\)/g) ?? []).toHaveLength(1);
  });

  it("never wires anything else", () => {
    expect(code.match(/\bsetPrinterResolver\(/g) ?? []).toHaveLength(1);
  });

  it("getPrinterByCode comes from the shop profile helper", () => {
    expect(code).toMatch(/import \{[^}]*\bgetPrinterByCode\b[^}]*\} from "\.\.\/helpers\/shopProfile\.js";/);
  });
});
