// The buyer's note of an Etsy order (plan MSG): the receipt's message_from_buyer, the free text a buyer typed at
// checkout, as Etsy sends it in the receipt the import already fetches. Used by both processes: main decides what
// it stores, the renderer (MSG-2) what it shows. A CUSTOMER's words: shown as plain text, never logged.

// The longest note kept, in characters (code points). Etsy's own limit is not documented; a longer one is cut here.
export const ETSY_BUYER_NOTE_MAX = 2000;

// Control characters but the newline (C0, DEL, C1) and the bidi embedding / override / isolate marks, which could make
// the tooltip read in another order than the text was typed.
const UNWANTED = /[\x00-\x09\x0B-\x1F\x7F-\x9F\u202A-\u202E\u2066-\u2069]/g;

// -> the note as text worth showing, or null for anything else (not a string, empty or blank once cleaned). Line
// breaks become "\n" and a tab a space; every other control character goes; trimmed; cut to ETSY_BUYER_NOTE_MAX
// without splitting a character. HTML entities are left as Etsy sent them. null is "Etsy said nothing usable" -
// never a reason to clear a note already stored.
export const etsyBuyerNoteOf = (value) => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(UNWANTED, "").trim();
  if (!text) return null;
  const chars = Array.from(text);
  return chars.length > ETSY_BUYER_NOTE_MAX ? chars.slice(0, ETSY_BUYER_NOTE_MAX).join("").trimEnd() : text;
};
