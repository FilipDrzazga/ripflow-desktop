import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The buyer's note in the dry run (plan MSG): main sends it as a key of its OWN next to `receipt` - receiptFacts keeps
// carrying no buyer data (etsyApi.facts.test.js) - and Settings shows it as React text, never as markup. Pinned by
// reading the sources (comment lines dropped), like etsyPreviewWiring.test.js: the dry run loads Electron.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const preview = read("./etsyPreview.js");
const api = read("../helpers/etsyApi.js");
const view = read("../../ui/components/Settings/views/EtsyView.jsx");

describe("Check newest order - the buyer's note", () => {
  it("main answers buyerNote through etsyBuyerNoteOf, next to receiptFacts and not inside it", () => {
    expect(preview).toContain("buyerNote: etsyBuyerNoteOf(receipt.message_from_buyer)");
    expect(preview).toContain("receipt: receiptFacts(receipt, getEtsyImportSince())");
    const facts = api.slice(api.indexOf("export const receiptFacts"));
    expect(facts.slice(0, facts.indexOf("\n};"))).not.toMatch(/message_from_buyer|buyerNote/);
  });

  it("Settings shows it as text: from previewBuyerNote, in a JSX child, with no innerHTML anywhere", () => {
    expect(view).toContain("const buyerNote = previewBuyerNote(check);");
    expect(view).toContain("{buyerNote}</div>");
    expect(view).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });
});
