import fs from "fs";

export const getRootPath = () => {
  const HOME_PATH = "C:\\SPPrintReadyArtwork";
  const WORK_PATH = "O:\\SPPrintReadyArtwork";

  const PATH = fs.existsSync(WORK_PATH) ? WORK_PATH : HOME_PATH;
  return PATH;
};
