import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests } from "./etsyImportRequests.js";

// Settings > Etsy > Remembered choices: both memories and the titles in one answer.

const LINE = { receiptId: "3456789012", transactionId: "501" };
const ROW = { ...LINE, state: "needs_review", listingId: "1351273307" };

const make = (over = {}) => {
  const parts = {
    saveListingType: vi.fn(() => true),
    forgetListingType: vi.fn(() => ({ deleted: true })),
    listListingTypes: vi.fn(() => [{ listingId: "1351273307", printType: "SNOOD" }]),
    listListingFabrics: vi.fn(() => []),
    getLine: vi.fn(() => ROW),
    ...over,
  };
  const requests = createEtsyImportRequests({
    featureOn: () => true,
    isImporter: () => false,
    list: () => [],
    requestRetry: () => ({ updated: true }),
    dismiss: () => ({ updated: true }),
    requestTick: () => {},
    ...parts,
  });
  return { requests, parts };
};

describe("listingChoices", () => {
  it("joins fabric, product type and title per listing, one row each", () => {
    const { requests, parts } = make({
      listListingFabrics: () => [
        { listingId: "1", fabricName: "Active Eco Lycra" },
        { listingId: "2", fabricName: "Drill" },
      ],
      listListingTypes: () => [
        { listingId: "3", printType: "APRON" },
        { listingId: "1", printType: "SNOOD" },
      ],
      listingTitles: vi.fn(() => ({ 1: "Adult Snood", 3: "Kitchen Apron" })),
    });
    const res = requests.listingChoices();
    expect(res).toEqual({
      success: true,
      data: [
        { listingId: "1", title: "Adult Snood", fabric: "Active Eco Lycra", printType: "SNOOD" },
        { listingId: "2", title: null, fabric: "Drill", printType: null },
        { listingId: "3", title: "Kitchen Apron", fabric: null, printType: "APRON" },
      ],
    });
    expect(parts).toBeTruthy();
  });

  it("asks for the titles of exactly the listings it lists", () => {
    const listingTitles = vi.fn(() => ({}));
    const { requests } = make({ listListingFabrics: () => [{ listingId: "1", fabricName: "Drill" }], listingTitles });
    requests.listingChoices();
    expect(listingTitles).toHaveBeenCalledWith(["1", "1351273307"]); // the fabrics first, then the types the fabrics did not list
  });

  it("titles that could not be read cost the titles only", () => {
    const { requests } = make({ listListingFabrics: () => [{ listingId: "1", fabricName: "Drill" }], listListingTypes: () => [], listingTitles: () => null });
    expect(requests.listingChoices()).toEqual({ success: true, data: [{ listingId: "1", title: null, fabric: "Drill", printType: null }] });
  });

  it.each([
    ["the fabrics", { listListingFabrics: () => null }],
    ["the product types", { listListingTypes: () => null }],
  ])("an unreadable memory of %s is an error, never a list that lacks half of it", (_label, over) => {
    const { requests } = make(over);
    expect(requests.listingChoices()).toMatchObject({ success: false, error: { code: "DB_READ_FAILED" } });
  });

  it("nothing remembered is an empty list", () => {
    const { requests } = make({ listListingFabrics: () => [], listListingTypes: () => [] });
    expect(requests.listingChoices()).toEqual({ success: true, data: [] });
  });

  it("is refused while features.etsy is off", () => {
    const off = createEtsyImportRequests({ featureOn: () => false, isImporter: () => false, list: () => [], requestRetry: () => null, dismiss: () => null, requestTick: () => {} });
    expect(off.listingChoices()).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
  });
});
