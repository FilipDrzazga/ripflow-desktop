import { repeatTypeOf } from "../../shared/artworkFile.js";

// What an order line of the Etsy API (a `transaction` of a receipt) says, and the one file name that
// becomes of it. EVERYTHING that depends on how the shop fills in its listings is in this file, because
// none of it is confirmed on a real order yet (no sign-in has run): where the pattern number (XWD) sits,
// which variation carries the print type. When the real order shows it, this is the only file that
// changes. Until then nothing is guessed - a line that cannot be read as ONE thing is reported with its
// reason, and the import writes no file for it.
//
//   receipt:     { receipt_id, name, transactions: [...] }
//   transaction: { transaction_id, title, sku, quantity, variations: [{ formatted_name, formatted_value }] }

const text = (v) => (typeof v === "string" ? v.trim() : "");

const variationsOf = (transaction) => (Array.isArray(transaction?.variations) ? transaction.variations : []);

const isFabricVariation = (variation) => /^(fabric|material)$/i.test(text(variation?.formatted_name));

// XWD<digits> as a WHOLE token: "XWD12" is not inside "XWD123" and "XWD123456" is not read from a longer
// run of letters or digits around it. Used for the Etsy line and for the library file name alike.
const xwdPattern = (digits, flags = "i") => new RegExp(`(?:^|[^A-Za-z0-9])XWD(${digits})(?![A-Za-z0-9])`, flags);

export const xwdIdsIn = (value) => {
  const ids = new Set();
  for (const m of text(value).matchAll(xwdPattern("\\d+", "gi"))) ids.add(m[1]);
  return [...ids];
};

// The shop's own listings (FILIP 2026-10-22, read off the live shop: 791 of 791 SKUs that are only digits) carry
// the pattern number as the SKU ALONE, without the XWD prefix, and every library number is six digits. Only a
// SKU that is exactly six digits counts: any other all-digit SKU is not read as a pattern.
const BARE_SKU_RE = /^\d{6}$/;

// -> { xwd: "173706" } or { reason }. The SKU, every variation value and the title are read; the number
// must be the same everywhere it appears, and appear somewhere.
export const xwdOfTransaction = (transaction) => {
  const sources = [transaction?.sku, ...variationsOf(transaction).map((v) => v?.formatted_value), transaction?.title];
  const ids = new Set(sources.flatMap(xwdIdsIn));
  const sku = text(transaction?.sku);
  if (BARE_SKU_RE.test(sku)) ids.add(sku);
  if (ids.size === 0) return { reason: "No XWD pattern number in the SKU, the variations or the title of the order line." };
  if (ids.size > 1) return { reason: `The order line carries more than one XWD number (${[...ids].map((i) => `XWD${i}`).join(", ")}).` };
  return { xwd: [...ids][0] };
};

// -> { value } (the Fabric variation as Etsy sent it) or { reason }.
export const fabricValueOfTransaction = (transaction) => {
  const found = variationsOf(transaction).filter(isFabricVariation);
  if (found.length === 0) return { reason: 'The order line has no "Fabric" variation.' };
  const values = new Set(found.map((v) => text(v.formatted_value)));
  if (values.size > 1) return { reason: 'The order line has more than one different "Fabric" variation.' };
  return { value: [...values][0] };
};

// The texts that may hold the print type: every value of a variation that is not the fabric. Which
// of them IS the type is decided by the parser (the file name made from it must read back as a Linear
// Meter, Fat Quarter or Sample), not here.
export const typeTextCandidates = (transaction) => {
  const seen = new Set();
  for (const v of variationsOf(transaction)) {
    if (isFabricVariation(v)) continue;
    const t = text(v?.formatted_value);
    if (t) seen.add(t);
  }
  return [...seen];
};

// ---- the library file ---------------------------------------------------------------------------------

// The file names of `names` (one folder listing) that carry XWD<digits> as a whole token and are images.
export const libraryFilesFor = (digits, names, isImage) => {
  if (!/^\d+$/.test(String(digits))) return [];
  const pattern = xwdPattern(digits);
  return names.filter((name) => isImage(name) && pattern.test(name));
};

// "<TITLE> XWD173706_<designer>_Half-Drop_211.67_14102025.jpg" -> "Half-Drop": the first repeat type
// AFTER the XWD token. null = the name does not say.
export const repeatOfLibraryName = (name, digits) => {
  const stem = String(name).replace(/\.[^.]+$/, "");
  const at = stem.search(xwdPattern(digits));
  if (at < 0) return null;
  const tokens = stem.slice(at).split("_").slice(1);
  for (const token of tokens) {
    const repeat = repeatTypeOf(token);
    if (repeat) return repeat;
  }
  return null;
};

// ---- the file name ------------------------------------------------------------------------------------

// Characters a Windows file name cannot hold: the path set and every control character (code < 32).
const PATH_CHARS = '<>:"/\\|?*';
const stripPathChars = (value) => [...value].filter((c) => !PATH_CHARS.includes(c) && c.charCodeAt(0) >= 32).join("");

// One word of a person's name as a file name token: no underscore (the token separator), no path
// character, no dot (a trailing dot is not a legal Windows name), no control character.
const nameWord = (word) => stripPathChars(word).replace(/[_.]/g, "").trim();

// "Ann-Marie O'Neil" -> ["Ann-Marie", "O'Neil"]; nothing usable -> ["Customer"].
export const customerNameTokens = (name) => {
  const words = text(name).split(/\s+/).map(nameWord).filter(Boolean);
  return words.length > 0 ? words : ["Customer"];
};

// The print type text as one token run of the name: underscores become spaces (the parser would split
// there), path characters go, spaces collapse.
export const typeTextForName = (value) =>
  stripPathChars(text(value))
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();

// ET<receipt>_<first>_<last>_<x>of<y>_<Material>_<qty>x_<type>_XWD<id>_<repeat>_ETSY.<ext>
// - the layout of an ON file with ET / ETSY in place of ON / FF, and the repeat type behind the XWD token
// that an image tile needs (src/shared/artworkFile.js). The caller proves the result by reading it back
// through the parser.
export const buildEtsyTileName = ({ receiptId, customerName, index, total, material, qty, typeText, xwd, repeat, ext }) =>
  [
    `ET${receiptId}`,
    ...customerNameTokens(customerName),
    `${index}of${total}`,
    material,
    `${qty}x`,
    typeTextForName(typeText),
    `XWD${xwd}`,
    repeat,
    "ETSY",
  ].join("_") + `.${String(ext).toLowerCase()}`;
