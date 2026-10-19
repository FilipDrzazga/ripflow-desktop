import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { displayFileName, searchOrders } from "./orderSearch";

// The Ctrl+F window does not SHOW the "_XWD<hex>_FF.pdf" tail of a file name (FILIP 2026-10-19 12:04).

const XWD_NAME = "ON12345_Jane_Doe_1of2_Cotton_2x_Cushion45_XWD1a2b3c_FF.pdf";

describe("displayFileName", () => {
  it("cuts the artwork-id tail of an XWD-based name, from the separator before XWD to the end", () => {
    expect(displayFileName(XWD_NAME)).toBe("ON12345_Jane_Doe_1of2_Cotton_2x_Cushion45");
    expect(displayFileName("ON1_Name_xwdABC9.pdf")).toBe("ON1_Name");
  });

  it("returns a name without an XWD token whole, extension included", () => {
    expect(displayFileName("ON12345_Jane_Doe_Cushion45_9f3a.pdf")).toBe("ON12345_Jane_Doe_Cushion45_9f3a.pdf");
  });

  it("returns the whole name when the tail would be all there is, and an empty string for a non-string", () => {
    expect(displayFileName("XWD1a2b3c_FF.pdf")).toBe("XWD1a2b3c_FF.pdf");
    expect(displayFileName(undefined)).toBe("");
  });
});

describe("the row keeps the full name; only the window drops the tail", () => {
  it("still finds a file by its artwork id and keeps the full fileName on the row", () => {
    const item = {
      id: `Cottons_${XWD_NAME}`,
      file: { name: XWD_NAME, ext: "pdf" },
      orderId: "ON12345",
      customerName: null,
      createdAt: "2026-10-17T08:00:00.000Z",
    };
    const result = searchOrders("XWD1a2b3c", { files: [{ items: [item] }] });
    const rows = result.groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.fileName)).toEqual([XWD_NAME]);
  });

  it("is what OrderSearch.jsx renders, while the title attribute keeps the full name", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const jsx = readFileSync(path.join(dir, "../components/OrderSearch/OrderSearch.jsx"), "utf8");
    expect(jsx).toContain("{displayFileName(row.fileName)}");
    expect(jsx).toContain("title={row.fileName}");
  });
});
