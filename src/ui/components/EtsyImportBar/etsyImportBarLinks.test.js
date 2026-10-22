import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-22 (plan FILIP-3): "Open order in Etsy" and "Open listing" sit before the name as icons only; the
// words stay as the tooltip and the accessible name. No React harness here (50f64c8): pinned by reading the
// sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const bar = read("./EtsyImportBar.jsx");
const css = read("./EtsyImportBar.module.css");
const links = bar.slice(bar.indexOf("<div className={styles.line_links}>"), bar.indexOf("<div className={styles.line_text}>"));
const actions = bar.slice(bar.indexOf("<div className={styles.actions}>"), bar.indexOf("</li>"));

describe("the Etsy links of a bar line", () => {
  it("both are icon buttons with an accessible name and the same words as a tooltip", () => {
    expect(links).toContain('onClick={() => openEtsyOrder(etsyOrderIdOf(row))} title="Open order in Etsy" aria-label="Open order in Etsy"');
    expect(links).toContain('onClick={() => handleListing(row)} title="Open listing in Etsy" aria-label="Open listing in Etsy"');
    expect((links.match(/className=\{styles\.icon_btn\}/g) ?? []).length).toBe(2);
  });

  it("no words inside the buttons - only the icons", () => {
    // The opening tag ends after aria-label (its last attribute) - an arrow "=>" in onClick is not its end.
    const inners = [...links.matchAll(/<button [\s\S]*?aria-label="[^"]*">([\s\S]*?)<\/button>/g)].map((m) => m[1]);
    expect(inners).toHaveLength(2);
    for (const inner of inners) {
      expect(inner).toMatch(/<(SiEtsy|LuTag) [^>]*\/>/);
      expect(inner.replace(/<[^>]*\/>/g, "").trim()).toBe("");
    }
  });

  it("they left the actions on the right: no 'Open order in Etsy' / 'Open listing' there", () => {
    expect(actions.length).toBeGreaterThan(0);
    expect(actions).not.toMatch(/Open order in Etsy|Open listing|openEtsyOrder|handleListing/);
  });

  it("a line without a listing keeps the place with a hidden spacer, so the names line up", () => {
    expect(links).toMatch(/\{row\.listingId \? \([\s\S]*?\) : \(\s*<span className=\{styles\.icon_spacer\} aria-hidden="true" \/>\s*\)\}/);
    expect(css).toMatch(/\.icon_spacer\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s);
    expect(css).toMatch(/\.icon_btn\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s);
  });

  it("the group does not shrink, so the icons never squeeze", () => {
    expect(css).toMatch(/\.line_links\s*\{[^}]*flex-shrink:\s*0;/s);
  });
});
