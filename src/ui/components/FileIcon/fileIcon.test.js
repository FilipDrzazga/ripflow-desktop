import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

vi.mock("../../services/fileService", () => ({ openInEtsy: vi.fn() }));
vi.mock("../../utils/notify", () => ({ notify: vi.fn() }));

import { isEtsyOrder } from "../../utils/orderLink.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("isEtsyOrder - the one question the file icon asks", () => {
  it("an Etsy order number wins, whatever the file name", () => {
    expect(isEtsyOrder("ET3456789012", "anything.pdf")).toBe(true);
    expect(isEtsyOrder("ON312819", "ET3456789012_X_ETSY.pdf")).toBe(false);
  });

  it("without an order number it reads the one in the file name (a Production or BatchHistory row)", () => {
    expect(isEtsyOrder(null, "ET3456789012_XWD123456_ETSY.pdf")).toBe(true);
    expect(isEtsyOrder(undefined, "ET3456789012_XWD123456_ETSY")).toBe(true);
    expect(isEtsyOrder(null, "ON312819_cushion_FF.pdf")).toBe(false);
  });

  it("a file with no order number is not an Etsy order", () => {
    expect(isEtsyOrder(null, "poster.pdf")).toBe(false);
    expect(isEtsyOrder(null, null)).toBe(false);
  });
});

describe("every list that shows a file name uses FileIcon (the Etsy mark must not change between tabs)", () => {
  const SITES = [
    ["../Production/ProductionCard.jsx", "<FileIcon orderId={row.order_id} fileName={row.file_id}"],
    ["../Production/OrderView.jsx", "<FileIcon orderId={row.order_id} fileName={row.file_id}"],
    ["../Production/ProductionRollbackModal.jsx", "<FileIcon orderId={row.order_id} fileName={row.file_id}"],
    ["../BatchHistory/FileRow.jsx", "<FileIcon fileName={file.name}"],
    ["../OrderSearch/OrderSearch.jsx", "<FileIcon fileName={row.fileName}"],
  ];

  it.each(SITES)("%s", (rel, call) => {
    const src = read(rel);
    expect(src).toContain(call);
    expect(src).not.toContain("<LuFileText");
  });

  it("the Etsy mark has its colour, from the shared token", () => {
    expect(read("./FileIcon.module.css")).toMatch(/svg\.etsy\s*\{[^}]*var\(--etsy-orange\)/);
    expect(read("../../styles/global.css")).toContain("--etsy-orange: #f1641e;");
  });
});
