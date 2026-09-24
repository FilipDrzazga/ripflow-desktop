// ESLint rule: no Polish letters and no control characters in source files.
//
// Code is English only - identifiers, comments, UI / log / error strings (FILIP,
// 2026-09-24; .claude/CLAUDE.md overview). This makes the rule checked instead of
// remembered: on the day it was written, Polish comments in createBatch.js were found only
// by chance, while editing that file for something else.
//
// Control characters (C0 except TAB / LF / CR, DEL, C1) are refused for the same reason
// the chat tooling refuses them: they render as nothing, or as a line break that is not
// one, and survive every review that reads the rendered text.
//
// What it CANNOT see: Polish written without diacritics ("wolne", "inne"). Those still
// need a reviewer; this rule catches the letters that prove the language.
// built from code points, so this file passes its own rule (the 18 Polish letters:
// a-ogonek, c-acute, e-ogonek, l-stroke, n-acute, o-acute, s-acute, z-acute, z-dot, and
// the same nine in upper case)
const POLISH = String.fromCharCode(
  0x105, 0x107, 0x119, 0x142, 0x144, 0xf3, 0x15b, 0x17a, 0x17c,
  0x104, 0x106, 0x118, 0x141, 0x143, 0xd3, 0x15a, 0x179, 0x17b,
);
const PATTERN = new RegExp(`[${POLISH}]|[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]`, "g");

const hex = (ch) => ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");

export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow Polish letters and control characters in source files" },
    schema: [],
    messages: {
      polish: 'Polish letter "{{ch}}" - code is English only (identifiers, comments, UI strings).',
      control: "Control character U+{{code}} - invisible in review; remove it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program() {
        const text = sourceCode.text;
        for (const m of text.matchAll(PATTERN)) {
          const ch = m[0];
          const loc = sourceCode.getLocFromIndex(m.index);
          if (POLISH.includes(ch)) context.report({ loc, messageId: "polish", data: { ch } });
          else context.report({ loc, messageId: "control", data: { code: hex(ch) } });
        }
      },
    };
  },
};
