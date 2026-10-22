// Where an order came from, read from its order number - the one place that knows the prefixes.
//
// Alex's file names start with the order number: "ON<digits>" for a Shopify order (the platform
// that also renders the print file), "ET<digits>" for an Etsy order, where <digits> is the Etsy
// receipt id (FILIP 2026-10-21: Etsy files get a name of their own and travel the same route as
// the ON files). The parser, the context menus and the main-process "Open in Etsy" all ask here,
// so the three can never disagree on which order is which.

export const ORDER_SOURCE = Object.freeze({
  SHOPIFY: "SHOPIFY",
  ETSY: "ETSY",
});

// The token that closes a file name of each source, where an ON file carries "FF".
export const SHOP_MARKER = Object.freeze({
  [ORDER_SOURCE.SHOPIFY]: "FF",
  [ORDER_SOURCE.ETSY]: "ETSY",
});

// One file-name token that is an order number of a known source.
export const ORDER_ID_RE = /^(ON|ET)\d+$/i;

// An order number as a whole "_"-delimited token of a file name (the parser's own tokenizing): it starts the
// name or follows "_", and ends at "_", the extension dot or the end - "Velvet2_..." is not ET2.
const ORDER_ID_IN_NAME_RE = /(?:^|_)((?:ON|ET)\d+)(?=_|\.|$)/i;

const ETSY_ORDER_RE = /^ET(\d+)$/i;
const SHOPIFY_ORDER_RE = /^ON\d+$/i;

const text = (v) => (typeof v === "string" ? v.trim() : "");

// ORDER_SOURCE value, or null for anything that is not an order number of a known source
// (null, "", a legacy row with no order).
export const orderSourceOf = (orderId) => {
  const id = text(orderId);
  if (ETSY_ORDER_RE.test(id)) return ORDER_SOURCE.ETSY;
  if (SHOPIFY_ORDER_RE.test(id)) return ORDER_SOURCE.SHOPIFY;
  return null;
};

// The first order number (upper case) that is a whole token of a file name, or null. The one fallback for a row
// the parser gave no orderId (a BatchHistory row read from disk, an invalid inbox file).
export const orderIdFromFileName = (name) => text(name).match(ORDER_ID_IN_NAME_RE)?.[1]?.toUpperCase() ?? null;

// The Etsy receipt id of an "ET<digits>" order number, as a digit string, or null.
export const etsyReceiptId = (orderId) => text(orderId).match(ETSY_ORDER_RE)?.[1] ?? null;

const ETSY_TILE_STEM_RE = /^ET\d+_.+_ETSY$/i;

// Is this file name one an Etsy import writes - "ET<receipt id>_..._ETSY.<ext>"? The shape check only (no
// parsing): the inbox gate uses it to tell a tile of the Etsy flow from an image an operator keeps in an inbox
// folder for manual printing.
export const isEtsyFileName = (name) => {
  const s = text(name);
  const dot = s.lastIndexOf(".");
  return ETSY_TILE_STEM_RE.test(dot < 0 ? s : s.slice(0, dot));
};
