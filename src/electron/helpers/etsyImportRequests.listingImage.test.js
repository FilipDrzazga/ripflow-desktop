import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests } from "./etsyImportRequests.js";

// The listing picture of the Inbox bar (FILIP 2026-10-22) through the bar's request module: the same fail-closed
// gate as every other call of the bar, only digits cross, the picture comes from the injected keeper.
const make = (over = {}) => {
  const parts = {
    featureOn: vi.fn(() => true),
    isImporter: vi.fn(() => false),
    list: vi.fn(() => []),
    requestRetry: vi.fn(),
    dismiss: vi.fn(),
    requestTick: vi.fn(),
    openExternal: vi.fn(),
    listingImage: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
    ...over,
  };
  return { parts, requests: createEtsyImportRequests(parts) };
};

describe("listingImage", () => {
  it("answers the picture of the listing, asked by its digits", async () => {
    const { parts, requests } = make();
    expect(await requests.listingImage(" 1700000001 ")).toEqual({ success: true, image: "data:image/jpeg;base64,AAAA" });
    expect(parts.listingImage).toHaveBeenCalledWith("1700000001");
  });

  it("no picture is a success with image null - the bar shows the grey square", async () => {
    const { requests } = make({ listingImage: async () => null });
    expect(await requests.listingImage("1700000001")).toEqual({ success: true, image: null });
  });

  it("refuses with features.etsy off and asks nothing (fail closed)", async () => {
    const { parts, requests } = make({ featureOn: () => false });
    expect(await requests.listingImage("1700000001")).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
    expect(parts.listingImage).not.toHaveBeenCalled();
  });

  it("a listing not named by digits never reaches the keeper", async () => {
    const { parts, requests } = make();
    for (const bad of ["", "abc", "https://evil.example/x.jpg", "1".repeat(21), null, 1700000001]) {
      expect(await requests.listingImage(bad)).toMatchObject({ success: false, error: { code: "INVALID_ETSY_LISTING" } });
    }
    expect(parts.listingImage).not.toHaveBeenCalled();
  });

  it("a station built without a keeper answers null (the default part)", async () => {
    const { listingImage: _unused, ...rest } = make().parts;
    const requests = createEtsyImportRequests(rest);
    expect(await requests.listingImage("1700000001")).toEqual({ success: true, image: null });
  });
});
