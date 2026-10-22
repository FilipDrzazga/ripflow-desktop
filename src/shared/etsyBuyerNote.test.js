import { describe, it, expect } from "vitest";
import { etsyBuyerNoteOf, ETSY_BUYER_NOTE_MAX } from "./etsyBuyerNote.js";

// What counts as a buyer's note worth keeping (plan MSG). Everything refused is null = "nothing usable", which the
// import never turns into a cleared note. Characters that must not stand in a source file are built from their codes.
const ch = (...codes) => String.fromCharCode(...codes);

describe("etsyBuyerNoteOf", () => {
  it("keeps a note as typed, trimmed", () => {
    expect(etsyBuyerNoteOf("  Please send it before Friday, it is a gift.  ")).toBe("Please send it before Friday, it is a gift.");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { text: "hi" }],
    ["empty", ""],
    ["blank", "  \n\t  "],
    ["only control characters", ch(0, 7, 27, 127, 0x85)],
  ])("refuses %s", (_label, value) => {
    expect(etsyBuyerNoteOf(value)).toBeNull();
  });

  it("keeps line breaks as \\n (CRLF and a lone CR included) and turns a tab into a space", () => {
    expect(etsyBuyerNoteOf("one\r\ntwo\rthree\nfour\tfive")).toBe("one\ntwo\nthree\nfour five");
  });

  it("drops every other control character (C0, DEL, C1)", () => {
    expect(etsyBuyerNoteOf(`a${ch(0)}b${ch(8)}c${ch(11)}d${ch(12)}e${ch(27)}f${ch(127)}g${ch(0x85)}h${ch(0x9f)}i`)).toBe("abcdefghi");
  });

  it("drops the bidi embedding, override and isolate marks", () => {
    const marks = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
    expect(etsyBuyerNoteOf(marks.map((code) => `x${ch(code)}`).join("") + "x")).toBe("x".repeat(marks.length + 1));
  });

  it("leaves letters of any script, emoji and HTML entities as they are", () => {
    const text = `Zo${ch(0xeb)} ${ch(0x05e9, 0x05dc, 0x05d5, 0x05dd)} ${ch(0xd83c, 0xdf39)} Tom &amp; Jerry &#39;s`;
    expect(etsyBuyerNoteOf(text)).toBe(text);
  });

  it("cuts a long note to ETSY_BUYER_NOTE_MAX characters and never splits an emoji", () => {
    const rose = ch(0xd83c, 0xdf39);
    expect(etsyBuyerNoteOf("a".repeat(ETSY_BUYER_NOTE_MAX))).toBe("a".repeat(ETSY_BUYER_NOTE_MAX));
    expect(etsyBuyerNoteOf("a".repeat(ETSY_BUYER_NOTE_MAX + 50))).toBe("a".repeat(ETSY_BUYER_NOTE_MAX));
    const cut = etsyBuyerNoteOf(rose.repeat(ETSY_BUYER_NOTE_MAX + 1));
    expect(Array.from(cut)).toHaveLength(ETSY_BUYER_NOTE_MAX);
    expect(cut.endsWith(rose)).toBe(true);
  });

  it("a cut that ends on a space does not keep it", () => {
    expect(etsyBuyerNoteOf("a".repeat(ETSY_BUYER_NOTE_MAX - 1) + " b")).toBe("a".repeat(ETSY_BUYER_NOTE_MAX - 1));
  });
});
