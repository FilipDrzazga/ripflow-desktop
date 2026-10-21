import { isImageFileName } from "../../shared/artworkFile.js";

// Which files an inbox folder may show as a row. The pipeline under the scan handles an image tile
// (checkPdf, createBatch, rollback - E3a-2), but an image is NOT yet an inbox row: the operators keep
// images in the inbox folders for their own manual printing (26 on 2026-10-21), and listing them would
// put INVALID / Copying rows and a "N new files" count on every station before there is a feature to
// turn them on. E3b (the Etsy import) switches this on with getFeature("etsy"); until then the ONE
// switch below says no, and both the scan (readFolders) and the inbox peek ask it.
export const inboxTakesImages = () => false;

// true = leave this name out of the inbox list: an image the inbox does not take. Any other name (a PDF,
// or a file the scan has always judged by its content) is not touched by this gate.
export const inboxSkipsImage = (name) => isImageFileName(name) && !inboxTakesImages();
