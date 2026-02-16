import fs from "fs";
import { Buffer } from "node:buffer";

const isPDF = async (filePath) => {
  const handle = await fs.promises.open(filePath);
  const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 0);
  await handle.close();

  const isPDFFile = buffer.toString() === "%PDF-" ? true : false;
  return isPDFFile;
};

export { isPDF };
