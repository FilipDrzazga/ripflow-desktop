import fs from "fs";
import { Buffer } from "node:buffer";

export const isPDF = async (filePath) => {
  const handle = await fs.promises.open(filePath);
  try {
    const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 0);
    return buffer.toString() === "%PDF-";
  } finally {
    await handle.close();
  }
};
