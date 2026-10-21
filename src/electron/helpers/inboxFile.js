import { isImageFileName } from "../../shared/artworkFile.js";
import { isEtsyFileName } from "../../shared/orderSource.js";
import { getFeature } from "./shopProfile.js";

// Which files an inbox folder may show as a row. The pipeline under the scan handles an image tile
// (checkPdf, createBatch, rollback - E3a-2), but the operators keep images in the inbox folders for their
// own manual printing (26 on 2026-10-21), and listing those would put INVALID / Copying rows and a
// "N new files" count on every station. So an image is an inbox row only when the shop turned the Etsy
// feature on (E3b, features.etsy, fail-closed: no profile = off) AND the name is one the Etsy flow writes
// ("ET<receipt id>_..._ETSY.<ext>"). Both the scan (readFolders) and the inbox peek ask the ONE gate below.
export const inboxTakesImages = () => getFeature("etsy");

// true = leave this name out of the inbox list: an image the inbox does not take. Any other name (a PDF,
// or a file the scan has always judged by its content) is not touched by this gate.
export const inboxSkipsImage = (name) => isImageFileName(name) && !(inboxTakesImages() && isEtsyFileName(name));
