import { describe, it, expect } from "vitest";
import {
  xwdIdsIn,
  xwdOfTransaction,
  fabricValueOfTransaction,
  typeTextCandidates,
  libraryFilesFor,
  repeatOfLibraryName,
  customerNameTokens,
  typeTextForName,
  buildEtsyTileName,
} from "./etsyTransaction.js";

const tx = (over = {}) => ({
  transaction_id: 11,
  title: "Floral pattern fabric",
  sku: "",
  quantity: 2,
  variations: [
    { formatted_name: "Fabric", formatted_value: "Drill" },
    { formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" },
  ],
  ...over,
});

describe("XWD in an order line", () => {
  it("is read as a whole token", () => {
    expect(xwdIdsIn("XWD12")).toEqual(["12"]);
    expect(xwdIdsIn("Rose XWD173706_Basic")).toEqual(["173706"]);
    expect(xwdIdsIn("notXWD12")).toEqual([]);
    expect(xwdIdsIn("XWD12abc")).toEqual([]);
    expect(xwdIdsIn("a XWD1 b XWD1 c")).toEqual(["1"]);
  });

  it("comes from the SKU, a variation or the title", () => {
    expect(xwdOfTransaction(tx({ sku: "XWD111484" })).xwd).toBe("111484");
    expect(xwdOfTransaction(tx({ title: "Rose XWD5" })).xwd).toBe("5");
    expect(xwdOfTransaction(tx({ variations: [{ formatted_name: "Pattern", formatted_value: "XWD7" }] })).xwd).toBe("7");
  });

  it("a SKU of exactly six digits is the number without the XWD prefix", () => {
    expect(xwdOfTransaction(tx({ sku: "101323" })).xwd).toBe("101323");
    expect(xwdOfTransaction(tx({ sku: " 101323 " })).xwd).toBe("101323");
    expect(xwdOfTransaction(tx({ sku: "101323", title: "Octopus XWD101323" })).xwd).toBe("101323");
  });

  it("any other all-digit SKU is not a pattern number", () => {
    for (const sku of ["12345", "1013231", "10132a", "101 323"]) {
      expect(xwdOfTransaction(tx({ sku })).reason).toMatch(/No XWD/);
    }
  });

  it("a bare SKU that disagrees with another number is a reason", () => {
    expect(xwdOfTransaction(tx({ sku: "101323", title: "Rose XWD101324" })).reason).toMatch(/more than one XWD/);
  });

  it("the same number in two places is one number", () => {
    expect(xwdOfTransaction(tx({ sku: "XWD9", title: "Rose XWD9" })).xwd).toBe("9");
  });

  it("no number, or two different ones, is a reason", () => {
    expect(xwdOfTransaction(tx()).reason).toMatch(/No XWD/);
    expect(xwdOfTransaction(tx({ sku: "XWD9", title: "Rose XWD10" })).reason).toMatch(/more than one XWD/);
  });
});

describe("the fabric and the type candidates", () => {
  it("the Fabric (or Material) variation, one value", () => {
    expect(fabricValueOfTransaction(tx()).value).toBe("Drill");
    expect(fabricValueOfTransaction(tx({ variations: [{ formatted_name: "material", formatted_value: "Velvet" }] })).value).toBe("Velvet");
  });

  it("none, or two different, is a reason", () => {
    expect(fabricValueOfTransaction(tx({ variations: [] })).reason).toMatch(/no "Fabric"/);
    const two = [
      { formatted_name: "Fabric", formatted_value: "Drill" },
      { formatted_name: "Material", formatted_value: "Velvet" },
    ];
    expect(fabricValueOfTransaction(tx({ variations: two })).reason).toMatch(/more than one/);
  });

  it("every non-fabric variation value is a candidate for the type", () => {
    expect(typeTextCandidates(tx())).toEqual(["Linear Meter - 1m increments"]);
  });
});

describe("the library file", () => {
  const names = [
    "ROSE XWD173706_designer_Half-Drop_211.67_14102025.jpg",
    "ROSE XWD1737_designer_Basic_150_14102025.jpg",
    "ROSE XWD173706_designer_Basic_150_14102025.pdf",
    "XWD173706 copy_x_Mirror_1_1.png",
    "readme.txt",
  ];
  const isImage = (n) => /\.(jpg|png)$/i.test(n);

  it("matches the XWD as a whole token among images only", () => {
    expect(libraryFilesFor("173706", names, isImage)).toEqual([names[0], names[3]]);
    expect(libraryFilesFor("1737", names, isImage)).toEqual([names[1]]);
    expect(libraryFilesFor("17", names, isImage)).toEqual([]);
  });

  it("refuses an XWD that is not digits", () => {
    expect(libraryFilesFor("1.*", names, isImage)).toEqual([]);
  });

  it("reads the repeat type after the XWD token", () => {
    expect(repeatOfLibraryName(names[0], "173706")).toBe("Half-Drop");
    expect(repeatOfLibraryName(names[1], "1737")).toBe("Basic");
    expect(repeatOfLibraryName("ROSE XWD5_designer_150_1.jpg", "5")).toBeNull();
  });
});

describe("the file name", () => {
  it("a customer name becomes tokens without underscores, dots or path characters", () => {
    expect(customerNameTokens("Ann-Marie O'Neil")).toEqual(["Ann-Marie", "O'Neil"]);
    expect(customerNameTokens("J. Smith")).toEqual(["J", "Smith"]);
    expect(customerNameTokens("  ")).toEqual(["Customer"]);
    expect(customerNameTokens(null)).toEqual(["Customer"]);
  });

  it("no token of a name can hold an underscore, a path character or a control character", () => {
    for (const word of customerNameTokens('A_B C:D E/F G\\H I|J K?L M*N O"P Q<R S>T U\u0001V')) {
      expect(word).not.toMatch(/[_:/\\|?*"<>.]/);
      expect([...word].every((c) => c.charCodeAt(0) >= 32)).toBe(true);
    }
  });

  it("the type text keeps its dashes and sizes, loses underscores and trailing dots", () => {
    expect(typeTextForName("Fat Quarter - 65 x 48 cm")).toBe("Fat Quarter - 65 x 48 cm");
    expect(typeTextForName("Sample_Print  - 20.5 x 20 cm.")).toBe("Sample Print - 20.5 x 20 cm");
  });

  it("builds the layout of an ON file with ET / ETSY and the repeat behind the XWD", () => {
    expect(
      buildEtsyTileName({
        receiptId: "3456789012",
        customerName: "Ann Lee",
        index: 1,
        total: 2,
        material: "Drill",
        qty: 3,
        typeText: "Linear Meter - 1m increments",
        xwd: "173706",
        repeat: "Half-Drop",
        ext: "JPG",
      }),
    ).toBe("ET3456789012_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg");
  });
});
