import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Plan ETA-2: the "Ship by" badge crosses main, the service, a hook and two views, none of which can be rendered
// here, so the chain is pinned by reading the sources (comment lines dropped), like etsyThumbWiring.test.js.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const handlers = read("../../../electron/ipc/etsyImportHandlers.js");
const preload = read("../../../electron/preload.js");
const service = read("../../services/etsyImportService.js");
const hook = read("../../hooks/useEtsyShipDates.js");
const dataList = read("../DataList/DataList.jsx");
const production = read("../Production/Production.jsx");
const card = read("../Production/ProductionCard.jsx");
const receive = read("../Production/SewingReceive.jsx");
const badge = read("./ShipByBadge.jsx");
const css = readFileSync(fileURLToPath(new URL("./ShipByBadge.module.css", import.meta.url)), "utf8");
const globalCss = readFileSync(fileURLToPath(new URL("../../styles/global.css", import.meta.url)), "utf8");

describe("the channel", () => {
  it("has a handler wired to the request module and a preload entry that sends only digits in a list", () => {
    expect(handlers).toContain('ipcMain.handle("etsy-imports:shipDates", (_event, receiptIds) => requests.shipDates(receiptIds));');
    expect(handlers).toContain("shipDates: listEtsyShipDates,");
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:shipDates", receiptIds)');
    expect(preload).toMatch(/receiptIds\.some\(\(id\) => typeof id !== "string" \|\| !\/\^\\d\{1,20\}\$\/\.test\(id\)\)/);
  });

  it("the renderer reaches it only through the service", () => {
    expect(service).toContain("window.api.etsyImports.shipDates(receiptIds)");
    for (const source of [hook, dataList, production, card, badge]) expect(source).not.toContain("window.api");
  });
});

describe("the hook", () => {
  it("is gated by features.etsy and asks only the digits of the Etsy numbers it was given", () => {
    expect(hook).toContain('isFeatureEnabled("etsy", shopProfile)');
    expect(hook).toContain("shipDateReceiptIds(orderIds)");
    expect(hook).toContain('getEtsyShipDates(askedKey.split(","))');
  });

  it("polls only while the polls stand and asks once more when they start again", () => {
    expect(hook).toContain("usePollingPaused()");
    expect(hook).toMatch(/if \(!enabled \|\| pollingPaused \|\| !key\) return undefined;/);
    expect(hook).toContain("useOnPollingResume(");
    expect(hook).toContain("ETSY_SHIP_DATES_POLL_MS");
  });

  it("drops an answer to an older list and answers nothing with the feature off", () => {
    expect(hook).toContain("keyRef.current !== askedKey");
    expect(hook).toContain("return enabled ? dates : NONE;");
  });
});

describe("the two views", () => {
  it("Inbox asks for every Etsy order of the inbox (not the filtered rows) and renders one badge per row", () => {
    expect(dataList).toContain("useEtsyShipDates(etsyOrderIds)");
    expect(dataList).toContain("useStore((state) => state.files)");
    expect(dataList).toContain("shipByOfOrder(etsyShipDates, item.orderId)");
    expect(dataList.match(/<ShipByBadge /g)).toHaveLength(1);
  });

  it("Production asks for the orders that have not shipped and a shipped card gets no date", () => {
    expect(production).toContain("filter((r) => r.stage !== PRODUCTION_STAGE.SHIPPED).map((r) => r.order_id)");
    expect(production).toContain("useEtsyShipDates(unshippedOrderIds)");
    expect(production).toContain("shipBy={row.stage === PRODUCTION_STAGE.SHIPPED ? null : shipByOfOrder(etsyShipDates, row.order_id)}");
  });

  it("the card stays presentational: it takes the seconds as a prop and never asks anything itself", () => {
    expect(card).toContain("shipBy = null");
    expect(card).toContain("<ShipByBadge seconds={shipBy} />");
    expect(card).not.toContain("useEtsyShipDates");
  });

  it("the Receive lens (sewing parcels) shows no badge", () => {
    expect(receive).not.toContain("shipBy");
    expect(receive).not.toContain("ShipByBadge");
  });
});

describe("the look", () => {
  it("renders nothing without a usable date (no empty space) and carries the tone", () => {
    expect(badge).toContain("if (!badge) return null;");
    expect(badge).toContain("styles[badge.tone]");
  });

  it("every tone of the component has its three tokens in global.css, and the CSS uses no colour of its own", () => {
    for (const tone of ["due", "soon", "later"]) {
      for (const part of ["bg", "border", "text"]) {
        expect(globalCss).toMatch(new RegExp(`--ship-${tone}-${part}:`));
        expect(css).toContain(`var(--ship-${tone}-${part})`);
      }
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
