import fs from "fs";
import path from "path";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { PDF_STATE } from "../../shared/inboxReadiness.js";
import { isImageExt } from "../../shared/artworkFile.js";

// The ONE answer to "is this inbox PDF finished being written". The inbox scan (readFolders) and
// createBatch's VALIDATE both ask it - two copies of the condition is how a file could be listed
// as ready and then refused, or the other way round. One open of the file: header, the last 1 KB
// and the size/mtime all come from the same handle.
//
// Why the end of the file: copying onto SMB (Explorer, CopyFile) usually reserves the full size
// at once and fills the data from the front, so a half-copied PDF has the right size and a good
// "%PDF-" header while its tail is still zeros. A complete PDF carries %%EOF in its last 1 KB
// (the tolerance Acrobat itself uses).
//
//   %PDF- + %%EOF in the last 1 KB            -> READY, unless this station saw the file with another size or
//                                                mtime at its previous look: it is still growing (a %%EOF in the
//                                                middle of a linearized or incrementally updated PDF, D40) and
//                                                is COPYING until two looks agree
//   %PDF- + a tail of nothing but zeros       -> COPYING, for good: a reserved size that never fills
//                                                (a torn copy) must not be let through by waiting
//   %PDF- + data, no %%EOF, last 64 bytes zero -> the same: a reserved size cut off inside the data (D39)
//   %PDF- + data but no %%EOF                 -> COPYING until the file has stayed unchanged for
//                                                STABLE_MS, then READY_NO_EOF (a generator that
//                                                writes no %%EOF would otherwise stay "Copying..." forever)
//   zeros where "%PDF-" should be             -> COPYING (the data has not started)
//   open refused with EPERM / EBUSY           -> COPYING (held by the program copying it)
//   anything else that is not "%PDF-"         -> NOT_PDF; ENOENT -> GONE (both left out of the list)
//
// "Unchanged" is the STATION's own observation (size + mtime equal at two looks, timed by this
// process's monotonic clock), never "now - mtime": mtime is the server's clock, which is not this
// PC's (the same reason the lock's staleness is measured on the NAS clock, createBatch.js).

export const TAIL_BYTES = 1024;
export const ZERO_END_BYTES = 64;
export const STABLE_MS = 2 * 60 * 1000;
const HEADER = "%PDF-";
const EOF_MARK = "%%EOF";

export const createStabilityTracker = ({ now = () => performance.now() } = {}) => {
  const seen = new Map();
  // size + mtime of the last look at a file that ended in %%EOF (D40); NOT counted by size(), which is the no-EOF watch
  const finished = new Map();
  return {
    // How long (ms) this size + mtime has been seen unchanged; 0 at the first look and on any change.
    observe(filePath, size, mtimeMs) {
      const t = now();
      const prev = seen.get(filePath);
      if (prev && prev.size === size && prev.mtimeMs === mtimeMs) return t - prev.since;
      seen.set(filePath, { size, mtimeMs, since: t });
      return 0;
    },
    forget(filePath) {
      seen.delete(filePath);
    },
    // Records this look at a file that ends in %%EOF. false = the previous look saw another size or mtime (the file is
    // still being written); the first look is never a "change".
    confirmFinished(filePath, size, mtimeMs) {
      const prev = finished.get(filePath);
      finished.set(filePath, { size, mtimeMs });
      return !prev || (prev.size === size && prev.mtimeMs === mtimeMs);
    },
    // Keeps the map to the files still being watched: the scan passes the paths it just saw.
    retainOnly(paths) {
      for (const key of seen.keys()) if (!paths.has(key)) seen.delete(key);
      for (const key of finished.keys()) if (!paths.has(key)) finished.delete(key);
    },
    size: () => seen.size,
  };
};

// One tracker per process: createBatch must see the same observations the scan made.
export const stabilityTracker = createStabilityTracker();

// An image tile (E3a-2, the Etsy route) is "finished" by the same ONE function; the name stays checkPdf
// because the scan, createBatch and recheckCopying import it by that name (pdfReadiness.wiring.test.js).
// The extension picks the check, the answer has the same shape.
//
//   signature of the extension     -> else NOT_PDF (not listed, like a text file in the inbox)
//   zeros where the signature goes -> COPYING (the data has not started)
//   PNG IEND / JPEG EOI / GIF trailer / WebP RIFF size at the end -> the end of the data is there; READY unless this
//                                     station saw another size or mtime at its previous look (D40, the same tracker)
//   a tail that is nothing but zeros, or no end marker -> COPYING (a reserved size not filled yet, or a cut-off copy)
//   TIFF has no end marker, and a legitimate one may end in zeros -> COPYING until a SECOND look (IMAGE_SETTLE_MS later) sees
//                                     the same size + mtime. Known edge: a copy paused between two looks passes.
export const IMAGE_SETTLE_MS = 10 * 1000;

const startsWithBytes = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const ascii = (buf, from, to) => buf.subarray(from, to).toString("latin1");

// -> true when the first bytes are those of the format the extension names
const hasImageSignature = (ext, head) => {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return startsWithBytes(head, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWithBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif":
      return ascii(head, 0, 4) === "GIF8";
    case "webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP";
    case "tif":
    case "tiff":
      return startsWithBytes(head, [0x49, 0x49, 0x2a, 0x00]) || startsWithBytes(head, [0x4d, 0x4d, 0x00, 0x2a]);
    default:
      return false;
  }
};

const lastNonZero = (buf) => {
  for (let i = buf.length - 1; i >= 0; i--) if (buf[i] !== 0) return i;
  return -1;
};

// -> whether the end of the data is there, or null for a format with no end marker (TIFF). Trailing zeros
// after the marker are tolerated (padding); a tail of nothing but zeros is never an end.
const hasImageEnd = (ext, tail, size, head) => {
  const trimmed = tail.subarray(0, lastNonZero(tail) + 1);
  switch (ext) {
    case "jpg":
    case "jpeg":
      return trimmed.length >= 2 && trimmed[trimmed.length - 2] === 0xff && trimmed[trimmed.length - 1] === 0xd9;
    case "png":
      return trimmed.length >= 8 && ascii(trimmed, trimmed.length - 8, trimmed.length - 4) === "IEND";
    case "gif":
      return trimmed.length > 0 && trimmed[trimmed.length - 1] === 0x3b;
    case "webp":
      // The RIFF size is the file size - 8, but a copy that reserved its full size says so too: the last
      // 64 bytes must not be zeros (the same test as the PDF's D39).
      return (
        head.length >= 8 &&
        head.readUInt32LE(4) + 8 <= size &&
        !allZero(tail.subarray(Math.max(0, tail.length - ZERO_END_BYTES)))
      );
    default:
      return null;
  }
};

const checkImage = async (handle, filePath, ext, tracker) => {
  const { size, mtimeMs } = await handle.stat();
  if (size === 0) return { state: PDF_STATE.COPYING, reason: "the file is still empty" };

  const head = await readAt(handle, 16, 0);
  if (!hasImageSignature(ext, head)) {
    if (head.length > 0 && allZero(head)) return { state: PDF_STATE.COPYING, reason: "the data has not started yet" };
    return { state: PDF_STATE.NOT_PDF };
  }

  const tailLength = Math.min(TAIL_BYTES, size);
  const tail = await readAt(handle, tailLength, size - tailLength);
  const end = hasImageEnd(ext, tail, size, head);

  if (end === null) {
    // TIFF: no end marker to look for. Two looks that agree.
    const unchangedMs = tracker.observe(filePath, size, mtimeMs);
    if (unchangedMs >= IMAGE_SETTLE_MS) return { state: PDF_STATE.READY, tracked: true };
    return { state: PDF_STATE.COPYING, reason: "waiting for the file to stop changing", tracked: true };
  }
  if (!end) {
    tracker.forget(filePath);
    if (allZero(tail)) return { state: PDF_STATE.COPYING, reason: "the end of the file is still empty" };
    return { state: PDF_STATE.COPYING, reason: "the end of the image is not there yet" };
  }
  tracker.forget(filePath);
  if (!tracker.confirmFinished(filePath, size, mtimeMs)) {
    return { state: PDF_STATE.COPYING, reason: "the file changed since it was last looked at", tracked: true };
  }
  return { state: PDF_STATE.READY, tracked: true };
};

const allZero = (buf) => buf.length > 0 && buf.every((byte) => byte === 0);

const readAt = async (handle, length, position) => {
  const { bytesRead, buffer } = await handle.read(Buffer.alloc(length), 0, length, position);
  return buffer.subarray(0, bytesRead);
};

// -> { state: PDF_STATE.*, reason?: string, tracked?: true }. `tracked` = the verdict rests on the
// stability tracker (the no-EOF wait, or the size/mtime of the last look at a finished file), so the caller keeps that
// path watched (tracker.retainOnly).
export const checkPdf = async (filePath, { tracker = stabilityTracker, fsp = fs.promises } = {}) => {
  let handle;
  try {
    handle = await fsp.open(filePath);
  } catch (err) {
    if (err.code === "ENOENT") return { state: PDF_STATE.GONE };
    if (err.code === "EPERM" || err.code === "EBUSY") {
      return { state: PDF_STATE.COPYING, reason: "the file is in use by another program" };
    }
    if (err.code === "EACCES") return { state: PDF_STATE.NOT_PDF }; // as before: not listed
    throw err; // unexpected -> the scan's per-file catch reports it as skipped
  }
  try {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (isImageExt(ext)) return await checkImage(handle, filePath, ext, tracker);

    const { size, mtimeMs } = await handle.stat();
    if (size === 0) return { state: PDF_STATE.COPYING, reason: "the file is still empty" };

    const head = await readAt(handle, HEADER.length, 0);
    if (head.toString("latin1") !== HEADER) {
      if (head.length === HEADER.length && allZero(head)) {
        return { state: PDF_STATE.COPYING, reason: "the data has not started yet" };
      }
      return { state: PDF_STATE.NOT_PDF };
    }

    const tailLength = Math.min(TAIL_BYTES, size);
    const tail = await readAt(handle, tailLength, size - tailLength);
    if (tail.includes(EOF_MARK, 0, "latin1")) {
      tracker.forget(filePath);
      if (!tracker.confirmFinished(filePath, size, mtimeMs)) {
        return { state: PDF_STATE.COPYING, reason: "the file changed since it was last looked at", tracked: true };
      }
      return { state: PDF_STATE.READY, tracked: true };
    }
    if (allZero(tail) || allZero(tail.subarray(Math.max(0, tail.length - ZERO_END_BYTES)))) {
      tracker.forget(filePath);
      return { state: PDF_STATE.COPYING, reason: "the end of the file is still empty" };
    }

    const unchangedMs = tracker.observe(filePath, size, mtimeMs);
    if (unchangedMs >= STABLE_MS) return { state: PDF_STATE.READY_NO_EOF, tracked: true };
    return { state: PDF_STATE.COPYING, reason: "no end-of-file marker yet", tracked: true };
  } finally {
    await handle.close();
  }
};
