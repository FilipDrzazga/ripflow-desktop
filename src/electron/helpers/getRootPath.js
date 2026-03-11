import fs from "fs";

const HOME_PATH = "C:\\SPPrintReadyArtwork";
const WORK_PATH = "O:\\SPPrintReadyArtwork";
const XML_PATH = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork";

export const getStorageRootPath = () => {
  return fs.existsSync(WORK_PATH) ? WORK_PATH : HOME_PATH;
};

export const getXmlRootPath = () => {
  return XML_PATH;
};

export const getRootPath = () => {
  return getStorageRootPath();
};
