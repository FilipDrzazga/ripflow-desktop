import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { buildZip } from "./zipWriter.js";

// ETAP 4 (4-diag): the archive is read back here through its central directory - the path every
// unzip tool takes (Windows Explorer, 7-Zip) - and each entry is inflated and compared. The live
// check with Windows' own Expand-Archive is in the artefact.

const readZip = (buf) => {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(endAt).toBeGreaterThanOrEqual(0);
  const count = buf.readUInt16LE(endAt + 10);
  let at = buf.readUInt32LE(endAt + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(at + 16);
    const packedSize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    expect(buf.readUInt32LE(localAt)).toBe(0x04034b50);
    const localNameLen = buf.readUInt16LE(localAt + 26);
    const dataAt = localAt + 30 + localNameLen + buf.readUInt16LE(localAt + 28);
    const data = zlib.inflateRawSync(buf.subarray(dataAt, dataAt + packedSize));
    out.push({ name, text: data.toString("utf8"), crcOk: (zlib.crc32(data) >>> 0) === crc, sizeOk: data.length === size });
    at += 46 + nameLen;
  }
  return out;
};

describe("buildZip", () => {
  it("every entry reads back through the central directory, byte for byte, with a correct CRC", () => {
    const entries = [
      { name: "summary.json", data: JSON.stringify({ a: 1 }) },
      { name: "logs.json", data: "x".repeat(10000) },
      { name: "empty.txt", data: "" },
      // a non-ASCII name (e with acute), built from its code point so the source stays ASCII
      { name: `caf${String.fromCharCode(0xe9)}.txt`, data: Buffer.from("utf-8 name") },
    ];
    const got = readZip(buildZip(entries));
    expect(got.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    expect(got.map((e) => e.text)).toEqual(["{\"a\":1}", "x".repeat(10000), "", "utf-8 name"]);
    expect(got.every((e) => e.crcOk && e.sizeOk)).toBe(true);
  });

  it("compresses (deflate): a repetitive log is much smaller than itself", () => {
    expect(buildZip([{ name: "l", data: "line\n".repeat(5000) }]).length).toBeLessThan(1000);
  });

  it("an empty archive is just the end record", () => {
    const buf = buildZip([]);
    expect(buf.length).toBe(22);
    expect(buf.readUInt32LE(0)).toBe(0x06054b50);
  });
});
