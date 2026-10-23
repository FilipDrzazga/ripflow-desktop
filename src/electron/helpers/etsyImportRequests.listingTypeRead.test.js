import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests } from "./etsyImportRequests.js";

// D84: setListingPrintType told "line gone" when the table could not be read at all (getEtsyImport -> undefined), the same
// fix as setListingFabric. null = no such row, undefined = could not ask.
const LINE = { receiptId: "3456789012", transactionId: "501" };

const make = (getLine) => {
  const saveListingType = vi.fn(() => true);
  const requests = createEtsyImportRequests({
    featureOn: () => true,
    isImporter: () => false,
    list: () => [],
    requestRetry: () => ({ updated: true }),
    dismiss: () => ({ updated: true }),
    requestTick: () => {},
    saveListingType,
    getLine,
  });
  return { requests, saveListingType };
};

describe("setListingPrintType - the row cannot be read", () => {
  it.each([
    ["a line that is not in the table", null, "ETSY_LINE_GONE"],
    ["a table that could not be asked", undefined, "DB_READ_FAILED"],
  ])("refuses %s", (_label, row, code) => {
    const { requests, saveListingType } = make(() => row);
    expect(requests.setListingPrintType({ ...LINE, printType: "SNOOD" })).toMatchObject({ success: false, error: { code } });
    expect(saveListingType).not.toHaveBeenCalled();
  });
});
