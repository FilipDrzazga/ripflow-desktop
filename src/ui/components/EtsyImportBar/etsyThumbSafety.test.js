import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-22 14:19: opening the Etsy bar took the whole window down - the DEV app's preload predated the
// listing-picture channel, so the call threw at once inside the effect and React had nothing to catch it. The bar
// has no ErrorBoundary of its own, so the picture must turn ANY failure into the grey square. No React harness
// here (50f64c8): pinned by reading the source (comment lines dropped).
const thumb = readFileSync(fileURLToPath(new URL("./EtsyThumb.jsx", import.meta.url)), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("EtsyThumb never throws out of its effect", () => {
  it("calls the service inside a promise chain, so a call that throws at once is a rejection", () => {
    expect(thumb).toMatch(/Promise\.resolve\(\)\s*\.then\(\(\) => getEtsyListingImage\(listingId\)\)/);
  });

  it("the service is called nowhere else in the component (no bare call that could throw)", () => {
    expect((thumb.match(/getEtsyListingImage\(/g) ?? []).length).toBe(1);
  });

  it("a rejection ends in the grey square", () => {
    expect(thumb).toMatch(/\.catch\(\(\) => \{\s+if \(!cancelled\) setLoaded\(\{ id: listingId, image: null \}\);/);
  });
});
