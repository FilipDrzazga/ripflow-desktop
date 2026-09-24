import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import rule from "./no-polish-or-control.js";

// RuleTester runs its cases through describe/it when those are globals; hand it vitest's.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });

tester.run("no-polish-or-control", rule, {
  valid: [
    { code: "const a = 1; // plain English comment" },
    // non-Polish non-ASCII stays legal: arrows, dashes, the multiplication sign, ellipsis
    { code: 'const s = "moved → ROLLED_BACK — 220×200mm…";' },
    { code: "const t = `tab\there`;\r\nconst u = 2;" }, // TAB and CRLF line ends
    // Polish WITHOUT diacritics is invisible to the rule - documented limit, pinned
    { code: "// ENOENT = wolne" },
  ],
  invalid: [
    {
      code: "// w górę",
      errors: [
        { messageId: "polish", data: { ch: "ó" }, line: 1, column: 7 },
        { messageId: "polish", data: { ch: "ę" }, line: 1, column: 9 },
      ],
    },
    { code: 'const label = "Usuń wpis";', errors: [{ messageId: "polish", data: { ch: "ń" } }] },
    { code: "const zółw = 1;", errors: [{ messageId: "polish" }, { messageId: "polish" }] },
    { code: "const a = 1;\n// ĄĆĘŁŃÓŚŹŻ", errors: 9 },
    { code: 'const s = "a\u0001b";', errors: [{ messageId: "control", data: { code: "0001" } }] },
    { code: "const s = 1; // a\u007Fb", errors: [{ messageId: "control", data: { code: "007F" } }] },
    { code: 'const s = "\u0085";', errors: [{ messageId: "control", data: { code: "0085" } }] },
    { code: "const s = 1;\u000B", errors: [{ messageId: "control", data: { code: "000B" } }] },
  ],
});
