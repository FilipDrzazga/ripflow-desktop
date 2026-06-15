import fs from "fs";
import { Buffer } from "node:buffer";

export const isPDF = async (filePath) => {
  let handle;
  try {
    handle = await fs.promises.open(filePath);
  } catch (err) {
    // File vanished or got locked in the stat↔open window → treat as not-a-PDF.
    if (["ENOENT", "EPERM", "EBUSY", "EACCES"].includes(err.code)) return false;
    throw err; // unexpected error → bubble up (caught by per-file try/catch in readFolders)
  }
  try {
    const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 0);
    return buffer.toString() === "%PDF-";
  } finally {
    await handle.close();
  }
};
