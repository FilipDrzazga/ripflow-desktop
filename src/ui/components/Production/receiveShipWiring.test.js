import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for the Production components (see rangeSelectWiring.test.js): the ship-from-Receive
// wiring is pinned by reading the sources. Each pin names the defect it stops.

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const production = read("Production.jsx");
const receive = read("SewingReceive.jsx");

describe("ship from the Receive lens", () => {
  it("ships through the one handleMarkShipped, and hands the applied ids back for the ledger", () => {
    expect(production).toContain("appliedIds = await handleMarkShipped(ids);");
    expect(production).toContain("    return appliedIds;\n  };");
  });

  it("shipped items enter the session ledger (without it the order vanishes from the list when shipped)", () => {
    const body = production.slice(production.indexOf("const shipFiles = async"));
    expect(body.slice(0, 900)).toContain("receivedInSession: new Set([...s.receivedInSession, ...appliedIds])");
  });

  it("ship shares the receive / undo guard (all three mutate the same rows)", () => {
    const body = production.slice(production.indexOf("const shipFiles = async"));
    expect(body.slice(0, 300)).toContain("if (isReceivingRef.current || ids.length === 0) return;");
  });

  it("the lens button and the context menu both call shipFiles", () => {
    expect(production).toContain("onShip={shipFiles}");
    expect(production).toContain("shipFiles(receiveIds);");
    expect(receive).toContain("onClick={() => onShip(shipTarget.ids)}");
  });

  it("the Receive menu offers it only when every target can jump to shipped", () => {
    expect(production).toContain("const canShipReceive = receiveCount > 0 && receiveTargets.every(isShippableRow);");
  });
});
