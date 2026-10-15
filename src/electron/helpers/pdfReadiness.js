import fs from "fs";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { PDF_STATE } from "../../shared/inboxReadiness.js";

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
//   %PDF- + %%EOF in the last 1 KB            -> READY
//   %PDF- + a tail of nothing but zeros       -> COPYING, for good: a reserved size that never fills
//                                                (a torn copy) must not be let through by waiting
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
export const STABLE_MS = 2 * 60 * 1000;
const HEADER = "%PDF-";
const EOF_MARK = "%%EOF";

export const createStabilityTracker = ({ now = () => performance.now() } = {}) => {
  const seen = new Map();
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
    // Keeps the map to the files still being watched: the scan passes the paths it just saw.
    retainOnly(paths) {
      for (const key of seen.keys()) if (!paths.has(key)) seen.delete(key);
    },
    size: () => seen.size,
  };
};

// One tracker per process: createBatch must see the same observations the scan made.
export const stabilityTracker = createStabilityTracker();

const allZero = (buf) => buf.length > 0 && buf.every((byte) => byte === 0);

const readAt = async (handle, length, position) => {
  const { bytesRead, buffer } = await handle.read(Buffer.alloc(length), 0, length, position);
  return buffer.subarray(0, bytesRead);
};

// -> { state: PDF_STATE.*, reason?: string, tracked?: true }. `tracked` = the verdict rests on the
// stability tracker, so the caller keeps that path watched (tracker.retainOnly).
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
      return { state: PDF_STATE.READY };
    }
    if (allZero(tail)) {
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
