import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renameNoOverwrite } from "./renameNoOverwrite.js";
import { checkPdf } from "./pdfReadiness.js";
import { PDF_STATE } from "../../shared/inboxReadiness.js";

// The shared rename of rollback and of the Etsy import, on a real folder.

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripflow-rename-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("renameNoOverwrite", () => {
  it("moves a file to a free name", async () => {
    const src = path.join(dir, "a.tmp");
    const dest = path.join(dir, "a.jpg");
    fs.writeFileSync(src, "one");
    await renameNoOverwrite(src, dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("one");
    expect(fs.existsSync(src)).toBe(false);
  });

  it("refuses a taken name with EEXIST and leaves BOTH files as they were", async () => {
    const src = path.join(dir, "a.tmp");
    const dest = path.join(dir, "a.jpg");
    fs.writeFileSync(src, "new");
    fs.writeFileSync(dest, "precious");
    await expect(renameNoOverwrite(src, dest)).rejects.toMatchObject({ code: "EEXIST" });
    expect(fs.readFileSync(dest, "utf8")).toBe("precious");
    expect(fs.readFileSync(src, "utf8")).toBe("new");
  });

  it("a missing source is the OS error, not a silent success", async () => {
    await expect(renameNoOverwrite(path.join(dir, "none"), path.join(dir, "b"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("the import's .tmp is not an inbox row while it is copied", () => {
  it("checkPdf answers NOT_PDF for the .etsy-<receipt>-<transaction>.tmp name, even when it holds image bytes", async () => {
    const tmp = path.join(dir, ".etsy-3456789012-501.tmp");
    // a complete JPEG (SOI ... EOI): were the extension an image one, this would be READY
    fs.writeFileSync(tmp, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]));
    const verdict = await checkPdf(tmp);
    expect(verdict.state).toBe(PDF_STATE.NOT_PDF);
  });
});
