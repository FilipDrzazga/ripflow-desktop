import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { canRollbackRows } from "./productionRollback";
import { PRODUCTION_STAGE } from "../../shared/constants";

const row = (stage, batch_path = "\\\\srv\\PRINTED\\14-10-2026\\PRINTED_101500-A-DGEN") => ({ file_id: "f", stage, batch_path });

describe("canRollbackRows", () => {
  it("is offered on every stage, shipped included", () => {
    for (const stage of Object.values(PRODUCTION_STAGE)) {
      expect(canRollbackRows([row(stage)]), stage).toBe(true);
    }
  });

  it("is offered for a mixed selection that holds a shipped file", () => {
    expect(canRollbackRows([row(PRODUCTION_STAGE.QC), row(PRODUCTION_STAGE.SHIPPED)])).toBe(true);
  });

  it("is hidden when any row has no batch folder - there is no PDF to move back", () => {
    expect(canRollbackRows([row(PRODUCTION_STAGE.QC), row(PRODUCTION_STAGE.QC, null)])).toBe(false);
    expect(canRollbackRows([undefined])).toBe(false);
  });

  it("is hidden for an empty target list", () => {
    expect(canRollbackRows([])).toBe(false);
  });
});

// Production.jsx has no UI harness: pin that both lenses ask this one function and that no
// shipped exclusion crept back next to it.
describe("Production.jsx rollback wiring", () => {
  const src = readFileSync(new URL("../components/Production/Production.jsx", import.meta.url), "utf8");

  it("both menu branches use canRollbackRows", () => {
    expect(src).toContain("const canRollbackReceive = canRollbackRows(receiveTargets);");
    expect(src).toContain("const canRollback = canRollbackRows(targetRows);");
  });

  it("no rollback condition excludes shipped", () => {
    expect(src).not.toMatch(/canRollback\w*\s*=[^;]*SHIPPED/);
  });
});
