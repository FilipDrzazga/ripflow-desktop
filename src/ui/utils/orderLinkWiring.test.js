import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness in the repo (see Production/rangeSelectWiring.test.js), so the Etsy wiring in
// the .jsx files is pinned by reading the sources. orderLink.js is tested on its own; only these
// lines connect it to the four context menus and to the inbox icon.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const MENUS = {
  DataList: read("../components/DataList/DataList.jsx"),
  BatchHistory: read("../components/BatchHistory/BatchHistory.jsx"),
  Production: read("../components/Production/Production.jsx"),
};

describe("every Open in ... entry asks orderLinkFor", () => {
  it.each(Object.keys(MENUS))("%s offers Open in Etsy for an Etsy order and keeps Open in Shopify", (name) => {
    const src = MENUS[name];
    expect(src).toContain('label: "Open in Etsy"');
    expect(src).toContain('label: "Open in Shopify"');
    expect(src).toMatch(/=== ORDER_LINK\.ETSY/);
    expect(src).toMatch(/=== ORDER_LINK\.SHOPIFY/);
    expect(src).toContain("openEtsyOrder(");
  });

  it("no menu gates Shopify on the bare flag any more (an Etsy order would get the Shopify search)", () => {
    for (const src of Object.values(MENUS)) {
      expect(src).not.toContain('isFeatureEnabled("shopify"');
    }
  });

  it("each menu decides once per entry: two in Production (Receive lens + Batches), one elsewhere", () => {
    expect(MENUS.Production.match(/orderLinkFor\(row\.order_id, shopProfile\)/g)).toHaveLength(2);
    expect(MENUS.DataList.match(/orderLinkFor\(orderId, shopProfile\)/g)).toHaveLength(1);
    expect(MENUS.BatchHistory.match(/orderLinkFor\(orderId, shopProfile\)/g)).toHaveLength(1);
  });
});

describe("the inbox row shows the Etsy mark for an Etsy file", () => {
  it("the icon is chosen by the parsed source, through the shared constant", () => {
    expect(MENUS.DataList).toContain("item.source === ORDER_SOURCE.ETSY ? (");
    expect(MENUS.DataList).toContain("<SiEtsy className={`${style.file_icon} ${style.etsy_icon}`}");
  });

  it("the Etsy icon class exists in the stylesheet", () => {
    expect(read("../components/DataList/DataList.module.css")).toMatch(/\.file_icon\.etsy_icon\s*\{/);
  });
});
