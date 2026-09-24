import { describe, expect, it } from "vitest";
import { parseBatchFolderName, printerOfBatch } from "./batchFolderName.js";

describe("parseBatchFolderName", () => {
  it("reads group and printer of a plain batch folder", () => {
    expect(parseBatchFolderName("PRINTED_101500-Neraki-DGEN")).toEqual({ group: "Neraki", printer: "DGEN" });
  });

  it("upper-cases the printer code at the input", () => {
    expect(parseBatchFolderName("PRINTED_101500-Neraki-dgen")).toEqual({ group: "Neraki", printer: "DGEN" });
  });

  it("strips the collision suffix createBatch.js appends - never part of the code", () => {
    expect(parseBatchFolderName("PRINTED_101500-Neraki-DGEN_1")).toEqual({ group: "Neraki", printer: "DGEN" });
    expect(parseBatchFolderName("PRINTED_101500-Neraki-YOKO_12")).toEqual({ group: "Neraki", printer: "YOKO" });
  });

  it("keeps a hyphen inside the group - the code is the LAST segment", () => {
    expect(parseBatchFolderName("PRINTED_101500-Cotton-Twill-YUMI")).toEqual({ group: "Cotton-Twill", printer: "YUMI" });
  });

  it("accepts a printer the old list did not know - visibility no longer depends on a list", () => {
    expect(parseBatchFolderName("PRINTED_101500-Neraki-MIMAKI2")).toEqual({ group: "Neraki", printer: "MIMAKI2" });
  });

  it("rejects names that are not batch folders", () => {
    expect(parseBatchFolderName("PRINTED_101500-Neraki")).toBeNull(); // no printer segment
    expect(parseBatchFolderName("PRINTED_1015-Neraki-DGEN")).toBeNull(); // time not hhmmss
    expect(parseBatchFolderName("Neraki-DGEN")).toBeNull();
    expect(parseBatchFolderName("PRINTED_101500-Neraki-DG.EN")).toBeNull(); // character outside the code set
    expect(parseBatchFolderName("PRINTED_101500-Neraki-DGEN_x")).toBeNull(); // suffix is digits only
    expect(parseBatchFolderName("")).toBeNull();
    expect(parseBatchFolderName(null)).toBeNull();
    expect(parseBatchFolderName(undefined)).toBeNull();
  });

  it("rejects createBatch temp folders, whose last segment is a number", () => {
    expect(parseBatchFolderName(".tmp-PRINTED_101500-Neraki-DGEN-4242-1727170000000")).toBeNull();
  });
});

describe("printerOfBatch", () => {
  it("takes a folder name or a full path with either slash", () => {
    expect(printerOfBatch("PRINTED_101500-Neraki-DGEN")).toBe("DGEN");
    expect(printerOfBatch("O:\\SPPrintReadyArtwork\\PRINTED\\24-09-2026\\PRINTED_101500-Neraki-yoko_2")).toBe("YOKO");
    expect(printerOfBatch("/share/PRINTED/24-09-2026/PRINTED_101500-Neraki-YUMI")).toBe("YUMI");
  });

  it("answers null when there is no batch folder to read - callers pick their fallback", () => {
    expect(printerOfBatch("O:\\SPPrintReadyArtwork\\PRINTED\\24-09-2026")).toBeNull();
    expect(printerOfBatch("")).toBeNull();
    expect(printerOfBatch(null)).toBeNull();
    expect(printerOfBatch(undefined)).toBeNull();
  });
});
