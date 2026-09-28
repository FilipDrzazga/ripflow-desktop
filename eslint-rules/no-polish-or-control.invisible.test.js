import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import rule from "./no-polish-or-control.js";

// ETAP 3-8 (FILIP 2026-09-28, ODP 28): invisible format characters. Every character here is built
// from its code point - this file is linted by the rule it tests, and a literal one would fail it
// (the existing test file is excluded from lint because its data IS Polish text; this one is not).

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });
const ch = (cp) => String.fromCharCode(cp);
const BS = String.fromCharCode(92); // a backslash, so "\" + "uFEFF" stays six characters

const INVISIBLE = [0xad, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202e, 0x2060, 0x2064, 0x2066, 0x2069, 0xfeff];
const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, "0");

tester.run("no-polish-or-control (invisible)", rule, {
  valid: [
    // the ESCAPE is fine - it is visible in the source and means the same at runtime
    { code: `const bom = /^${BS}uFEFF/;` },
    { code: `const zw = "${BS}u200B";` },
    // neighbours of the ranges stay legal: a no-break space, an en dash, a right arrow
    { code: `const s = "a${ch(0xa0)}b ${ch(0x2013)} ${ch(0x2192)}";` },
    { code: `const s = "${ch(0x2010)}${ch(0x2065)}${ch(0x2070)}";` },
  ],
  invalid: [
    // the 3-3 case: a literal U+FEFF inside a regex
    {
      code: `const t = s.replace(/^${ch(0xfeff)}/, "");`,
      errors: [{ messageId: "invisible", data: { code: "FEFF" }, line: 1, column: 23 }],
    },
    // every range, both ends
    ...INVISIBLE.map((cp) => ({
      code: `const s = "a${ch(cp)}b";`,
      errors: [{ messageId: "invisible", data: { code: hex(cp) } }],
    })),
    // in a comment and in an identifier position too
    { code: `// see${ch(0x200b)}here`, errors: [{ messageId: "invisible", data: { code: "200B" } }] },
    // a Trojan Source line: an override plus its pop
    {
      code: `const isAdmin = false; /*${ch(0x202e)} } ${ch(0x2066)}if (isAdmin)${ch(0x2069)} ${ch(0x2066)} begin admins only */`,
      errors: 4,
    },
    // a leading BOM: ESLint strips it from the text and reports hasBOM - still refused
    { code: `${ch(0xfeff)}const a = 1;`, errors: [{ messageId: "invisible", data: { code: "FEFF" }, line: 1, column: 1 }] },
  ],
});
