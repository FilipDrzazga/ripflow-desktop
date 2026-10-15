import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness: the reason dropdown of the rollback modal is pinned by reading the source.

const modalJsx = readFileSync(fileURLToPath(new URL("./ProductionRollbackModal.jsx", import.meta.url)), "utf8");

describe("the reason dropdown of the rollback modal opens where there is room", () => {
  it("takes its placement from dropdownPlacement and applies it as the list's position", () => {
    expect(modalJsx).toContain('import { dropdownPlacement } from "@/utils/dropdownPlacement";');
    expect(modalJsx).toContain("dropdownPlacement(rect, window.innerHeight)");
    expect(modalJsx).toContain("style={menuPos}");
  });
});
